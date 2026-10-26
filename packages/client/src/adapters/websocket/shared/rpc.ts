/**
 * The calls over one WebSocket in the two directions (roadmap R24).
 *
 * A WebSocket connection carries the calls of each side to the other side, with the same frames:
 * a `request`, then a `response`, an `error`, or `stream` frames that end with `stream.done`. The
 * reader of a stream gives `credit`, and the caller can `cancel`. `OutgoingCalls` is the side that
 * sends calls. `IncomingCalls` is the side that serves them with a `RequestHandler`, so a call runs
 * through `invokeProcedure` (validation, the expose rule, the capability, the deadline of
 * `procedure-timeout`). The server serves the calls of the client, and the client can serve the
 * calls of the server: before, the reverse calls had frames of their own (`server-request`,
 * `server-response`), with one value, no stream, no cancel and no signal.
 */

import type { Message, ResponseItem } from "../../../client/types.js";
import type { RequestHandler, ServerRequest } from "../../../server/types.js";
import type { WebSocketMessage } from "../server/types.js";
import { withoutInternalKeys } from "../../metadata.js";
import { StreamSequence, gapOf, itemMetadata } from "../../sequence.js";
import { DELIVERY_METADATA_KEY } from "../../../client/middleware/items.js";
import { errorCodeOf, foldedErrorCode, retryableOf } from "../../../protocol.js";
import { lastResortError } from "../../../server/error-policy.js";

/**
 * A queue of response items that one reader takes in order: push, then end or fail. The reader
 * waits for the next item without polling.
 */
export class ItemQueue<T> {
  private items: T[] = [];
  private ended = false;
  private failure: { error: Error } | undefined;
  private wake: (() => void) | undefined;

  push(item: T): void {
    this.items.push(item);
    this.notify();
  }

  end(): void {
    this.ended = true;
    this.notify();
  }

  fail(error: Error): void {
    this.failure = { error };
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.failure) throw this.failure.error;
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}

/**
 * The credit of a stream (deep dive TRN-3): the number of items that the reader has room for.
 * The stream takes one for each item that it sends, and waits when it has none.
 */
export class StreamCredit {
  private wake: (() => void) | undefined;

  constructor(private credit: number) {}

  grant(n: number): void {
    this.credit += n;
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  /** Take one item of credit. Returns false when the signal aborted the wait. */
  async take(signal: AbortSignal): Promise<boolean> {
    while (this.credit <= 0) {
      if (signal.aborted) return false;
      await new Promise<void>((resolve) => {
        const onAbort = (): void => resolve();
        signal.addEventListener("abort", onAbort, { once: true });
        this.wake = () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
      });
    }
    if (signal.aborted) return false;
    this.credit--;
    return true;
  }
}

/**
 * The error of a failed stream: its code (a string) and its retryable flag. `items` is the count of
 * the item frames before the error. An error without a flag gets the flag of its code before the
 * first item (CLI-68). After the first item, it gets false: a retry can send the items again
 * (CLI-58, `retryableOf`, `WIRE-PROTOCOL.md`, section "Error codes").
 */
export function errorStatus(error: unknown, items: number): { type: "error"; code: string; message: string; retryable: boolean } {
  return {
    type: "error",
    code: errorCodeOf(error),
    message: error instanceof Error ? error.message : String(error),
    // Before, every stream error lost its retryable flag (deep dive TRN-7)
    retryable: retryableOf(error, items),
  };
}

/** A text of an error message of a frame: a string, or the JSON of another value. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  return value === undefined ? "Unknown error" : JSON.stringify(value);
}

/** The response item of a `response` or an `error` frame, for the caller's message id. */
export function itemOfFrame(frame: WebSocketMessage, messageId: string): ResponseItem<unknown> {
  let status: ResponseItem<unknown>["status"];
  if (frame.status && frame.status.type === "error") {
    // A code of an older server becomes its code of wire v1 (CLI-4): "500" is INTERNAL_ERROR
    status = { type: "error", code: foldedErrorCode(String(frame.status.code)).code, message: textOf(frame.status.message), retryable: frame.status.retryable || false };
  } else if (frame.status && frame.status.type === "success") {
    status = { type: "success", code: Number(frame.status.code) };
  } else if (frame.type === "error") {
    status = {
      type: "error",
      code: foldedErrorCode(String(frame.error?.code || "UNKNOWN_ERROR")).code,
      message: textOf(frame.error?.message),
      retryable: frame.error?.retryable || false,
    };
  } else {
    status = { type: "success", code: 200 };
  }
  return { id: messageId, status, payload: frame.payload, metadata: frame.metadata || {} };
}

/** A call that this side sent and that waits for frames. */
interface PendingCall {
  /** The id of the caller's message: the response items carry it */
  messageId: string;
  /** The response items of the call, in order */
  queue: ItemQueue<ResponseItem<unknown>>;
  /** The `seq` of the stream frames: a duplicate or a late frame gives no item */
  order: StreamSequence;
  /** The time limit until the first frame */
  timeout?: ReturnType<typeof setTimeout> | undefined;
}

/** The options of `OutgoingCalls`. */
export interface OutgoingCallsOptions {
  /** This function sends a frame on the socket. */
  send: (frame: WebSocketMessage) => void;
  /** True while the socket is open. */
  isOpen: () => boolean;
  /** The time until the first frame of a call, in milliseconds. 0 or less: no limit. */
  requestTimeoutMs: number;
  /** The number of stream items that the reader can hold. */
  streamWindow: number;
  /** The start of the wire id of each call: the two sides use different ones. */
  idPrefix: string;
}

/** The calls that this side sends on one socket. */
export class OutgoingCalls {
  private readonly pending = new Map<string, PendingCall>();
  private seq = 0;

