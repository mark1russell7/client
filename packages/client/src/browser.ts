/**
 * Universal Client Library: the browser-safe entry point.
 *
 * This module exports everything of the package except the Node server transports
 * (`HttpServerTransport` and `WebSocketServerTransport`, which use `http` and `ws`).
 * A browser bundle imports "@mark1russell7/client/browser". The root entry point
 * re-exports this module and adds the server transports.
 *
 * Collections (maps, caches, collection storage) are in @mark1russell7/client-collections.
 * The "@mark1russell7/client/collections" entry point re-exports them together with the
 * storage backends that need a Client (ApiStorage, HybridStorage).
 */

// ============================================================================
// Universal Client (protocol-agnostic RPC)
// Core client and transports
// Import client middleware explicitly: import { createRetryMiddleware } from "@mark1russell7/client/client"
// ============================================================================
export { Client, ClientError } from "./client/index.js";
export {
  HttpTransport,
  LocalTransport,
  WebSocketTransport,
  MockTransport,
  mockBuilder,
} from "./client/index.js";
export {
  defaultUrlPattern,
  restfulHttpMethodStrategy,
  postOnlyStrategy,
} from "./client/index.js";
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
  MockTransportOptions,
  MockResponse,
  ResponseMatcher,
  CallHistoryEntry,
} from "./client/index.js";

// WebSocketState is a runtime enum, not just a type — export as a value so consumers can compare
// against WebSocketState.CONNECTED etc. See documentation/BUGS-2026-07.md (L1).
export { WebSocketState } from "./client/index.js";

// Error system
export type { ErrorMetadata, ErrorRegistry, ErrorContext, RichError } from "./client/index.js";
export { ErrorSeverity, ErrorCategory } from "./client/index.js";
export {
  ERROR_REGISTRY,
  getErrorMetadata,
  isKnownError,
  createError,
  createErrorFromHTTPStatus,
  createErrorFromException,
  formatError,
} from "./client/index.js";

// ============================================================================
// Universal Server (protocol-agnostic RPC)
// The server transports are Node only: the root entry point exports them.
// ============================================================================
export { Server } from "./server/server.js";
export type { ServerOptions } from "./server/server.js";
export { ProcedureServer, createProcedureServer } from "./server/procedure-server.js";
export type { ProcedureServerOptions, StorageConfig } from "./server/procedure-server.js";
export {
  HandlerNotFoundError,
  ServerError,
} from "./server/types.js";
export { pathToMethod, methodToPath } from "./server/method.js";
export type {
  ServerRequest,
  ServerResponse,
  ServerHandler,
  ServerMiddleware,
  ServerContext,
  ServerRunner,
  ServerTransport,
} from "./server/types.js";

// ============================================================================
// Procedure System - Type-safe RPC with auto-discovery
// ============================================================================
export {
  defineProcedure,
  defineStub,
  createProcedure,
  ProcedureBuilder,
  namespace,
  validateProcedure,
  ProcedureRegistry,
  RegistryError,
  PROCEDURE_REGISTRY,
  assertValidPath,
  pathToKey,
  keyToPath,
  createCollectionProcedures,
  // Manual registration helpers
  registerModule,
  registerProcedures,
  createAndRegister,
  // Procedure reference system (procedure-as-data)
  PROCEDURE_SYMBOL,
  PROCEDURE_JSON_KEY,
  PROCEDURE_WHEN_KEY,
  PROCEDURE_NAME_KEY,
  WHEN_IMMEDIATE,
  WHEN_NEVER,
  WHEN_PARENT,
  isProcedureRef,
  isProcedureRefJson,
  isAnyProcedureRef,
  getRefWhen,
  getRefName,
  shouldExecuteRef,
  proc,
  ProcedureRefBuilder,
  fromJson,
  toJson,
  normalizeRef,
  hydrateInput,
  isControlFlowPath,
  isDataDriven,
  markDataDriven,
  RUNS_REFS_TAG,
  RAW_INPUT_TAG,
  takesRawInput,
  rawInputRule,
  MAX_DATA_DEPTH,
  LITERAL_KEY,
  isLiteral,
  isPlainObject,
  createRefScope,
  lookupOutputRef,
  resolveOutputRef,
  withScope,
  scopeOf,
  executeRef,
  extractTemplate,
  parseProcedureJson,
  stringifyProcedureJson,
  // Core language procedures
  coreProcedures,
  coreModule,
  // Every core procedure (math, comparison, string, type, object, array, meta too). Not registered by default.
  allCoreProcedures,
  allCoreModules,
  chainProcedure,
  parallelProcedure,
  conditionalProcedure,
  andProcedure,
  orProcedure,
  notProcedure,
  allProcedure,
  anyProcedure,
  noneProcedure,
  mapProcedure,
  reduceProcedure,
  identityProcedure,
  constantProcedure,
  throwProcedure,
  tryCatchProcedure,
  // Common schemas
  anySchema,
  typedAnySchema,
  zodAdapter,
  outputSchema,
  // Meta-procedures for runtime definition
  defineProcedureProcedure,
  getProcedureProcedure,
  listProceduresProcedure,
  deleteProcedureProcedure,
  metaProcedures,
  getRuntimeProcedure,
  hasRuntimeProcedure,
  getAllRuntimeProcedures,
  clearRuntimeProcedures,
  isRuntimeDefined,
  // Storage-backed registry
  serializeProcedure,
  deserializeProcedure,
  deserializeProcedureSync,
  getProcedureKey,
  getSerializedKey,
  serializeProcedures,
  deserializeProcedures,
  createDynamicHandlerLoader,
  ProcedureStorageAdapter,
  SyncedProcedureRegistry,
  getProcedureStore,
  ProcedureStoreError,
  createSyncedRegistry,
  createMemorySyncedRegistry,
  createApiSyncedRegistry,
  createHybridSyncedRegistry,
  createCustomSyncedRegistry,
  procedureRegisterProcedure,
  procedureStoreProcedure,
  procedureLoadProcedure,
  procedureSyncProcedure,
  procedureRemoteProcedure,
  procedureStorageModule,
  procedureStorageProcedures,
} from "./procedures/index.js";

