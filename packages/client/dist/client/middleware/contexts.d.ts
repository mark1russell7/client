/**
 * Middleware Context Types
 *
 * Each middleware declares what context it provides and requires through
 * these type definitions. This enables compile-time validation of middleware
 * chains and type-safe context accumulation.
 *
 * @example
 * ```typescript
 * // Middleware composition with type accumulation
 * const client = new Client(transport)
 *   .use(createRetryMiddleware())     // Client<BaseContext & RetryContext>
 *   .use(createCacheMiddleware())     // Client<... & CacheContext>
 *   .use(createAuthMiddleware(...))   // Client<... & AuthContext>
 * ```
 */
/**
 * Context provided by retry middleware.
 * Tracks retry state for observability and dependent middleware.
 */
export interface RetryContext {
    retry: {
        /** Current attempt number (0-indexed) */
        attempt: number;
        /** Maximum number of attempts configured */
        maxAttempts: number;
    };
}
/**
 * Context provided by cache middleware.
 * Tracks cache state for observability.
 */
export interface CacheContext {
    cache: {
        /** Whether the response was served from cache */
        hit: boolean;
        /** The cache key used for this request */
        key: string;
    };
}
/**
 * Context provided by timeout middleware.
 * Tracks timeout configuration.
 */
export interface TimeoutContext {
    timeout: {
        /** Overall timeout in milliseconds (if configured) */
        overall?: number;
        /** Per-attempt timeout in milliseconds (if configured) */
        perAttempt?: number;
    };
}
/**
 * Context provided by auth middleware.
 * Contains authentication credentials added to requests.
 */
export interface AuthContext {
    auth: {
        /** Bearer token (if provided) */
        token?: string;
        /** API key (if provided) */
        apiKey?: string;
        /** User ID (if provided) */
        userId?: string;
        /** Additional custom auth fields */
        [key: string]: unknown;
    };
}
/**
 * Context provided by tracing middleware.
 * Contains distributed tracing identifiers.
 */
export interface TracingContext {
    tracing: {
        /** Trace ID for the entire distributed trace */
        traceId: string;
        /** Span ID for this specific operation */
        spanId: string;
        /** Parent span ID (if continuing existing trace) */
        parentSpanId?: string;
    };
}
/**
 * Circuit breaker state values.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
/**
 * Context provided by circuit breaker middleware.
 * Tracks circuit breaker state for observability.
 */
export interface CircuitBreakerContext {
    circuitBreaker: {
        /** Current circuit state */
        state: CircuitState;
        /** Number of recent failures */
        failures: number;
        /** Number of successes in HALF_OPEN state */
        successes: number;
    };
}
/**
 * Context provided by rate limit middleware.
 * Tracks rate limiting state.
 */
export interface RateLimitContext {
    rateLimit: {
        /** Tokens currently available */
        tokensAvailable: number;
        /** Maximum tokens */
        maxTokens: number;
        /** Requests currently queued */
        queueSize: number;
    };
}
/**
 * Context provided by batching middleware.
 * Tracks batching state.
 */
export interface BatchingContext {
    batching: {
        /** Batch key this request belongs to */
        batchKey: string;
        /** Current batch size */
        batchSize: number;
    };
}
/**
 * Context provided by pagination middleware.
 * Tracks pagination parameters.
 */
export interface PaginationContext {
    pagination: {
        /** Current page (for page-based pagination) */
        page?: number;
        /** Current offset (for offset-based pagination) */
        offset?: number;
        /** Page size limit */
        limit: number;
    };
}
/**
 * Context provided by Zod validation middleware.
 * Re-exported from validation module for consistency.
 */
export type { ZodValidationContext } from "../validation/types";
/**
 * Base context that all clients start with.
 * Contains the minimum required context for any request.
 */
export interface BaseClientContext {
    /** The request message being processed */
    message: {
        id: string;
        method: {
            service: string;
            operation: string;
            version?: string;
        };
        payload: unknown;
        metadata: Record<string, unknown>;
        signal?: AbortSignal;
    };
}
/**
 * Union of all middleware contexts.
 * Useful for type guards and runtime checks.
 */
export type AnyMiddlewareContext = RetryContext | CacheContext | TimeoutContext | AuthContext | TracingContext | CircuitBreakerContext | RateLimitContext | BatchingContext | PaginationContext;
/**
 * All middleware contexts combined.
 * Represents a fully-configured client with all middleware.
 */
export type FullContext = BaseClientContext & RetryContext & CacheContext & TimeoutContext & AuthContext & TracingContext & CircuitBreakerContext & RateLimitContext & BatchingContext & PaginationContext;
/**
 * Check if context has retry information.
 */
export declare function hasRetryContext(ctx: unknown): ctx is RetryContext;
/**
 * Check if context has cache information.
 */
export declare function hasCacheContext(ctx: unknown): ctx is CacheContext;
/**
 * Check if context has auth information.
 */
export declare function hasAuthContext(ctx: unknown): ctx is AuthContext;
/**
 * Check if context has tracing information.
 */
export declare function hasTracingContext(ctx: unknown): ctx is TracingContext;
/**
 * Check if context has circuit breaker information.
 */
export declare function hasCircuitBreakerContext(ctx: unknown): ctx is CircuitBreakerContext;
/**
 * Check if context has rate limit information.
 */
export declare function hasRateLimitContext(ctx: unknown): ctx is RateLimitContext;
//# sourceMappingURL=contexts.d.ts.map