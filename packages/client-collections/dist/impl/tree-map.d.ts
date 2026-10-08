/**
 * TreeMap - Red-black tree based sorted map implementation.
 *
 * Implements a self-balancing binary search tree that maintains keys in sorted
 * order. Mirrors java.util.TreeMap.
 *
 * Key features:
 * - O(log n) access, insert, delete
 * - Keys maintained in sorted order (natural or custom comparator)
 * - Navigation methods (floor, ceiling, lower, higher)
 * - Range view operations (subMap, headMap, tailMap)
 *
 * @example
 * const map = treeMap<string, number>()
 * map.set('c', 3)
 * map.set('a', 1)
 * map.set('b', 2)
 * // Iteration order: a, b, c (sorted)
 *
 * @example
 * // Custom comparator for descending order
 * const map = treeMap<number, string>({
 *   compare: (a, b) => b - a
 * })
 */
import type { NavigableMap, SortedMap, Entry } from "../interfaces/map.js";
import type { Eq, Compare } from "../core/traits.js";
/**
 * Options for creating a TreeMap.
 */
export interface TreeMapOptions<K, V> {
    /**
     * Comparison function for keys.
     * @default defaultCompare
     */
    compare?: Compare<K>;
    /**
     * Equality function for keys.
     * @default defaultEq
     */
    eq?: Eq<K>;
    /**
     * Equality function for values.
     * @default defaultEq
     */
    valueEq?: Eq<V>;
}
/**
 * TreeMap<K, V> - Red-black tree based sorted map.
 *
 * Maintains keys in sorted order using a self-balancing binary search tree.
 * Provides O(log n) operations and navigation methods.
 */
export declare class TreeMap<K, V> implements NavigableMap<K, V> {
    private _root;
    private _size;
    private readonly _compare;
    private readonly _eq;
    private readonly _valueEq;
    constructor(options?: TreeMapOptions<K, V>);
    get size(): number;
    get isEmpty(): boolean;
    get comparator(): Compare<K>;
    get keyEq(): Eq<K>;
    get valueEq(): Eq<V>;
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
    putAll(other: NavigableMap<K, V> | Iterable<Entry<K, V>>): void;
    computeIfAbsent(key: K, mappingFunction: (key: K) => V): V;
    computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V | undefined): V | undefined;
    compute(key: K, remappingFunction: (key: K, value: V | undefined) => V | undefined): V | undefined;
    merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V | undefined): V | undefined;
    firstKey(): K;
    lastKey(): K;
    headMap(toKey: K): SortedMap<K, V>;
    tailMap(fromKey: K): SortedMap<K, V>;
    subMap(fromKey: K, toKey: K): SortedMap<K, V>;
    floorKey(key: K): K | undefined;
    ceilingKey(key: K): K | undefined;
    lowerKey(key: K): K | undefined;
    higherKey(key: K): K | undefined;
    floorEntry(key: K): Entry<K, V> | undefined;
    ceilingEntry(key: K): Entry<K, V> | undefined;
    lowerEntry(key: K): Entry<K, V> | undefined;
    higherEntry(key: K): Entry<K, V> | undefined;
    firstEntry(): Entry<K, V> | undefined;
    lastEntry(): Entry<K, V> | undefined;
    pollFirstEntry(): Entry<K, V> | undefined;
    pollLastEntry(): Entry<K, V> | undefined;
    descendingMap(): NavigableMap<K, V>;
    descendingKeys(): IterableIterator<K>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<Entry<K, V>>;
    [Symbol.iterator](): Iterator<Entry<K, V>>;
    forEach(action: (value: V, key: K, map: this) => void): void;
    toArray(): Entry<K, V>[];
    private createNode;
    private getNode;
    private getFirstNode;
    private getLastNode;
    private findValue;
    private inOrderTraversal;
    private reverseInOrderTraversal;
    private rotateLeft;
    private rotateRight;
    private fixAfterInsertion;
    private deleteNode;
    private fixAfterDeletion;
    toString(): string;
}
/**
 * Factory function to create a TreeMap.
 *
 * @example
 * const map = treeMap<string, number>()
 * map.set('c', 3)
 * map.set('a', 1)
 * map.set('b', 2)
 * // Iteration order: a, b, c
 *
 * @example
 * // With initial entries
 * const map = treeMap<string, number>([
 *   ['c', 3],
 *   ['a', 1],
 *   ['b', 2]
 * ])
 *
 * @example
 * // Custom comparator for descending order
 * const map = treeMap<number, string>({ compare: (a, b) => b - a })
 */
export declare function treeMap<K, V>(optionsOrEntries?: TreeMapOptions<K, V> | Iterable<[K, V]>): TreeMap<K, V>;
//# sourceMappingURL=tree-map.d.ts.map