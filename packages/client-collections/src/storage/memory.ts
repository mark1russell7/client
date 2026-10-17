/**
 * In-Memory Storage Implementation
 *
 * Fast, volatile storage using JavaScript Map.
 * All operations return Promises for interface consistency.
 */

import type { CollectionStorage, StorageChanges, StorageMetadata } from "./interface.js";

/** Options of an in-memory storage. */
export interface InMemoryStorageOptions {
  /**
   * The number of deletes that the change log keeps (roadmap R28). After more deletes, the log
   * drops the oldest ones, and `getChangesSince` of an older version gives all items.
   * @default 10000
   */
  maxTombstones?: number;
  /**
   * True: the storage keeps a copy of each value that a write takes, and each read gives a new
   * copy (`structuredClone`). Then a change of a written or a read value does not change the
   * stored item, as in each other storage.
   *
   * False: the storage keeps the values themselves, and the reads give them. This is faster.
   * Give it only when no caller changes a value after a write or a read.
   * @default true
   */
  copies?: boolean;
}

/** A new epoch: a version of another storage does not match it. */
function newEpoch(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The copy of a value: `structuredClone`, or the value itself without copies. */
type Copy = <V>(value: V) => V;
const same: Copy = (value) => value;
const clone: Copy = (value) => structuredClone(value);

/**
 * In-memory storage backed by JavaScript Map.
 *
 * Features:
 * - Fast lookups O(1)
 * - No persistence (data lost on restart)
 * - Memory-bound (limited by available RAM)
 * - Returns Promises for API consistency with remote storage
 * - Each error is a rejected promise: an error of a `find` predicate does not throw at once
 * - A change log: `getChangesSince(version)` gives the changes after a version (roadmap R28)
 * - Copies: a change of a written or a read value does not change the stored item (the option
 *   `copies: false` turns this off)
 * - `getIds()` gives the ids without a copy of the values
 * - After `close()`, each operation rejects, and a second `close()` does nothing
 *
 * @example
 * ```typescript
 * const storage = new InMemoryStorage<User>();
 * await storage.set("123", { id: "123", name: "John" });
 * const user = await storage.get("123"); // { id: "123", name: "John" }
 * ```
 */
export class InMemoryStorage<T> implements CollectionStorage<T> {
  private data = new Map<string, T>();

  // The change log (roadmap R28). Each write gets the next number of `seq`. A version is
  // `<epoch>:<seq>`.
  private readonly epoch = newEpoch();
  private seq = 0;
  /** The number of the last write of each id that has an item, the oldest first */
  private readonly changedAt = new Map<string, number>();
  /** The number of the delete of each id that has no item, the oldest first (the tombstones) */
  private readonly deletedAt = new Map<string, number>();
  /** The log does not know the deletes at or below this number: they were dropped */
  private floor = 0;
  private readonly maxTombstones: number;
  private readonly copy: Copy;
  private closed = false;

  constructor(options: InMemoryStorageOptions = {}) {
    this.maxTombstones = Math.max(0, options.maxTombstones ?? 10_000);
    this.copy = options.copies === false ? same : clone;
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    this.checkOpen();
    return this.copy(this.data.get(id));
  }

  async getAll(): Promise<T[]> {
    this.checkOpen();
    return Array.from(this.data.values(), this.copy);
  }

  async getEntries(): Promise<Array<[string, T]>> {
    this.checkOpen();
    return this.copiedEntries();
  }

  /** The ids of the items, in the order of the entries. This method copies no value. */
  async getIds(): Promise<string[]> {
    this.checkOpen();
    return Array.from(this.data.keys());
  }

  /**
   * The changes after a version (roadmap R28). A version of another storage, or older than the
   * dropped deletes, gives all items (`full: true`) in the order of the entries. A delta gives
   * the changed items and the deleted ids in the order of the last change of each id.
   */
  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    this.checkOpen();
    const version = `${this.epoch}:${this.seq}`;
    const from = this.parseVersion(since);
    if (from === undefined || from < this.floor) {
      return { version, full: true, changed: this.copiedEntries(), deleted: [] };
    }
    const changed: Array<[string, T]> = [];
    for (const [id, at] of this.changedAt) {
      if (at > from) changed.push([id, this.copy(this.data.get(id) as T)]);
    }
    const deleted: string[] = [];
    for (const [id, at] of this.deletedAt) {
      if (at > from) deleted.push(id);
    }
    return { version, full: false, changed, deleted };
  }

  /** The items for which the predicate gives true. The predicate gets a copy of each item. */
  async find(predicate: (item: T) => boolean): Promise<T[]> {
    this.checkOpen();
    const results: T[] = [];
    for (const stored of this.data.values()) {
      const item = this.copy(stored);
      if (predicate(item)) {
        results.push(item);
      }
    }
    return results;
  }

  async has(id: string): Promise<boolean> {
    this.checkOpen();
    return this.data.has(id);
  }

  async size(): Promise<number> {
    this.checkOpen();
    return this.data.size;
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    this.checkOpen();
    this.data.set(id, this.copy(value));
    this.noteSet(id);
  }

  async delete(id: string): Promise<boolean> {
    this.checkOpen();
    const existed = this.data.delete(id);
    if (existed) this.noteDelete(id);
    return existed;
  }

  async clear(): Promise<void> {
    this.checkOpen();
    for (const id of this.data.keys()) this.noteDelete(id);
    this.data.clear();
  }

  //
  // ═══ Bulk Operations ═══
  //

  /** This method sets several items. When one value has no copy, nothing changes. */
  async setBatch(items: Array<[string, T]>): Promise<void> {
    this.checkOpen();
    const copies = items.map(([id, value]): [string, T] => [id, this.copy(value)]);
    for (const [id, value] of copies) {
      this.data.set(id, value);
      this.noteSet(id);
    }
  }

  async deleteBatch(ids: string[]): Promise<number> {
    this.checkOpen();
    let deleted = 0;
    for (const id of ids) {
      if (this.data.delete(id)) {
        this.noteDelete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    this.checkOpen();
    const result = new Map<string, T>();
    for (const id of ids) {
      const value = this.data.get(id);
      if (value !== undefined) {
        result.set(id, this.copy(value));
      }
    }
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /**
   * This method closes the storage and drops its items. After it, each operation rejects (and
   * each method of the `Map` interface throws). A second `close()` does nothing.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.data.clear();
    this.changedAt.clear();
    this.deletedAt.clear();
  }

  async getMetadata(): Promise<StorageMetadata> {
    this.checkOpen();
    // Rough memory estimation:
    // Each entry has ~overhead of 100 bytes (key string + Map entry overhead)
    const estimatedEntrySize = 100;
    const memoryUsage = this.data.size * estimatedEntrySize;

    return {
      type: "memory",
      size: this.data.size,
      stats: {
        memoryUsage,
      },
    };
  }

  //
  // ═══ Additional Methods (Map compatibility) ═══
  //

  /**
   * Get all keys in storage.
   *
   * @returns Iterator of keys
   */
  keys(): IterableIterator<string> {
    this.checkOpen();
    return this.data.keys();
  }

  /**
   * The values in storage: copies, unless the option `copies` is false.
   *
   * @returns Iterator of values
   */
  values(): IterableIterator<T> {
    this.checkOpen();
    return this.copiedEntries().map(([, value]) => value)[Symbol.iterator]();
  }

  /**
   * The entries in storage: copies of the values, unless the option `copies` is false.
   *
   * @returns Iterator of [id, value] tuples
   */
  entries(): IterableIterator<[string, T]> {
    this.checkOpen();
    return this.copiedEntries()[Symbol.iterator]();
  }

  /**
   * Iterate over storage entries. The callback gets a copy of each value, and a `Map` of the
   * copies, unless the option `copies` is false.
   *
   * @param callback - Function to call for each entry
   */
  forEach(callback: (value: T, key: string, map: Map<string, T>) => void): void {
    this.checkOpen();
    new Map(this.copiedEntries()).forEach(callback);
  }

  /**
   * Make storage iterable.
   */
  [Symbol.iterator](): IterableIterator<[string, T]> {
    return this.entries();
  }

  //
  // ═══ Internal Helpers ═══
  //

  /** This method throws after `close()`. In an async method, the throw rejects the promise. */
  private checkOpen(): void {
    if (this.closed) throw new Error("The InMemoryStorage is closed");
  }

  /** The entries with copies of the values. */
  private copiedEntries(): Array<[string, T]> {
    return Array.from(this.data, ([id, value]): [string, T] => [id, this.copy(value)]);
  }

  //
  // ═══ The change log ═══
  //

  /** A set moves the id to the end of the order of the log: the order of the last change. */
  private noteSet(id: string): void {
    this.changedAt.delete(id);
    this.changedAt.set(id, ++this.seq);
    this.deletedAt.delete(id);
  }

  private noteDelete(id: string): void {
    this.changedAt.delete(id);
    // Delete, then set: the tombstone goes to the end of the order (the newest)
    this.deletedAt.delete(id);
    this.deletedAt.set(id, ++this.seq);
    while (this.deletedAt.size > this.maxTombstones) {
      const [oldest, at] = this.deletedAt.entries().next().value as [string, number];
      this.deletedAt.delete(oldest);
      this.floor = Math.max(this.floor, at);
    }
  }

  /** The number of a version of this storage, or undefined for another or an unknown version. */
  private parseVersion(since: string | undefined): number | undefined {
    if (since === undefined) return undefined;
    const separator = since.lastIndexOf(":");
    if (separator < 0 || since.slice(0, separator) !== this.epoch) return undefined;
    const at = Number(since.slice(separator + 1));
    return Number.isInteger(at) && at >= 0 && at <= this.seq ? at : undefined;
  }
}