  constructor(private readonly options: OutgoingCallsOptions) {}

  /** The number of calls that wait for their frames. */
  get size(): number {
    return this.pending.size;
  }

  /** This function sends a call, and gives its response items. */
  async *call<TReq, TRes>(message: Message<TReq>): AsyncGenerator<ResponseItem<TRes>, void, undefined> {
    if (message.signal?.aborted) {
      yield abortedItem<TRes>(message.id);
      return;
    }
    if (!this.options.isOpen()) {
      // The call did not leave: a retry can send it
      yield {
        id: message.id,
        status: { type: "error", code: "CONNECTION_CLOSED", message: "The connection is closed", retryable: true },
        payload: null as TRes,
        metadata: { [DELIVERY_METADATA_KEY]: "not-sent" },
      };
      return;
    }
    const wireId = `${this.options.idPrefix}${message.id}~${++this.seq}`;
    const window = this.options.streamWindow;
    const queue = new ItemQueue<ResponseItem<unknown>>();
    const pending: PendingCall = { messageId: message.id, queue, order: new StreamSequence() };
    const limited = Number.isFinite(this.options.requestTimeoutMs) && this.options.requestTimeoutMs > 0;
    if (limited) pending.timeout = setTimeout(() => {
      if (this.pending.get(wireId) !== pending) return;
      this.pending.delete(wireId);
      this.sendCancel(wireId);
      queue.push({
        id: message.id,
        status: { type: "error", code: "TIMEOUT", message: `Request timeout after ${this.options.requestTimeoutMs}ms`, retryable: false },
        payload: null,
        metadata: { [DELIVERY_METADATA_KEY]: "indeterminate" },
      });
      queue.end();
    }, this.options.requestTimeoutMs);
    this.pending.set(wireId, pending);

    const onAbort = (): void => {
      if (this.pending.get(wireId) !== pending) return;
      this.pending.delete(wireId);
      if (pending.timeout) clearTimeout(pending.timeout);
      this.sendCancel(wireId);
      queue.push(abortedItem(message.id));
      queue.end();
    };
    message.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      this.options.send({
        id: wireId,
        type: "request",
        method: message.method,
        payload: message.payload,
        // The internal metadata keys stay in this process (deep dive TRN-11)
        metadata: withoutInternalKeys(message.metadata),
        credit: window,
      });
      let taken = 0;
      for await (const item of queue) {
        yield item as ResponseItem<TRes>;
        // The reader took the item: give the other side credit, in batches of half the window.
        // The frames of a gap took credit too, and no reader takes them.
        taken += 1 + gapOf(item.metadata);
        if (taken >= window / 2 && this.pending.get(wireId) === pending) {
          this.sendCredit(wireId, taken);
          taken = 0;
        }
      }
    } finally {
      message.signal?.removeEventListener("abort", onAbort);
      if (pending.timeout) clearTimeout(pending.timeout);
      if (this.pending.get(wireId) === pending) {
        // The reader stopped before the end: the other side stops the stream
        this.pending.delete(wireId);
        this.sendCancel(wireId);
      }
    }
  }

