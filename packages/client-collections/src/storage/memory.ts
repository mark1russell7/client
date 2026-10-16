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
}

/** A new epoch: a version of another storage, or of a closed one, does not match it. */
function newEpoch(): string {
  return Math.random().toString(36).slice(2, 10);
}

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
  private epoch = newEpoch();
  private seq = 0;
  /** The number of the last write of each id that has an item */
  private readonly changedAt = new Map<string, number>();
  /** The number of the delete of each id that has no item, the oldest first (the tombstones) */
  private readonly deletedAt = new Map<string, number>();
  /** The log does not know the deletes at or below this number: they were dropped */
  private floor = 0;
  private readonly maxTombstones: number;

  constructor(options: InMemoryStorageOptions = {}) {
    this.maxTombstones = Math.max(0, options.maxTombstones ?? 10_000);
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    return this.data.get(id);
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.data.values());
  }

  async getEntries(): Promise<Array<[string, T]>> {
    return Array.from(this.data.entries());
  }

  /**
   * The changes after a version (roadmap R28). A version of another storage, of a closed
   * storage, or older than the dropped deletes gives all items (`full: true`).
   */
  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    const version = `${this.epoch}:${this.seq}`;
    const from = this.parseVersion(since);
    if (from === undefined || from < this.floor) {
      return { version, full: true, changed: Array.from(this.data.entries()), deleted: [] };
    }
    const changed: Array<[string, T]> = [];
    for (const [id, at] of this.changedAt) {
      if (at > from) changed.push([id, this.data.get(id) as T]);
    }
    const deleted: string[] = [];
    for (const [id, at] of this.deletedAt) {
      if (at > from) deleted.push(id);
    }
    return { version, full: false, changed, deleted };
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    const results: T[] = [];
    for (const item of this.data.values()) {
      if (predicate(item)) {
        results.push(item);
      }
    }
    return results;
  }

  async has(id: string): Promise<boolean> {
    return this.data.has(id);
  }

  async size(): Promise<number> {
    return this.data.size;
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    this.data.set(id, value);
    this.noteSet(id);
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.data.delete(id);
    if (existed) this.noteDelete(id);
    return existed;
  }

  async clear(): Promise<void> {
    for (const id of this.data.keys()) this.noteDelete(id);
    this.data.clear();
  }

  //
  // ═══ Bulk Operations ═══
  //

  async setBatch(items: Array<[string, T]>): Promise<void> {
    for (const [id, value] of items) {
      this.data.set(id, value);
      this.noteSet(id);
    }
  }

  async deleteBatch(ids: string[]): Promise<number> {
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
    const result = new Map<string, T>();
    for (const id of ids) {
      const value = this.data.get(id);
      if (value !== undefined) {
        result.set(id, value);
      }
    }
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  async close(): Promise<void> {
    // No cleanup needed for in-memory storage
    this.data.clear();
    // A new epoch: a version of the closed storage gives all items
    this.changedAt.clear();
    this.deletedAt.clear();
    this.epoch = newEpoch();
    this.seq = 0;
    this.floor = 0;
  }

  async getMetadata(): Promise<StorageMetadata> {
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
    return this.data.keys();
  }

  /**
   * Get all values in storage.
   *
   * @returns Iterator of values
   */
  values(): IterableIterator<T> {
    return this.data.values();
  }

  /**
   * Get all entries in storage.
   *
   * @returns Iterator of [id, value] tuples
   */
  entries(): IterableIterator<[string, T]> {
    return this.data.entries();
  }

  /**
   * Iterate over storage entries.
   *
   * @param callback - Function to call for each entry
   */
  forEach(callback: (value: T, key: string, map: Map<string, T>) => void): void {
    this.data.forEach(callback);
  }

  /**
   * Make storage iterable.
   */
  [Symbol.iterator](): IterableIterator<[string, T]> {
    return this.data.entries();
  }

  //
  // ═══ The change log ═══
  //

  private noteSet(id: string): void {
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
