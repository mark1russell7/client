/**
 * The interface of the collection storages. These storages implement it:
 * - `InMemoryStorage` (this package): a fast storage in a `Map`, in memory only.
 * - `ApiStorage` (`@procedures/store`): a remote collection through a `Client`.
 * - `HybridStorage` (`@procedures/store`): a local copy that syncs with a remote, with a
 *   conflict policy and a queue of the local writes.
 * - `MongoStorage` (`@procedures/mongo`).
 *
 * `@procedures/client` declares a copy of this interface with the same shape, so that the core
 * does not depend on this package. `SqliteStorage` (`@procedures/sqlite`) implements that copy.
 *
 * Each method gives a `Promise`. Thus the code of a caller cannot tell a local storage from a
 * remote storage.
 */

/**
 * Storage backend interface for collections.
 *
 * All methods return Promise<T> to ensure consistent async behavior.
 * This guarantees client code remains agnostic to the storage backend,
 * enabling seamless switching between local and remote storage.
 *
 * The contract (the suite of `@procedures/collections/testing` tests it for each storage):
 * - A storage keeps a copy of each value that a write takes, and each read gives a new copy. A
 *   change of a written or a read value does not change the stored item.
 * - A stored `null` reads back as `null`. A missing id reads back as `undefined`.
 * - The entries keep the order of the first set of each id, as a `Map` does.
 * - A delta of `getChangesSince` follows the order of the last change of each id.
 * - After `close()`, each operation rejects with an error whose message says "closed". A second
 *   `close()` does nothing.
 */
export interface CollectionStorage<T> {
  //
  // ═══ Read Operations ═══
  //

  /**
   * Get item by ID.
   *
   * @param id - Item identifier
   * @returns Promise resolving to a copy of the item, or undefined if not found. A stored null is null.
   */
  get(id: string): Promise<T | undefined>;

  /**
   * Get all items in collection.
   *
   * @returns Promise resolving to array of all items
   */
  getAll(): Promise<T[]>;

  /**
   * Every item with its id. A sync needs the ids: `getAll` gives only the values (roadmap R2).
   * A storage that cannot give the ids does not have this method.
   *
   * @returns Promise resolving to the [id, item] pairs
   */
  getEntries?(): Promise<Array<[string, T]>>;

  /**
   * The ids of the items, in the order of the entries. The storage does not read or copy the
   * values, so a sync that needs only the ids does not copy each item. A storage that cannot
   * give the ids cheaply does not have this method, and a caller uses `getEntries()`.
   *
   * @returns Promise resolving to the ids, as a new array
   */
  getIds?(): Promise<string[]>;

  /**
   * The changes after a version (roadmap R28). A storage without a change log does not have
   * this method, and a sync uses `getEntries()`. A full result follows the order of the entries.
   * A delta follows the order of the last change of each id.
   *
   * @param since - A `version` that an earlier call gave. Without it, the result has all items.
   * @returns Promise resolving to the changed items, the deleted ids and the new version
   */
  getChangesSince?(since?: string): Promise<StorageChanges<T>>;

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

  //
  // ═══ Write Operations ═══
  //

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

  //
  // ═══ Bulk Operations ═══
  //

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

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /**
   * This method sends the writes that wait in the storage to their destination (roadmap R28). A storage
   * that keeps no writes does not have this method.
   *
   * @returns Promise resolving when the waiting writes reached their destination
   */
  flush?(): Promise<void>;

  /**
   * This method closes the storage and releases its resources. After it, each operation rejects
   * with an error whose message says "closed". A second `close()` does nothing. A durable storage
   * keeps its items for a new storage of the same place.
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
 * The changes of a storage after a version (roadmap R28).
 *
 * - `version` is opaque. The next call gives it back as `since`.
 * - When `full` is true, `changed` has every item, and each id that it does not have was
 *   deleted. A storage gives a full result when it cannot find the changes since the version:
 *   the first call, a version of an older run, or a change log that dropped old deletes.
 * - When `full` is false, `changed` has the items that changed after the version, and `deleted`
 *   has the ids that were deleted after it.
 * - The order of a full result is the order of the entries. The order of a delta is the order of
 *   the last change of each id: an id that changed again comes after the ids that changed before.
 */
export interface StorageChanges<T> {
  /** The version of the storage that includes these changes. */
  version: string;
  /** True when `changed` has every item of the storage. */
  full: boolean;
  /** The items that changed, with their ids. */
  changed: Array<[string, T]>;
  /** The ids that were deleted. Empty when `full` is true. */
  deleted: string[];
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
export function normalizeStorageResult<T>(value: Promise<T>): Promise<T> {
  return value;
}
