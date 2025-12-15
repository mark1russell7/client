/**
 * Universal Client System
 *
 * Protocol-agnostic RPC client with middleware composition.
 * Works with HTTP, gRPC, WebSocket, and local transports.
 */
// Core Client
export { Client } from "./client.js";
export { ErrorSeverity, ErrorCategory } from "./errors/index.js";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./errors/index.js";
// Transport Adapters
export { HttpTransport, defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy } from "../adapters/http/client/index.js";
export { LocalTransport } from "../adapters/local/client/index.js";
export { WebSocketTransport } from "../adapters/websocket/client/index.js";
export { MockTransport, mockBuilder } from "../adapters/mock/client/index.js";
// Middleware
export { createRetryMiddleware } from "./middleware/retry.js";
``;
export { createCacheMiddleware } from "./middleware/cache.js";
export { createTimeoutMiddleware, createOverallTimeoutMiddleware, createCombinedTimeoutMiddleware, } from "./middleware/timeout.js";
export { createPaginationMiddleware, paginateAll } from "./middleware/pagination.js";
export { createCircuitBreakerMiddleware, CircuitBreakerError } from "./middleware/circuit-breaker.js";
export { createRateLimitMiddleware, createPerServiceRateLimiter, RateLimitError } from "./middleware/rate-limit.js";
export { createBatchingMiddleware, createAdaptiveBatchingMiddleware } from "./middleware/batching.js";
export { createAuthMiddleware, createBearerAuthMiddleware, createApiKeyAuthMiddleware, } from "./middleware/auth.js";
export { createTracingMiddleware, createSimpleTracingMiddleware, extractTracingInfo, } from "./middleware/tracing.js";
// Zod Validation Middleware
export { createZodMiddleware, ValidationError, methodToKey, keyToMethod } from "./validation/index.js";
// Context System
export { mergeContext, normalizeCallOptions, isCallOptions } from "./context.js";
export { ClientError } from "./types.js";
//# sourceMappingURL=index.js.map