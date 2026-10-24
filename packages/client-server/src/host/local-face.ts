/**
 * The local face of the procedures host (CLI-26): the calls of this process, through the request
 * tracking of the service.
 *
 * `localFace()` gives a face factory for the option `faces` of `createProcedureHost()`, and a
 * transport of `@procedures/client` for a `Client`. Each call of the client goes to the handler of
 * the face, as a call of the HTTP face does. Thus the service admits the call, counts it, drains
 * it and cuts it. The cold mode of `mark` calls its host in this process with this face.
 *
 * - Each call has `LOCAL_CREDENTIALS`: it is a call of this application (CLI-1). A token of the
 *   policy does not apply to it.
 * - The signal of the call goes with the request. The cooperative abort of the drain also aborts the call.
 * - When the signal aborts, the caller stops its wait at once, as over HTTP. The call gets the
 *   abort, and the drain of the service waits for its end.
 * - A value is one response item. A stream gives one item for each value. An error ends the
 *   stream with an error item, with the code, the flag `retryable` and the reason of the error.
 * - The face mounts nothing on a listener, and it has no stop parts. Before `createProcedureHost()`
 *   uses the factory, each call gets `UNAVAILABLE`.
 */

import {
  LOCAL_CREDENTIALS,
  type Message,
  type ResponseItem,
  type ServerRequest,
  type ServerResponse,
  type Status,
  type Transport,
} from "@procedures/client";
import type { HostFaceFactory } from "./faces.js";
import type { FaceHandler } from "./tracking.js";

/** The local face: the factory for the host, and the transport for a `Client` of this process. */
export interface LocalFace {
  /** The face factory. Give it to the option `faces` of `createProcedureHost()`, for example as `local`. */
  readonly face: HostFaceFactory;
  /** The transport of a `Client`: each call goes to the host through the request tracking of the face. */
  readonly transport: Transport;
}

/** The value of `untilAborted` when the signal aborts first. */
const ABORTED: unique symbol = Symbol("aborted");

/** This function gives the value of a promise, or `ABORTED` when the signal aborts first. The promise continues. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T | typeof ABORTED> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.resolve(ABORTED);
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      promise.catch(() => undefined);
      resolve(ABORTED);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** This function gives a response item of a status. */
function item<T>(id: string, status: Status, payload: unknown, metadata: Record<string, unknown> = {}): ResponseItem<T> {
  return { id, status, payload: payload as T, metadata };
}

/** This function gives the error item of an abort of the caller: the item of the local transport. */
function abortedItem<T>(id: string): ResponseItem<T> {
  return item<T>(id, { type: "error", code: "ABORTED", message: "Request was aborted", retryable: false }, null);
}

/** This function gives the error item of an error that ends a stream: its code, its flag `retryable` and its reason. */
function errorItem<T>(id: string, error: unknown): ResponseItem<T> {
  const fields = (error ?? {}) as { code?: unknown; retryable?: unknown; reason?: unknown };
  const code = typeof fields.code === "string" ? fields.code : "HANDLER_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  const retryable = typeof fields.retryable === "boolean" ? fields.retryable : false;
  return item<T>(id, { type: "error", code, message, retryable }, null, typeof fields.reason === "string" ? { reason: fields.reason } : {});
}

/** This function reads a stream that nobody reads to its end, so its request ends. The call has its abort, thus it ends soon. */
async function discard(response: ServerResponse): Promise<void> {
  const values = response.stream?.[Symbol.asyncIterator]();
  if (!values) return;
  try {
    while (!(await values.next()).done) {
      // Each value goes nowhere
    }
  } catch {
    // The end of the call after its abort
  }
}

/** The response items of a response of the face: one item for a value or an error, and one item for each value of a stream. */
async function* itemsOf<T>(id: string, response: ServerResponse, signal: AbortSignal | undefined): AsyncGenerator<ResponseItem<T>, void, undefined> {
  if (response.status.type === "error" || response.stream === undefined) {
    yield item<T>(id, response.status, response.status.type === "error" ? null : response.payload, response.metadata ?? {});
    return;
  }
  const values = response.stream[Symbol.asyncIterator]();
  let ended = false;
  try {
    for (;;) {
      const next = await untilAborted(values.next(), signal);
      if (next === ABORTED) {
        yield abortedItem<T>(id);
        return;
      }
      if (next.done) {
        ended = true;
        return;
      }
      yield item<T>(id, { type: "success", code: 200 }, next.value);
    }
  } catch (error) {
    ended = true;
    yield errorItem<T>(id, error);
  } finally {
    // A reader that stops early stops the call: the work gets its abort
    if (!ended) void values.return?.(undefined)?.catch(() => undefined);
  }
}

/**
 * This function gives the local face of a host (CLI-26). One face serves one host.
 *
 * @example
 * ```typescript
 * const local = localFace();
 * const host = createProcedureHost({ registry, faces: { local: local.face } });
 * const life = await host.declare(service("mark").profile(ephemeral)).run();
 * const client = new Client({ transport: local.transport });
 * for await (const item of client.stream({ service: "git", operation: "status" }, {}, { signal })) print(item);
 * ```
 */
export function localFace(): LocalFace {
  let handler: FaceHandler | undefined;
  const face: HostFaceFactory = (context) => {
    handler = context.handler;
    return {};
  };
  const transport: Transport = {
    name: "local-face",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      const target = handler;
      if (!target) {
        yield item<TRes>(message.id, { type: "error", code: "UNAVAILABLE", message: "The local face has no host: give its factory to createProcedureHost()", retryable: false }, null);
        return;
      }
      if (message.signal?.aborted) {
        yield abortedItem<TRes>(message.id);
        return;
      }
      const request: ServerRequest = {
        id: message.id,
        method: message.method,
        payload: message.payload,
        metadata: { ...message.metadata },
        credentials: LOCAL_CREDENTIALS,
        ...(message.signal ? { signal: message.signal } : {}),
      };
      const pending = target.handle(request);
      const response = await untilAborted(pending, message.signal);
      if (response === ABORTED) {
        // A stream that comes after the abort still holds its request: it is read to its end
        void pending.then(discard, () => undefined);
        yield abortedItem<TRes>(message.id);
        return;
      }
      yield* itemsOf<TRes>(message.id, response, message.signal);
    },
    close: async () => undefined,
  };
  return { face, transport };
}
