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
  SyncError,
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
export {
  HybridStorage,
  PendingWriteError,
  QueueFullError,
  MissingKeysError,
  QueueStoreError,
  ConflictError,
  ModeSwitchError,
  SyncStateError,
  RemoteApplyHookError,
} from "./hybrid.js";
export type {
  HybridStorageOptions,
  HybridMode,
  LocalCopyStorage,
  RemoteApplyCause,
  RemoteApplyContext,
  RemoteApplyHook,
} from "./hybrid.js";
// One leader tab runs the sync, and the other tabs copy its changes (roadmap CLI-25)
export { TabCoordinator, TabGroup } from "./tab-coordinator.js";
export type {
  TabAbortSignalLike,
  TabChannelFactory,
  TabChannelLike,
  TabCollection,
  TabCollectionOptions,
  TabCoordinatorOptions,
  TabGroupOptions,
  TabLockManagerLike,
  TabRetryOptions,
  TabRole,
  TabSnapshotOptions,
} from "./tab-coordinator.js";
// The push feed of the remote changes (roadmap CLI-21, CLI-15)
export { EventsChangeFeed } from "./feed.js";
export type {
  ChangeEventSource,
  EventSubscriber,
  EventsChangeFeedOptions,
  RemoteChangeFeed,
  RemoteChangeHint,
  RemoteChangeListener,
  RemoteChanges,
} from "./feed.js";
// The sync state of HybridStorage: the cursor and the base versions (roadmap CLI-21).
// IndexedDbSyncStateStore is in "@procedures/store/indexeddb".
export { MemorySyncStateStore } from "./sync-state.js";
export type { SyncState, SyncStateChange, SyncStateStore } from "./sync-state.js";
// The queue of HybridStorage and its store (roadmap R28). FileQueueStore is in
// "@procedures/store/file-queue": it uses node:fs. IndexedDbQueueStore is in
// "@procedures/store/indexeddb": it uses the IndexedDB of a browser (roadmap R45).
export { MemoryQueueStore } from "./queue.js";
export type { QueuedOperation, QueueStore } from "./queue.js";

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
