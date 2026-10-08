/**
 * MongoDB Storage Implementation
 *
 * Implements CollectionStorage<T> from client-collections, providing MongoDB
 * as a storage backend for the collections framework.
 */
import type { CollectionStorage, StorageMetadata } from "@mark1russell7/client-collections";
/**
 * Configuration options for MongoStorage.
 */
export interface MongoStorageOptions {
    /** MongoDB collection name */
    collection: string;
}
/**
 * MongoDB implementation of CollectionStorage.
 *
 * Stores items as documents with the structure:
 * { _id: string, data: T }
 *
 * @example
 * ```typescript
 * const storage = new MongoStorage<User>({ collection: "users" });
 * await storage.set("user-1", { name: "Alice", email: "alice@example.com" });
 * const user = await storage.get("user-1");
 * ```
 */
export declare class MongoStorage<T> implements CollectionStorage<T> {
    private readonly collectionName;
    private cachedCollection;
    constructor(options: MongoStorageOptions);
    private getCollection;
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
}
//# sourceMappingURL=mongo-storage.d.ts.map