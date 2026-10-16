/**
 * Universal Retry Middleware
 *
 * Protocol-agnostic retry with exponential backoff and jitter.
 * Works with any transport!
 */

import type { ClientRunner, ClientContext, Method, ResponseItem, TypedClientMiddleware } from "../types.js";
import type { RetryContext } from "./contexts.js";
import { abortedItem, deliveryOf, sleep, thrownItem } from "./items.js";
import { IDEMPOTENCY_KEY_METADATA, idempotencyKeyOf, newIdempotencyKey } from "../../procedures/idempotency.js";
import { isDuration, optionalMs, type Duration } from "../../duration.js";

/**
 * Retry middleware options.
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay for exponential backoff, for example `ms(500)`.
   * Actual delay will be: baseDelay * 2^attempt + jitter
   * @default 1 second
   */
  retryDelay?: Duration;

  /**
   * The factor of the delay from one attempt to the next.
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * The longest delay between two attempts.
   * @default no limit
   */
  maxDelay?: Duration;

  /**
   * Maximum jitter as a fraction of the delay (0-1).
   * Adds randomness to prevent thundering herd.
   * @default 0.1 (10% jitter)
   */
  jitter?: number;

  /**
   * The calls that the middleware can send again after a try with an indeterminate outcome: the
   * request left, and no answer came (a reset, a closed connection, the timeout of one try). The
   * server can have run such a call, so only an idempotent call goes again (roadmap R1).
   *
   * - a function: true for an idempotent method. `idempotentIn(registry)` reads the effects of
   *   the procedures that the client knows.
   * - `true`: every call. Use it only with a server that removes duplicate calls by their
   *   idempotency key (`ProcedureServer` does).
   * - absent: only a call with `retry: { idempotent: true }` in its context.
   *
   * A try that did not leave the client (a refused connection) and an error that the server
   * marks retryable go again in each case.
   */
  idempotent?: boolean | ((method: Method) => boolean | undefined);

  /**
   * Custom function to determine if a request should be retried.
   * Takes precedence over Status.retryable flag. The rule of `idempotent` still applies.
   *
   * @param item - The response item
   * @param attempt - Current attempt number (0-indexed)
   * @returns true if the request should be retried
   */
  shouldRetry?: (item: ResponseItem<unknown>, attempt: number) => boolean;

  /**
   * Hook called before each retry attempt.
   * Can modify delay or abort retry.
   *
   * @param item - The response item that triggered retry
   * @param attempt - Current attempt number (0-indexed)
   * @returns Object with shouldRetry and optional delayMs override
   */
  onBeforeRetry?: (
    item: ResponseItem<unknown>,
    attempt: number,
  ) => Promise<{ shouldRetry: boolean; delayMs?: number }> | { shouldRetry: boolean; delayMs?: number };

  /**
   * Hook called after each retry completes (success or failure).
   *
   * @param success - Whether the retry succeeded
   * @param attempt - Attempt number that just completed
   */
  onAfterRetry?: (success: boolean, attempt: number) => Promise<void> | void;
}

/**
 * Create retry middleware with exponential backoff and jitter.
 *
 * Features:
 * - Protocol-agnostic: Works with HTTP, gRPC, WebSocket, local
 * - Uses Status.retryable flag (no protocol-specific knowledge)
 * - Exponential backoff with jitter
 * - Custom retry predicates
 * - Before/after retry hooks
 * - Respects AbortSignal
 * - **Context override**: Values from metadata.retry take precedence over options:
 *   `maxAttempts`, `delay`, `backoffMultiplier` and `maxDelay` (the `route()` overrides)
 *
 * @param options - Retry configuration (defaults, can be overridden per-call)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Create middleware with defaults
 * client.use(createRetryMiddleware({ maxRetries: 3, retryDelay: ms(500) }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { retry: { maxAttempts: 5 } }
 * });
 * ```
 */
