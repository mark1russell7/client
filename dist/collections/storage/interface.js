/**
 * Collection Storage Interface
 *
 * Abstract storage layer for collections, enabling different backends:
 * - InMemoryStorage: Fast, volatile storage using Map
 * - ApiStorage: Remote persistence via universal client
 * - HybridStorage: Local cache + remote sync with conflict resolution
 * - SyncedStorage: Periodic background sync with offline support
 */
/**
 * Helper to normalize storage return values (Promise or direct).
 *
 * @param value - Value that may or may not be a Promise
 * @returns Promise that resolves to the value
 */
export async function normalizeStorageResult(value) {
    return value;
}
/**
 * Helper to check if storage operation returns Promise.
 *
 * @param value - Value to check
 * @returns true if value is a Promise
 */
export function isStorageAsync(value) {
    return value instanceof Promise;
}
//# sourceMappingURL=interface.js.map