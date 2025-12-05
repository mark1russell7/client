/**
 * Universal Client System
 *
 * Protocol-agnostic RPC client with middleware composition.
 * Works with HTTP, gRPC, WebSocket, and local transports.
 */
export { Client } from "./client";
export type { ErrorMetadata, ErrorRegistry, ErrorContext, RichError } from "./errors";
export { ErrorSeverity, ErrorCategory } from "./errors";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./errors";
export { HttpTransport, defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy } from "../adapters/http/client";
export type { HttpTransportOptions, UrlStrategy, HttpMethodStrategy } from "../adapters/http/client";
export { LocalTransport } from "../adapters/local/client";
export type { LocalTransportOptions, Handler } from "../adapters/local/client";
export { WebSocketTransport } from "../adapters/websocket/client";
export type { WebSocketTransportOptions, WebSocketState } from "../adapters/websocket/client";
export { MockTransport, mockBuilder } from "../adapters/mock/client";
export type { MockTransportOptions, MockResponse, ResponseMatcher, CallHistoryEntry, } from "../adapters/mock/client";
export { createRetryMiddleware } from "./middleware/retry";
export type { RetryOptions } from "./middleware/retry";
export { createCacheMiddleware } from "./middleware/cache";
export type { CacheOptions, CacheStats } from "./middleware/cache";
export { createTimeoutMiddleware, createOverallTimeoutMiddleware, createCombinedTimeoutMiddleware, } from "./middleware/timeout";
export type { TimeoutOptions } from "./middleware/timeout";
export { createPaginationMiddleware, paginateAll } from "./middleware/pagination";
export type { PaginationOptions } from "./middleware/pagination";
export { createCircuitBreakerMiddleware, CircuitBreakerError } from "./middleware/circuit-breaker";
export type { CircuitBreakerOptions, CircuitBreakerStats, CircuitState } from "./middleware/circuit-breaker";
export { createRateLimitMiddleware, createPerServiceRateLimiter, RateLimitError } from "./middleware/rate-limit";
export type { RateLimitOptions, RateLimitStats } from "./middleware/rate-limit";
export { createBatchingMiddleware, createAdaptiveBatchingMiddleware } from "./middleware/batching";
export type { BatchingOptions, BatchingStats } from "./middleware/batching";
export { createAuthMiddleware, createBearerAuthMiddleware, createApiKeyAuthMiddleware, } from "./middleware/auth";
export type { AuthOptions } from "./middleware/auth";
export { createTracingMiddleware, createSimpleTracingMiddleware, extractTracingInfo, } from "./middleware/tracing";
export type { TracingOptions } from "./middleware/tracing";
export type { Transport, Method, Metadata, Message, ResponseItem, Status, ClientContext, ClientRunner, ClientMiddleware, ClientOptions, } from "./types";
export { ClientError } from "./types";
//# sourceMappingURL=index.d.ts.map