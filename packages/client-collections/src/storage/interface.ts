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

// The query language is a part of the wire contract of the core: its one copy is there (roadmap CLI-34)
import type { StoragePatch, StorageQueryOptions, StorageQueryPolicy, StorageSelector } from "@procedures/client/query";

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
 * - `query()` gives the result of `queryEntries()` for the entries of the storage.
 * - `observe()` gives one batch for each write that changes the storage, before the write resolves.
 * - `patch()` changes the item in one step: two patches at the same time keep each field.
 * - A write with a precondition (`expectedVersion` of `set` and `delete`, `expectedVersions` of
 *   `setBatch`) tests the version of the current item and writes in one step. A conflict changes
 *   nothing and rejects with `VersionConflictError`. A storage that cannot test a precondition
 *   rejects the write with a `TypeError`: it never ignores a precondition (roadmap CLI-16).
 *
 * The optional methods are features: a caller tests for each one before it uses it.
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
   * The entries whose items match a selector, with an order, a skip and a limit. The selector is
   * JSON, so a remote storage sends it to its server, and a database can run it itself. The result
   * is the result of `queryEntries()` for the entries of the storage. A storage without this method
   * does not run selectors: a caller uses `queryEntries()` on the entries.
   *
   * @param selector - The selector. `{}` matches each item.
   * @param options - The order, the skip and the limit
   * @param policy - The query policy of the caller: the procedure `find` gives the policy of the
   *   host. Without it, the storage uses its own policy. The default policy does not permit `$regex`.
   * @returns Promise resolving to the [id, item] pairs, with copies of the items. A selector or
   *   options with a problem, or that the policy does not permit, reject with a `TypeError`.
   */
  query?(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>>;

  /**
   * This method starts to send the changes of the storage to an observer. Each write that changes
   * the storage gives one batch, before the write resolves. A write that changes nothing gives no
   * batch. A storage without this method does not tell its changes.
   *
   * - A set gives a `set` change with a copy of the value. A patch gives a `set` change with the new item.
   * - A delete gives a `delete` change for each id that existed.
   * - A clear of a storage with items gives one `clear` change.
   * - Each change has the `origin` of the write options, or no origin.
   *
   * @param observer - The function that gets each batch. Its error does not change the write.
   * @returns The function that stops the batches. A second use of it does nothing.
   * @throws Error after `close()`
   */
  observe?(observer: StorageObserver<T>): () => void;

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
   * @param options - The origin of the write, for the observers, and the expected version of the
   *   current item (roadmap CLI-16)
   * @returns Promise resolving when operation completes. A conflict rejects with `VersionConflictError`.
   */
  set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void>;

  /**
   * Delete item by ID.
   *
   * @param id - Item identifier
   * @param options - The origin of the write, for the observers, and the expected version of the
   *   current item (roadmap CLI-16)
   * @returns Promise resolving to true if item was deleted, false if not found. A conflict rejects
   *   with `VersionConflictError`.
   */
  delete(id: string, options?: StorageItemWriteOptions): Promise<boolean>;

  /**
   * Clear all items from collection.
   *
   * @param options - The origin of the write, for the observers
   * @returns Promise resolving when operation completes
   */
  clear(options?: StorageWriteOptions): Promise<void>;

  /**
   * This method changes one item in one step. The fields are a JSON Merge Patch (RFC 7386): each
   * field replaces the field of the item, an object field merges into an object field, and `null`
   * removes the field. Or they are the operations `{ $set, $unset, $remove, $insert }`: `$set` can
   * set `null` and nested field paths, and `$remove` and `$insert` move the elements of arrays.
   * Two patches of one item at the same time keep the fields of each. A storage
   * without this method cannot change an item in one step.
   *
   * @param id - Item identifier
   * @param fields - The fields: an object of one form. Another value rejects with a `TypeError`.
   * @param options - The origin of the write, for the observers
   * @returns Promise resolving to a copy of the new item, or undefined when the id has no item. A
   *   missing id stays missing.
   */
  patch?(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined>;

  //
  // ═══ Bulk Operations ═══
  //

  /**
   * Set multiple items at once (more efficient than individual sets).
   *
   * @param items - Array of [id, value] tuples
   * @param options - The origin of the write, for the observers, and the expected version of
   *   each id (roadmap CLI-16)
   * @returns Promise resolving when operation completes. A conflict of one id rejects with
   *   `VersionConflictError`, and the batch changes no item.
   */
  setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void>;

  /**
   * Delete multiple items at once.
   *
   * @param ids - Array of item identifiers
   * @param options - The origin of the write, for the observers
   * @returns Promise resolving to number of items actually deleted
   */
  deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number>;

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

/** The options of a write. */
export interface StorageWriteOptions {
  /**
   * The tag of the writer. Each change that the write gives has it, so an observer knows its own
   * writes: a sync does not send back the changes that it wrote itself.
   */
  readonly origin?: string | undefined;
}

/**
 * The options of `set` and `delete`: the origin, and the precondition of the write (roadmap
 * CLI-16).
 */
export interface StorageItemWriteOptions extends StorageWriteOptions {
  /**
   * The version that the write expects for the current item: the value of `versionOf` of the
   * storage for that item. `null` expects no item. When the current item has another version, the
   * write changes nothing and rejects with `VersionConflictError`. A storage without `versionOf`
   * rejects the write with a `TypeError`. Absent: no precondition, and the last write wins.
   */
  readonly expectedVersion?: string | null | undefined;
}

/** The options of `setBatch`: the origin, and the precondition of each id (roadmap CLI-16). */
export interface StorageBatchWriteOptions extends StorageWriteOptions {
  /**
   * The version that the write expects for the current item of each id, as `expectedVersion`
   * does. When one id has a conflict, the batch changes no item. An id without an entry has no
   * precondition.
   */
  readonly expectedVersions?: ReadonlyArray<readonly [string, string | null]> | undefined;
}

/** A change of `observe()`: an id got a value. */
export interface StorageSetChange<T> {
  readonly type: "set";
  readonly id: string;
  /** A copy of the new item. */
  readonly value: T;
  /** The origin of the write, or undefined when the write had none. */
  readonly origin?: string | undefined;
}

/** A change of `observe()`: an id lost its item. */
export interface StorageDeleteChange {
  readonly type: "delete";
  readonly id: string;
  /** The origin of the write, or undefined when the write had none. */
  readonly origin?: string | undefined;
}

/** A change of `observe()`: the storage lost each item. */
export interface StorageClearChange {
  readonly type: "clear";
  /** The origin of the write, or undefined when the write had none. */
  readonly origin?: string | undefined;
}

/** One change of `observe()`. */
export type StorageChangeEvent<T> = StorageSetChange<T> | StorageDeleteChange | StorageClearChange;

/** The changes of one write, in the order of the write. The observers share it: do not change it. */
export type StorageChangeBatch<T> = readonly StorageChangeEvent<T>[];

/** The function that gets each batch of `observe()`. */
export type StorageObserver<T> = (changes: StorageChangeBatch<T>) => void;

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