export function createRetryMiddleware(options: RetryOptions = {}): TypedClientMiddleware<RetryContext, {}> {
  const defaultRetryDelay = optionalMs(options.retryDelay, "retryDelay") ?? 1000;
  const {
    jitter: defaultJitter = 0.1,
    shouldRetry: customShouldRetry,
    onBeforeRetry,
    onAfterRetry,
    idempotent: idempotentOption,
  } = options;
  const defaultMaxRetries = options.maxRetries ?? 3;
  const defaultMultiplier = options.backoffMultiplier ?? 2;
  const defaultMaxDelay = optionalMs(options.maxDelay, "maxDelay") ?? Number.POSITIVE_INFINITY;

  /**
   * The overrides of one call (`retry: { ... }` in its context), with the delays in milliseconds.
   * Before, only maxAttempts was read.
   */
  const overridesOf = (value: unknown): { maxAttempts?: number; delay?: number; backoffMultiplier?: number; maxDelay?: number } => {
    if (typeof value !== "object" || value === null) return {};
    const out: { maxAttempts?: number; delay?: number; backoffMultiplier?: number; maxDelay?: number } = {};
    for (const key of ["maxAttempts", "backoffMultiplier"] as const) {
      const field = (value as Record<string, unknown>)[key];
      if (typeof field === "number" && Number.isFinite(field) && field >= 0) out[key] = field;
    }
    for (const key of ["delay", "maxDelay"] as const) {
      const field = (value as Record<string, unknown>)[key];
      if (field !== undefined) {
        if (!isDuration(field)) throw new TypeError(`retry.${key} must be a duration such as ms(500) (roadmap R11)`);
        out[key] = optionalMs(field, `retry.${key}`)!;
      }
    }
    return out;
  };

  /** The backoff delay of an attempt: exponential, with jitter, at most the maximum delay */
  const backoffDelay = (attempt: number, overrides: ReturnType<typeof overridesOf>): number => {
    const baseDelay = (overrides.delay ?? defaultRetryDelay) * Math.pow(overrides.backoffMultiplier ?? defaultMultiplier, attempt);
    const jitterAmount = defaultJitter * baseDelay * (Math.random() * 2 - 1);
    return Math.max(0, Math.min(overrides.maxDelay ?? defaultMaxDelay, baseDelay + jitterAmount));
  };

  /** True when the call can go again after an indeterminate try: the call says so, or the option. */
  const isIdempotent = (method: Method, value: unknown): boolean => {
    const own = typeof value === "object" && value !== null ? (value as { idempotent?: unknown }).idempotent : undefined;
    if (typeof own === "boolean") return own;
    if (typeof idempotentOption === "function") return idempotentOption(method) === true;
    return idempotentOption === true;
  };

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Read from metadata first (user-provided context), then fall back to options
      const given = context.message.metadata.retry;
      const overrides = overridesOf(given);
      const maxRetries = overrides.maxAttempts ?? defaultMaxRetries;
      const idempotent = isIdempotent(context.message.method, context.message.metadata.retry);
      const shouldRetryItem = (item: ResponseItem<TRes>, attempt: number): boolean => {
        const wanted = customShouldRetry
          ? customShouldRetry(item, attempt)
          : item.status.type === "error" && item.status.retryable;
        // A request that can have run goes again only when the call is idempotent (R1). Before,
        // a reset or a timeout of one try sent a write again.
        return wanted && (deliveryOf(item) !== "indeterminate" || idempotent);
      };
      const signal = context.message.signal;
      const baseId = context.message.id;
      // One key for all the tries of the call: a server that removes duplicates runs it one time
      const idempotencyKey = idempotencyKeyOf(context.message.metadata) ?? newIdempotencyKey();
      context.message.metadata[IDEMPOTENCY_KEY_METADATA] = idempotencyKey;

      let attempt = 0;
      for (;;) {
        // Update retry metadata with current state
        context.message.metadata.retry = {
          ...(typeof given === "object" && given !== null ? (given as object) : {}),
          attempt,
          maxAttempts: maxRetries,
          idempotent,
        };
        // Each attempt gets its own request id. The id correlates the frames of one attempt
        // on the wire: a cancelled attempt can still answer under its id (deep dive TRN-8/9).
        context.message.id = attempt === 0 ? baseId : `${baseId}.retry${attempt}`;

        // Check if cancelled before attempt
        if (signal?.aborted) {
          yield abortedItem<TRes>(context.message.id);
          return;
        }

        // The items pass through as they arrive (BUGS-2026-07 M2: before, the middleware
        // collected the whole stream first). A retry is possible only while no item has
        // reached the reader: the first item is a retryable error, or the attempt throws
        // before its first item. After that, a retry would repeat items.
        let started = false;
        let lastItem: ResponseItem<TRes> | undefined;
        let retryItem: ResponseItem<TRes> | undefined;
        try {
          for await (const item of next(context)) {
            if (!started && attempt < maxRetries && shouldRetryItem(item, attempt)) {
              retryItem = item;
              break;
            }
            started = true;
            lastItem = item;
            yield item;
          }
        } catch (error) {
          const isAborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");
          if (started || isAborted || attempt >= maxRetries) {
            throw error;
          }
          // A thrown error is retried only when it is a network failure, or when shouldRetry
          // says so. Before, every thrown error was retried: a validation error, an open
          // circuit breaker, a rate limit (deep dive TRN-8).
          const item = thrownItem<TRes>(context.message.id, error);
          if (!shouldRetryItem(item, attempt)) {
            throw error;
          }
          retryItem = item;
        }

        if (retryItem === undefined) {
          // Success, a non-retryable error, or the last attempt
          if (onAfterRetry) {
            await onAfterRetry(lastItem?.status.type === "success", attempt);
          }
          return;
        }

        let delay = backoffDelay(attempt, overrides);

        // Before retry hook
        if (onBeforeRetry) {
          const hookResult = await onBeforeRetry(retryItem, attempt);
          if (!hookResult.shouldRetry) {
            // Hook decided not to retry - yield the error and return
            yield retryItem;
            if (onAfterRetry) {
              await onAfterRetry(false, attempt);
            }
            return;
          }

          // Use custom delay if provided by hook
          if (hookResult.delayMs !== undefined) {
            delay = hookResult.delayMs;
          }
        }

        // The backoff stops at once when the caller aborts (deep dive TRN-8)
        if (!(await sleep(delay, signal))) {
          yield abortedItem<TRes>(context.message.id);
          return;
        }
        attempt++;
      }
    };
  };
}
