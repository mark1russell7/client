/**
 * Factory utilities for creating collections.
 *
 * Provides convenient factory methods similar to Java's Collections class.
 * These mirror methods like Collections.emptyList(), singletonList(), etc.
 */
import { ArrayList } from "../impl/array-list.js";
import { ArrayDeque } from "../impl/array-deque.js";
import { HashMap } from "../impl/hash-map.js";
import type { List } from "../interfaces/list.js";
import type { Queue } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
export declare function emptyList<T>(): List<T>;
export declare function emptyQueue<T>(): Queue<T>;
export declare function emptyMap<K, V>(): MapLike<K, V>;
/**
 * Returns an immutable list containing only the specified element.
 *
 * @example
 * const list = singletonList(42)
 * list.size // 1
 * list.get(0) // 42
 * list.add(2) // Error: Cannot modify readonly collection
 */
export declare function singletonList<T>(element: T): List<T>;
/**
 * Returns an immutable map containing only the specified key-value mapping.
 */
export declare function singletonMap<K, V>(key: K, value: V): MapLike<K, V>;
/**
 * Returns an immutable list consisting of n copies of the specified element.
 *
 * @example
 * const list = nCopies(5, 'hello')
 * list.size // 5
 * list.get(2) // 'hello'
 */
export declare function nCopies<T>(n: number, element: T): List<T>;
/**
 * Creates a new ArrayList from the given elements.
 *
 * @example
 * const list = listOf(1, 2, 3, 4, 5)
 */
export declare function listOf<T>(...elements: T[]): ArrayList<T>;
/**
 * Creates a new ArrayDeque from the given elements.
 */
export declare function queueOf<T>(...elements: T[]): ArrayDeque<T>;
/**
 * Creates a new HashMap from the given key-value pairs.
 *
 * @example
 * const map = mapOf(['a', 1], ['b', 2], ['c', 3])
 */
export declare function mapOf<K, V>(...entries: [K, V][]): HashMap<K, V>;
/**
 * Creates a new mutable ArrayList with optional initial elements.
 *
 * @example
 * const list = mutableListOf(1, 2, 3)
 * list.add(4)
 */
export declare function mutableListOf<T>(...elements: T[]): ArrayList<T>;
/**
 * Creates a new mutable HashMap with optional initial entries.
 */
export declare function mutableMapOf<K, V>(...entries: [K, V][]): HashMap<K, V>;
/**
 * Creates an immutable List from the given elements.
 *
 * @example
 * const list = immutableListOf(1, 2, 3)
 * list.get(0) // 1
 * list.add(4) // Error: Cannot modify readonly collection
 */
export declare function immutableListOf<T>(...elements: T[]): List<T>;
/**
 * Creates an immutable Map from the given entries.
 */
export declare function immutableMapOf<K, V>(...entries: [K, V][]): MapLike<K, V>;
/**
 * Creates a list containing integers from start (inclusive) to end (exclusive).
 *
 * @example
 * const list = range(0, 5) // [0, 1, 2, 3, 4]
 * const list2 = range(10, 15) // [10, 11, 12, 13, 14]
 */
export declare function range(start: number, end: number, step?: number): ArrayList<number>;
/**
 * Creates a list containing integers from 0 to n (exclusive).
 *
 * @example
 * const list = rangeTo(5) // [0, 1, 2, 3, 4]
 */
export declare function rangeTo(n: number): ArrayList<number>;
/**
 * Builder for constructing lists with a fluent API.
 *
 * @example
 * const list = buildList<number>((builder) => {
 *   builder.add(1)
 *   builder.add(2)
 *   if (someCondition) {
 *     builder.add(3)
 *   }
 * })
 */
export declare function buildList<T>(builder: (list: ArrayList<T>) => void): ArrayList<T>;
/**
 * Builder for constructing maps with a fluent API.
 */
export declare function buildMap<K, V>(builder: (map: HashMap<K, V>) => void): HashMap<K, V>;
/**
 * Converts an iterable to an ArrayList.
 *
 * @example
 * const set = new Set([1, 2, 3])
 * const list = toList(set)
 */
export declare function toList<T>(iterable: Iterable<T>): ArrayList<T>;
/**
 * Converts an iterable to a HashMap using a key extractor function.
 *
 * @example
 * const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
 * const userMap = toMap(users, u => u.id)
 */
export declare function toMap<T, K>(iterable: Iterable<T>, keyExtractor: (value: T) => K): HashMap<K, T>;
export declare function toMap<T, K, V>(iterable: Iterable<T>, keyExtractor: (value: T) => K, valueExtractor: (value: T) => V): HashMap<K, V>;
/**
 * Groups elements by a key extractor function.
 *
 * @example
 * const users = [
 *   { age: 25, name: 'Alice' },
 *   { age: 30, name: 'Bob' },
 *   { age: 25, name: 'Charlie' }
 * ]
 * const byAge = groupBy(users, u => u.age)
 * // Map { 25 => [Alice, Charlie], 30 => [Bob] }
 */
export declare function groupBy<T, K>(iterable: Iterable<T>, keyExtractor: (value: T) => K): HashMap<K, ArrayList<T>>;
//# sourceMappingURL=factories.d.ts.map