/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition,
 * transport adapters, and a rich collections framework.
 */
export * from "./collections";
export { Client, ClientError } from "./client";
export { HttpTransport, LocalTransport, WebSocketTransport, MockTransport, mockBuilder, } from "./client";
export { defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy, } from "./client";
export type { Transport, Method, Metadata, Message, ResponseItem, Status, ClientContext, ClientRunner, ClientMiddleware, ClientOptions, HttpTransportOptions, UrlStrategy, HttpMethodStrategy, LocalTransportOptions, Handler, WebSocketTransportOptions, WebSocketState, MockTransportOptions, MockResponse, ResponseMatcher, CallHistoryEntry, } from "./client";
export type { ErrorMetadata, ErrorRegistry, ErrorContext, RichError } from "./client";
export { ErrorSeverity, ErrorCategory } from "./client";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./client";
export { Server, ProcedureServer, createProcedureServer } from "./server";
export type { ServerOptions, ProcedureServerOptions, StorageConfig } from "./server";
export { HandlerNotFoundError, ServerError, } from "./server";
export type { ServerRequest, ServerResponse, ServerHandler, ServerMiddleware, ServerContext, ServerRunner, ServerTransport, } from "./server";
export { HttpServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy, } from "./server";
export type { HttpServerTransportOptions, HttpUrlStrategy, } from "./server";
export { WebSocketServerTransport } from "./server";
export type { WebSocketServerTransportOptions, WebSocketAuthHandler, WebSocketConnectionHandler, WebSocketMessage, } from "./server";
export { defineProcedure, defineStub, createProcedure, ProcedureBuilder, namespace, validateProcedure, ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY, pathToKey, keyToPath, createCollectionProcedures, genericCollectionProcedures, collectionModule, registerModule, registerProcedures, createAndRegister, } from "./procedures";
export type { Procedure, AnyProcedure, ProcedurePath, ProcedureMetadata, ProcedureHandler, ProcedureContext, ProcedureResult, ProcedureError, RepositoryProvider, ProcedureModule, RegistrationOptions, ProcedureDefinition, ProcedureStub, InferProcedureInput, InferProcedureOutput, InferProcedureMetadata, RegistryEventType, RegistryListener, } from "./procedures";
export type { Route, RouteNode, RouteLeaf, CallRequest, SingleCallRequest, CallResponse, ProcedureCallResult, StreamingCallResponse, BatchConfig, BatchStrategy, StreamConfig, MiddlewareOverrides, RetryOverride, TimeoutOverride, CacheOverride, } from "./client/call-types";
export { flattenRoute, buildResponse, createRoute, mergeRoutes, isBatchRoute, } from "./client/call-types";
export { RouteResolver, createRouteResolver, isValidRoute, getMissingPaths, matchPath } from "./client/route-resolver";
export type { ResolvedRoute, RouteResolutionResult, RouteResolutionError } from "./client/route-resolver";
export { BatchExecutor, createBatchExecutor, Semaphore, executeWithConcurrency } from "./client/batch-executor";
export type { ProcedureExecutor, ExecutionContext, BatchExecutionResult } from "./client/batch-executor";
export { getMiddlewareOverrides, getRetryOverride, getTimeoutOverride, getCacheOverride, getOverride, mergeOverride, mergeRetryConfig, mergeTimeoutConfig, mergeCacheConfig, createOverrideGetter, hasOverride, setMiddlewareOverrides, clearMiddlewareOverrides, MIDDLEWARE_OVERRIDES_KEY, } from "./client/middleware-override";
export type { OverrideAwareConfig, ExtractMiddlewareConfig, OverrideOf } from "./client/middleware-override";
//# sourceMappingURL=index.d.ts.map