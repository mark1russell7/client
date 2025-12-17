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
export { PROCEDURE_SYMBOL, PROCEDURE_JSON_KEY, isProcedureRef, isProcedureRefJson, isAnyProcedureRef, proc, ProcedureRefBuilder, fromJson, toJson, normalizeRef, hydrateInput, extractTemplate, parseProcedureJson, stringifyProcedureJson, } from "./ref.js";
export type { ProcedureRef, ProcedureRefJson, AnyProcedureRef, RefExecutor, HydrateOptions, } from "./ref.js";
export { coreProcedures, coreModule, chainProcedure, parallelProcedure, conditionalProcedure, andProcedure, orProcedure, notProcedure, mapProcedure, reduceProcedure, identityProcedure, constantProcedure, throwProcedure, tryCatchProcedure, } from "./core/index.js";
//# sourceMappingURL=index.d.ts.map