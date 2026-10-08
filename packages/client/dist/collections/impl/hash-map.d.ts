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
import type { MapLike, Entry } from "../interfaces/map.js";
import type { Eq, Hash } from "../core/traits.js";
/**
 * Options for creating a HashMap.
 */
export interface HashMapOptions<K, V> {
    /**
     * Initial capacity (number of buckets).
     * Must be a power of 2.
     * @default 16
     */
    initialCapacity?: number;
    /**
     * Load factor threshold for resizing (0-1).
     * When size > capacity * loadFactor, the map resizes.
     * @default 0.75
     */
    loadFactor?: number;
    /**
     * Equality function for keys.
     * @default defaultEq (===)
     */
    keyEq?: Eq<K>;
    /**
     * Hash function for keys.
     * @default defaultHash
     */
    keyHash?: Hash<K>;
    /**
     * Equality function for values (used in containsValue).
     * @default defaultEq (===)
     */
    valueEq?: Eq<V>;
}
/**
 * HashMap<K, V> - Hash table implementation with custom equality/hashing.
 *
 * Uses separate chaining for collision resolution.
 * Automatically resizes when load factor is exceeded.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export declare class HashMap<K, V> implements MapLike<K, V> {
    private _buckets;
    private _size;
    private readonly _loadFactor;
    private readonly _keyEq;
    private readonly _keyHash;
    private readonly _valueEq;
    private _threshold;
    constructor(options?: HashMapOptions<K, V>);
    get size(): number;
    get isEmpty(): boolean;
    get keyEq(): Eq<K>;
    get valueEq(): Eq<V>;
    has(key: K): boolean;
    get(key: K): V;
    getOrUndefined(key: K): V | undefined;
    getOrDefault(key: K, defaultValue: V): V;
    containsValue(value: V): boolean;
    set(key: K, value: V): V | undefined;
    setIfAbsent(key: K, value: V): V;
    delete(key: K): V | undefined;
    deleteEntry(key: K, value: V): boolean;
    replace(key: K, value: V): V | undefined;
    replaceEntry(key: K, oldValue: V, newValue: V): boolean;
    computeIfAbsent(key: K, mappingFunction: (key: K) => V): V;
    computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V | undefined): V | undefined;
    compute(key: K, remappingFunction: (key: K, value: V | undefined) => V | undefined): V | undefined;
    merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V | undefined): V | undefined;
    putAll(other: MapLike<K, V> | Iterable<Entry<K, V>>): void;
    clear(): void;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<Entry<K, V>>;
    [Symbol.iterator](): Iterator<Entry<K, V>>;
    forEach(action: (value: V, key: K, map: this) => void): void;
    /**
     * Returns the bucket index for a given hash.
     */
    private bucketIndex;
    /**
     * Resizes the hash table to double its current capacity.
     */
    private resize;
    /**
     * Returns the next power of 2 >= n.
     */
    private nextPowerOfTwo;
    /**
     * Returns the current number of buckets.
     */
    get capacity(): number;
    /**
     * Returns the current load factor (size / capacity).
     */
    get loadFactor(): number;
    /**
     * Returns statistics about bucket distribution (for debugging).
     */
    getStats(): {
        size: number;
        capacity: number;
        loadFactor: number;
        avgChainLength: number;
        maxChainLength: number;
        emptyBuckets: number;
    };
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
export declare function hashMap<K, V>(optionsOrEntries?: HashMapOptions<K, V> | Iterable<readonly [K, V]>): HashMap<K, V>;
//# sourceMappingURL=hash-map.d.ts.map