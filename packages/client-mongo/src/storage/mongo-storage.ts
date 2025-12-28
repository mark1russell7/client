/**
 * MongoDB Storage Implementation
 *
 * Implements CollectionStorage<T> from client-collections, providing MongoDB
 * as a storage backend for the collections framework.
 */

import type { Collection, Document, Filter } from "mongodb";
import type { CollectionStorage, StorageMetadata } from "@mark1russell7/client-collections";
import { getDb } from "../connection.js";

/**
 * Configuration options for MongoStorage.
 */
export interface MongoStorageOptions {
  /** MongoDB collection name */
  collection: string;
}

/**
 * MongoDB document with string ID.
 */
interface MongoDoc<T> extends Document {
  _id: string;
  data: T;
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
export class MongoStorage<T> implements CollectionStorage<T> {
  private readonly collectionName: string;
  private cachedCollection: Collection<MongoDoc<T>> | null = null;

  constructor(options: MongoStorageOptions) {
    this.collectionName = options.collection;
  }

  private getCollection(): Collection<MongoDoc<T>> {
    if (!this.cachedCollection) {
      const db = getDb();
      this.cachedCollection = db.collection<MongoDoc<T>>(this.collectionName);
    }
    return this.cachedCollection;
  }

  async get(id: string): Promise<T | undefined> {
    const doc = await this.getCollection().findOne({ _id: id } as Filter<MongoDoc<T>>);
    return doc?.data;
  }

  async getAll(): Promise<T[]> {
    const docs = await this.getCollection().find({}).toArray();
    return docs.map((doc) => doc.data);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.getAll();
    return all.filter(predicate);
  }

  async has(id: string): Promise<boolean> {
    const count = await this.getCollection().countDocuments({ _id: id } as Filter<MongoDoc<T>>, { limit: 1 });
    return count > 0;
  }

  async size(): Promise<number> {
    return this.getCollection().countDocuments({});
  }

  async set(id: string, value: T): Promise<void> {
    await this.getCollection().updateOne(
      { _id: id } as Filter<MongoDoc<T>>,
      { $set: { _id: id, data: value } as unknown as Document },
      { upsert: true }
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.getCollection().deleteOne({ _id: id } as Filter<MongoDoc<T>>);
    return result.deletedCount > 0;
  }

  async clear(): Promise<void> {
    await this.getCollection().deleteMany({});
  }

  async setBatch(items: Array<[string, T]>): Promise<void> {
    if (items.length === 0) return;

    const operations = items.map(([id, value]) => ({
      updateOne: {
        filter: { _id: id } as Filter<MongoDoc<T>>,
        update: { $set: { _id: id, data: value } as unknown as Document },
        upsert: true,
      },
    }));

    await this.getCollection().bulkWrite(operations);
  }

  async deleteBatch(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const result = await this.getCollection().deleteMany({
      _id: { $in: ids },
    } as Filter<MongoDoc<T>>);

    return result.deletedCount;
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    if (ids.length === 0) return new Map();

    const docs = await this.getCollection()
      .find({ _id: { $in: ids } } as Filter<MongoDoc<T>>)
      .toArray();

    const result = new Map<string, T>();
    for (const doc of docs) {
      result.set(String(doc._id), doc.data);
    }
    return result;
  }

  async close(): Promise<void> {
    this.cachedCollection = null;
  }

  async getMetadata(): Promise<StorageMetadata> {
    const size = await this.size();

    return {
      type: "custom",
      size,
      stats: {
        collectionName: this.collectionName,
      },
    };
  }
}
