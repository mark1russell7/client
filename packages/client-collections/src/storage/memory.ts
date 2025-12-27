/**
 * In-Memory Storage Implementation
 *
 * Fast, volatile storage using JavaScript Map.
 * All operations return Promises for interface consistency.
 */

import type { CollectionStorage, StorageMetadata } from "./interface.js";

/**
 * In-memory storage backed by JavaScript Map.
 *
 * Features:
 * - Fast lookups O(1)
 * - No persistence (data lost on restart)
 * - Memory-bound (limited by available RAM)
 * - Returns Promises for API consistency with remote storage
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

  //
  // ═══ Read Operations ═══
  //

  get(id: string): Promise<T | undefined> {
    return Promise.resolve(this.data.get(id));
  }

  getAll(): Promise<T[]> {
    return Promise.resolve(Array.from(this.data.values()));
  }

  find(predicate: (item: T) => boolean): Promise<T[]> {
    const results: T[] = [];
    for (const item of this.data.values()) {
      if (predicate(item)) {
        results.push(item);
      }
    }
    return Promise.resolve(results);
  }

  has(id: string): Promise<boolean> {
    return Promise.resolve(this.data.has(id));
  }

  size(): Promise<number> {
    return Promise.resolve(this.data.size);
  }

  //
  // ═══ Write Operations ═══
  //

  set(id: string, value: T): Promise<void> {
    this.data.set(id, value);
    return Promise.resolve();
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.data.delete(id));
  }

  clear(): Promise<void> {
    this.data.clear();
    return Promise.resolve();
  }

  //
  // ═══ Bulk Operations ═══
  //

  setBatch(items: Array<[string, T]>): Promise<void> {
    for (const [id, value] of items) {
      this.data.set(id, value);
    }
    return Promise.resolve();
  }

  deleteBatch(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (this.data.delete(id)) {
        deleted++;
      }
    }
    return Promise.resolve(deleted);
  }

  getBatch(ids: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const id of ids) {
      const value = this.data.get(id);
      if (value !== undefined) {
        result.set(id, value);
      }
    }
    return Promise.resolve(result);
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  close(): Promise<void> {
    // No cleanup needed for in-memory storage
    this.data.clear();
    return Promise.resolve();
  }

  getMetadata(): Promise<StorageMetadata> {
    // Rough memory estimation:
    // Each entry has ~overhead of 100 bytes (key string + Map entry overhead)
    const estimatedEntrySize = 100;
    const memoryUsage = this.data.size * estimatedEntrySize;

    return Promise.resolve({
      type: "memory",
      size: this.data.size,
      stats: {
        memoryUsage,
      },
    });
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
}
