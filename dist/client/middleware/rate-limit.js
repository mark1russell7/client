/**
 * Rate Limiting Middleware
 *
 * Throttles requests using token bucket algorithm.
 * Prevents overwhelming services with too many requests.
 *
 * Works with both client and server!
 */
/**
 * Rate limit error thrown when limit exceeded.
 */
export class RateLimitError extends Error {
    stats;
    constructor(message, stats) {
        super(message);
        this.stats = stats;
        this.name = "RateLimitError";
    }
}
/**
 * Create rate limiting middleware using token bucket algorithm.
 *
 * @param options - Rate limiting configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Reject strategy (default)
 * client.use(createRateLimitMiddleware({
 *   maxRequests: 100,    // 100 requests
 *   window: 60000,       // per minute
 *   strategy: "reject"   // Throw error when exceeded
 * }));
 *
 * // Queue strategy
 * client.use(createRateLimitMiddleware({
 *   maxRequests: 10,
 *   window: 1000,
 *   strategy: "queue",   // Queue requests when exceeded
 *   maxQueueSize: 50
 * }));
 * ```
 */
export function createRateLimitMiddleware(options = {}) {
    const { maxRequests = 100, window = 60000, strategy = "reject", maxQueueSize = 100, message = "Rate limit exceeded", onRateLimitExceeded, } = options;
    // Token bucket state
    let tokens = maxRequests;
    let lastRefill = Date.now();
    let totalRequests = 0;
    let rejectedRequests = 0;
    // Queue for "queue" strategy
    const queue = [];
    let processingQueue = false;
    /**
     * Refill tokens based on elapsed time.
     */
    function refillTokens() {
        const now = Date.now();
        const elapsed = now - lastRefill;
        if (elapsed >= window) {
            // Full refill
            tokens = maxRequests;
            lastRefill = now;
        }
        else {
            // Partial refill (tokens per millisecond * elapsed time)
            const tokensToAdd = (maxRequests / window) * elapsed;
            tokens = Math.min(maxRequests, tokens + tokensToAdd);
            lastRefill = now;
        }
    }
    /**
     * Get current statistics.
     */
    function getStats() {
        return {
            tokensAvailable: Math.floor(tokens),
            maxTokens: maxRequests,
            queueSize: queue.length,
            totalRequests,
            rejectedRequests,
        };
    }
    /**
     * Acquire a token (blocking for queue strategy).
     */
    async function acquireToken() {
        refillTokens();
        if (tokens >= 1) {
            // Token available
            tokens -= 1;
            return;
        }
        // No tokens available
        const stats = getStats();
        if (strategy === "reject") {
            // Reject immediately
            rejectedRequests++;
            if (onRateLimitExceeded) {
                onRateLimitExceeded(stats);
            }
            throw new RateLimitError(message, stats);
        }
        // Queue strategy - wait for token
        if (queue.length >= maxQueueSize) {
            rejectedRequests++;
            if (onRateLimitExceeded) {
                onRateLimitExceeded(stats);
            }
            throw new RateLimitError(`${message} (queue full)`, stats);
        }
        return new Promise((resolve, reject) => {
            queue.push({
                resolve,
                reject,
                timestamp: Date.now(),
            });
            // Start processing queue if not already running
            if (!processingQueue) {
                processQueue();
            }
        });
    }
    /**
     * Process queued requests.
     */
    function processQueue() {
        if (processingQueue || queue.length === 0) {
            return;
        }
        processingQueue = true;
        const interval = setInterval(() => {
            refillTokens();
            while (queue.length > 0 && tokens >= 1) {
                const request = queue.shift();
                if (request) {
                    tokens -= 1;
                    request.resolve();
                }
            }
            if (queue.length === 0) {
                clearInterval(interval);
                processingQueue = false;
            }
        }, 100); // Check every 100ms
    }
    return (next) => {
        return async function* (context) {
            totalRequests++;
            // Acquire token (may throw or wait)
            await acquireToken();
            // Execute request
            yield* next(context);
        };
    };
}
/**
 * Create per-service rate limiter.
 *
 * Applies different rate limits based on service name.
 *
 * @example
 * ```typescript
 * client.use(createPerServiceRateLimiter({
 *   users: { maxRequests: 100, window: 60000 },
 *   orders: { maxRequests: 50, window: 60000 },
 *   default: { maxRequests: 200, window: 60000 }
 * }));
 * ```
 */
export function createPerServiceRateLimiter(limits) {
    // Create rate limiter for each service
    const limiters = new Map();
    for (const [service, options] of Object.entries(limits)) {
        limiters.set(service, createRateLimitMiddleware(options));
    }
    const defaultLimiter = limits.default
        ? createRateLimitMiddleware(limits.default)
        : null;
    return (next) => {
        return async function* (context) {
            // Get service name from context
            const service = context.message.method.service;
            // Get appropriate limiter
            const limiter = limiters.get(service) ?? defaultLimiter;
            if (limiter) {
                // Apply service-specific rate limit
                const typedLimiter = limiter;
                const limitedNext = typedLimiter(next);
                yield* limitedNext(context);
            }
            else {
                // No rate limit for this service
                yield* next(context);
            }
        };
    };
}
//# sourceMappingURL=rate-limit.js.map