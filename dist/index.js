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
export { Server, ProcedureServer, createProcedureServer } from "./server";
export { HandlerNotFoundError, ServerError, } from "./server";
// Server Transports
export { HttpServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy, } from "./server";
export { WebSocketServerTransport } from "./server";
// ============================================================================
// Procedure System - Type-safe RPC with auto-discovery
// ============================================================================
export { defineProcedure, defineStub, createProcedure, ProcedureBuilder, namespace, validateProcedure, ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY, pathToKey, keyToPath, createCollectionProcedures, genericCollectionProcedures, collectionModule, 
// Manual registration helpers
registerModule, registerProcedures, createAndRegister, } from "./procedures";
export { flattenRoute, buildResponse, createRoute, mergeRoutes, isBatchRoute, } from "./client/call-types";
export { RouteResolver, createRouteResolver, isValidRoute, getMissingPaths, matchPath } from "./client/route-resolver";
export { BatchExecutor, createBatchExecutor, Semaphore, executeWithConcurrency } from "./client/batch-executor";
export { getMiddlewareOverrides, getRetryOverride, getTimeoutOverride, getCacheOverride, getOverride, mergeOverride, mergeRetryConfig, mergeTimeoutConfig, mergeCacheConfig, createOverrideGetter, hasOverride, setMiddlewareOverrides, clearMiddlewareOverrides, MIDDLEWARE_OVERRIDES_KEY, } from "./client/middleware-override";
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