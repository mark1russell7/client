/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition,
 * transport adapters, and a rich collections framework.
 */

// ============================================================================
// Collections Framework - Rich data structures with behaviors
// ============================================================================
export * from "./collections";

// ============================================================================
// Universal Client (protocol-agnostic RPC)
// Core client and transports - middleware has naming conflicts with collections
// Import client middleware explicitly: import { createRetryMiddleware } from "client/client"
// ============================================================================
export { Client, ClientError } from "./client";
export {
  HttpTransport,
  LocalTransport,
  WebSocketTransport,
  MockTransport,
  mockBuilder,
} from "./client";
export {
  defaultUrlPattern,
  restfulHttpMethodStrategy,
  postOnlyStrategy,
} from "./client";
export type {
  Transport,
  Method,
  Metadata,
  Message,
  ResponseItem,
  Status,
  ClientContext,
  ClientRunner,
  ClientMiddleware,
  ClientOptions,
  HttpTransportOptions,
  UrlStrategy,
  HttpMethodStrategy,
  LocalTransportOptions,
  Handler,
  WebSocketTransportOptions,
  WebSocketState,
  MockTransportOptions,
  MockResponse,
  ResponseMatcher,
  CallHistoryEntry,
} from "./client";

// Error system
export type { ErrorMetadata, ErrorRegistry, ErrorContext, RichError } from "./client";
export { ErrorSeverity, ErrorCategory } from "./client";
export {
  ERROR_REGISTRY,
  getErrorMetadata,
  isKnownError,
  createError,
  createErrorFromHTTPStatus,
  createErrorFromException,
  formatError,
} from "./client";

// ============================================================================
// Note: The unified middleware system (./middleware) is a foundation used by both
// collections and universal client. Access it directly:
// import { AsyncMiddleware, SyncMiddleware } from "client/middleware"
//
// Note: Universal client middleware is available for explicit import:
// import { createRetryMiddleware } from "client/client/middleware/retry"
// import { createCacheMiddleware } from "client/client/middleware/cache"
// import { createTimeoutMiddleware } from "client/client/middleware/timeout"
// import { createPaginationMiddleware } from "client/client/middleware/pagination"
// import { createAuthMiddleware } from "client/client/middleware/auth"
// import { createTracingMiddleware } from "client/client/middleware/tracing"
// import { createCircuitBreakerMiddleware } from "client/client/middleware/circuit-breaker"
// import { createRateLimitMiddleware } from "client/client/middleware/rate-limit"
// import { createBatchingMiddleware } from "client/client/middleware/batching"
// ============================================================================
