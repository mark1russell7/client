/**
 * Procedure Storage Module
 *
 * Enables procedure registry to be backed by CollectionStorage.
 * Provides persistence, sync, and remote registry capabilities.
 */

// Types
export type {
  SerializedProcedure,
  HandlerReference,
  HandlerLoader,
  SyncDirection,
  ConflictResolution,
  WriteStrategy,
  SyncConflict,
  SyncResult,
  SyncStatus,
  SyncedRegistryOptions,
  ProcedureStorageConfig,
} from "./types.js";

// Serialization
export {
  serializeProcedure,
  deserializeProcedure,
  deserializeProcedureSync,
  getProcedureKey,
  getSerializedKey,
  serializeProcedures,
  deserializeProcedures,
  createDynamicHandlerLoader,
} from "./serialization.js";
export type { SerializeOptions, DeserializeOptions } from "./serialization.js";

// Adapter
export { ProcedureStorageAdapter } from "./adapter.js";
export type { ProcedureStorageAdapterOptions } from "./adapter.js";

// Synced Registry
export { SyncedProcedureRegistry } from "./synced-registry.js";
export type { SyncedRegistrationOptions } from "./synced-registry.js";

// Factory
export {
  createSyncedRegistry,
  createMemorySyncedRegistry,
  createApiSyncedRegistry,
  createHybridSyncedRegistry,
  createCustomSyncedRegistry,
} from "./factory.js";
export type { CreateSyncedRegistryConfig } from "./factory.js";

// Procedures
export {
  procedureRegisterProcedure,
  procedureStoreProcedure,
  procedureLoadProcedure,
  procedureSyncProcedure,
  procedureRemoteProcedure,
  procedureStorageModule,
  procedureStorageProcedures,
} from "./procedures.js";
