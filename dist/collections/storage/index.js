/**
 * Collection Storage Backends
 *
 * Abstract storage layer enabling collections to be backed by:
 * - In-memory (fast, volatile)
 * - Remote API (persistent, shared)
 * - Hybrid (local cache + remote sync)
 */
export { normalizeStorageResult, isStorageAsync } from "./interface";
export { InMemoryStorage } from "./memory";
export { ApiStorage } from "./api";
export { HybridStorage } from "./hybrid";
//# sourceMappingURL=index.js.map