  /**
   * This function takes a `response`, `error` or `stream` frame of a call that this side sent.
   * It gives false for another frame.
   */
  receive(frame: WebSocketMessage): boolean {
    if (frame.type !== "response" && frame.type !== "error" && frame.type !== "stream") return false;
    const pending = this.pending.get(frame.id);
    if (!pending) return false;
    // The first frame arrived: the time limit ends. A stream can stay open longer.
    if (pending.timeout) {
      clearTimeout(pending.timeout);
      pending.timeout = undefined;
    }
    if (frame.type === "stream" && !frame.status) {
      // A duplicate or a late frame: its item came before, or the delivery is at most once
      const gap = pending.order.next(frame.seq, frame.id);
      if (gap < 0) return true;
      if (frame.stream?.done) {
        this.pending.delete(frame.id);
        pending.queue.end();
        return true;
      }
      pending.queue.push({ id: pending.messageId, status: { type: "success", code: 200 }, payload: frame.payload, metadata: itemMetadata(frame.metadata, gap) });
      return true;
    }
    this.pending.delete(frame.id);
    pending.queue.push(itemOfFrame(frame, pending.messageId));
    pending.queue.end();
    return true;
  }

  /**
   * This function fails each call that waits: the socket closed. The other side can have run
   * them, so their outcome is indeterminate (R1).
   */
  failAll(reason: string): void {
    for (const pending of this.pending.values()) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.queue.fail(new Error(reason));
    }
    this.pending.clear();
  }

  private sendCancel(id: string): void {
    if (this.options.isOpen()) this.options.send({ id, type: "cancel" });
  }

  private sendCredit(id: string, credit: number): void {
    if (this.options.isOpen()) this.options.send({ id, type: "credit", credit });
  }
}

/** The options of `IncomingCalls`. */
export interface IncomingCallsOptions {
  /** The handler that serves each call: a `ProcedureServer`, a `Server`, or a function object. */
  handler: RequestHandler;
  /** This function sends a frame on the socket. */
  send: (frame: WebSocketMessage) => void;
  /** This function sends a frame and waits while the send buffer of the socket is full. */
  sendWithBackpressure?: ((frame: WebSocketMessage, signal: AbortSignal) => Promise<void>) | undefined;
  /** True while the socket is open. */
  isOpen: () => boolean;
  /** This function makes the server request of a `request` frame: the metadata, the credentials. */
  requestOf: (frame: WebSocketMessage, signal: AbortSignal) => ServerRequest;
  /** This function runs when the number of calls that run becomes smaller. A drain waits on it. */
  onSettled?: (() => void) | undefined;
}

/** The calls that the other side sends on one socket, served by a handler. */
export class IncomingCalls {
  /** The calls that run, by wire id: a cancel frame or a closed socket aborts them */
  private readonly inflight = new Map<string, AbortController>();
  /** The flow control of the streams that run, by wire id */
  private readonly credits = new Map<string, StreamCredit>();

  constructor(private readonly options: IncomingCallsOptions) {}

  /** The number of calls that run. */
  get size(): number {
    return this.inflight.size;
  }

  /**
   * This function takes a `request`, `cancel` or `credit` frame of the other side. It gives false
   * for another frame.
   */
  receive(frame: WebSocketMessage): boolean {
    if (frame.type === "cancel") {
      this.inflight.get(frame.id)?.abort();
      if (this.inflight.delete(frame.id)) this.options.onSettled?.();
      return true;
    }
    if (frame.type === "credit") {
      if (typeof frame.credit === "number" && frame.credit > 0) this.credits.get(frame.id)?.grant(frame.credit);
      return true;
    }
    if (frame.type !== "request") return false;
    if (!frame.id || !frame.method) {
      this.sendError(frame.id || "unknown", "Invalid message format", "INVALID_REQUEST");
      return true;
    }
    // A request id names one request while it runs. A second request with the id would take the
    // first one's controller: its stream could not be cancelled (deep dive TRN-9).
    if (this.inflight.has(frame.id)) {
      this.sendError(frame.id, "A request with this id is still running", "DUPLICATE_REQUEST");
      return true;
    }
    void this.serve(frame);
    return true;
  }

