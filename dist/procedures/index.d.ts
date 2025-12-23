/**
 * Procedure System
 *
 * Type-safe procedure definitions with schema validation,
 * registry for auto-discovery, and server integration.
 */
export type { ProcedurePath, ProcedureMetadata, RepositoryProvider, ProcedureContext, ProcedureHandler, Procedure, AnyProcedure, ProcedureResult, ProcedureError, InferProcedureInput, InferProcedureOutput, InferProcedureMetadata, RegistryEventType, RegistryListener, ProcedureModule, RegistrationOptions, } from "./types.js";
export { pathToKey, keyToPath } from "./types.js";
export { ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY } from "./registry.js";
export { defineProcedure, defineStub, createProcedure, ProcedureBuilder, namespace, validateProcedure, } from "./define.js";
export type { ProcedureDefinition, ProcedureStub } from "./define.js";
export { createCollectionProcedures, genericCollectionProcedures, collectionModule, } from "./collection/index.js";
export { registerModule, registerProcedures, createAndRegister, } from "./discovery.js";
export { PROCEDURE_SYMBOL, PROCEDURE_JSON_KEY, PROCEDURE_WHEN_KEY, PROCEDURE_NAME_KEY, WHEN_IMMEDIATE, WHEN_NEVER, WHEN_PARENT, isProcedureRef, isProcedureRefJson, isAnyProcedureRef, getRefWhen, getRefName, shouldExecuteRef, proc, ProcedureRefBuilder, fromJson, toJson, normalizeRef, hydrateInput, executeRef, extractTemplate, parseProcedureJson, stringifyProcedureJson, } from "./ref.js";
export type { ProcedureWhen, ProcedureRef, ProcedureRefJson, AnyProcedureRef, RefExecutor, HydrateOptions, StepResultInfo, ContinueDecision, } from "./ref.js";
export { coreProcedures, coreModule, chainProcedure, parallelProcedure, conditionalProcedure, andProcedure, orProcedure, notProcedure, allProcedure, anyProcedure, noneProcedure, mapProcedure, reduceProcedure, identityProcedure, constantProcedure, throwProcedure, tryCatchProcedure, anySchema, } from "./core/index.js";
export { defineProcedureProcedure, getProcedureProcedure, listProceduresProcedure, deleteProcedureProcedure, metaProcedures, getRuntimeProcedure, hasRuntimeProcedure, getAllRuntimeProcedures, clearRuntimeProcedures, } from "./define-procedure.js";
export type { AggregationDefinition, DefineProcedureInput, DefineProcedureOutput, } from "./define-procedure.js";
export { type SerializedProcedure, type HandlerReference, type HandlerLoader, type SyncDirection, type SyncConflict, type SyncResult, type SyncStatus, type SyncedRegistryOptions, type ProcedureStorageConfig, type SerializeOptions, type DeserializeOptions, type ProcedureStorageAdapterOptions, type SyncedRegistrationOptions, type CreateSyncedRegistryConfig, serializeProcedure, deserializeProcedure, deserializeProcedureSync, getProcedureKey, getSerializedKey, serializeProcedures, deserializeProcedures, createDynamicHandlerLoader, ProcedureStorageAdapter, SyncedProcedureRegistry, createSyncedRegistry, createMemorySyncedRegistry, createApiSyncedRegistry, createHybridSyncedRegistry, createCustomSyncedRegistry, procedureRegisterProcedure, procedureStoreProcedure, procedureLoadProcedure, procedureSyncProcedure, procedureRemoteProcedure, procedureStorageModule, procedureStorageProcedures, } from "./storage/index.js";
//# sourceMappingURL=index.d.ts.map