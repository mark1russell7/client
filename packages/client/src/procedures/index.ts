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
export { PURE_EFFECTS, REGISTRY_READ_EFFECTS, withEffects } from "./effects.js";
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
export type { ToolHints, CapabilityRefusal, CapabilityRefusalReason, InvocationExplanation, EffectsViolation } from "./capability.js";

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
export { createCollectionProcedures } from "./collection/index.js";
export type { CollectionStorage, StorageMetadata } from "./collection/index.js";

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
  moduleClosure,
  registerModules,
  createRegistry,
  registerClientProcedures,
} from "./module.js";
export type { ModuleInput } from "./module.js";

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
