/**
 * A batch of calls in one HTTP request (roadmap CLI-32).
 *
 * The client sends `POST {base}` with the header `Procedures-Batch: 1` and the body
 * `{"calls": [{"id", "path", "input", "headers", "metadata"}]}`. The answer is one NDJSON stream.
 * Each item of the stream is a frame that names its call: the value of a call, an item of its
 * stream, the end of its stream, or its error. Each call runs through `handle()` as a call of its
 * own, so the authentication, the limits and the error policy apply to each call. The frames of
 * the calls come in the order of their arrival. Refer to "A batch of calls" in WIRE-PROTOCOL.md.
 */

import type { IncomingMessage } from "node:http";
import type { Method, Metadata, Status } from "../../../client/types.js";
import type { RequestHandler, ServerRequest, ServerResponse } from "../../../server/types.js";
import { lastResortError } from "../../../server/last-resort.js";
import { pathToMethod } from "../../../server/method.js";
import { segmentsOf } from "./addressing.js";
import type { NdjsonError } from "./ndjson.js";
import { BodyError } from "./body.js";

/** The request header of a batch, and of the answer of a server that took the batch. */
export const BATCH_HEADER = "Procedures-Batch";

/** The options of the batches of `procedureHandler`. */
export interface HandlerBatchOptions {
  /**
   * The most calls in one batch. A batch with more calls gets the status 413 and the code
   * `PAYLOAD_TOO_LARGE`, and no call runs.
   * @default 64
   */
  readonly maxCalls?: number | undefined;
  /**
   * The most calls of one batch that run at the same time. The next call starts when a call ends.
   * @default 8
   */
  readonly concurrency?: number | undefined;
}

/** The options of the batches, with each default. */
export interface ResolvedBatchOptions {
  readonly maxCalls: number;
  readonly concurrency: number;
}

/** The defaults of `HandlerBatchOptions`. */
export const BATCH_DEFAULTS = { maxCalls: 64, concurrency: 8 } as const;

/** The longest id of a call in a batch. */
export const BATCH_CALL_ID_LIMIT = 128;

/** One call of a batch, as the body gives it. */
export interface BatchCall {
  /** The id of the call, unique in its batch. Each frame of the call names it. */
  readonly id: string;
  readonly method: Method;
  /** The input of the procedure. Without `input`, the input is `{}`. */
  readonly input: unknown;
  /** The headers of the call, as the headers of a request of one call. */
  readonly headers: Readonly<Record<string, string>>;
  /** The custom metadata of the call, as the `X-Metadata` header of a request of one call. */
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
}

/** A frame of the answer of a batch: the payload of one NDJSON item. */
export type BatchFrame =
  | { readonly call: string; readonly type: "response"; readonly payload?: unknown }
  | { readonly call: string; readonly type: "item"; readonly seq: number; readonly payload: unknown }
  | { readonly call: string; readonly type: "done"; readonly seq: number }
  | { readonly call: string; readonly type: "error"; readonly error: BatchError };

/** The error of a call of a batch: the fields of the error body of one call. */
export interface BatchError extends NdjsonError {
  readonly reason?: string | undefined;
  readonly retryAfterMs?: number | undefined;
  readonly conflicts?: unknown[] | undefined;
}

/** True when the request is a batch: `POST` with the header `Procedures-Batch: 1`. */
export function isBatchRequest(req: IncomingMessage): boolean {
  return (req.method ?? "").toUpperCase() === "POST" && req.headers[BATCH_HEADER.toLowerCase()] === "1";
}

