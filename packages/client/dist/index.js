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
export { HttpTransport, LocalTransport, WebSocketTransport, MockTransport, mockBuilder, } from "./client";
export { defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy, } from "./client";
export { ErrorSeverity, ErrorCategory } from "./client";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./client";
// ============================================================================
// Universal Server (protocol-agnostic RPC)
// ============================================================================
export { Server } from "./server";
export { HandlerNotFoundError, ServerError, } from "./server";
// Server Transports
export { HttpServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy, } from "./server";
export { WebSocketServerTransport } from "./server";
// ============================================================================
// Note: The unified middleware system (./middleware) is a foundation used by both
// collections and universal client. Access it directly:
// import { AsyncMiddleware, SyncMiddleware } from "client/middleware"
//
// Note: Universal client middleware is available for explicit import:
// import { createRetryMiddleware } from "client/client"
// import { createCacheMiddleware } from "client/client"
// etc.
// ============================================================================
//# sourceMappingURL=index.js.map