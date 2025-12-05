/**
 * Collection Storage Backends
 *
 * Abstract storage layer enabling collections to be backed by:
 * - In-memory (fast, volatile)
 * - Remote API (persistent, shared)
 * - Hybrid (local cache + remote sync)
 */
export type { CollectionStorage, StorageMetadata } from "./interface";
export { normalizeStorageResult, isStorageAsync } from "./interface";
export { InMemoryStorage } from "./memory";
export { ApiStorage } from "./api";
export type { ApiStorageOptions } from "./api";
export { HybridStorage } from "./hybrid";
export type { HybridStorageOptions, ConflictResolution, WriteStrategy } from "./hybrid";
//# sourceMappingURL=index.d.ts.map