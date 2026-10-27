/**
 * The batches of `HttpTransport` (roadmap CLI-32).
 *
 * With the option `batch`, the calls that start in the same turn of the event loop go to the
 * server in one request: `POST {baseUrl}` with the header `Procedures-Batch: 1`. The answer is one
 * NDJSON stream, and each frame of it names its call. The batcher gives each call its own items, so
 * the middleware of a call (retry, timeout, circuit breaker) sees the items of one call, as without
 * a batch. Refer to "A batch of calls" in WIRE-PROTOCOL.md.
 *
 * - The calls of one request have the same secret headers (`Authorization`, `X-API-Key` and the
 *   others). Calls with other secret headers go in another request.
 * - A batch of one call is a request of one call.
 * - A server without batches answers without the header `Procedures-Batch`. Then the batcher sends
 *   each call alone, now and later.
 */

import type { Message, Metadata, ResponseItem, Status } from "../../../client/types.js";
import { DELIVERY_METADATA_KEY, RETRY_AFTER_METADATA_KEY, isNotSentError } from "../../../client/middleware/items.js";
import { StreamSequence, streamItemMetadata } from "../../sequence.js";
import { foldedErrorCode, PROTOCOL_HEADER, PROTOCOL_VERSION } from "../../../protocol.js";
import { toMs, type Duration } from "../../../duration.js";
import { HTTPHeaders, createAbortError, createErrorFromException, decodeMetadataHeader } from "../shared/index.js";

/** The header of a batch request, and of the answer of a server that takes batches. */
export const BATCH_HEADER = "Procedures-Batch";

/** The options of the batches of `HttpTransport`. */
export interface HttpBatchOptions {
  /**
   * The most calls in one request. A call after them goes in the next request.
   * @default 32
   */
  readonly maxCalls?: number | undefined;
  /**
   * The time that the first call of a batch waits for more calls. Zero takes the calls that start
   * in the same turn of the event loop.
   * @default 0
   */
  readonly window?: Duration | undefined;
  /**
   * The URL of a batch request.
   * @default the `baseUrl` of the transport
   */
  readonly url?: string | undefined;
  /**
   * More headers that carry a secret, as the option `secretHeaders` of the server. Calls with other
   * values of a secret header go in different requests. `Authorization`, `Proxy-Authorization`,
   * `Cookie` and `X-Api-Key` are always secret.
   */
  readonly secretHeaders?: readonly string[] | undefined;
}

/** The defaults of `HttpBatchOptions`. */
export const HTTP_BATCH_DEFAULTS = { maxCalls: 32, windowMs: 0 } as const;

/** The secret headers of each request: they go on the batch request, not on a call. */
const SECRET_HEADERS = ["authorization", "proxy-authorization", "cookie", "x-api-key"];

/** The most items that wait for the reader of one call before the batch stops reading. */
const HIGH_WATER = 64;

/** The statuses of a server that knows no batch, when the answer has no `Procedures-Batch` header. */
const NO_BATCH_STATUSES = new Set([400, 404, 405, 415, 501]);

const NDJSON = "application/x-ndjson";

/** The parts of the transport that the batcher uses. */
export interface BatchHost {
  readonly url: string;
  readonly timeoutMs: number | undefined;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The headers and the init of each request of the transport. */
  readonly init: () => { readonly headers: Record<string, string>; readonly init: Omit<RequestInit, "method" | "headers" | "body" | "signal"> };
  /** The headers of the metadata of a call. It throws for metadata that is too large. */
  readonly headersOf: (metadata: Metadata) => Record<string, string>;
  readonly metadataOf: (headers: Headers) => Metadata;
  /** The status of an HTTP answer that is not NDJSON, from its status and its body. */
  readonly statusOf: (status: number, body: unknown) => Status;
  readonly bodyOf: (response: Response) => Promise<unknown>;
  /** The request of one call. */
  readonly sendOne: <TRes>(message: Message) => AsyncIterable<ResponseItem<TRes>>;
}

/** The items of one call: the reader of the batch pushes them, and the caller reads them. */
class Channel<T> {
  private readonly items: T[] = [];
  private ended = false;
  private wake: (() => void) | undefined;
  private room: (() => void) | undefined;

  /** It resolves when the reader has room for more items. */
  push(item: T): Promise<void> {
    if (this.ended) return Promise.resolve();
    this.items.push(item);
    this.wake?.();
    if (this.items.length < HIGH_WATER) return Promise.resolve();
    return new Promise<void>((resolve) => (this.room = resolve));
  }

  end(): void {
    this.ended = true;
    this.wake?.();
    this.free();
  }

  private free(): void {
    const room = this.room;
    this.room = undefined;
    room?.();
  }

