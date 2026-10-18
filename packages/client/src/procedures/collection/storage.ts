/**
 * The storage of a collection, as the core sees it.
 *
 * The core procedures of a collection (`collections.<name>.<operation>`), the repository of a
 * procedure context and the collections of a `ProcedureServer` use a storage through this
 * interface. It has the shape of `CollectionStorage` of `@procedures/collections`, so
 * each backend of that package (`InMemoryStorage`) and of `@procedures/store`
 * (`ApiStorage`, `HybridStorage`) fits it. The core declares it itself, so it does not depend on
 * the collections package (roadmap 3.3).
 *
 * Each method gives a Promise: a caller cannot tell a local storage from a remote one.
 *
 * The contract (the suite of `@procedures/collections/testing` tests it for each storage):
 * - A storage keeps a copy of each value that a write takes, and each read gives a new copy.
 * - A stored `null` reads back as `null`. A missing id reads back as `undefined`.
 * - `getIds()` gives the ids of `getEntries()`, in the same order.
 * - A delta of `getChangesSince` follows the order of the last change of each id.
 * - After `close()`, each operation rejects with an error whose message says "closed". A second
 *   `close()` does nothing.
 * - `query()` gives the result of `queryEntries()` of `@procedures/collections` for the entries.
 * - `observe()` gives one batch for each write that changes the storage, before the write resolves.
 * - `patch()` merges the fields into the item in one step.
 */

import type { StoragePatch, StorageQueryOptions, StorageQueryPolicy, StorageSelector } from "./query.js";

export type {
  StorageFieldOperators,
  StoragePatch,
  StoragePatchOperations,
  StorageQueryOperator,
  StorageQueryOptions,
  StorageQueryPolicy,
  StorageSelector,
  StorageSort,
  StorageSortDirection,
} from "./query.js";

export interface CollectionStorage<T> {
  /** The item with this id, or undefined. A stored null is null. */
  get(id: string): Promise<T | undefined>;
  /** Every item of the collection. */
  getAll(): Promise<T[]>;
  /**
   * Every item with its id. A sync needs the ids (roadmap R2). A storage that cannot give
   * them does not have this method.
   */
  getEntries?(): Promise<Array<[string, T]>>;
  /**
   * The ids of the items, in the order of the entries, without the values. A storage that cannot
   * give the ids cheaply does not have this method.
   */
  getIds?(): Promise<string[]>;
  /**
   * The changes after a version (roadmap R28). A storage without a change log does not have
   * this method, and a sync uses `getEntries()`.
   *
   * @param since - A `version` that an earlier call gave. Without it, the result has all items.
   */
  getChangesSince?(since?: string): Promise<StorageChanges<T>>;
  /** The items for which the predicate gives true. */
  find(predicate: (item: T) => boolean): Promise<T[]>;
  /**
   * The entries whose items match a JSON selector, with an order, a skip and a limit. The
   * procedure `find` uses it, and gives the query policy of the host. A storage without it gives
   * its entries, and the procedure runs the selector itself. Without a policy, the storage uses its
   * own policy: `$regex` is off by default.
   */
  query?(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>>;
  /**
   * This method sends a batch of changes to the observer for each write that changes the storage,
   * before the write resolves. It gives the function that stops the batches.
   */
  observe?(observer: StorageObserver<T>): () => void;
  /** True when an item has this id. */
  has(id: string): Promise<boolean>;
  /** The number of items. */
  size(): Promise<number>;
  /** Set the item of an id. The options give the origin of the write to the observers. */
  set(id: string, value: T, options?: StorageWriteOptions): Promise<void>;
  /** Delete the item of an id. True when it existed. */
  delete(id: string, options?: StorageWriteOptions): Promise<boolean>;
  /** Delete every item. */
  clear(options?: StorageWriteOptions): Promise<void>;
  /**
   * This method changes the item of an id in one step, and gives the new item, or undefined for a
   * missing id. The fields are a JSON Merge Patch, or the operations `{ $set, $unset }`. The
   * procedure `patch` uses it. A storage without it gets a read and a write of the item.
   */
  patch?(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined>;
  /** Set several items. */
  setBatch(items: Array<[string, T]>, options?: StorageWriteOptions): Promise<void>;
  /** Delete several items. The number of items that existed. */
  deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number>;
  /** The items of several ids. An id with no item is not in the map. */
  getBatch(ids: string[]): Promise<Map<string, T>>;
  /**
   * This method sends the writes that wait in the storage to their destination (roadmap R28). A storage
   * that keeps no writes does not have this method. `ProcedureServer.useStorage` calls it.
   */
  flush?(): Promise<void>;
  /**
   * This method releases the resources of the storage. After it, each operation rejects. A second
   * `close()` does nothing.
   */
  close(): Promise<void>;
  /** The kind, the size and the statistics of the storage. */
  getMetadata?(): Promise<StorageMetadata>;
}

/** The options of a write. */
export interface StorageWriteOptions {
  /** The tag of the writer. Each change that the write gives has it. */
  readonly origin?: string | undefined;
}

/** A change of `observe()`: an id got a value. */
export interface StorageSetChange<T> {
  readonly type: "set";
  readonly id: string;
  readonly value: T;
  readonly origin?: string | undefined;
}

/** A change of `observe()`: an id lost its item. */
export interface StorageDeleteChange {
  readonly type: "delete";
  readonly id: string;
  readonly origin?: string | undefined;
}

/** A change of `observe()`: the storage lost each item. */
export interface StorageClearChange {
  readonly type: "clear";
  readonly origin?: string | undefined;
}

/** One change of `observe()`. */
export type StorageChangeEvent<T> = StorageSetChange<T> | StorageDeleteChange | StorageClearChange;

/** The changes of one write, in the order of the write. */
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
 *   the last change of each id.
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

/** The metadata that a storage gives about itself. */
export interface StorageMetadata {
  type: "memory" | "api" | "hybrid" | "synced" | "custom";
  size: number;
  stats?: {
    hitRate?: number;
    lastSync?: number;
    pendingOps?: number;
    memoryUsage?: number;
    [key: string]: unknown;
  };
}
