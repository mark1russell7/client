/**
 * Universal Client System
 *
 * Protocol-agnostic RPC client with middleware composition.
 * Works with HTTP, gRPC, WebSocket, and local transports.
 */
// Core Client
export { Client } from "./client";
export { ErrorSeverity, ErrorCategory } from "./errors";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./errors";
// Transport Adapters
export { HttpTransport, defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy } from "../adapters/http/client";
export { LocalTransport } from "../adapters/local/client";
export { WebSocketTransport } from "../adapters/websocket/client";
export { MockTransport, mockBuilder } from "../adapters/mock/client";
// Middleware
export { createRetryMiddleware } from "./middleware/retry";
export { createCacheMiddleware } from "./middleware/cache";
export { createTimeoutMiddleware, createOverallTimeoutMiddleware, createCombinedTimeoutMiddleware, } from "./middleware/timeout";
export { createPaginationMiddleware, paginateAll } from "./middleware/pagination";
export { createCircuitBreakerMiddleware, CircuitBreakerError } from "./middleware/circuit-breaker";
export { createRateLimitMiddleware, createPerServiceRateLimiter, RateLimitError } from "./middleware/rate-limit";
export { createBatchingMiddleware, createAdaptiveBatchingMiddleware } from "./middleware/batching";
export { createAuthMiddleware, createBearerAuthMiddleware, createApiKeyAuthMiddleware, } from "./middleware/auth";
export { createTracingMiddleware, createSimpleTracingMiddleware, extractTracingInfo, } from "./middleware/tracing";
export { ClientError } from "./types";
//# sourceMappingURL=index.js.map