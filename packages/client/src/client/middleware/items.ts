/**
 * Helpers that the client middlewares share.
 *
 * The transports report a failure as an error item, not as a thrown error. The middlewares use
 * the same style: a timeout, an abort or a refused retry is an error item, and `Client` throws
 * it when `throwOnError` is on (deep dive TRN-7: before, the timeout middleware waited for a
 * thrown error that the transports never threw).
 */

import type { ResponseItem } from "../types.js";

/** This function makes an error item. */
export function errorItem<TRes>(id: string, code: string, message: string, retryable: boolean): ResponseItem<TRes> {
  return { id, status: { type: "error", code, message, retryable }, payload: null as TRes, metadata: {} };
}

/** The error item of a request that its caller aborted. A retry does not repeat it. */
export function abortedItem<TRes>(id: string): ResponseItem<TRes> {
  return errorItem<TRes>(id, "ABORTED", "Request was aborted", false);
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

/**
 * The item that stands for a thrown error, so that `shouldRetry` can decide about it. It is
 * retryable only when the error is a network failure.
 */
export function thrownItem<TRes>(id: string, error: unknown): ResponseItem<TRes> {
  const code = (error as { code?: unknown } | undefined)?.code;
  return errorItem<TRes>(
    id,
    typeof code === "string" ? code : "THROWN",
    error instanceof Error ? error.message : String(error),
    isNetworkError(error),
  );
}

/**
 * This function waits `ms` milliseconds. It returns false at once when the signal aborts (deep
 * dive TRN-8: before, the backoff of the retry middleware ignored the signal).
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, Math.max(0, ms));
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
