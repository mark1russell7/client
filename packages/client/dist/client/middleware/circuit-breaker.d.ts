/**
 * Circuit Breaker Middleware
 *
 * Prevents cascading failures by failing fast when a service is unhealthy.
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation (requests pass through)
 * - OPEN: Service unhealthy (requests fail immediately)
 * - HALF_OPEN: Testing if service recovered (limited requests)
 *
 * Works with both client and server!
 */
import type { ClientMiddleware, TypedClientMiddleware } from "../types.js";
import type { CircuitBreakerContext } from "./contexts.js";
/**
 * Circuit breaker state.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
/**
 * Circuit breaker options.
 */
export interface CircuitBreakerOptions {
    /**
     * Number of failures before opening circuit.
     * @default 5
     */
    failureThreshold?: number;
    /**
     * Time window for counting failures (in milliseconds).
     * @default 10000 (10 seconds)
     */
    failureWindow?: number;
    /**
     * Time to wait before attempting to close circuit (in milliseconds).
     * @default 30000 (30 seconds)
     */
    resetTimeout?: number;
    /**
     * Number of successful requests required to close circuit from HALF_OPEN.
     * @default 2
     */
    successThreshold?: number;
    /**
     * Custom error predicate.
     * Return true if error should count as failure.
     * @default All errors count as failures
     */
    isFailure?: (error: Error) => boolean;
    /**
     * Callback when circuit state changes.
     */
    onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}
/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    totalRequests: number;
    lastFailureTime: number | null;
    lastStateChange: number;
}
/**
 * Circuit breaker error thrown when circuit is open.
 */
export declare class CircuitBreakerError extends Error {
    readonly state: CircuitState;
    readonly lastError: Error | null;
    constructor(state: CircuitState, lastError: Error | null);
}
/**
 * Create circuit breaker middleware.
 *
 * Automatically opens circuit when failure threshold is reached,
 * preventing requests from reaching unhealthy services.
 *
 * @param options - Circuit breaker configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createCircuitBreakerMiddleware({
 *   failureThreshold: 5,      // Open after 5 failures
 *   failureWindow: 10000,      // Within 10 seconds
 *   resetTimeout: 30000,       // Try again after 30 seconds
 *   successThreshold: 2        // Close after 2 successes
 * }));
 * ```
 */
export declare function createCircuitBreakerMiddleware(options?: CircuitBreakerOptions): TypedClientMiddleware<CircuitBreakerContext, {}>;
/**
 * Get circuit breaker statistics.
 *
 * Note: This requires storing the middleware instance to access stats.
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreakerMiddleware();
 * client.use(breaker);
 *
 * // Later...
 * const stats = getCircuitBreakerStats(breaker);
 * ```
 */
export declare function getCircuitBreakerStats(_middleware: ClientMiddleware): CircuitBreakerStats | null;
//# sourceMappingURL=circuit-breaker.d.ts.map