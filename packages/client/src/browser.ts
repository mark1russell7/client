/**
 * Universal Client Library: the browser-safe entry point.
 *
 * This module exports everything of the package except the Node server transports
 * (`HttpServerTransport` and `WebSocketServerTransport`, which use `http` and `ws`).
 * A browser bundle imports "@procedures/client/browser". The root entry point
 * re-exports this module. It also adds the server transports as deprecated aliases: their entry
 * is "@procedures/client/node", and the next MINOR removes them from the root (CLI-6).
 *
 * Collections (maps, caches, collection storage) are in @procedures/collections.
 * The program store, the storage backends that need a Client (ApiStorage, HybridStorage) and the
 * synced registry are in @procedures/store (roadmap 3.2).
 */

// ============================================================================
// Universal Client (protocol-agnostic RPC)
// Core client and transports
// Import client middleware explicitly: import { createRetryMiddleware } from "@procedures/client/client"
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
export { ProcedureServer, createProcedureServer, STREAM_METADATA_KEY, isUnboundedStream, tokenMatches } from "./server/procedure-server.js";
// The credentials of a network request (roadmap R18), and the parts that a request hook reads (CLI-2a)
export { credentialsOf, bearerOf, withoutSecretHeaders, cookiesOf, requestCredentials } from "./server/request-auth.js";
export type { RequestCredentialsOptions } from "./server/request-auth.js";
// The procedures of a host: host.health, host.info, host.metrics (roadmap R19)
export { hostProcedures } from "./server/host-procedures.js";
export type { HostSource } from "./server/host-procedures.js";
export type { ProcedureServerOptions, RegisterProcedureOptions, StorageConfig, StopOptions, UseStorageOptions } from "./server/procedure-server.js";
// The stop parts of the server and its storages as dependencies, in the shape of the runner (CLI-5)
export type { StopParts, StorageHandle } from "./server/procedure-server.js";
// The limits of the calls: keyed limiters of @mark1russell7/service/limiter in the admission path (CLI-40)
export type { CallLimit, CallLimitCovers, CallLimitKey, CallLimitKeyPart, LimitedCall } from "./server/limits.js";
export {
  HandlerNotFoundError,
  ServerError,
} from "./server/types.js";
export { pathToMethod, methodToPath, methodName } from "./server/method.js";
export type {
  ServerRequest,
  ServerResponse,
  RequestHandler,
  Credentials,
  Principal,
  PrincipalOf,
  RequestIdentity,
  AmbientCredentials,
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
  // The change events of the collection writes (roadmap CLI-15)
  collectionChangeTopic,
  collectionTopicReads,
  // The partitions of a collection (roadmap CLI-17)
  PARTITION_PATTERN,
  collectionTopicPartition,
  collectionTopicTarget,
  // The rules of the rows of a collection (roadmap CLI-41)
  admittedStorage,
  admitsRow,
  // The query language of the collection storages (roadmap CLI-14, CLI-34)
  DEFAULT_FIND_LIMIT,
  DEFAULT_QUERY_OPERATORS,
  DEFAULT_QUERY_POLICY,
  QUERY_OPERATORS,
  applyPatch,
  compareStorageValues,
  compileSelector,
  isPatchOperations,
  matchesSelector,
  mergePatch,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
  // The precondition of the collection writes (roadmap CLI-16)
  MAX_EXPECTED_VERSION_LENGTH,
  PRECONDITION_NOT_SUPPORTED,
  VERSION_CONFLICTS_METADATA_KEY,
  VersionConflictError,
  asVersionConflictError,
  isExpectedVersion,
  preconditionNotSupported,
  versionConflict,
  versionConflicts,
  versionConflictsOf,
  // Manual registration helpers
  registerModule,
  registerProcedures,
  createAndRegister,
  // Modules and explicit registries (roadmap 3.1)
  clientModule,
  defineModule,
  moduleClosure,
  registerModules,
  createRegistry,
  registerClientProcedures,
  callerOf,
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
  prepareRootCall,
  observeHydration,
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
  manifestProcedure,
  listProceduresProcedure,
  deleteProcedureProcedure,
  metaProcedures,
  getRuntimeProcedure,
  hasRuntimeProcedure,
  getAllRuntimeProcedures,
  clearRuntimeProcedures,
  isRuntimeDefined,
  runtimeProgramOf,
} from "./procedures/index.js";

