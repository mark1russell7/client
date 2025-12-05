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
 * Storage backend interface for collections.
 *
 * Supports both synchronous (in-memory) and asynchronous (remote) operations.
 * All methods return Promise OR direct value for maximum flexibility.
 */
export interface CollectionStorage<T> {
    /**
     * Get item by ID.
     *
     * @param id - Item identifier
     * @returns Item or undefined if not found
     */
    get(id: string): Promise<T | undefined> | T | undefined;
    /**
     * Get all items in collection.
     *
     * @returns Array of all items
     */
    getAll(): Promise<T[]> | T[];
    /**
     * Find items matching predicate.
     *
     * @param predicate - Filter function
     * @returns Array of matching items
     */
    find(predicate: (item: T) => boolean): Promise<T[]> | T[];
    /**
     * Check if item exists.
     *
     * @param id - Item identifier
     * @returns true if item exists
     */
    has(id: string): Promise<boolean> | boolean;
    /**
     * Get number of items in collection.
     *
     * @returns Count of items
     */
    size(): Promise<number> | number;
    /**
     * Set/update item by ID.
     *
     * @param id - Item identifier
     * @param value - Item to store
     */
    set(id: string, value: T): Promise<void> | void;
    /**
     * Delete item by ID.
     *
     * @param id - Item identifier
     * @returns true if item was deleted, false if not found
     */
    delete(id: string): Promise<boolean> | boolean;
    /**
     * Clear all items from collection.
     */
    clear(): Promise<void> | void;
    /**
     * Set multiple items at once (more efficient than individual sets).
     *
     * @param items - Array of [id, value] tuples
     */
    setBatch(items: Array<[string, T]>): Promise<void> | void;
    /**
     * Delete multiple items at once.
     *
     * @param ids - Array of item identifiers
     * @returns Number of items actually deleted
     */
    deleteBatch(ids: string[]): Promise<number> | number;
    /**
     * Get multiple items by ID at once.
     *
     * @param ids - Array of item identifiers
     * @returns Map of found items (missing IDs are omitted)
     */
    getBatch(ids: string[]): Promise<Map<string, T>> | Map<string, T>;
    /**
     * Close storage and cleanup resources.
     * Should be called when collection is no longer needed.
     */
    close(): Promise<void> | void;
    /**
     * Get storage metadata/stats (optional).
     * Useful for monitoring and debugging.
     *
     * @returns Storage-specific metadata
     */
    getMetadata?(): Promise<StorageMetadata> | StorageMetadata;
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
 * Helper to normalize storage return values (Promise or direct).
 *
 * @param value - Value that may or may not be a Promise
 * @returns Promise that resolves to the value
 */
export declare function normalizeStorageResult<T>(value: Promise<T> | T): Promise<T>;
/**
 * Helper to check if storage operation returns Promise.
 *
 * @param value - Value to check
 * @returns true if value is a Promise
 */
export declare function isStorageAsync<T>(value: Promise<T> | T): value is Promise<T>;
//# sourceMappingURL=interface.d.ts.map