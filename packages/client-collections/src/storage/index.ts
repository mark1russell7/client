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

export type { CollectionStorage, StorageChanges, StorageMetadata } from "./interface.js";
export { normalizeStorageResult } from "./interface.js";

export { InMemoryStorage } from "./memory.js";
export type { InMemoryStorageOptions } from "./memory.js";
