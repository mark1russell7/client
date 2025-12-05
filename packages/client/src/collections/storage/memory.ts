/**
 * In-Memory Storage Implementation
 *
 * Fast, volatile storage using JavaScript Map.
 * All operations are synchronous.
 */

import type { CollectionStorage, StorageMetadata } from "./interface";

/**
 * In-memory storage backed by JavaScript Map.
 *
 * Features:
 * - Synchronous operations (no async overhead)
 * - Fast lookups O(1)
 * - No persistence (data lost on restart)
 * - Memory-bound (limited by available RAM)
 *
 * @example
 * ```typescript
 * const storage = new InMemoryStorage<User>();
 * storage.set("123", { id: "123", name: "John" });
 * const user = storage.get("123"); // { id: "123", name: "John" }
 * ```
 */
export class InMemoryStorage<T> implements CollectionStorage<T> {
  private data = new Map<string, T>();

  //
  // ═══ Read Operations ═══
  //

  get(id: string): T | undefined {
    return this.data.get(id);
  }

  getAll(): T[] {
    return Array.from(this.data.values());
  }

  find(predicate: (item: T) => boolean): T[] {
    const results: T[] = [];
    for (const item of this.data.values()) {
      if (predicate(item)) {
        results.push(item);
      }
    }
    return results;
  }

  has(id: string): boolean {
    return this.data.has(id);
  }

  size(): number {
    return this.data.size;
  }

  //
  // ═══ Write Operations ═══
  //

  set(id: string, value: T): void {
    this.data.set(id, value);
  }

  delete(id: string): boolean {
    return this.data.delete(id);
  }

  clear(): void {
    this.data.clear();
  }

  //
  // ═══ Bulk Operations ═══
  //

  setBatch(items: Array<[string, T]>): void {
    for (const [id, value] of items) {
      this.data.set(id, value);
    }
  }

  deleteBatch(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.data.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  getBatch(ids: string[]): Map<string, T> {
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

  close(): void {
    // No cleanup needed for in-memory storage
    this.data.clear();
  }

  getMetadata(): StorageMetadata {
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
}
