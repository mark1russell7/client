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
import type { MapLike, Entry } from "../interfaces/map.js";
import type { Eq, Hash } from "../core/traits.js";
/**
 * Options for creating a LinkedHashMap.
 */
export interface LinkedHashMapOptions<K, V> {
    /**
     * Initial capacity of the hash table.
     * @default 16
     */
    initialCapacity?: number;
    /**
     * Load factor before resizing.
     * @default 0.75
     */
    loadFactor?: number;
    /**
     * Equality function for keys.
     * @default defaultEq
     */
    eq?: Eq<K>;
    /**
     * Hash function for keys.
     * @default defaultHash
     */
    hash?: Hash<K>;
    /**
     * Equality function for values.
     * @default defaultEq
     */
    valueEq?: Eq<V>;
    /**
     * If true, maintain access order instead of insertion order.
     * Useful for LRU caches.
     * @default false
     */
    accessOrder?: boolean;
}
/**
 * LinkedHashMap<K, V> - Hash map with predictable iteration order.
 *
 * Maintains a doubly-linked list of entries to preserve insertion order
 * (or access order if accessOrder is true).
 */
export declare class LinkedHashMap<K, V> implements MapLike<K, V> {
    private _buckets;
    private _size;
    private readonly _loadFactor;
    private readonly _eq;
    private readonly _hash;
    private readonly _valueEq;
    private readonly _accessOrder;
    private _head;
    private _tail;
    constructor(options?: LinkedHashMapOptions<K, V>);
    get size(): number;
    get isEmpty(): boolean;
    get eq(): Eq<K>;
    get keyEq(): Eq<K>;
    get valueEq(): Eq<V>;
    get hash(): Hash<K>;
    has(key: K): boolean;
    containsKey(key: K): boolean;
    containsValue(value: V): boolean;
    get(key: K): V;
    getOrUndefined(key: K): V | undefined;
    getOrDefault(key: K, defaultValue: V): V;
    set(key: K, value: V): V | undefined;
    setIfAbsent(key: K, value: V): V;
    replace(key: K, value: V): V | undefined;
    replaceEntry(key: K, oldValue: V, newValue: V): boolean;
    delete(key: K): V | undefined;
    deleteEntry(key: K, value: V): boolean;
    clear(): void;
    putAll(other: MapLike<K, V> | Iterable<Entry<K, V>>): void;
    computeIfAbsent(key: K, mappingFunction: (key: K) => V): V;
    computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V | undefined): V | undefined;
    compute(key: K, remappingFunction: (key: K, value: V | undefined) => V | undefined): V | undefined;
    merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V | undefined): V | undefined;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<Entry<K, V>>;
    [Symbol.iterator](): Iterator<Entry<K, V>>;
    forEach(action: (value: V, key: K, map: this) => void): void;
    toArray(): Entry<K, V>[];
    private getNode;
    private getBucketIndex;
    private removeFromBucket;
    private addToEnd;
    private removeFromList;
    private moveToEnd;
    private resize;
    toString(): string;
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
export declare function linkedHashMap<K, V>(optionsOrEntries?: LinkedHashMapOptions<K, V> | Iterable<[K, V]>): LinkedHashMap<K, V>;
//# sourceMappingURL=linked-hash-map.d.ts.map