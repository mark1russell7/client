/**
 * The storages of the collections.
 *
 * This package has the contract `CollectionStorage` and one storage, `InMemoryStorage` (fast,
 * in memory only).
 *
 * The storages that need a `Client` are in `@procedures/store`: `ApiStorage` (a remote
 * collection) and `HybridStorage` (a local copy that syncs with a remote). Thus this package
 * does not depend on `@procedures/client`. `MongoStorage` is in `@procedures/mongo`, and
 * `SqliteStorage` is in `@procedures/sqlite`.
 */

export type {
  CollectionStorage,
  StorageChanges,
  StorageMetadata,
  StorageWriteOptions,
  StorageSetChange,
  StorageDeleteChange,
  StorageClearChange,
  StorageChangeEvent,
  StorageChangeBatch,
  StorageObserver,
} from "./interface.js";
export { normalizeStorageResult } from "./interface.js";

// The query language: the selectors, the options and the merge patch (roadmap CLI-14, CLI-20)
export {
  compareStorageValues,
  compileSelector,
  matchesSelector,
  mergePatch,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
} from "./query.js";
export type {
  StorageFieldOperators,
  StoragePatch,
  StorageQueryOptions,
  StorageSelector,
  StorageSort,
  StorageSortDirection,
} from "./query.js";

// The listeners of the events of a storage
export { StorageListeners, reportListenerError } from "./listeners.js";
export type { ListenerErrorHandler } from "./listeners.js";

export { InMemoryStorage } from "./memory.js";
export type { InMemoryStorageOptions } from "./memory.js";
