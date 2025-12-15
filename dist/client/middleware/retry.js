/**
 * Universal Retry Middleware
 *
 * Protocol-agnostic retry with exponential backoff and jitter.
 * Works with any transport!
 */
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
export function createRetryMiddleware(options = {}) {
    const { retryDelay: defaultRetryDelay = 1000, jitter: defaultJitter = 0.1, shouldRetry: customShouldRetry, onBeforeRetry, onAfterRetry, } = options;
    const defaultMaxRetries = options.maxRetries ?? 3;
    return (next) => {
        return async function* (context) {
            // Read from metadata first (user-provided context), then fall back to options
            const maxRetries = context.message.metadata.retry?.maxAttempts
                ?? defaultMaxRetries;
            const retryDelay = defaultRetryDelay;
            const jitter = defaultJitter;
            let attempt = 0;
            let lastItem = null;
            while (attempt <= maxRetries) {
                // Update retry metadata with current state
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
                    const items = [];
                    for await (const item of responseStream) {
                        items.push(item);
                        lastItem = item;
                    }
                    // Check if we should retry based on last item
                    const shouldRetryRequest = customShouldRetry
                        ? customShouldRetry(lastItem, attempt)
                        : lastItem?.status.type === "error" && lastItem.status.retryable;
                    if (shouldRetryRequest && attempt < maxRetries) {
                        // Before retry hook
                        if (onBeforeRetry) {
                            const hookResult = await onBeforeRetry(lastItem, attempt);
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
                }
                catch (error) {
                    // Handle stream errors
                    const isAborted = context.message.signal?.aborted || (error instanceof Error && error.name === "AbortError");
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
//# sourceMappingURL=retry.js.map