export type {
  Effects,
  FsRootRules,
  PermittedEffects,
  Register,
  ClearanceOf,
  ResourcesOf,
  Capability,
  CapabilityRequest,
  ClearanceOrder,
  NestedCallOptions,
  Procedure,
  AnyProcedure,
  ProcedurePath,
  ProcedureMetadata,
  ProcedureHandler,
  ProcedureContext,
  ProcedureResult,
  ProcedureError,
  RepositoryProvider,
  CollectionStorage,
  StorageChanges,
  StorageMetadata,
  StorageWriteOptions,
  StorageItemWriteOptions,
  StorageBatchWriteOptions,
  CurrentItem,
  VersionConflict,
  VersionOf,
  StorageSetChange,
  StorageDeleteChange,
  StorageClearChange,
  StorageChangeEvent,
  StorageChangeBatch,
  StorageObserver,
  StorageFieldOperators,
  StoragePatch,
  StorageQueryOptions,
  StorageSelector,
  StorageSort,
  StorageSortDirection,
  StoragePatchOperations,
  StorageQueryOperator,
  StorageQueryPolicy,
  CollectionProceduresOptions,
  CollectionChangeEventsOptions,
  CollectionAdmission,
  CollectionRow,
  CollectionWrite,
  CollectionWriteGuard,
  CollectionPartitions,
  PartitionInput,
  PartitionResolver,
  CollectionChangeEvent,
  ProcedureModule,
  ModuleInput,
  Caller,
  CallerOptions,
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
  HydrationEvent,
  StepResultInfo,
  ContinueDecision,
  OutputRef,
  RefScope,
  // Schema types
  ZodLikeSchema,
  // Meta-procedure types
  AggregationDefinition,
  DefineProcedureInput,
  DefineProcedureOutput,
} from "./procedures/index.js";

// ============================================================================
// Invocation: the one path, the call policy and the interceptors
// (ARCHITECTURE-PROPOSALS P1, deep dive MCP-3, roadmap 1.2)
// ============================================================================
export {
  invokeProcedure,
  invokePath,
  outputValue,
  outputItems,
  streamOutput,
  InvocationError,
  isAsyncIterable,
} from "./procedures/invoke.js";
export type {
  InvokeOptions,
  ProcedureOutput,
  InvocationErrorCode,
  ForbiddenReason,
  Invocation,
  InvocationChanges,
  InvocationNext,
  Interceptor,
  AdmitItem,
} from "./procedures/invoke.js";
export { callMatches, validateCalls, declaredCalls, nestedCallRefusal, hasCallPolicy, hiddenReach } from "./procedures/policy.js";
// Capabilities (CAPABILITIES-2026-10)
export {
  STANDARD_RESOURCES,
  UNLIMITED_CAPABILITY,
  ladder,
  effectsOf,
  isReadOnly,
  isDestructive,
  isOpenWorld,
  toolHints,
  narrowCapability,
  capabilityRefusal,
  examinesNestedCall,
  explainInvocation,
  checkEffects,
} from "./procedures/capability.js";
export { PURE_EFFECTS, REGISTRY_READ_EFFECTS, withEffects, INFERRED_EFFECTS_METADATA_KEY, inferredEffectsOf, effectsValue } from "./procedures/effects.js";
// The clock of the timers, and the state machines as data (roadmap R35)
export { realClock } from "./clock.js";
export type { Cancel, Clock } from "./clock.js";
export { WEBSOCKET_CONNECTION_MACHINE, CIRCUIT_BREAKER_MACHINE, replayTransitions } from "./machines.js";
export type { MachineDocument, MachineTransition, MachineTransitionDef, MachineTimer, MachineDuration } from "./machines.js";
// The default times of the core, as data (roadmap R34)
export { TIMER_DEFAULTS } from "./timers.js";
export type { TimerDefaults } from "./timers.js";
// The transport over a message port: a Web Worker, a MessageChannel (roadmap R27)
export { PortTransport } from "./adapters/port/transport.js";
export type { PortLike, PortTransportOptions } from "./adapters/port/transport.js";
// The W3C trace context: one trace from the client to the handler (roadmap R16)
export { TRACEPARENT_METADATA_KEY, formatTraceparent, parseTraceparent, newTraceId, newSpanId, isW3cIds } from "./tracing/traceparent.js";
export type { TraceContext } from "./tracing/traceparent.js";
// Wire protocol v1: the version and the one list of error codes (roadmap R25)
export { PROTOCOL_VERSION, PROTOCOL_HEADER, ERROR_CODES, isProtocolErrorCode, httpStatusOf, protocolVersionOf } from "./protocol.js";
export type { ProtocolErrorCode, ErrorCodeInfo } from "./protocol.js";
// The seq of the stream frames: the metadata key of an item after a gap, and the key of an item
// that the HTTP client read from an NDJSON stream (WIRE-PROTOCOL.md)
export { STREAM_GAP_METADATA_KEY, STREAM_ITEM_METADATA_KEY } from "./adapters/sequence.js";
// The deadline of a call: the remaining time goes as procedure-timeout (roadmap R10)
export { TIMEOUT_METADATA_KEY, DEADLINE_METADATA_KEY } from "./client/deadline.js";
// The narrowing key of a call: the call asks for a narrower capability on each face (CLI-30)
export { NARROWING_METADATA_KEY, NARROWING_HEADER, narrowingOf, narrowWithin, addNarrowing } from "./procedures/narrowing.js";
export type { NarrowingNote, WireNarrowing, NarrowedCapability } from "./procedures/narrowing.js";
export type { ServerDebugReport } from "./server/types.js";
// Typed durations: each public option that is a time takes a Duration (roadmap R11)
export { ms, seconds, minutes, hours, toMs, optionalMs, isDuration } from "./duration.js";
export type { Duration, TimeUnit } from "./duration.js";
// What the face of a call offers the procedure: the questions to the person at the caller, the
// progress, and the text from outside the host (CLI-10, CLI-12)
export {
  createElicit,
  elicitWithPolicy,
  operatorAnswer,
  elicitInput,
  elicitConfirmation,
  NO_ELICITATION_REASON,
} from "./procedures/elicit.js";
export type {
  Elicit,
  ElicitRequest,
  ElicitFormRequest,
  ElicitUrlRequest,
  ElicitMode,
  ElicitAction,
  ElicitResult,
  ElicitOptions,
  ElicitField,
  ElicitFieldBase,
  ElicitTextField,
  ElicitNumberField,
  ElicitBooleanField,
  ElicitChoiceField,
  ElicitChoicesField,
  ElicitValue,
  ElicitationPolicy,
  ConfirmationOptions,
  ConfirmationResult,
} from "./procedures/elicit.js";
export type { ProgressUpdate, ReportProgress } from "./procedures/progress.js";
export { toolHintsOf, toolHintOverrideOf, toolHintOverrideRefusal } from "./procedures/hints.js";
export type { ToolHintOverride } from "./procedures/hints.js";
export { untrustedText, untrustedFieldsOf, untrustedTextsOf } from "./procedures/untrusted.js";
export type { UntrustedText, UntrustedSource, UntrustedValue } from "./procedures/untrusted.js";
// One manifest type (roadmap R17)
export { MANIFEST_FORMAT, describeProcedure as describeProcedureEntry, describeRegistry, exposedProcedures, hashOf } from "./procedures/manifest.js";
export type { ProcedureEntry, ProcedureManifest, CliDescription, DescribeOptions, DescribeRegistryOptions } from "./procedures/manifest.js";
// Idempotency of calls (roadmap R1)
export {
  IDEMPOTENCY_KEY_METADATA,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  IdempotencyCache,
  idempotencyKeyOf,
  idempotentIn,
  effectsIn,
  isRepeatable,
  newIdempotencyKey,
} from "./procedures/idempotency.js";
export type { IdempotencyOptions } from "./procedures/idempotency.js";
export type { ToolHints, CapabilityRefusal, CapabilityRefusalReason, InvocationExplanation, EffectsViolation } from "./procedures/capability.js";
export type { CallPolicy, CallRefusal, HiddenCall } from "./procedures/policy.js";
export { timeoutInterceptor, tracingInterceptor, metricsInterceptor } from "./procedures/interceptors.js";
export type {
  TimeoutInterceptorOptions,
  TracingInterceptorOptions,
  InvocationSpan,
  ProcedureMetrics,
  MetricsInterceptor,
} from "./procedures/interceptors.js";

