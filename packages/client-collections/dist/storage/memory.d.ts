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
export declare class InMemoryStorage<T> implements CollectionStorage<T> {
    private data;
    get(id: string): Promise<T | undefined>;
    getAll(): Promise<T[]>;
    find(predicate: (item: T) => boolean): Promise<T[]>;
    has(id: string): Promise<boolean>;
    size(): Promise<number>;
    set(id: string, value: T): Promise<void>;
    delete(id: string): Promise<boolean>;
    clear(): Promise<void>;
    setBatch(items: Array<[string, T]>): Promise<void>;
    deleteBatch(ids: string[]): Promise<number>;
    getBatch(ids: string[]): Promise<Map<string, T>>;
    close(): Promise<void>;
    getMetadata(): Promise<StorageMetadata>;
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