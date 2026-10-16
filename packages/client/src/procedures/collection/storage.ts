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
 */
export interface CollectionStorage<T> {
  /** The item with this id, or undefined. */
  get(id: string): Promise<T | undefined>;
  /** Every item of the collection. */
  getAll(): Promise<T[]>;
  /**
   * Every item with its id. A sync needs the ids (roadmap R2). A storage that cannot give
   * them does not have this method.
   */
  getEntries?(): Promise<Array<[string, T]>>;
  /**
   * The changes after a version (roadmap R28). A storage without a change log does not have
   * this method, and a sync uses `getEntries()`.
   *
   * @param since - A `version` that an earlier call gave. Without it, the result has all items.
   */
  getChangesSince?(since?: string): Promise<StorageChanges<T>>;
  /** The items for which the predicate gives true. */
  find(predicate: (item: T) => boolean): Promise<T[]>;
  /** True when an item has this id. */
  has(id: string): Promise<boolean>;
  /** The number of items. */
  size(): Promise<number>;
  /** Set the item of an id. */
  set(id: string, value: T): Promise<void>;
  /** Delete the item of an id. True when it existed. */
  delete(id: string): Promise<boolean>;
  /** Delete every item. */
  clear(): Promise<void>;
  /** Set several items. */
  setBatch(items: Array<[string, T]>): Promise<void>;
  /** Delete several items. The number of items that existed. */
  deleteBatch(ids: string[]): Promise<number>;
  /** The items of several ids. An id with no item is not in the map. */
  getBatch(ids: string[]): Promise<Map<string, T>>;
  /**
   * This method sends the writes that wait in the storage to their destination (roadmap R28). A storage
   * that keeps no writes does not have this method. `ProcedureServer.useStorage` calls it.
   */
  flush?(): Promise<void>;
  /** Release the resources of the storage. */
  close(): Promise<void>;
  /** The kind, the size and the statistics of the storage. */
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
