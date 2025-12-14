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
 * **Context Override**: metadata.timeout.overall takes precedence over options.
 *
 * @param options - Timeout configuration (defaults, can be overridden per-call)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Create middleware with default timeout
 * client.use(createOverallTimeoutMiddleware({ overall: 5000 }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { timeout: { overall: 10000 } }
 * });
 * ```
 */
export declare function createOverallTimeoutMiddleware(options: Pick<TimeoutOptions, "overall" | "message">): TypedClientMiddleware<TimeoutContext, {}>;
/**
 * Create per-attempt timeout middleware.
 *
 * Applies timeout to each individual attempt (useful with retry middleware).
 * Each retry gets a fresh timeout.
 *
 * **Context Override**: metadata.timeout.perAttempt takes precedence over options.
 *
 * @param options - Timeout configuration (defaults, can be overridden per-call)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Create middleware with default timeout
 * client.use(createTimeoutMiddleware({ perAttempt: 1000 }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { timeout: { perAttempt: 2000 } }
 * });
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