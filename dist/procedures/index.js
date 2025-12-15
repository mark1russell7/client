/**
 * Procedure System
 *
 * Type-safe procedure definitions with schema validation,
 * registry for auto-discovery, and server integration.
 */
// Type utilities
export { pathToKey, keyToPath } from "./types.js";
// Registry
export { ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY } from "./registry.js";
// Definition helpers
export { defineProcedure, defineStub, createProcedure, ProcedureBuilder, namespace, validateProcedure, } from "./define.js";
// Collection procedures
export { createCollectionProcedures, genericCollectionProcedures, collectionModule, } from "./collection/index.js";
// Manual registration helpers
export { registerModule, registerProcedures, createAndRegister, } from "./discovery.js";
//# sourceMappingURL=index.js.map