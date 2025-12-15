/**
 * Collection Storage Backends
 *
 * Abstract storage layer enabling collections to be backed by:
 * - In-memory (fast, volatile)
 * - Remote API (persistent, shared)
 * - Hybrid (local cache + remote sync)
 */
export { normalizeStorageResult } from "./interface.js";
export { InMemoryStorage } from "./memory.js";
export { ApiStorage } from "./api.js";
export { HybridStorage } from "./hybrid.js";
//# sourceMappingURL=index.js.map