/**
 * Rate Limiting Middleware
 *
 * Throttles requests using token bucket algorithm.
 * Prevents overwhelming services with too many requests.
 *
 * Works with both client and server!
 */
import type { ClientMiddleware } from "../types";
/**
 * Rate limiting options.
 */
export interface RateLimitOptions {
    /**
     * Maximum number of requests per time window.
     * @default 100
     */
    maxRequests?: number;
    /**
     * Time window in milliseconds.
     * @default 60000 (1 minute)
     */
    window?: number;
    /**
     * Behavior when rate limit is exceeded.
     * - "reject": Throw error immediately
     * - "queue": Queue requests and process when capacity available
     * @default "reject"
     */
    strategy?: "reject" | "queue";
    /**
     * Maximum queue size (only for "queue" strategy).
     * @default 100
     */
    maxQueueSize?: number;
    /**
     * Custom error message.
     */
    message?: string;
    /**
     * Callback when rate limit is exceeded.
     */
    onRateLimitExceeded?: (stats: RateLimitStats) => void;
}
/**
 * Rate limit statistics.
 */
export interface RateLimitStats {
    tokensAvailable: number;
    maxTokens: number;
    queueSize: number;
    totalRequests: number;
    rejectedRequests: number;
}
/**
 * Rate limit error thrown when limit exceeded.
 */
export declare class RateLimitError extends Error {
    readonly stats: RateLimitStats;
    constructor(message: string, stats: RateLimitStats);
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
export declare function createRateLimitMiddleware(options?: RateLimitOptions): ClientMiddleware;
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
export declare function createPerServiceRateLimiter(limits: Record<string, RateLimitOptions> & {
    default?: RateLimitOptions;
}): ClientMiddleware;
//# sourceMappingURL=rate-limit.d.ts.map