// The policy of a host (roadmap 2.3): one builder for the MCP server, the server CLI and mark
export { hostPolicy, procedureServerOptions, exposePatterns, surfaceRule } from "./server/host-policy.js";
export type { HostPolicy, HostPolicyOptions, ToolSurface } from "./server/host-policy.js";

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
  EventListenOptions,
  EventWaitOptions,
  ChannelMap,
} from "./events/index.js";
// The remote events: a peer subscribes to the topics of the bus of another peer (EVENTS.md)
export { EventPublisher, topicMatcher, EVENTS_SUBSCRIBE_PATH, SubscriptionError, remoteEvents, subscribeRemote } from "./events/index.js";
export type {
  EventPublisherOptions,
  TopicRule,
  TopicCall,
  RightsChange,
  SubscriptionRecheck,
  EventItem,
  RemoteEvent,
  RemoteEventHandler,
  RemoteEventsOptions,
  ResubscribeBackoff,
  SubscribeOptions,
  Subscription,
} from "./events/index.js";

// ============================================================================
// Components (serializable UI descriptors) moved to @procedures/splay, the UI package
// of the ecosystem (roadmap 3.4).
// ============================================================================

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

// ============================================================================
// Schemas: Standard Schema v1, validation and JSON Schema (roadmap 2.1)
// ============================================================================
export {
  validateSchema,
  validateSchemaAsync,
  jsonSchemaOf,
  isStandardSchema,
  describeIssues,
} from "./procedures/index.js";
export type {
  StandardSchemaV1,
  StandardJSONSchemaConverter,
  ProcedureSchema,
  InferSchema,
  SchemaResult,
  JsonSchema,
  JsonSchemaTarget,
  JsonSchemaSource,
} from "./procedures/index.js";
