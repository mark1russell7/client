/**
 * Universal Timeout Middleware
 *
 * Protocol-agnostic timeout handling with per-request and overall timeouts.
 * Works with any transport!
 */
import type { TypedClientMiddleware } from "../types";
import type { TimeoutContext } from "./contexts";
/**
 * Timeout middleware options.
 */
export interface TimeoutOptions {
    /**
     * Timeout in milliseconds for the entire request (including retries).
     * @default undefined (no overall timeout)
     */
    overall?: number;
    /**
     * Timeout in milliseconds for each individual attempt.
     * Useful with retry middleware for per-attempt timeouts.
     * @default undefined (no per-attempt timeout)
     */
    perAttempt?: number;
    /**
     * Custom timeout error message.
     * @default "Request timeout"
     */
    message?: string;
}
/**
 * Create overall timeout middleware.
 *
 * Applies timeout to the entire request, including all retry attempts.
 * If timeout is exceeded, the request is aborted.
 *
 * @param options - Timeout configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createOverallTimeoutMiddleware({ overall: 5000 })); // 5 seconds total
 * ```
 */
export declare function createOverallTimeoutMiddleware(options: Pick<TimeoutOptions, "overall" | "message">): TypedClientMiddleware<TimeoutContext, {}>;
/**
 * Create per-attempt timeout middleware.
 *
 * Applies timeout to each individual attempt (useful with retry middleware).
 * Each retry gets a fresh timeout.
 *
 * @param options - Timeout configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createTimeoutMiddleware({ perAttempt: 1000 })); // 1 second per attempt
 * ```
 */
export declare function createTimeoutMiddleware(options: Pick<TimeoutOptions, "perAttempt" | "message">): TypedClientMiddleware<TimeoutContext, {}>;
/**
 * Create combined timeout middleware with both overall and per-attempt timeouts.
 *
 * @param options - Timeout configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createCombinedTimeoutMiddleware({
 *   overall: 5000,     // 5 seconds total
 *   perAttempt: 1000   // 1 second per attempt
 * }));
 * ```
 */
export declare function createCombinedTimeoutMiddleware(options: TimeoutOptions): TypedClientMiddleware<TimeoutContext, {}>;
//# sourceMappingURL=timeout.d.ts.map