  async *read(): AsyncGenerator<T, void, undefined> {
    for (;;) {
      const item = this.items.shift();
      if (item !== undefined) {
        if (this.items.length < HIGH_WATER) this.free();
        yield item;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = undefined;
    }
  }
}

/** One call in a batch. */
interface Pending {
  readonly message: Message;
  readonly headers: Record<string, string>;
  readonly channel: Channel<ResponseItem<unknown>>;
  /** "queued" before the request; "alone" in a request of one call; "sent" in a batch */
  state: "queued" | "alone" | "sent";
  /** The call has its last item, or the caller stopped reading */
  ended: boolean;
  /** The caller stopped before the last item: an abort, a timeout or an early return */
  detached: boolean;
  /** The call got a frame: the timeout of the first item stops */
  started: boolean;
  timer?: ReturnType<typeof setTimeout> | undefined;
  batch?: { readonly controller: AbortController; readonly calls: readonly Pending[] } | undefined;
}

function errorItem(message: Message, status: Omit<Extract<Status, { type: "error" }>, "type">, metadata: Metadata): ResponseItem<unknown> {
  return { id: message.id, status: { type: "error", ...status }, payload: null, metadata };
}

/** The text form of a path: the segments of the method joined with dots (CLI-75). */
function pathOf(message: Message): string {
  const { service, operation } = message.method;
  return service === "" ? operation : `${service}.${operation}`;
}

/** The batcher of one transport. */
export class HttpBatcher {
  private readonly maxCalls: number;
  private readonly windowMs: number;
  private readonly secret: ReadonlySet<string>;
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The server answered a batch as a server without batches */
  private unsupported = false;

  constructor(
    private readonly host: BatchHost,
    options: HttpBatchOptions,
  ) {
    const maxCalls = options.maxCalls ?? HTTP_BATCH_DEFAULTS.maxCalls;
    if (!Number.isInteger(maxCalls) || maxCalls < 1) throw new TypeError(`batch.maxCalls must be a positive integer, not ${String(maxCalls)}`);
    this.maxCalls = maxCalls;
    this.windowMs = options.window === undefined ? HTTP_BATCH_DEFAULTS.windowMs : Math.max(0, toMs(options.window, "batch.window"));
    this.secret = new Set([...SECRET_HEADERS, ...(options.secretHeaders ?? []).map((name) => name.toLowerCase())]);
  }

  async *send<TRes>(message: Message): AsyncGenerator<ResponseItem<TRes>, void, undefined> {
    let headers: Record<string, string>;
    try {
      headers = this.host.headersOf(message.metadata);
    } catch {
      // The request of one call gives the error of the metadata
      yield* this.host.sendOne<TRes>(message);
      return;
    }
    if (this.unsupported || message.signal?.aborted) {
      yield* this.host.sendOne<TRes>(message);
      return;
    }
    const pending: Pending = { message, headers, channel: new Channel(), state: "queued", ended: false, detached: false, started: false };
    const onAbort = (): void => this.abort(pending);
    message.signal?.addEventListener("abort", onAbort, { once: true });
    this.enqueue(pending);
    try {
      yield* pending.channel.read() as AsyncGenerator<ResponseItem<TRes>, void, undefined>;
    } finally {
      message.signal?.removeEventListener("abort", onAbort);
      // An early return of the caller: the call stops
      if (!pending.ended) this.detach(pending);
    }
  }

  private enqueue(pending: Pending): void {
    this.queue.push(pending);
    if (this.queue.length >= this.maxCalls) {
      this.flush();
      return;
    }
    this.timer ??= setTimeout(() => this.flush(), this.windowMs);
  }

  private flush(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const queue = this.queue;
    this.queue = [];
    // The calls of one request have the same secret headers
    const groups = new Map<string, Pending[]>();
    for (const pending of queue) {
      const key = JSON.stringify(
        Object.entries(pending.headers)
          .filter(([name]) => this.secret.has(name.toLowerCase()))
          .map(([name, value]) => [name.toLowerCase(), value])
          .sort(([a], [b]) => (a! < b! ? -1 : 1)),
      );
      const group = groups.get(key);
      if (group) group.push(pending);
      else groups.set(key, [pending]);
    }
    for (const group of groups.values()) {
      if (group.length === 1 || this.unsupported) for (const pending of group) void this.alone(pending);
      else void this.sendBatch(group);
    }
  }

  /** The request of one call, with the items in the channel of the call. */
  private async alone(pending: Pending): Promise<void> {
    pending.state = "alone";
    try {
      for await (const item of this.host.sendOne(pending.message)) {
        if (pending.detached) break;
        await pending.channel.push(item);
      }
    } finally {
      this.end(pending);
    }
  }

  /** The last item of a call, and the end of its channel. */
  private finish(pending: Pending, item: ResponseItem<unknown>): void {
    if (pending.ended) return;
    void pending.channel.push(item);
    this.end(pending);
  }

