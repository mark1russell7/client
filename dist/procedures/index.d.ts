/**
 * Procedure System
 *
 * Type-safe procedure definitions with schema validation,
 * registry for auto-discovery, and server integration.
 */
export type { ProcedurePath, ProcedureMetadata, RepositoryProvider, ProcedureContext, ProcedureHandler, Procedure, AnyProcedure, ProcedureResult, ProcedureError, InferProcedureInput, InferProcedureOutput, InferProcedureMetadata, RegistryEventType, RegistryListener, ProcedureModule, RegistrationOptions, } from "./types";
export { pathToKey, keyToPath } from "./types";
export { ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY } from "./registry";
export { defineProcedure, defineStub, createProcedure, ProcedureBuilder, namespace, validateProcedure, } from "./define";
export type { ProcedureDefinition, ProcedureStub } from "./define";
export { createCollectionProcedures, genericCollectionProcedures, collectionModule, } from "./collection";
export { registerModule, registerProcedures, createAndRegister, } from "./discovery.js";
//# sourceMappingURL=index.d.ts.map