export type {
  Procedure,
  AnyProcedure,
  ProcedurePath,
  ProcedureMetadata,
  ProcedureHandler,
  ProcedureContext,
  ProcedureResult,
  ProcedureError,
  RepositoryProvider,
  ProcedureModule,
  RegistrationOptions,
  ProcedureRegistryLike,
  ProcedureDefinition,
  ProcedureStub,
  InferProcedureInput,
  InferProcedureOutput,
  InferProcedureMetadata,
  RegistryEventType,
  RegistryListener,
  // Procedure reference types (procedure-as-data)
  ProcedureWhen,
  ProcedureRef,
  ProcedureRefJson,
  AnyProcedureRef,
  RefExecutor,
  HydrateOptions,
  StepResultInfo,
  ContinueDecision,
  OutputRef,
  RefScope,
  // Storage-backed registry types
  SerializedProcedure,
  HandlerReference,
  HandlerLoader,
  SyncDirection,
  SyncConflict,
  SyncResult,
  SyncStatus,
  SyncedRegistryOptions,
  ProcedureStorageConfig,
  SerializeOptions,
  DeserializeOptions,
  ProcedureStorageAdapterOptions,
  SyncedRegistrationOptions,
  CreateSyncedRegistryConfig,
  // Schema types
  ZodLikeSchema,
  // Meta-procedure types
  AggregationDefinition,
  DefineProcedureInput,
  DefineProcedureOutput,
} from "./procedures/index.js";

// ============================================================================
// Nested Route API - Batch calls with per-call middleware overrides
// ============================================================================
export type {
  Route,
  RouteNode,
  RouteLeaf,
  CallRequest,
  SingleCallRequest,
  CallResponse,
  ProcedureCallResult,
  StreamingCallResponse,
  BatchConfig,
  BatchStrategy,
  StreamConfig,
  MiddlewareOverrides,
  RetryOverride,
  TimeoutOverride,
  CacheOverride,
} from "./client/call-types.js";

export {
  flattenRoute,
  buildResponse,
  createRoute,
  mergeRoutes,
  isBatchRoute,
} from "./client/call-types.js";

export { RouteResolver, createRouteResolver, isValidRoute, getMissingPaths, matchPath } from "./client/route-resolver.js";
export type { ResolvedRoute, RouteResolutionResult, RouteResolutionError } from "./client/route-resolver.js";

export { BatchExecutor, createBatchExecutor, Semaphore, executeWithConcurrency } from "./client/batch-executor.js";
export type { ProcedureExecutor, ExecutionContext, BatchExecutionResult, BatchItem } from "./client/batch-executor.js";

// ============================================================================
// Events System - Pub/sub messaging and streaming coordination
// ============================================================================
export {
  DefaultEventBus as EventBus,
  createEventBus,
  createTypedEventBus,
  getGlobalEventBus,
  withEventBusSignal,
} from "./events/index.js";
export type {
  EventBus as IEventBus,
  TypedEventBus,
  EventHandler,
  EventBusOptions,
  EventWaitOptions,
  ChannelMap,
} from "./events/index.js";

// ============================================================================
// Components - Serializable UI descriptors via procedures
// ============================================================================
export type {
  ComponentOutput,
  FragmentOutput,
  NullOutput,
  AnyComponentOutput,
  Size,
  ComponentContext,
  ComponentFactory,
  StreamingComponentFactory,
  AnyComponentFactory,
  ComponentMetadata,
  ComponentDefinition,
  AnyComponentDefinition,
  RegisteredComponent,
  ComponentBundle,
  InferComponentInput,
  IsStreamingComponent,
  ComponentInput,
} from "./components/index.js";

export {
  nullOutput,
  fragment,
  isFragment,
  isNullOutput,
  isStreamingFactory,
  defineComponent,
  componentToProcedure,
  registerBundle,
  createBundle,
  simpleComponent,
  namespacedComponent,
  streamingComponent,
  componentInputSchema,
  componentOutputSchema,
} from "./components/index.js";

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
