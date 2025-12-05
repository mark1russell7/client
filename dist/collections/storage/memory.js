/**
 * In-Memory Storage Implementation
 *
 * Fast, volatile storage using JavaScript Map.
 * All operations are synchronous.
 */
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
export class InMemoryStorage {
    data = new Map();
    //
    // ═══ Read Operations ═══
    //
    get(id) {
        return this.data.get(id);
    }
    getAll() {
        return Array.from(this.data.values());
    }
    find(predicate) {
        const results = [];
        for (const item of this.data.values()) {
            if (predicate(item)) {
                results.push(item);
            }
        }
        return results;
    }
    has(id) {
        return this.data.has(id);
    }
    size() {
        return this.data.size;
    }
    //
    // ═══ Write Operations ═══
    //
    set(id, value) {
        this.data.set(id, value);
    }
    delete(id) {
        return this.data.delete(id);
    }
    clear() {
        this.data.clear();
    }
    //
    // ═══ Bulk Operations ═══
    //
    setBatch(items) {
        for (const [id, value] of items) {
            this.data.set(id, value);
        }
    }
    deleteBatch(ids) {
        let deleted = 0;
        for (const id of ids) {
            if (this.data.delete(id)) {
                deleted++;
            }
        }
        return deleted;
    }
    getBatch(ids) {
        const result = new Map();
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
    close() {
        // No cleanup needed for in-memory storage
        this.data.clear();
    }
    getMetadata() {
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
    keys() {
        return this.data.keys();
    }
    /**
     * Get all values in storage.
     *
     * @returns Iterator of values
     */
    values() {
        return this.data.values();
    }
    /**
     * Get all entries in storage.
     *
     * @returns Iterator of [id, value] tuples
     */
    entries() {
        return this.data.entries();
    }
    /**
     * Iterate over storage entries.
     *
     * @param callback - Function to call for each entry
     */
    forEach(callback) {
        this.data.forEach(callback);
    }
    /**
     * Make storage iterable.
     */
    [Symbol.iterator]() {
        return this.data.entries();
    }
}
//# sourceMappingURL=memory.js.map