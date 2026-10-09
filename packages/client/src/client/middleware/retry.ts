/**
 * Universal Retry Middleware
 *
 * Protocol-agnostic retry with exponential backoff and jitter.
 * Works with any transport!
 */

import type { ClientRunner, ClientContext, ResponseItem, TypedClientMiddleware } from "../types.js";
import type { RetryContext } from "./contexts.js";
import { abortedItem, sleep, thrownItem } from "./items.js";

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
   * Base delay in milliseconds for exponential backoff.
   * Actual delay will be: baseDelay * 2^attempt + jitter
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Maximum jitter as a fraction of the delay (0-1).
   * Adds randomness to prevent thundering herd.
   * @default 0.1 (10% jitter)
   */
  jitter?: number;

  /**
   * Custom function to determine if a request should be retried.
   * Takes precedence over Status.retryable flag.
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
 * - **Context override**: Values from metadata.retry take precedence over options
 *
 * @param options - Retry configuration (defaults, can be overridden per-call)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Create middleware with defaults
 * client.use(createRetryMiddleware({ maxRetries: 3 }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { retry: { maxAttempts: 5 } }
 * });
 * ```
 */
export function createRetryMiddleware(options: RetryOptions = {}): TypedClientMiddleware<RetryContext, {}> {
  const {
    retryDelay: defaultRetryDelay = 1000,
    jitter: defaultJitter = 0.1,
    shouldRetry: customShouldRetry,
    onBeforeRetry,
    onAfterRetry,
  } = options;
  const defaultMaxRetries = options.maxRetries ?? 3;

  /** The backoff delay of an attempt: exponential, with jitter */
  const backoffDelay = (attempt: number): number => {
    const baseDelay = defaultRetryDelay * Math.pow(2, attempt);
    const jitterAmount = defaultJitter * baseDelay * (Math.random() * 2 - 1);
    return Math.max(0, baseDelay + jitterAmount);
  };

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Read from metadata first (user-provided context), then fall back to options
      const maxRetries = (context.message.metadata.retry as RetryContext["retry"] | undefined)?.maxAttempts
        ?? defaultMaxRetries;
      const shouldRetryItem = (item: ResponseItem<TRes>, attempt: number): boolean =>
        customShouldRetry
          ? customShouldRetry(item, attempt)
          : item.status.type === "error" && item.status.retryable;
      const signal = context.message.signal;
      const baseId = context.message.id;

      let attempt = 0;
      for (;;) {
        // Update retry metadata with current state
        context.message.metadata.retry = {
          attempt,
          maxAttempts: maxRetries,
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

        let delay = backoffDelay(attempt);

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
