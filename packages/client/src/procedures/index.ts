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
} from "./types.js";

// Type utilities
export { pathToKey, keyToPath } from "./types.js";

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
// procedures moved to @mark1russell7/client-store (roadmap 3.2): the program store.

// =============================================================================
// Auto-register core procedures
// =============================================================================

import { coreProcedures as _coreProcedures } from "./core/index.js";
import { metaProcedures as _metaProcedures } from "./define-procedure.js";
import { PROCEDURE_REGISTRY } from "./registry.js";

// Register core procedures when this module is imported
// This ensures client.* procedures are available without explicit registration
try {
  for (const proc of _coreProcedures) {
    if (!PROCEDURE_REGISTRY.has(proc.path)) {
      PROCEDURE_REGISTRY.register(proc);
    }
  }
  // Also register meta-procedures
  for (const proc of _metaProcedures) {
    if (!PROCEDURE_REGISTRY.has(proc.path)) {
      PROCEDURE_REGISTRY.register(proc);
    }
  }
} catch {
  // Ignore errors during auto-registration (e.g., if already registered)
}
