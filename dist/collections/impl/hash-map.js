/**
 * HashMap implementation - A hash table with custom equality and hashing.
 *
 * Provides O(1) average case lookup, insertion, and deletion.
 * Supports custom equality and hash functions for keys.
 * Mirrors java.util.HashMap.
 *
 * @example
 * const map = hashMap<string, number>()
 * map.set('one', 1)
 * map.set('two', 2)
 * console.log(map.get('one')) // 1
 *
 * // Custom equality for object keys
 * const userMap = hashMap<User, Data>({
 *   keyEq: (a, b) => a.id === b.id,
 *   keyHash: (u) => hashString(u.id)
 * })
 */
import { defaultEq, defaultHash } from "../utils/defaults.js";
/**
 * HashMap<K, V> - Hash table implementation with custom equality/hashing.
 *
 * Uses separate chaining for collision resolution.
 * Automatically resizes when load factor is exceeded.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export class HashMap {
    _buckets;
    _size;
    _loadFactor;
    _keyEq;
    _keyHash;
    _valueEq;
    _threshold;
    constructor(options = {}) {
        const { initialCapacity = 16, loadFactor = 0.75, keyEq = defaultEq, keyHash = defaultHash, valueEq = defaultEq, } = options;
        const capacity = this.nextPowerOfTwo(Math.max(4, initialCapacity));
        this._buckets = new Array(capacity).fill(null);
        this._size = 0;
        this._loadFactor = loadFactor;
        this._keyEq = keyEq;
        this._keyHash = keyHash;
        this._valueEq = valueEq;
        this._threshold = Math.floor(capacity * loadFactor);
    }
    // ========================================================================
    // Size
    // ========================================================================
    get size() {
        return this._size;
    }
    get isEmpty() {
        return this._size === 0;
    }
    get keyEq() {
        return this._keyEq;
    }
    get valueEq() {
        return this._valueEq;
    }
    // ========================================================================
    // Lookup
    // ========================================================================
    has(key) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        while (node !== null) {
            if (node.hash === hash && this._keyEq(node.key, key)) {
                return true;
            }
            node = node.next;
        }
        return false;
    }
    get(key) {
        const value = this.getOrUndefined(key);
        if (value === undefined) {
            throw new Error(`Key not found: ${key}`);
        }
        return value;
    }
    getOrUndefined(key) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        while (node !== null) {
            if (node.hash === hash && this._keyEq(node.key, key)) {
                return node.value;
            }
            node = node.next;
        }
        return undefined;
    }
    getOrDefault(key, defaultValue) {
        const value = this.getOrUndefined(key);
        return value !== undefined ? value : defaultValue;
    }
    containsValue(value) {
        for (const bucket of this._buckets) {
            let node = bucket;
            while (node !== null) {
                if (this._valueEq(node.value, value)) {
                    return true;
                }
                node = node.next;
            }
        }
        return false;
    }
    // ========================================================================
    // Modification
    // ========================================================================
    set(key, value) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        // Check if key already exists
        while (node !== null) {
            if (node.hash === hash && this._keyEq(node.key, key)) {
                const oldValue = node.value;
                node.value = value;
                return oldValue;
            }
            node = node.next;
        }
        // Key doesn't exist, add new entry
        const newNode = {
            key,
            value,
            hash,
            next: this._buckets[index] ?? null,
        };
        this._buckets[index] = newNode;
        this._size++;
        // Check if resize is needed
        if (this._size > this._threshold) {
            this.resize();
        }
        return undefined;
    }
    setIfAbsent(key, value) {
        const existing = this.getOrUndefined(key);
        if (existing !== undefined) {
            return existing;
        }
        this.set(key, value);
        return value;
    }
    delete(key) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        let prev = null;
        while (node !== null) {
            if (node.hash === hash && this._keyEq(node.key, key)) {
                // Found the node to delete
                if (prev === null) {
                    // Node is at head of bucket
                    this._buckets[index] = node.next;
                }
                else {
                    // Node is in middle or end
                    prev.next = node.next;
                }
                this._size--;
                return node.value;
            }
            prev = node;
            node = node.next;
        }
        return undefined;
    }
    deleteEntry(key, value) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        let prev = null;
        while (node !== null) {
            if (node.hash === hash &&
                this._keyEq(node.key, key) &&
                this._valueEq(node.value, value)) {
                // Found the entry to delete
                if (prev === null) {
                    this._buckets[index] = node.next;
                }
                else {
                    prev.next = node.next;
                }
                this._size--;
                return true;
            }
            prev = node;
            node = node.next;
        }
        return false;
    }
    replace(key, value) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        while (node !== null) {
            if (node.hash === hash && this._keyEq(node.key, key)) {
                const oldValue = node.value;
                node.value = value;
                return oldValue;
            }
            node = node.next;
        }
        return undefined;
    }
    replaceEntry(key, oldValue, newValue) {
        const hash = this._keyHash(key);
        const index = this.bucketIndex(hash);
        let node = this._buckets[index] ?? null;
        while (node !== null) {
            if (node.hash === hash &&
                this._keyEq(node.key, key) &&
                this._valueEq(node.value, oldValue)) {
                node.value = newValue;
                return true;
            }
            node = node.next;
        }
        return false;
    }
    // ========================================================================
    // Compute operations
    // ========================================================================
    computeIfAbsent(key, mappingFunction) {
        const existing = this.getOrUndefined(key);
        if (existing !== undefined) {
            return existing;
        }
        const newValue = mappingFunction(key);
        this.set(key, newValue);
        return newValue;
    }
    computeIfPresent(key, remappingFunction) {
        const existing = this.getOrUndefined(key);
        if (existing === undefined) {
            return undefined;
        }
        const newValue = remappingFunction(key, existing);
        if (newValue === undefined) {
            this.delete(key);
            return undefined;
        }
        this.set(key, newValue);
        return newValue;
    }
    compute(key, remappingFunction) {
        const existing = this.getOrUndefined(key);
        const newValue = remappingFunction(key, existing);
        if (newValue === undefined) {
            if (existing !== undefined) {
                this.delete(key);
            }
            return undefined;
        }
        this.set(key, newValue);
        return newValue;
    }
    merge(key, value, remappingFunction) {
        const existing = this.getOrUndefined(key);
        if (existing === undefined) {
            this.set(key, value);
            return value;
        }
        const merged = remappingFunction(existing, value);
        if (merged === undefined) {
            this.delete(key);
            return undefined;
        }
        this.set(key, merged);
        return merged;
    }
    // ========================================================================
    // Bulk operations
    // ========================================================================
    putAll(other) {
        for (const entry of other) {
            this.set(entry.key, entry.value);
        }
    }
    clear() {
        this._buckets.fill(null);
        this._size = 0;
    }
    // ========================================================================
    // Views
    // ========================================================================
    *keys() {
        for (const bucket of this._buckets) {
            let node = bucket;
            while (node !== null) {
                yield node.key;
                node = node.next;
            }
        }
    }
    *values() {
        for (const bucket of this._buckets) {
            let node = bucket;
            while (node !== null) {
                yield node.value;
                node = node.next;
            }
        }
    }
    *entries() {
        for (const bucket of this._buckets) {
            let node = bucket;
            while (node !== null) {
                yield { key: node.key, value: node.value };
                node = node.next;
            }
        }
    }
    // ========================================================================
    // Iteration
    // ========================================================================
    *[Symbol.iterator]() {
        yield* this.entries();
    }
    forEach(action) {
        for (const entry of this.entries()) {
            action(entry.value, entry.key, this);
        }
    }
    // ========================================================================
    // Internal helpers
    // ========================================================================
    /**
     * Returns the bucket index for a given hash.
     */
    bucketIndex(hash) {
        // Use bitwise AND with (length - 1) for efficient modulo
        // This works because length is always a power of 2
        return hash & (this._buckets.length - 1);
    }
    /**
     * Resizes the hash table to double its current capacity.
     */
    resize() {
        const oldBuckets = this._buckets;
        const newCapacity = oldBuckets.length << 1; // Double capacity
        if (newCapacity < 0) {
            throw new Error("Map too large");
        }
        this._buckets = new Array(newCapacity).fill(null);
        this._threshold = Math.floor(newCapacity * this._loadFactor);
        // Rehash all entries
        for (const bucket of oldBuckets) {
            let node = bucket;
            while (node !== null) {
                const next = node.next;
                const index = this.bucketIndex(node.hash);
                node.next = this._buckets[index] ?? null;
                this._buckets[index] = node;
                node = next;
            }
        }
    }
    /**
     * Returns the next power of 2 >= n.
     */
    nextPowerOfTwo(n) {
        if (n <= 0)
            return 1;
        n--;
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n |= n >> 16;
        return n + 1;
    }
    // ========================================================================
    // Inspection
    // ========================================================================
    /**
     * Returns the current number of buckets.
     */
    get capacity() {
        return this._buckets.length;
    }
    /**
     * Returns the current load factor (size / capacity).
     */
    get loadFactor() {
        return this._size / this._buckets.length;
    }
    /**
     * Returns statistics about bucket distribution (for debugging).
     */
    getStats() {
        let maxChainLength = 0;
        let totalChainLength = 0;
        let emptyBuckets = 0;
        for (const bucket of this._buckets) {
            if (bucket === null) {
                emptyBuckets++;
            }
            else {
                let length = 0;
                let node = bucket;
                while (node !== null) {
                    length++;
                    node = node.next;
                }
                totalChainLength += length;
                maxChainLength = Math.max(maxChainLength, length);
            }
        }
        return {
            size: this._size,
            capacity: this._buckets.length,
            loadFactor: this.loadFactor,
            avgChainLength: this._size > 0 ? totalChainLength / (this._buckets.length - emptyBuckets) : 0,
            maxChainLength,
            emptyBuckets,
        };
    }
}
/**
 * Factory function to create a HashMap.
 *
 * @example
 * const map = hashMap<string, number>()
 * const mapWithOptions = hashMap<User, Data>({
 *   keyEq: (a, b) => a.id === b.id,
 *   keyHash: (u) => hashString(u.id)
 * })
 * const mapFromEntries = hashMap([['a', 1], ['b', 2]])
 */
export function hashMap(optionsOrEntries) {
    // Check if it's an iterable of entries
    if (optionsOrEntries && Symbol.iterator in optionsOrEntries) {
        const map = new HashMap();
        for (const [key, value] of optionsOrEntries) {
            map.set(key, value);
        }
        return map;
    }
    return new HashMap(optionsOrEntries);
}
//# sourceMappingURL=hash-map.js.map