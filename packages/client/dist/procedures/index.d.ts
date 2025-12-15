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
//# sourceMappingURL=index.d.ts.map