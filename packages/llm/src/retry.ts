/**
 * The automatic retry of a request to the Messages API.
 *
 * A request that fails with an `LlmError` with `retryable: true` (429, 529 and the other 5xx
 * statuses, 408, 409, a connection error, an error event at the start of a stream) gets a new
 * try. The wait before a try is the `retry-after-ms` or `retry-after` header of the API, or the
 * backoff of `@mark1russell7/service/backoff`. A wait that ends after the deadline of the call
 * gives the error at once. The abort of the caller stops a wait with `ABORTED`.
 */

import { backoffDelay, type Backoff } from "@mark1russell7/service/backoff";
import { InvocationError } from "@procedures/client";
import { LlmError } from "./errors.js";
import type { CallLimits } from "./anthropic.js";

/** The default number of new tries after a retryable error, as in the Anthropic SDKs. */
export const DEFAULT_REQUEST_RETRIES = 2;
/** The most new tries that an input or the module can ask for. */
export const MAX_REQUEST_RETRIES = 10;
/** The longest wait that a `retry-after` header can ask for: 60 seconds. A longer wait gives the error at once. */
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * The default backoff: 500 ms before the first new try, then two times more each time, at most
 * 8 seconds. A jitter removes up to a quarter of each wait.
 */
export const DEFAULT_BACKOFF: Backoff = Object.freeze({
  base: 500,
  factor: 2,
  cap: 8_000,
  jitter: Object.freeze({ kind: "subtract", fraction: 0.25 }),
});

/** What a retry uses: the backoff policy and the number of new tries. */
export interface RetryPolicy {
  readonly backoff: Backoff;
  readonly retries: number;
}

/**
 * This function gives the wait that the headers of an answer ask for, in milliseconds, or
 * undefined. It reads `retry-after-ms`, then `retry-after` as seconds or as an HTTP date.
 */
export function retryAfterMs(headers: Pick<Headers, "get">, now: number = Date.now()): number | undefined {
  const milliseconds = headers.get("retry-after-ms");
  if (milliseconds !== null && milliseconds.trim() !== "") {
    const value = Number(milliseconds);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const after = headers.get("retry-after");
  if (after === null || after.trim() === "") return undefined;
  const seconds = Number(after);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
  const date = Date.parse(after);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** The time that is left before the deadline of the capability, or undefined. */
export function deadlineLeft(ctx: CallLimits["ctx"]): number | undefined {
  const deadline = ctx?.capability?.deadline;
  return typeof deadline === "number" ? deadline - Date.now() : undefined;
}

/** This function waits `ms` milliseconds. The abort of the signal stops the wait with `ABORTED`. */
function sleep(ms: number, limits: CallLimits): Promise<void> {
  const signal = limits.ctx?.signal;
  const aborted = (): InvocationError => new InvocationError("ABORTED", `Procedure was aborted: ${limits.path.join(".")}`, limits.path);
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * This function decides about a new try after an error. It waits and gives true, or it gives
 * false at once. `retry` is the number of the new try: the first new try is 1.
 */
export async function waitToRetry(error: unknown, retry: number, policy: RetryPolicy, limits: CallLimits): Promise<boolean> {
  if (retry > policy.retries) return false;
  if (!(error instanceof LlmError) || !error.retryable) return false;
  const after = error.retryAfterMs;
  if (after !== undefined && after > MAX_RETRY_AFTER_MS) return false;
  const wait = after ?? backoffDelay(policy.backoff, retry);
  const left = deadlineLeft(limits.ctx);
  if (left !== undefined && wait >= left) return false;
  await sleep(wait, limits);
  return true;
}

/**
 * This function runs `attempt` and gives its result. After a retryable error, it waits and
 * runs `attempt` again, at most `policy.retries` more times. The last error goes to the caller.
 */
export async function withRetries<T>(attempt: () => Promise<T>, policy: RetryPolicy, limits: CallLimits): Promise<T> {
  for (let retry = 1; ; retry++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(await waitToRetry(error, retry, policy, limits))) throw error;
    }
  }
}
