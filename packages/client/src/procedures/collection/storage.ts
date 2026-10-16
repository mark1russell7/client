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
  /** Release the resources of the storage. */
  close(): Promise<void>;
  /** The kind, the size and the statistics of the storage. */
  getMetadata?(): Promise<StorageMetadata>;
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
