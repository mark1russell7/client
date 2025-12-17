/**
 * Procedure Storage Module
 *
 * Enables procedure registry to be backed by CollectionStorage.
 * Provides persistence, sync, and remote registry capabilities.
 */
export type { SerializedProcedure, HandlerReference, HandlerLoader, SyncDirection, ConflictResolution, WriteStrategy, SyncConflict, SyncResult, SyncStatus, SyncedRegistryOptions, ProcedureStorageConfig, } from "./types.js";
export { serializeProcedure, deserializeProcedure, deserializeProcedureSync, getProcedureKey, getSerializedKey, serializeProcedures, deserializeProcedures, createDynamicHandlerLoader, } from "./serialization.js";
export type { SerializeOptions, DeserializeOptions } from "./serialization.js";
export { ProcedureStorageAdapter } from "./adapter.js";
export type { ProcedureStorageAdapterOptions } from "./adapter.js";
export { SyncedProcedureRegistry } from "./synced-registry.js";
export type { SyncedRegistrationOptions } from "./synced-registry.js";
export { createSyncedRegistry, createMemorySyncedRegistry, createApiSyncedRegistry, createHybridSyncedRegistry, createCustomSyncedRegistry, } from "./factory.js";
export type { CreateSyncedRegistryConfig } from "./factory.js";
export { procedureRegisterProcedure, procedureStoreProcedure, procedureLoadProcedure, procedureSyncProcedure, procedureRemoteProcedure, procedureStorageModule, procedureStorageProcedures, } from "./procedures.js";
//# sourceMappingURL=index.d.ts.map