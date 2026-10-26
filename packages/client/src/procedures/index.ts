/**
 * Procedure System
 *
 * Type-safe procedure definitions with schema validation,
 * registry for auto-discovery, and server integration.
 */

// Types
export type {
  ProcedurePath,
  ProcedureMetadata,
  RepositoryProvider,
  ProcedureContext,
  ProcedureHandler,
  Procedure,
  AnyProcedure,
  ProcedureResult,
  ProcedureError,
  InferProcedureInput,
  InferProcedureOutput,
  InferProcedureMetadata,
  RegistryEventType,
  RegistryListener,
  ProcedureModule,
  RegistrationOptions,
  ProcedureRegistryLike,
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
} from "./types.js";

// Type utilities
export { pathToKey, keyToPath } from "./types.js";
// The escape of a segment with a dot, for a method name, a key and a topic (roadmap CLI-75)
export { encodeSegment, decodeSegment, segmentsToTopic, topicToSegments } from "./segments.js";

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
} from "./capability.js";
export { PURE_EFFECTS, REGISTRY_READ_EFFECTS, withEffects, INFERRED_EFFECTS_METADATA_KEY, inferredEffectsOf, effectsValue } from "./effects.js";
// One manifest type (roadmap R17)
export { MANIFEST_FORMAT, describeProcedure as describeProcedureEntry, describeRegistry, exposedProcedures, hashOf } from "./manifest.js";
export type { ProcedureEntry, ProcedureManifest, CliDescription, DescribeOptions, DescribeRegistryOptions } from "./manifest.js";
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
} from "./idempotency.js";
export type { IdempotencyOptions } from "./idempotency.js";
// What the face of a call offers the procedure (CLI-10, CLI-12)
export {
  createElicit,
  elicitWithPolicy,
  operatorAnswer,
  elicitInput,
  elicitConfirmation,
  NO_ELICITATION_REASON,
} from "./elicit.js";
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
} from "./elicit.js";
export type { ProgressUpdate, ReportProgress } from "./progress.js";
export { toolHintsOf, toolHintOverrideOf, toolHintOverrideRefusal } from "./hints.js";
export type { ToolHintOverride } from "./hints.js";
export { untrustedText, untrustedFieldsOf, untrustedTextsOf } from "./untrusted.js";
export type { UntrustedText, UntrustedSource, UntrustedValue } from "./untrusted.js";
export type { ToolHints, CapabilityRefusal, CapabilityRefusalReason, InvocationExplanation, EffectsViolation } from "./capability.js";
// The narrowing key of a call (CLI-30)
export { NARROWING_METADATA_KEY, NARROWING_HEADER, narrowingOf, narrowWithin, addNarrowing } from "./narrowing.js";
export type { NarrowingNote, WireNarrowing, NarrowedCapability } from "./narrowing.js";

// Registry
export { ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY, assertValidPath } from "./registry.js";

// Definition helpers
export {
  defineProcedure,
  defineStub,
  createProcedure,
  ProcedureBuilder,
  namespace,
  validateProcedure,
} from "./define.js";
export type { ProcedureDefinition, ProcedureStub } from "./define.js";

// Collection procedures
export {
  createCollectionProcedures,
  collectionChangeTopic,
  collectionTopicReads,
  PARTITION_PATTERN,
  collectionTopicPartition,
  collectionTopicTarget,
  collectionTopicRule,
  // The refusal of a storage whose topic is the topic of a partition (roadmap CLI-57). Deprecated since CLI-75
  CollectionTopicCollisionError,
  // The rules of the rows of a collection (roadmap CLI-41)
  admittedStorage,
  admitsRow,
  // The images of the rows of a change event, for the row filter of each subscriber (roadmap CLI-78)
  withHintImages,
  hintImagesOf,
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
} from "./collection/index.js";
export type {
  CurrentItem,
  VersionConflict,
  VersionOf,
  StorageItemWriteOptions,
  StorageBatchWriteOptions,
  CollectionProceduresOptions,
  CollectionChangeEventsOptions,
  CollectionChangeEvent,
  CollectionAdmission,
  CollectionRow,
  HintImages,
  HintRowState,
  CollectionWrite,
  CollectionWriteGuard,
  CollectionPartitions,
  PartitionInput,
  PartitionResolver,
  StoragePatchOperations,
  StorageQueryOperator,
  StorageQueryPolicy,
  CollectionStorage,
  StorageChanges,
  StorageMetadata,
  StorageWriteOptions,
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
} from "./collection/index.js";

