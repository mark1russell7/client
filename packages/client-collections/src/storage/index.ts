/**
 * Collection Storage Backends
 *
 * Abstract storage layer enabling collections to be backed by:
 * - In-memory (fast, volatile)
 *
 * The backends that need an RPC Client (ApiStorage: remote API, HybridStorage: local
 * cache + remote sync) live in @procedures/client and are exported from
 * "@procedures/client/collections". Keeping them there means this package
 * does not depend on the client package.
 */

export type { CollectionStorage, StorageChanges, StorageMetadata } from "./interface.js";
export { normalizeStorageResult } from "./interface.js";

export { InMemoryStorage } from "./memory.js";
export type { InMemoryStorageOptions } from "./memory.js";
