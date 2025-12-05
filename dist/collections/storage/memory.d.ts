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
export declare class InMemoryStorage<T> implements CollectionStorage<T> {
    private data;
    get(id: string): T | undefined;
    getAll(): T[];
    find(predicate: (item: T) => boolean): T[];
    has(id: string): boolean;
    size(): number;
    set(id: string, value: T): void;
    delete(id: string): boolean;
    clear(): void;
    setBatch(items: Array<[string, T]>): void;
    deleteBatch(ids: string[]): number;
    getBatch(ids: string[]): Map<string, T>;
    close(): void;
    getMetadata(): StorageMetadata;
    /**
     * Get all keys in storage.
     *
     * @returns Iterator of keys
     */
    keys(): IterableIterator<string>;
    /**
     * Get all values in storage.
     *
     * @returns Iterator of values
     */
    values(): IterableIterator<T>;
    /**
     * Get all entries in storage.
     *
     * @returns Iterator of [id, value] tuples
     */
    entries(): IterableIterator<[string, T]>;
    /**
     * Iterate over storage entries.
     *
     * @param callback - Function to call for each entry
     */
    forEach(callback: (value: T, key: string, map: Map<string, T>) => void): void;
    /**
     * Make storage iterable.
     */
    [Symbol.iterator](): IterableIterator<[string, T]>;
}
//# sourceMappingURL=memory.d.ts.map