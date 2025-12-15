/**
 * Universal Client System
 *
 * Protocol-agnostic RPC client with middleware composition.
 * Works with HTTP, gRPC, WebSocket, and local transports.
 */
export { Client } from "./client.js";
export type { ErrorMetadata, ErrorRegistry, ErrorContext, RichError } from "./errors/index.js";
export { ErrorSeverity, ErrorCategory } from "./errors/index.js";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./errors/index.js";
export { HttpTransport, defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy } from "../adapters/http/client/index.js";
export type { HttpTransportOptions, UrlStrategy, HttpMethodStrategy } from "../adapters/http/client/index.js";
export { LocalTransport } from "../adapters/local/client/index.js";
export type { LocalTransportOptions, Handler } from "../adapters/local/client/index.js";
export { WebSocketTransport } from "../adapters/websocket/client/index.js";
export type { WebSocketTransportOptions, WebSocketState } from "../adapters/websocket/client/index.js";
export { MockTransport, mockBuilder } from "../adapters/mock/client/index.js";
export type { MockTransportOptions, MockResponse, ResponseMatcher, CallHistoryEntry, } from "../adapters/mock/client//index.js";
export { createRetryMiddleware } from "./middleware/retry.js";
export type { RetryOptions } from "./middleware/retry.js";
export { createCacheMiddleware } from "./middleware/cache.js";
export type { CacheOptions, CacheStats } from "./middleware/cache.js";
export { createTimeoutMiddleware, createOverallTimeoutMiddleware, createCombinedTimeoutMiddleware, } from "./middleware/timeout.js";
export type { TimeoutOptions } from "./middleware/timeout.js";
export { createPaginationMiddleware, paginateAll } from "./middleware/pagination.js";
export type { PaginationOptions } from "./middleware/pagination.js";
export { createCircuitBreakerMiddleware, CircuitBreakerError } from "./middleware/circuit-breaker.js";
export type { CircuitBreakerOptions, CircuitBreakerStats, CircuitState } from "./middleware/circuit-breaker.js";
export { createRateLimitMiddleware, createPerServiceRateLimiter, RateLimitError } from "./middleware/rate-limit.js";
export type { RateLimitOptions, RateLimitStats } from "./middleware/rate-limit.js";
export { createBatchingMiddleware, createAdaptiveBatchingMiddleware } from "./middleware/batching.js";
export type { BatchingOptions, BatchingStats } from "./middleware/batching.js";
export { createAuthMiddleware, createBearerAuthMiddleware, createApiKeyAuthMiddleware, } from "./middleware/auth.js";
export type { AuthOptions } from "./middleware/auth.js";
export { createTracingMiddleware, createSimpleTracingMiddleware, extractTracingInfo, } from "./middleware/tracing.js";
export type { TracingOptions } from "./middleware/tracing.js";
export { createZodMiddleware, ValidationError, methodToKey, keyToMethod } from "./validation/index.js";
export type { ZodMiddlewareOptions, ValidationMode, ZodLike, ZodErrorLike, SchemaDefinition, ValidationPhase, ZodValidationContext, } from "./validation/index.js";
export { mergeContext, normalizeCallOptions, isCallOptions } from "./context.js";
export type { CallOptions, ClientContextInput, MiddlewareContextFields, SchemaOverride } from "./context.js";
export type { Transport, Method, Metadata, Message, ResponseItem, Status, ClientContext, ClientRunner, ClientMiddleware, ClientOptions, } from "./types.js";
export { ClientError } from "./types.js";
//# sourceMappingURL=index.d.ts.map