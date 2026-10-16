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

// The collection storages that need a Client (before: "@procedures/client/collections")
export { ApiStorage } from "./api.js";
export type { ApiStorageOptions } from "./api.js";
export { HybridStorage, PendingWriteError, QueueFullError, MissingKeysError } from "./hybrid.js";
export type { HybridStorageOptions } from "./hybrid.js";

// Adapter
export { ProcedureStorageAdapter } from "./adapter.js";
export type { ProcedureStorageAdapterOptions } from "./adapter.js";

// Synced Registry
export { SyncedProcedureRegistry, getProcedureStore } from "./synced-registry.js";
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

// procedure.register (the other store procedures are in ../program-store)
export { procedureRegisterProcedure } from "./procedures.js";
