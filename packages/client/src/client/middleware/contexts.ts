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

// =============================================================================
// Retry Middleware Context
// =============================================================================

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

// =============================================================================
// Cache Middleware Context
// =============================================================================

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

// =============================================================================
// Timeout Middleware Context
// =============================================================================

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

// =============================================================================
// Auth Middleware Context
// =============================================================================

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

// =============================================================================
// Tracing Middleware Context
// =============================================================================

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

// =============================================================================
// Circuit Breaker Middleware Context
// =============================================================================

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

// =============================================================================
// Rate Limit Middleware Context
// =============================================================================

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

// =============================================================================
// Batching Middleware Context
// =============================================================================

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

// =============================================================================
// Pagination Middleware Context
// =============================================================================

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

// =============================================================================
// Combined / Utility Types
// =============================================================================

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
export type AnyMiddlewareContext =
  | RetryContext
  | CacheContext
  | TimeoutContext
  | AuthContext
  | TracingContext
  | CircuitBreakerContext
  | RateLimitContext
  | BatchingContext
  | PaginationContext;

/**
 * All middleware contexts combined.
 * Represents a fully-configured client with all middleware.
 */
export type FullContext = BaseClientContext &
  RetryContext &
  CacheContext &
  TimeoutContext &
  AuthContext &
  TracingContext &
  CircuitBreakerContext &
  RateLimitContext &
  BatchingContext &
  PaginationContext;

// =============================================================================
// Context Type Guards
// =============================================================================

/**
 * Check if context has retry information.
 */
export function hasRetryContext(ctx: unknown): ctx is RetryContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "retry" in ctx &&
    typeof (ctx as RetryContext).retry === "object"
  );
}

/**
 * Check if context has cache information.
 */
export function hasCacheContext(ctx: unknown): ctx is CacheContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "cache" in ctx &&
    typeof (ctx as CacheContext).cache === "object"
  );
}

/**
 * Check if context has auth information.
 */
export function hasAuthContext(ctx: unknown): ctx is AuthContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "auth" in ctx &&
    typeof (ctx as AuthContext).auth === "object"
  );
}

/**
 * Check if context has tracing information.
 */
export function hasTracingContext(ctx: unknown): ctx is TracingContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "tracing" in ctx &&
    typeof (ctx as TracingContext).tracing === "object"
  );
}

/**
 * Check if context has circuit breaker information.
 */
export function hasCircuitBreakerContext(ctx: unknown): ctx is CircuitBreakerContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "circuitBreaker" in ctx &&
    typeof (ctx as CircuitBreakerContext).circuitBreaker === "object"
  );
}

/**
 * Check if context has rate limit information.
 */
export function hasRateLimitContext(ctx: unknown): ctx is RateLimitContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "rateLimit" in ctx &&
    typeof (ctx as RateLimitContext).rateLimit === "object"
  );
}