// Manual registration helpers
export {
  registerModule,
  registerProcedures,
  createAndRegister,
} from "./discovery.js";

// Modules and explicit registries (roadmap 3.1)
export {
  clientModule,
  defineModule,
  definePackage,
  moduleClosure,
  registerModules,
  createRegistry,
  registerClientProcedures,
} from "./module.js";
export type { ModuleInput, PackageDefinition } from "./module.js";
// One call for a registry of some modules, `invokePath` and `outputValue`
export { callerOf } from "./caller.js";
export type { Caller, CallerOptions } from "./caller.js";

// Procedure reference system (procedure-as-data)
export {
  // Constants
  PROCEDURE_SYMBOL,
  PROCEDURE_JSON_KEY,
  PROCEDURE_WHEN_KEY,
  PROCEDURE_NAME_KEY,
  WHEN_IMMEDIATE,
  WHEN_NEVER,
  WHEN_PARENT,
  // Type guards
  isProcedureRef,
  isProcedureRefJson,
  isAnyProcedureRef,
  getRefWhen,
  getRefName,
  shouldExecuteRef,
  // Builder
  proc,
  ProcedureRefBuilder,
  // Conversion
  fromJson,
  toJson,
  normalizeRef,
  // Hydration
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
  // Templates
  extractTemplate,
  parseProcedureJson,
  stringifyProcedureJson,
} from "./ref.js";

export type {
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
} from "./ref.js";

// Programs on the coeval kernel (coeval D13, roadmap item M14): the run documents and their machine
export {
  hydrateInput,
  prepareRootCall,
  observeHydration,
  executeRef,
  runProgram,
  runDocument,
  runControl,
  runOperand,
  programMachine,
  PROGRAM_WORLD,
  desugarProgram,
  desugarInput,
  desugarControlValue,
  originOf,
  namesOfScope,
  scopeOfNames,
  nameKey,
  nameOfKey,
  documentAt,
} from "./program.js";
export type {
  ProgramDocument,
  DocumentOrigin,
  DesugarOptions,
  ProgramHost,
  CallEffect,
  CallPosition,
  RunDocumentOptions,
  RunProgramOptions,
  RunOperandOptions,
} from "./program.js";

// The envelope form of a program (coeval D6, D9 and D10, roadmap item M7)
export { isEnvelopeProgram, fromEnvelopeProgram, toEnvelopeProgram } from "./envelope.js";
export type { EnvelopeProgram, EnvelopeRef, EnvelopeLiteral, EnvelopePath } from "./envelope.js";

// Core language procedures (chain, parallel, if, etc.)
export {
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
  // Schemas and result types
  anySchema,
  typed,
  typedAnySchema,
  zodAdapter,
  outputSchema,
  type ZodLikeSchema,
} from "./core/index.js";

// Schemas: Standard Schema v1, validation and JSON Schema (roadmap 2.1)
export {
  validateSchema,
  validateSchemaAsync,
  jsonSchemaOf,
  isStandardSchema,
  describeIssues,
} from "./schema.js";
export type {
  StandardSchemaV1,
  StandardJSONSchemaConverter,
  ProcedureSchema,
  InferSchema,
  SchemaResult,
  JsonSchema,
  JsonSchemaTarget,
  JsonSchemaSource,
} from "./schema.js";

// Meta-procedures for runtime procedure definition
export {
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
} from "./define-procedure.js";
export type {
  AggregationDefinition,
  DefineProcedureInput,
  DefineProcedureOutput,
} from "./define-procedure.js";

// The storage layer, the synced registry and the procedure.store/load/sync/remote/register
// procedures moved to @procedures/store (roadmap 3.2): the program store.

// =============================================================================
// Registration
// =============================================================================

// Importing this package registers nothing (ARCHITECTURE-PROPOSALS-2026-10, P9). The
// "./register" entry registers the procedures of `clientModule` in the global registry, and
// `createRegistry()` adds them to each new registry.
