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
 * Storage backend interface for collections.
 *
 * All methods return Promise<T> to ensure consistent async behavior.
 * This guarantees client code remains agnostic to the storage backend,
 * enabling seamless switching between local and remote storage.
 */
export interface CollectionStorage<T> {
    /**
     * Get item by ID.
     *
     * @param id - Item identifier
     * @returns Promise resolving to item or undefined if not found
     */
    get(id: string): Promise<T | undefined>;
    /**
     * Get all items in collection.
     *
     * @returns Promise resolving to array of all items
     */
    getAll(): Promise<T[]>;
    /**
     * Find items matching predicate.
     *
     * @param predicate - Filter function
     * @returns Promise resolving to array of matching items
     */
    find(predicate: (item: T) => boolean): Promise<T[]>;
    /**
     * Check if item exists.
     *
     * @param id - Item identifier
     * @returns Promise resolving to true if item exists
     */
    has(id: string): Promise<boolean>;
    /**
     * Get number of items in collection.
     *
     * @returns Promise resolving to count of items
     */
    size(): Promise<number>;
    /**
     * Set/update item by ID.
     *
     * @param id - Item identifier
     * @param value - Item to store
     * @returns Promise resolving when operation completes
     */
    set(id: string, value: T): Promise<void>;
    /**
     * Delete item by ID.
     *
     * @param id - Item identifier
     * @returns Promise resolving to true if item was deleted, false if not found
     */
    delete(id: string): Promise<boolean>;
    /**
     * Clear all items from collection.
     *
     * @returns Promise resolving when operation completes
     */
    clear(): Promise<void>;
    /**
     * Set multiple items at once (more efficient than individual sets).
     *
     * @param items - Array of [id, value] tuples
     * @returns Promise resolving when operation completes
     */
    setBatch(items: Array<[string, T]>): Promise<void>;
    /**
     * Delete multiple items at once.
     *
     * @param ids - Array of item identifiers
     * @returns Promise resolving to number of items actually deleted
     */
    deleteBatch(ids: string[]): Promise<number>;
    /**
     * Get multiple items by ID at once.
     *
     * @param ids - Array of item identifiers
     * @returns Promise resolving to Map of found items (missing IDs are omitted)
     */
    getBatch(ids: string[]): Promise<Map<string, T>>;
    /**
     * Close storage and cleanup resources.
     * Should be called when collection is no longer needed.
     *
     * @returns Promise resolving when cleanup completes
     */
    close(): Promise<void>;
    /**
     * Get storage metadata/stats (optional).
     * Useful for monitoring and debugging.
     *
     * @returns Promise resolving to storage-specific metadata
     */
    getMetadata?(): Promise<StorageMetadata>;
}
/**
 * Optional storage metadata for monitoring.
 */
export interface StorageMetadata {
    /** Storage backend type */
    type: "memory" | "api" | "hybrid" | "synced" | "custom";
    /** Number of items */
    size: number;
    /** Storage-specific stats */
    stats?: {
        /** Cache hit rate (for hybrid/synced storage) */
        hitRate?: number;
        /** Last sync timestamp (for synced storage) */
        lastSync?: number;
        /** Pending sync operations (for synced storage) */
        pendingOps?: number;
        /** Memory usage in bytes (for memory storage) */
        memoryUsage?: number;
        /** Custom stats */
        [key: string]: unknown;
    };
}
/**
 * @deprecated All storage methods now return Promise.
 * This helper is kept for backward compatibility but is no longer needed.
 *
 * @param value - Promise value
 * @returns The same Promise
 */
export declare function normalizeStorageResult<T>(value: Promise<T>): Promise<T>;
//# sourceMappingURL=interface.d.ts.map