/**
 * MongoDB Storage Implementation
 *
 * Implements CollectionStorage<T> from client-collections, providing MongoDB
 * as a storage backend for the collections framework.
 */
import { getDb } from "../connection.js";
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
export class MongoStorage {
    collectionName;
    cachedCollection = null;
    constructor(options) {
        this.collectionName = options.collection;
    }
    getCollection() {
        if (!this.cachedCollection) {
            const db = getDb();
            this.cachedCollection = db.collection(this.collectionName);
        }
        return this.cachedCollection;
    }
    async get(id) {
        const doc = await this.getCollection().findOne({ _id: id });
        return doc?.data;
    }
    async getAll() {
        const docs = await this.getCollection().find({}).toArray();
        return docs.map((doc) => doc.data);
    }
    async find(predicate) {
        const all = await this.getAll();
        return all.filter(predicate);
    }
    async has(id) {
        const count = await this.getCollection().countDocuments({ _id: id }, { limit: 1 });
        return count > 0;
    }
    async size() {
        return this.getCollection().countDocuments({});
    }
    async set(id, value) {
        await this.getCollection().updateOne({ _id: id }, { $set: { _id: id, data: value } }, { upsert: true });
    }
    async delete(id) {
        const result = await this.getCollection().deleteOne({ _id: id });
        return result.deletedCount > 0;
    }
    async clear() {
        await this.getCollection().deleteMany({});
    }
    async setBatch(items) {
        if (items.length === 0)
            return;
        const operations = items.map(([id, value]) => ({
            updateOne: {
                filter: { _id: id },
                update: { $set: { _id: id, data: value } },
                upsert: true,
            },
        }));
        await this.getCollection().bulkWrite(operations);
    }
    async deleteBatch(ids) {
        if (ids.length === 0)
            return 0;
        const result = await this.getCollection().deleteMany({
            _id: { $in: ids },
        });
        return result.deletedCount;
    }
    async getBatch(ids) {
        if (ids.length === 0)
            return new Map();
        const docs = await this.getCollection()
            .find({ _id: { $in: ids } })
            .toArray();
        const result = new Map();
        for (const doc of docs) {
            result.set(String(doc._id), doc.data);
        }
        return result;
    }
    async close() {
        this.cachedCollection = null;
    }
    async getMetadata() {
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
//# sourceMappingURL=mongo-storage.js.map