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
// Procedure reference system (procedure-as-data)
export { PROCEDURE_SYMBOL, PROCEDURE_JSON_KEY, isProcedureRef, isProcedureRefJson, isAnyProcedureRef, proc, ProcedureRefBuilder, fromJson, toJson, normalizeRef, hydrateInput, extractTemplate, parseProcedureJson, stringifyProcedureJson, } from "./ref.js";
// Core language procedures (chain, parallel, if, etc.)
export { coreProcedures, coreModule, chainProcedure, parallelProcedure, conditionalProcedure, andProcedure, orProcedure, notProcedure, mapProcedure, reduceProcedure, identityProcedure, constantProcedure, throwProcedure, tryCatchProcedure, } from "./core/index.js";
// Storage-backed registry
export { 
// Serialization
serializeProcedure, deserializeProcedure, deserializeProcedureSync, getProcedureKey, getSerializedKey, serializeProcedures, deserializeProcedures, createDynamicHandlerLoader, 
// Adapter
ProcedureStorageAdapter, 
// Synced Registry
SyncedProcedureRegistry, 
// Factory
createSyncedRegistry, createMemorySyncedRegistry, createApiSyncedRegistry, createHybridSyncedRegistry, createCustomSyncedRegistry, 
// Procedures
procedureRegisterProcedure, procedureStoreProcedure, procedureLoadProcedure, procedureSyncProcedure, procedureRemoteProcedure, procedureStorageModule, procedureStorageProcedures, } from "./storage/index.js";
// =============================================================================
// Auto-register core procedures
// =============================================================================
import { coreProcedures as _coreProcedures } from "./core/index.js";
import { procedureStorageProcedures as _storageProcedures } from "./storage/index.js";
import { PROCEDURE_REGISTRY } from "./registry.js";
// Register core procedures when this module is imported
// This ensures client.* procedures are available without explicit registration
try {
    for (const proc of _coreProcedures) {
        if (!PROCEDURE_REGISTRY.has(proc.path)) {
            PROCEDURE_REGISTRY.register(proc);
        }
    }
    // Also register storage procedures
    for (const proc of _storageProcedures) {
        if (!PROCEDURE_REGISTRY.has(proc.path)) {
            PROCEDURE_REGISTRY.register(proc);
        }
    }
}
catch {
    // Ignore errors during auto-registration (e.g., if already registered)
}
//# sourceMappingURL=index.js.map