  private end(pending: Pending): void {
    if (pending.ended) return;
    pending.ended = true;
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    pending.channel.end();
    this.check(pending);
  }

  /** The caller does not read more items of the call. */
  private detach(pending: Pending): void {
    if (pending.ended) return;
    pending.detached = true;
    if (pending.state === "queued") this.queue = this.queue.filter((other) => other !== pending);
    this.end(pending);
  }

  /** The signal of a call aborted. A call alone gets the abort from the request of one call. */
  private abort(pending: Pending): void {
    if (pending.ended || pending.state === "alone") return;
    const delivery = pending.state === "queued" ? "not-sent" : "indeterminate";
    pending.detached = true;
    if (pending.state === "queued") this.queue = this.queue.filter((other) => other !== pending);
    this.finish(pending, errorItem(pending.message, createAbortError(), { [DELIVERY_METADATA_KEY]: delivery }));
  }

  /** When each call of a batch ended and a caller stopped early, the request stops. */
  private check(pending: Pending): void {
    const batch = pending.batch;
    if (!batch || !batch.calls.every((call) => call.ended) || !batch.calls.some((call) => call.detached)) return;
    batch.controller.abort();
  }

  private async sendBatch(calls: Pending[]): Promise<void> {
    const controller = new AbortController();
    const batch = { controller, calls };
    const { headers: defaults, init } = this.host.init();
    const secret: Record<string, string> = {};
    const body = {
      calls: calls.map((pending, index) => {
        pending.state = "sent";
        pending.batch = batch;
        const own: Record<string, string> = {};
        let metadata: Record<string, unknown> | undefined;
        for (const [name, value] of Object.entries(pending.headers)) {
          const lower = name.toLowerCase();
          if (this.secret.has(lower)) secret[name] = value;
          else if (lower === HTTPHeaders.METADATA.toLowerCase()) metadata = decodeMetadataHeader(value);
          else own[name] = value;
        }
        return {
          id: String(index),
          path: pathOf(pending.message),
          input: pending.message.payload,
          ...(Object.keys(own).length > 0 ? { headers: own } : {}),
          ...(metadata ? { metadata } : {}),
        };
      }),
    };
    const byId = new Map(calls.map((pending, index) => [String(index), pending]));
    // The timeout of the transport covers the time to the first frame of each call
    const timeoutMs = this.host.timeoutMs;
    if (timeoutMs) {
      for (const pending of calls) {
        pending.timer = setTimeout(() => {
          pending.detached = true;
          this.finish(pending, errorItem(pending.message, { code: "TIMEOUT", message: `Request timed out after ${timeoutMs}ms`, retryable: false }, { [DELIVERY_METADATA_KEY]: "indeterminate" }));
        }, timeoutMs);
      }
    }
    const live = (): Pending[] => calls.filter((pending) => !pending.ended);
    try {
      const response = await this.host.fetch(this.host.url, {
        ...init,
        method: "POST",
        headers: {
          [HTTPHeaders.CONTENT_TYPE]: "application/json",
          Accept: NDJSON,
          [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
          ...defaults,
          ...secret,
          [BATCH_HEADER]: "1",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const metadata = this.host.metadataOf(response.headers);
      const batchAnswer = response.headers.get(BATCH_HEADER) === "1";
      if (!batchAnswer && NO_BATCH_STATUSES.has(response.status)) {
        // A server without batches ran no call: each call goes alone, now and later
        void response.body?.cancel().catch(() => undefined);
        this.unsupported = true;
        for (const pending of live()) {
          if (pending.timer !== undefined) clearTimeout(pending.timer);
          pending.timer = undefined;
          void this.alone(pending);
        }
        return;
      }
      if (!response.headers.get(HTTPHeaders.CONTENT_TYPE)?.includes(NDJSON) || !response.body) {
        // An error of the whole batch, for example a refused origin or a stopped server
        const answer = await this.host.bodyOf(response);
        const status = this.host.statusOf(response.status, answer);
        const fields = status.type === "error" ? status : { code: "INVALID_RESPONSE", message: `A batch got the status ${response.status} without a stream`, retryable: false };
        for (const pending of live()) this.finish(pending, errorItem(pending.message, fields, { ...metadata, ...errorMetadataOf(answer) }));
        return;
      }
      await this.read(response.body, byId, metadata);
    } catch (error) {
      // The same error items as a request of one call (R1)
      const details = error instanceof Error ? (error.name === "AbortError" ? createAbortError() : createErrorFromException(error)) : createErrorFromException(new Error("Unknown error"));
      const delivery = isNotSentError(error) ? "not-sent" : "indeterminate";
      for (const pending of live()) this.finish(pending, errorItem(pending.message, details, { [DELIVERY_METADATA_KEY]: delivery }));
    } finally {
      for (const pending of calls) if (pending.timer !== undefined) clearTimeout(pending.timer);
      if (live().length > 0) controller.abort();
    }
  }

  /** The reader of the stream of a batch: each frame goes to the channel of its call. */
  private async read(body: ReadableStream<Uint8Array>, byId: ReadonlyMap<string, Pending>, metadata: Metadata): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const outer = new StreamSequence();
    const orders = new Map<string, StreamSequence>();
    const items = new Map<string, number>();
    const unfinished = (): Pending[] => Array.from(byId.values()).filter((pending) => !pending.ended);
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          // A keep-alive line of the server
          if (!line) continue;
          const entry = JSON.parse(line) as { type: string; seq?: unknown; payload?: unknown; error?: { code?: string; message?: string; retryable?: boolean } };
          if (entry.type === "item" || entry.type === "done") {
            if (outer.next(entry.seq, "batch") < 0) continue;
          }
          if (entry.type === "done" || entry.type === "error") {
            // The end of the batch: a call without its last frame gets an error
            const fields =
              entry.type === "error"
                ? { code: foldedErrorCode(entry.error?.code ?? "HANDLER_ERROR").code, message: entry.error?.message ?? "Unknown error", retryable: entry.error?.retryable ?? false }
                : { code: "STREAM_ENDED", message: "The batch ended without the last frame of the call", retryable: true };
            for (const pending of unfinished()) {
              const base = (items.get(pending.message.id) ?? 0) > 0 ? streamItemMetadata(metadata, 0) : { ...metadata };
              this.finish(pending, errorItem(pending.message, fields, { ...base, [DELIVERY_METADATA_KEY]: "indeterminate" }));
            }
            return;
          }
          if (entry.type !== "item") continue;
          const frame = entry.payload as { call?: unknown; type?: unknown; seq?: unknown; payload?: unknown; error?: Record<string, unknown> } | null;
          const pending = typeof frame?.call === "string" ? byId.get(frame.call) : undefined;
          if (!frame || !pending || pending.ended) continue;
          pending.started = true;
          if (pending.timer !== undefined) clearTimeout(pending.timer);
          pending.timer = undefined;
          const id = pending.message.id;
          if (frame.type === "response") {
            this.finish(pending, { id, status: { type: "success", code: frame.payload === undefined ? 204 : 200 }, payload: frame.payload, metadata: { ...metadata } });
          } else if (frame.type === "item" || frame.type === "done") {
            let order = orders.get(frame.call as string);
            if (!order) orders.set(frame.call as string, (order = new StreamSequence()));
            const gap = order.next(frame.seq, id);
            if (gap < 0) continue;
            if (frame.type === "done") {
              this.end(pending);
              continue;
            }
            items.set(id, (items.get(id) ?? 0) + 1);
            await pending.channel.push({ id, status: { type: "success", code: 200 }, payload: frame.payload, metadata: streamItemMetadata(metadata, gap) });
          } else if (frame.type === "error") {
            const error = frame.error ?? {};
            const base = (items.get(id) ?? 0) > 0 ? streamItemMetadata(metadata, 0) : { ...metadata };
            const code = foldedErrorCode(typeof error["code"] === "string" ? error["code"] : "HANDLER_ERROR");
            this.finish(
              pending,
              errorItem(
                pending.message,
                { code: code.code, message: typeof error["message"] === "string" ? error["message"] : "Unknown error", retryable: error["retryable"] === true },
                { ...base, ...errorMetadataOf(error), ...(code.reason !== undefined && typeof error["reason"] !== "string" ? { reason: code.reason } : {}) },
              ),
            );
          }
        }
      }
      // The stream of the batch ended without its end line
      for (const pending of unfinished()) {
        this.finish(pending, errorItem(pending.message, { code: "STREAM_ENDED", message: "The stream ended without its end line", retryable: true }, { ...metadata, [DELIVERY_METADATA_KEY]: "indeterminate" }));
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/** The metadata of an error body: the wait, the reason and the conflicts (R12, R25, CLI-16). */
function errorMetadataOf(body: unknown): Metadata {
  if (body === null || typeof body !== "object") return {};
  const fields = body as { retryAfterMs?: unknown; reason?: unknown; conflicts?: unknown };
  const out: Metadata = {};
  if (typeof fields.retryAfterMs === "number" && Number.isFinite(fields.retryAfterMs) && fields.retryAfterMs >= 0) out[RETRY_AFTER_METADATA_KEY] = fields.retryAfterMs;
  if (typeof fields.reason === "string") out["reason"] = fields.reason;
  if (Array.isArray(fields.conflicts)) out["conflicts"] = fields.conflicts;
  return out;
}
