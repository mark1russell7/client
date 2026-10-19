/**
 * The storages of the collections.
 *
 * This package has the contract `CollectionStorage` and one storage, `InMemoryStorage` (fast,
 * in memory only).
 *
 * The storages that need a `Client` are in `@procedures/store`: `ApiStorage` (a remote
 * collection) and `HybridStorage` (a local copy that syncs with a remote). `MongoStorage` is in
 * `@procedures/mongo`, and `SqliteStorage` is in `@procedures/sqlite`. This package uses only the
 * query language of the core, from the entry `@procedures/client/query`, which imports nothing
 * else (roadmap CLI-34).
 */

export type {
  CollectionStorage,
  StorageChanges,
  StorageMetadata,
  StorageWriteOptions,
  StorageItemWriteOptions,
  StorageBatchWriteOptions,
  StorageSetChange,
  StorageDeleteChange,
  StorageClearChange,
  StorageChangeEvent,
  StorageChangeBatch,
  StorageObserver,
} from "./interface.js";
export { normalizeStorageResult } from "./interface.js";

// The query language: the selectors, the options, the query policy and the patches (roadmap
// CLI-14, CLI-20). The one copy is in the core (CLI-34): these names come from there.
export {
  DEFAULT_FIND_LIMIT,
  DEFAULT_QUERY_OPERATORS,
  DEFAULT_QUERY_POLICY,
  QUERY_OPERATORS,
  applyPatch,
  compareStorageValues,
  compileSelector,
  isPatchOperations,
  matchesSelector,
  mergePatch,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
} from "@procedures/client/query";
export type {
  StorageFieldOperators,
  StoragePatch,
  StoragePatchOperations,
  StorageQueryOperator,
  StorageQueryOptions,
  StorageQueryPolicy,
  StorageSelector,
  StorageSort,
  StorageSortDirection,
} from "@procedures/client/query";

// The precondition of the writes: the expected version and VERSION_CONFLICT (roadmap CLI-16). The
// one copy is in the core, as for the query language.
export {
  MAX_EXPECTED_VERSION_LENGTH,
  PRECONDITION_NOT_SUPPORTED,
  VERSION_CONFLICTS_METADATA_KEY,
  VersionConflictError,
  asVersionConflictError,
  isExpectedVersion,
  preconditionNotSupported,
  versionConflict,
  versionConflicts,
  versionConflictsOf,
} from "@procedures/client/query";
export type { CurrentItem, VersionConflict, VersionOf } from "@procedures/client/query";

// The listeners of the events of a storage
export { StorageListeners, reportListenerError } from "./listeners.js";
export type { ListenerErrorHandler } from "./listeners.js";

export { InMemoryStorage } from "./memory.js";
export type { InMemoryStorageOptions } from "./memory.js";
