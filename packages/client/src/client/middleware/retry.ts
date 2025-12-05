/**
 * Universal Retry Middleware
 *
 * Protocol-agnostic retry with exponential backoff and jitter.
 * Works with any transport!
 */

import type { ClientMiddleware, ClientRunner, ClientContext, ResponseItem } from "../types";

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
 *
 * @param options - Retry configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createRetryMiddleware({
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   jitter: 0.1,
 *   onBeforeRetry: async (item, attempt) => {
 *     console.log(`Retrying after ${item.status.message}, attempt ${attempt}`);
 *     return { shouldRetry: true };
 *   }
 * }));
 * ```
 */
export function createRetryMiddleware(options: RetryOptions = {}): ClientMiddleware {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    jitter = 0.1,
    shouldRetry: customShouldRetry,
    onBeforeRetry,
    onAfterRetry,
  } = options;

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      let attempt = 0;
      let lastItem: ResponseItem<TRes> | null = null;

      while (attempt <= maxRetries) {
        // Update retry metadata
        context.message.metadata.retry = {
          attempt,
          maxAttempts: maxRetries,
        };

        // Check if cancelled before attempt
        if (context.message.signal?.aborted) {
          throw new Error("Request was aborted");
        }

        try {
          // Execute request
          const responseStream = next(context);

          // Collect all items from stream
          const items: ResponseItem<TRes>[] = [];
          for await (const item of responseStream) {
            items.push(item);
            lastItem = item;
          }

          // Check if we should retry based on last item
          const shouldRetryRequest = customShouldRetry
            ? customShouldRetry(lastItem!, attempt)
            : lastItem?.status.type === "error" && lastItem.status.retryable;

          if (shouldRetryRequest && attempt < maxRetries) {
            // Before retry hook
            if (onBeforeRetry) {
              const hookResult = await onBeforeRetry(lastItem!, attempt);
              if (!hookResult.shouldRetry) {
                // Hook decided not to retry - yield items and return
                for (const item of items) {
                  yield item;
                }
                if (onAfterRetry) {
                  await onAfterRetry(false, attempt);
                }
                return;
              }

              // Use custom delay if provided by hook
              if (hookResult.delayMs !== undefined) {
                await new Promise((resolve) => setTimeout(resolve, hookResult.delayMs));
                attempt++;
                continue;
              }
            }

            // Calculate delay with exponential backoff and jitter
            const baseDelay = retryDelay * Math.pow(2, attempt);
            const jitterAmount = jitter * baseDelay * (Math.random() * 2 - 1);
            const delay = Math.max(0, baseDelay + jitterAmount);

            await new Promise((resolve) => setTimeout(resolve, delay));
            attempt++;
            continue; // Retry
          }

          // Success or non-retryable - yield all items
          for (const item of items) {
            yield item;
          }

          if (onAfterRetry) {
            await onAfterRetry(lastItem?.status.type === "success", attempt);
          }

          return;
        } catch (error) {
          // Handle stream errors
          const isAborted =
            context.message.signal?.aborted || (error instanceof Error && error.name === "AbortError");

          if (isAborted) {
            throw error;
          }

          if (attempt >= maxRetries) {
            throw error;
          }

          // Check if error is retryable using custom predicate
          if (customShouldRetry && lastItem) {
            const customRetry = customShouldRetry(lastItem, attempt);
            if (!customRetry) {
              throw error;
            }
          }

          // Calculate delay with exponential backoff and jitter
          const baseDelay = retryDelay * Math.pow(2, attempt);
          const jitterAmount = jitter * baseDelay * (Math.random() * 2 - 1);
          const delay = Math.max(0, baseDelay + jitterAmount);

          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
        }
      }

      throw new Error(`Max retries (${maxRetries}) exceeded`);
    };
  };
}
