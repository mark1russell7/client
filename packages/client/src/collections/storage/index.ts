/**
 * Collection Storage Backends
 *
 * Abstract storage layer enabling collections to be backed by:
 * - In-memory (fast, volatile)
 * - Remote API (persistent, shared)
 * - Hybrid (local cache + remote sync)
 */

export type { CollectionStorage, StorageMetadata } from "./interface.js";
export { normalizeStorageResult } from "./interface.js";

export { InMemoryStorage } from "./memory.js";
export { ApiStorage } from "./api.js";
export type { ApiStorageOptions } from "./api.js";
export { HybridStorage } from "./hybrid.js";
export type { HybridStorageOptions, ConflictResolution, WriteStrategy } from "./hybrid.js";