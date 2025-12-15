/**
 * Collection Storage Interface
 *
 * Abstract storage layer for collections, enabling different backends:
 * - InMemoryStorage: Fast, volatile storage using Map
 * - ApiStorage: Remote persistence via universal client
 * - HybridStorage: Local cache + remote sync with conflict resolution
 * - SyncedStorage: Periodic background sync with offline support
 *
 * IMPORTANT: All methods return Promise to ensure client code is
 * transport-agnostic (cannot distinguish local from remote storage).
 */
/**
 * @deprecated All storage methods now return Promise.
 * This helper is kept for backward compatibility but is no longer needed.
 *
 * @param value - Promise value
 * @returns The same Promise
 */
export function normalizeStorageResult(value) {
    return value;
}
//# sourceMappingURL=interface.js.map