/**
 * Collection Storage Backends
 *
 * Abstract storage layer enabling collections to be backed by:
 * - In-memory (fast, volatile)
 *
 * The backends that need an RPC Client (ApiStorage: remote API, HybridStorage: local
 * cache + remote sync) live in @mark1russell7/client and are exported from
 * "@mark1russell7/client/collections". Keeping them there means this package
 * does not depend on the client package.
 */

export type { CollectionStorage, StorageMetadata } from "./interface.js";
export { normalizeStorageResult } from "./interface.js";

export { InMemoryStorage } from "./memory.js";