/** The resolved options of the batches, or undefined when the handler takes no batch. */
export function batchOptionsOf(option: boolean | HandlerBatchOptions | undefined): ResolvedBatchOptions | undefined {
  if (option === false) return undefined;
  const given = option === true || option === undefined ? {} : option;
  const count = (value: number | undefined, fallback: number, name: string): number => {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`batch.${name} must be a positive integer, not ${String(value)}`);
    return value;
  };
  return { maxCalls: count(given.maxCalls, BATCH_DEFAULTS.maxCalls, "maxCalls"), concurrency: count(given.concurrency, BATCH_DEFAULTS.concurrency, "concurrency") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The calls of a batch body. A body that is not a batch throws a `BodyError` with the status 400,
 * and a batch above `maxCalls` throws one with the status 413. Then no call runs.
 */
export function parseBatch(body: unknown, maxCalls: number): BatchCall[] {
  const calls = isRecord(body) && Object.hasOwn(body, "calls") ? body["calls"] : undefined;
  if (!Array.isArray(calls) || calls.length === 0) throw new BodyError('A batch body is {"calls": [...]} with one call or more', 400);
  if (calls.length > maxCalls) throw new BodyError(`A batch has ${calls.length} calls, and the limit is ${maxCalls}`, 413);
  const ids = new Set<string>();
  return calls.map((value: unknown, index): BatchCall => {
    if (!isRecord(value)) throw new BodyError(`The call ${index} of the batch is not an object`, 400);
    const own = (key: string): unknown => (Object.hasOwn(value, key) ? value[key] : undefined);
    const id = own("id");
    if (typeof id !== "string" || id === "" || id.length > BATCH_CALL_ID_LIMIT) {
      throw new BodyError(`The call ${index} of the batch needs an id: a text of 1 to ${BATCH_CALL_ID_LIMIT} characters`, 400);
    }
    if (ids.has(id)) throw new BodyError(`Two calls of the batch have the id "${id}"`, 400);
    ids.add(id);
    const path = segmentsOf(own("path"));
    if (!path) throw new BodyError(`The call "${id}" of the batch has no valid path`, 400);
    const headers = own("headers") ?? {};
    if (!isRecord(headers) || !Object.values(headers).every((header) => typeof header === "string")) {
      throw new BodyError(`The headers of the call "${id}" are not an object of texts`, 400);
    }
    const metadata = own("metadata");
    if (metadata !== undefined && !isRecord(metadata)) throw new BodyError(`The metadata of the call "${id}" is not an object`, 400);
    const input = own("input");
    return { id, method: pathToMethod(path), input: input === undefined ? {} : input, headers: headers as Record<string, string>, metadata };
  });
}

/** The error fields of an error response, as the error body of one call has them. */
export function batchErrorOf(status: Extract<Status, { type: "error" }>, metadata: Metadata): BatchError {
  const wait = metadata["retry-after"];
  const reason = metadata["reason"];
  const conflicts = metadata["conflicts"];
  return {
    code: status.code,
    message: status.message,
    retryable: status.retryable,
    ...(typeof wait === "number" && Number.isFinite(wait) && wait >= 0 ? { retryAfterMs: wait } : {}),
    ...(typeof reason === "string" ? { reason } : {}),
    ...(Array.isArray(conflicts) ? { conflicts } : {}),
  };
}

/** The frames of one call: its response, or the items and the end of its stream, or its error. */
async function* callFrames(
  server: RequestHandler,
  call: string,
  request: ServerRequest,
  errorOf: (error: unknown, items: number) => NdjsonError,
): AsyncGenerator<BatchFrame, void, undefined> {
  let response: ServerResponse;
  try {
    response = await server.handle(request);
  } catch (error) {
    // The last-resort error of a call, as the face of one call sends it (CLI-80)
    const exposed = lastResortError(server, error, request);
    const wait = exposed.retryAfterMs;
    yield {
      call,
      type: "error",
      error: {
        code: exposed.code,
        message: exposed.message,
        retryable: exposed.retryable === true,
        ...(typeof wait === "number" && Number.isFinite(wait) && wait >= 0 ? { retryAfterMs: wait } : {}),
      },
    };
    return;
  }
  if (response.stream) {
    // The seq of the frames of a stream counts within the call, as in a stream of one call
    let seq = 0;
    try {
      for await (const item of response.stream) yield { call, type: "item", seq: ++seq, payload: item };
    } catch (error) {
      yield { call, type: "error", error: errorOf(error, seq) };
      return;
    }
    yield { call, type: "done", seq: ++seq };
    return;
  }
  if (response.status.type === "error") {
    yield { call, type: "error", error: batchErrorOf(response.status, response.metadata) };
    return;
  }
  // No value: the frame has no payload, as a response of one call has no body (status 204)
  yield response.payload === undefined ? { call, type: "response" } : { call, type: "response", payload: response.payload };
}

/** One call of a batch with its request. */
export interface BatchRun {
  readonly call: string;
  readonly request: ServerRequest;
}

/**
 * The frames of each call of a batch, in the order of their arrival. At most `concurrency` calls
 * run at the same time. The function takes the next frame of a call only after the reader took the
 * frame before it, so a slow reader slows each stream (backpressure). When the reader stops, each
 * call that runs gets `return()`.
 */
export async function* batchFrames(
  server: RequestHandler,
  runs: readonly BatchRun[],
  concurrency: number,
  errorOf: (error: unknown, items: number) => NdjsonError,
): AsyncGenerator<BatchFrame, void, undefined> {
  type Next = { readonly key: number; readonly result: IteratorResult<BatchFrame, void> };
  const running = new Map<number, { readonly iterator: AsyncIterator<BatchFrame, void>; next: Promise<Next> }>();
  const pull = (key: number, iterator: AsyncIterator<BatchFrame, void>): Promise<Next> => iterator.next().then((result) => ({ key, result }));
  let started = 0;
  const start = (): void => {
    while (running.size < concurrency && started < runs.length) {
      const key = started++;
      const run = runs[key]!;
      const iterator = callFrames(server, run.call, run.request, errorOf);
      running.set(key, { iterator, next: pull(key, iterator) });
    }
  };
  try {
    start();
    while (running.size > 0) {
      const { key, result } = await Promise.race(Array.from(running.values(), (entry) => entry.next));
      const entry = running.get(key)!;
      if (result.done) {
        running.delete(key);
        start();
        continue;
      }
      yield result.value;
      entry.next = pull(key, entry.iterator);
    }
  } finally {
    for (const entry of running.values()) void Promise.resolve(entry.iterator.return?.()).catch(() => undefined);
  }
}
