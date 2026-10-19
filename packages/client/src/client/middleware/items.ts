/**
 * Helpers that the client middlewares share.
 *
 * The transports report a failure as an error item, not as a thrown error. The middlewares use
 * the same style: a timeout, an abort or a refused retry is an error item, and `Client` throws
 * it when `throwOnError` is on (deep dive TRN-7: before, the timeout middleware waited for a
 * thrown error that the transports never threw).
 */

import type { ResponseItem } from "../types.js";
import { realClock, type Clock } from "../../clock.js";

/** This function makes an error item. */
export function errorItem<TRes>(id: string, code: string, message: string, retryable: boolean): ResponseItem<TRes> {
  return { id, status: { type: "error", code, message, retryable }, payload: null as TRes, metadata: {} };
}

/** The error item of a request that its caller aborted. A retry does not repeat it. */
export function abortedItem<TRes>(id: string): ResponseItem<TRes> {
  return errorItem<TRes>(id, "ABORTED", "Request was aborted", false);
}

/**
 * What a failed try tells about its request, in the metadata of the error item (`delivery`).
 * - `not-sent`: the request did not leave the client. A retry is safe.
 * - `indeterminate`: the request left, and no answer came. The server can have run it, so only
 *   an idempotent call can go again (the three outcomes of `@mark1russell7/service`).
 * An error item without the field is an answer of the server: its `retryable` flag decides.
 */
export type Delivery = "not-sent" | "indeterminate";

/** The metadata key of the delivery of a failed try. */
export const DELIVERY_METADATA_KEY = "delivery";

/** This function marks an error item with the delivery of its request. */
export function withDelivery<TRes>(item: ResponseItem<TRes>, delivery: Delivery): ResponseItem<TRes> {
  return { ...item, metadata: { ...item.metadata, [DELIVERY_METADATA_KEY]: delivery } };
}

/** The metadata key of the time that the server asks a client to wait before a retry, in milliseconds. */
export const RETRY_AFTER_METADATA_KEY = "retry-after";

/** The time that an error item asks a client to wait before a retry, in milliseconds, or undefined. */
export function retryAfterOf(item: ResponseItem<unknown>): number | undefined {
  const value = item.metadata?.[RETRY_AFTER_METADATA_KEY];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The error codes that say that the service is not available: the server is down, busy, slow or
 * stopping, or the network failed. A circuit breaker counts only these (roadmap R12). An abort,
 * a validation error, a refusal or an error of the handler says nothing about the health of the
 * service.
 */
const AVAILABILITY_CODES = new Set([
  "UNAVAILABLE",
  "TIMEOUT",
  // The code of a stopped server before CLI-4. It is UNAVAILABLE now. The next breaking release
  // of the client group removes it.
  "SERVER_STOPPED",
  "SERVICE_UNAVAILABLE",
  "BAD_GATEWAY",
  "GATEWAY_TIMEOUT",
  "NETWORK_ERROR",
  "CONNECTION_REFUSED",
  "STREAM_ENDED",
  // The connection to the other side closed before the call left (roadmap R30: before, the list
  // did not have this code of R24)
  "CONNECTION_CLOSED",
]);

/** True when an error says that the service is not available (see AVAILABILITY_CODES). */
export function isAvailabilityFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && AVAILABILITY_CODES.has(code)) return true;
  return isNetworkError(error);
}

/** The time of a monotonic clock in milliseconds: a change of the wall clock does not move it. */
export function monotonicNow(): number {
  const performance = (globalThis as { performance?: { now(): number } }).performance;
  return performance ? performance.now() : Date.now();
}

/** The delivery of a failed try, or undefined for an answer of the server. */
export function deliveryOf(item: ResponseItem<unknown>): Delivery | undefined {
  const delivery = item.metadata?.[DELIVERY_METADATA_KEY];
  return delivery === "not-sent" || delivery === "indeterminate" ? delivery : undefined;
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "NETWORK_ERROR",
  "CONNECTION_REFUSED",
]);

/**
 * This function tells if a thrown error is a network failure: the connection failed or broke.
 * A retry can repair a network failure. A validation error, an open circuit breaker or a rate
 * limit cannot be repaired by a retry (deep dive TRN-8).
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && NETWORK_CODES.has(code)) return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && cause !== error && isNetworkError(cause)) return true;
  // fetch() rejects with TypeError("fetch failed") when the connection fails
  if (error.name === "TypeError" && /fetch failed|network/i.test(error.message)) return true;
  // The WebSocket transport fails the requests of a connection that closed or never opened
  return /WebSocket (connection closed|disconnected)|Connection timeout/.test(error.message);
}

/** The network codes that tell that the connection never opened, so no request left. */
const NOT_SENT_CODES = new Set([
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "CONNECTION_REFUSED",
]);

/**
 * This function tells if a thrown error proves that the request did not leave the client: the
 * connection was refused, the name did not resolve, or the WebSocket did not open in time.
 * A reset or a close during the request does not prove it (the request can have arrived).
 */
export function isNotSentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && NOT_SENT_CODES.has(code)) return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && cause !== error && isNotSentError(cause)) return true;
  // The WebSocket transport fails a request that waited for a connection that did not come
  return /^(WebSocket disconnected|Connection timeout)$/.test(error.message);
}

/**
 * The item that stands for a thrown error, so that `shouldRetry` can decide about it. It is
 * retryable only when the error is a network failure. Its delivery tells if the request left.
 */
export function thrownItem<TRes>(id: string, error: unknown): ResponseItem<TRes> {
  const code = (error as { code?: unknown } | undefined)?.code;
  const item = errorItem<TRes>(
    id,
    typeof code === "string" ? code : "THROWN",
    error instanceof Error ? error.message : String(error),
    isNetworkError(error),
  );
  return withDelivery(item, isNotSentError(error) ? "not-sent" : "indeterminate");
}

/**
 * This function waits `ms` milliseconds. It returns false at once when the signal aborts (deep
 * dive TRN-8: before, the backoff of the retry middleware ignored the signal).
 */
export function sleep(ms: number, signal?: AbortSignal, clock: Clock = realClock): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = (): void => {
      cancel();
      resolve(false);
    };
    // The clock of the caller (roadmap R35): a test gives a fake clock
    const cancel = clock.after(Math.max(0, ms), () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The value that `nextOrAbort` gives when the signal aborts first. */
export const ABORTED_FIRST: unique symbol = Symbol("aborted first");

/**
 * The next result of an iterator, or `ABORTED_FIRST` when the signal aborts first. A transport
 * that ignores the signal cannot keep the caller waiting past its timeout.
 */
export function nextOrAbort<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
): Promise<IteratorResult<T> | typeof ABORTED_FIRST> {
  if (signal.aborted) return Promise.resolve(ABORTED_FIRST);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve(ABORTED_FIRST);
    signal.addEventListener("abort", onAbort, { once: true });
    iterator.next().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
