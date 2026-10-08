/**
 * Procedure Storage Module
 *
 * Enables procedure registry to be backed by CollectionStorage.
 * Provides persistence, sync, and remote registry capabilities.
 */
// Serialization
export { serializeProcedure, deserializeProcedure, deserializeProcedureSync, getProcedureKey, getSerializedKey, serializeProcedures, deserializeProcedures, createDynamicHandlerLoader, } from "./serialization.js";
// Adapter
export { ProcedureStorageAdapter } from "./adapter.js";
// Synced Registry
export { SyncedProcedureRegistry } from "./synced-registry.js";
// Factory
export { createSyncedRegistry, createMemorySyncedRegistry, createApiSyncedRegistry, createHybridSyncedRegistry, createCustomSyncedRegistry, } from "./factory.js";
// Procedures
export { procedureRegisterProcedure, procedureStoreProcedure, procedureLoadProcedure, procedureSyncProcedure, procedureRemoteProcedure, procedureStorageModule, procedureStorageProcedures, } from "./procedures.js";
//# sourceMappingURL=index.js.map