  /** This function aborts each call that runs: the socket closed, or the side stops. */
  abortAll(): void {
    for (const controller of this.inflight.values()) controller.abort();
    const had = this.inflight.size > 0;
    this.inflight.clear();
    this.credits.clear();
    if (had) this.options.onSettled?.();
  }

  private async serve(frame: WebSocketMessage): Promise<void> {
    const controller = new AbortController();
    this.inflight.set(frame.id, controller);
    let credit: StreamCredit | undefined;
    let request: ServerRequest | undefined;
    try {
      request = this.options.requestOf(frame, controller.signal);
      const response = await this.options.handler.handle(request);
      if (response.stream) {
        credit = typeof frame.credit === "number" && frame.credit > 0 ? new StreamCredit(frame.credit) : undefined;
        if (credit) this.credits.set(frame.id, credit);
        await this.sendStream(frame.id, response.stream, controller.signal, credit);
      } else {
        const out: WebSocketMessage = {
          id: frame.id,
          type: response.status.type === "success" ? "response" : "error",
          payload: response.payload,
          metadata: response.metadata,
          status: response.status,
        };
        if (response.status.type === "error") {
          out.error = { code: response.status.code, message: response.status.message || "Unknown error", retryable: response.status.retryable };
        }
        this.send(out);
      }
    } catch (error) {
      // The last resort: the error policy of the server applies here too (CLI-80)
      const raw = { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Internal server error", retryable: false };
      const exposed = lastResortError(this.options.handler, error, request, raw);
      this.sendError(frame.id, exposed.message, exposed.code, exposed.retryable === true);
    } finally {
      // Delete only this request's entries (deep dive TRN-9)
      if (this.inflight.get(frame.id) === controller) {
        this.inflight.delete(frame.id);
        this.options.onSettled?.();
      }
      // A newer request with the same id keeps its credit (audit pass 2)
      if (credit !== undefined && this.credits.get(frame.id) === credit) this.credits.delete(frame.id);
    }
  }

  /**
   * Send a stream (BUGS-2026-07 H5): one `stream` frame for each item, then a frame with
   * `stream.done`. Each `stream` frame has its `seq`, from 1. An error of the stream ends it with
   * an `error` frame. When the signal aborts (a cancel frame, a closed socket), the loop stops,
   * and the handler of the stream gets return(). The stream takes its next item only when the
   * reader has credit for it.
   */
  private async sendStream(id: string, stream: AsyncIterable<unknown>, signal: AbortSignal, credit: StreamCredit | undefined): Promise<void> {
    const iterator = stream[Symbol.asyncIterator]();
    let done = false;
    let seq = 0;
    try {
      for (;;) {
        if (credit && !(await credit.take(signal))) return;
        if (signal.aborted || !this.options.isOpen()) return;
        const result = await iterator.next();
        if (result.done) {
          done = true;
          break;
        }
        if (signal.aborted || !this.options.isOpen()) return;
        const item: WebSocketMessage = { id, type: "stream", seq: ++seq, payload: result.value, stream: { done: false } };
        if (this.options.sendWithBackpressure) await this.options.sendWithBackpressure(item, signal);
        else this.send(item);
      }
      this.send({ id, type: "stream", seq: ++seq, stream: { done: true } });
    } catch (error) {
      done = true;
      if (signal.aborted) return;
      // `seq` counts the item frames that went out: before the first item, an error without a flag
      // gets the flag of its code (CLI-68)
      const status = errorStatus(error, seq);
      this.send({
        id,
        type: "error",
        status,
        error: { code: status.code, message: status.message, retryable: status.retryable },
        stream: { done: true },
      });
    } finally {
      // The loop stopped before the end: the handler gets return()
      if (!done) await iterator.return?.();
    }
  }

  private send(frame: WebSocketMessage): void {
    if (this.options.isOpen()) this.options.send(frame);
  }

  private sendError(id: string, message: string, code: string, retryable = false): void {
    this.send({
      id,
      type: "error",
      status: { type: "error", code, message, retryable },
      error: { code, message, retryable },
    });
  }
}

/** The error item of a call that its caller aborted. A retry does not repeat it. */
function abortedItem<TRes>(id: string): ResponseItem<TRes> {
  return { id, status: { type: "error", code: "ABORTED", message: "Request was aborted", retryable: false }, payload: null as TRes, metadata: {} };
}
