/**
 * Universal Retry Middleware
 *
 * Protocol-agnostic retry with exponential backoff and jitter.
 * Works with any transport!
 */
import type { ClientMiddleware, ResponseItem } from "../types";
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
    onBeforeRetry?: (item: ResponseItem<unknown>, attempt: number) => Promise<{
        shouldRetry: boolean;
        delayMs?: number;
    }> | {
        shouldRetry: boolean;
        delayMs?: number;
    };
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
export declare function createRetryMiddleware(options?: RetryOptions): ClientMiddleware;
//# sourceMappingURL=retry.d.ts.map