/**
 * LinkedHashMap - HashMap that maintains insertion order.
 *
 * Combines a hash table with a doubly-linked list to maintain predictable
 * iteration order. Mirrors java.util.LinkedHashMap.
 *
 * Key features:
 * - O(1) access, insert, delete (like HashMap)
 * - Predictable iteration order (insertion order or access order)
 * - Perfect for LRU caches when accessOrder is true
 *
 * @example
 * const map = linkedHashMap<string, number>()
 * map.set('a', 1)
 * map.set('b', 2)
 * map.set('c', 3)
 * // Iteration order: a, b, c (insertion order)
 *
 * @example
 * // LRU cache with access order
 * const lru = linkedHashMap<string, number>({ accessOrder: true })
 * lru.set('a', 1)
 * lru.set('b', 2)
 * lru.get('a') // Moves 'a' to end
 * // Iteration order: b, a (access order)
 */
import { defaultEq, defaultHash } from "../utils/defaults.js";
/**
 * LinkedHashMap<K, V> - Hash map with predictable iteration order.
 *
 * Maintains a doubly-linked list of entries to preserve insertion order
 * (or access order if accessOrder is true).
 */
export class LinkedHashMap {
    _buckets;
    _size = 0;
    _loadFactor;
    _eq;
    _hash;
    _valueEq;
    _accessOrder;
    // Doubly-linked list sentinels
    _head = null;
    _tail = null;
    constructor(options = {}) {
        const { initialCapacity = 16, loadFactor = 0.75, eq = defaultEq, hash = defaultHash, valueEq = defaultEq, accessOrder = false, } = options;
        this._buckets = new Array(initialCapacity).fill(null);
        this._loadFactor = loadFactor;
        this._eq = eq;
        this._hash = hash;
        this._valueEq = valueEq;
        this._accessOrder = accessOrder;
    }
    // ========================================================================
    // Size and state
    // ========================================================================
    get size() {
        return this._size;
    }
    get isEmpty() {
        return this._size === 0;
    }
    get eq() {
        return this._eq;
    }
    get keyEq() {
        return this._eq;
    }
    get valueEq() {
        return this._valueEq;
    }
    get hash() {
        return this._hash;
    }
    // ========================================================================
    // Lookup operations
    // ========================================================================
    has(key) {
        return this.getNode(key) !== null;
    }
    containsKey(key) {
        return this.has(key);
    }
    containsValue(value) {
        let node = this._head;
        while (node !== null) {
            if (this._valueEq(node.value, value)) {
                return true;
            }
            node = node.next;
        }
        return false;
    }
    get(key) {
        const node = this.getNode(key);
        if (node === null) {
            throw new Error("Key not found");
        }
        if (this._accessOrder) {
            this.moveToEnd(node);
        }
        return node.value;
    }
    getOrUndefined(key) {
        const node = this.getNode(key);
        if (node === null)
            return undefined;
        if (this._accessOrder) {
            this.moveToEnd(node);
        }
        return node.value;
    }
    getOrDefault(key, defaultValue) {
        const node = this.getNode(key);
        if (node === null)
            return defaultValue;
        if (this._accessOrder) {
            this.moveToEnd(node);
        }
        return node.value;
    }
    // ========================================================================
    // Modification operations
    // ========================================================================
    set(key, value) {
        const hashCode = this._hash(key);
        const index = this.getBucketIndex(hashCode);
        let node = this._buckets[index] ?? null;
        // Check if key already exists
        while (node !== null) {
            if (node.hash === hashCode && this._eq(node.key, key)) {
                const oldValue = node.value;
                node.value = value;
                if (this._accessOrder) {
                    this.moveToEnd(node);
                }
                return oldValue;
            }
            node = node.next;
        }
        // Key doesn't exist, add new entry
        const newNode = {
            key,
            value,
            hash: hashCode,
            prev: null,
            next: this._buckets[index] ?? null,
        };
        this._buckets[index] = newNode;
        this._size++;
        // Add to linked list
        this.addToEnd(newNode);
        // Resize if needed
        if (this._size > this._buckets.length * this._loadFactor) {
            this.resize();
        }
        return undefined;
    }
    setIfAbsent(key, value) {
        const existing = this.getNode(key);
        if (existing !== null) {
            if (this._accessOrder) {
                this.moveToEnd(existing);
            }
            return existing.value;
        }
        this.set(key, value);
        return value;
    }
    replace(key, value) {
        const node = this.getNode(key);
        if (node === null)
            return undefined;
        const oldValue = node.value;
        node.value = value;
        if (this._accessOrder) {
            this.moveToEnd(node);
        }
        return oldValue;
    }
    replaceEntry(key, oldValue, newValue) {
        const node = this.getNode(key);
        if (node === null || !this._valueEq(node.value, oldValue)) {
            return false;
        }
        node.value = newValue;
        if (this._accessOrder) {
            this.moveToEnd(node);
        }
        return true;
    }
    delete(key) {
        const node = this.getNode(key);
        if (node === null)
            return undefined;
        const oldValue = node.value;
        // Remove from bucket
        this.removeFromBucket(node);
        // Remove from linked list
        this.removeFromList(node);
        this._size--;
        return oldValue;
    }
    deleteEntry(key, value) {
        const node = this.getNode(key);
        if (node === null || !this._valueEq(node.value, value)) {
            return false;
        }
        // Remove from bucket
        this.removeFromBucket(node);
        // Remove from linked list
        this.removeFromList(node);
        this._size--;
        return true;
    }
    clear() {
        this._buckets = new Array(this._buckets.length).fill(null);
        this._size = 0;
        this._head = null;
        this._tail = null;
    }
    // ========================================================================
    // Bulk operations
    // ========================================================================
    putAll(other) {
        if ('entries' in other && typeof other.entries === 'function') {
            for (const entry of other.entries()) {
                this.set(entry.key, entry.value);
            }
        }
        else {
            for (const entry of other) {
                this.set(entry.key, entry.value);
            }
        }
    }
    // ========================================================================
    // Computed operations
    // ========================================================================
    computeIfAbsent(key, mappingFunction) {
        const existing = this.getNode(key);
        if (existing !== null) {
            if (this._accessOrder) {
                this.moveToEnd(existing);
            }
            return existing.value;
        }
        const value = mappingFunction(key);
        this.set(key, value);
        return value;
    }
    computeIfPresent(key, remappingFunction) {
        const existing = this.getNode(key);
        if (existing === null)
            return undefined;
        const newValue = remappingFunction(key, existing.value);
        if (newValue === undefined) {
            this.delete(key);
            return undefined;
        }
        existing.value = newValue;
        if (this._accessOrder) {
            this.moveToEnd(existing);
        }
        return newValue;
    }
    compute(key, remappingFunction) {
        const existing = this.getNode(key);
        const newValue = remappingFunction(key, existing?.value);
        if (newValue === undefined) {
            if (existing !== null) {
                this.delete(key);
            }
            return undefined;
        }
        this.set(key, newValue);
        return newValue;
    }
    merge(key, value, remappingFunction) {
        const existing = this.getNode(key);
        if (existing === null) {
            this.set(key, value);
            return value;
        }
        const merged = remappingFunction(existing.value, value);
        if (merged === undefined) {
            this.delete(key);
            return undefined;
        }
        existing.value = merged;
        if (this._accessOrder) {
            this.moveToEnd(existing);
        }
        return merged;
    }
    // ========================================================================
    // View operations
    // ========================================================================
    *keys() {
        let node = this._head;
        while (node !== null) {
            yield node.key;
            node = node.next;
        }
    }
    *values() {
        let node = this._head;
        while (node !== null) {
            yield node.value;
            node = node.next;
        }
    }
    *entries() {
        let node = this._head;
        while (node !== null) {
            yield { key: node.key, value: node.value };
            node = node.next;
        }
    }
    *[Symbol.iterator]() {
        yield* this.entries();
    }
    forEach(action) {
        for (const entry of this.entries()) {
            action(entry.value, entry.key, this);
        }
    }
    toArray() {
        return Array.from(this.entries());
    }
    // ========================================================================
    // Private helpers
    // ========================================================================
    getNode(key) {
        const hashCode = this._hash(key);
        const index = this.getBucketIndex(hashCode);
        let node = this._buckets[index] ?? null;
        while (node !== null) {
            if (node.hash === hashCode && this._eq(node.key, key)) {
                return node;
            }
            node = node.next;
        }
        return null;
    }
    getBucketIndex(hashCode) {
        return Math.abs(hashCode) % this._buckets.length;
    }
    removeFromBucket(node) {
        const index = this.getBucketIndex(node.hash);
        let current = this._buckets[index] ?? null;
        let prev = null;
        while (current !== null) {
            if (current === node) {
                if (prev === null) {
                    this._buckets[index] = current.next;
                }
                else {
                    prev.next = current.next;
                }
                return;
            }
            prev = current;
            current = current.next;
        }
    }
    addToEnd(node) {
        if (this._tail === null) {
            // First node
            this._head = node;
            this._tail = node;
            node.prev = null;
            node.next = null;
        }
        else {
            // Append to end
            this._tail.next = node;
            node.prev = this._tail;
            node.next = null;
            this._tail = node;
        }
    }
    removeFromList(node) {
        if (node.prev !== null) {
            node.prev.next = node.next;
        }
        else {
            this._head = node.next;
        }
        if (node.next !== null) {
            node.next.prev = node.prev;
        }
        else {
            this._tail = node.prev;
        }
    }
    moveToEnd(node) {
        if (node === this._tail)
            return; // Already at end
        // Remove from current position
        if (node.prev !== null) {
            node.prev.next = node.next;
        }
        else {
            this._head = node.next;
        }
        if (node.next !== null) {
            node.next.prev = node.prev;
        }
        // Add to end
        if (this._tail !== null) {
            this._tail.next = node;
        }
        node.prev = this._tail;
        node.next = null;
        this._tail = node;
        if (this._head === null) {
            this._head = node;
        }
    }
    resize() {
        const oldBuckets = this._buckets;
        this._buckets = new Array(oldBuckets.length * 2).fill(null);
        // Rehash all entries
        let node = this._head;
        while (node !== null) {
            const index = this.getBucketIndex(node.hash);
            node.next = this._buckets[index] ?? null;
            this._buckets[index] = node;
            node = node.next;
        }
    }
    // ========================================================================
    // Utility methods
    // ========================================================================
    toString() {
        const entries = Array.from(this.entries())
            .map(({ key, value }) => `${key}=${value}`)
            .join(', ');
        return `LinkedHashMap{${entries}}`;
    }
}
/**
 * Factory function to create a LinkedHashMap.
 *
 * @example
 * const map = linkedHashMap<string, number>()
 * map.set('a', 1)
 * map.set('b', 2)
 *
 * @example
 * // With initial entries
 * const map = linkedHashMap<string, number>([
 *   ['a', 1],
 *   ['b', 2]
 * ])
 *
 * @example
 * // LRU cache with access order
 * const lru = linkedHashMap<string, number>({ accessOrder: true })
 */
export function linkedHashMap(optionsOrEntries) {
    if (optionsOrEntries && Symbol.iterator in optionsOrEntries) {
        const map = new LinkedHashMap();
        for (const [key, value] of optionsOrEntries) {
            map.set(key, value);
        }
        return map;
    }
    return new LinkedHashMap(optionsOrEntries);
}
//# sourceMappingURL=linked-hash-map.js.map