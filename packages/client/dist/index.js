/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition,
 * transport adapters, and a rich collections framework.
 */
// ============================================================================
// Collections Framework - Rich data structures with behaviors
// ============================================================================
export * from "./collections/index.js";
// ============================================================================
// Universal Client (protocol-agnostic RPC)
// Core client and transports - middleware has naming conflicts with collections
// Import client middleware explicitly: import { createRetryMiddleware } from "client/client"
// ============================================================================
export { Client, ClientError } from "./client/index.js";
export { HttpTransport, LocalTransport, WebSocketTransport, MockTransport, mockBuilder, } from "./client/index.js";
export { defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy, } from "./client/index.js";
export { ErrorSeverity, ErrorCategory } from "./client/index.js";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./client/index.js";
// ============================================================================
// Universal Server (protocol-agnostic RPC)
// ============================================================================
export { Server, ProcedureServer, createProcedureServer } from "./server/index.js";
export { HandlerNotFoundError, ServerError, } from "./server/index.js";
// Server Transports
export { HttpServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy, } from "./server/index.js";
export { WebSocketServerTransport } from "./server/index.js";
// ============================================================================
// Procedure System - Type-safe RPC with auto-discovery
// ============================================================================
export { defineProcedure, defineStub, createProcedure, ProcedureBuilder, namespace, validateProcedure, ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY, pathToKey, keyToPath, createCollectionProcedures, genericCollectionProcedures, collectionModule, 
// Manual registration helpers
registerModule, registerProcedures, createAndRegister, 
// Procedure reference system (procedure-as-data)
PROCEDURE_SYMBOL, PROCEDURE_JSON_KEY, isProcedureRef, isProcedureRefJson, isAnyProcedureRef, proc, ProcedureRefBuilder, fromJson, toJson, normalizeRef, hydrateInput, extractTemplate, parseProcedureJson, stringifyProcedureJson, 
// Core language procedures
coreProcedures, coreModule, chainProcedure, parallelProcedure, conditionalProcedure, andProcedure, orProcedure, notProcedure, mapProcedure, reduceProcedure, identityProcedure, constantProcedure, throwProcedure, tryCatchProcedure, 
// Storage-backed registry
serializeProcedure, deserializeProcedure, deserializeProcedureSync, getProcedureKey, getSerializedKey, serializeProcedures, deserializeProcedures, createDynamicHandlerLoader, ProcedureStorageAdapter, SyncedProcedureRegistry, createSyncedRegistry, createMemorySyncedRegistry, createApiSyncedRegistry, createHybridSyncedRegistry, createCustomSyncedRegistry, procedureRegisterProcedure, procedureStoreProcedure, procedureLoadProcedure, procedureSyncProcedure, procedureRemoteProcedure, procedureStorageModule, procedureStorageProcedures, } from "./procedures/index.js";
export { flattenRoute, buildResponse, createRoute, mergeRoutes, isBatchRoute, } from "./client/call-types.js";
export { RouteResolver, createRouteResolver, isValidRoute, getMissingPaths, matchPath } from "./client/route-resolver.js";
export { BatchExecutor, createBatchExecutor, Semaphore, executeWithConcurrency } from "./client/batch-executor.js";
export { getMiddlewareOverrides, getRetryOverride, getTimeoutOverride, getCacheOverride, getOverride, mergeOverride, mergeRetryConfig, mergeTimeoutConfig, mergeCacheConfig, createOverrideGetter, hasOverride, setMiddlewareOverrides, clearMiddlewareOverrides, MIDDLEWARE_OVERRIDES_KEY, } from "./client/middleware-override.js";
// ============================================================================
// Events System - Pub/sub messaging and streaming coordination
// ============================================================================
export { DefaultEventBus as EventBus, createEventBus, createTypedEventBus } from "./events/index.js";
export { nullOutput, fragment, isFragment, isNullOutput, isStreamingFactory, defineComponent, componentToProcedure, registerBundle, createBundle, simpleComponent, namespacedComponent, streamingComponent, componentInputSchema, componentOutputSchema, } from "./components/index.js";
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