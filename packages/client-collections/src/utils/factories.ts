/**
 * Factory utilities for creating collections.
 *
 * Provides convenient factory methods similar to Java's Collections class.
 * These mirror methods like Collections.emptyList(), singletonList(), etc.
 */

import { arrayList, ArrayList } from "../impl/array-list.js";
import { arrayDeque, ArrayDeque } from "../impl/array-deque.js";
import { hashMap, HashMap } from "../impl/hash-map.js";
import type { List } from "../interfaces/list.js";
import type { Queue } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { readonly } from "../behaviors/readonly.js";
import { compose } from "../core/middleware.js";

// ============================================================================
// Empty collections
// ============================================================================

/**
 * Returns an empty, immutable list.
 * Multiple calls return the same instance (singleton pattern).
 *
 * @example
 * const list = emptyList<number>()
 * list.size // 0
 * list.add(1) // Error: Cannot modify readonly collection
 */
const EMPTY_LIST_CACHE = new Map<any, any>();

export function emptyList<T>(): List<T> {
  const key = "list";
  if (!EMPTY_LIST_CACHE.has(key)) {
    const list = compose(readonly<List<T>>())(arrayList<T>());
    EMPTY_LIST_CACHE.set(key, list);
  }
  return EMPTY_LIST_CACHE.get(key);
}

/**
 * Returns an empty, immutable queue.
 */
const EMPTY_QUEUE_CACHE = new Map<any, any>();

export function emptyQueue<T>(): Queue<T> {
  const key = "queue";
  if (!EMPTY_QUEUE_CACHE.has(key)) {
    const queue = compose(readonly<Queue<T>>())(arrayDeque<T>() as Queue<T>);
    EMPTY_QUEUE_CACHE.set(key, queue);
  }
  return EMPTY_QUEUE_CACHE.get(key);
}

/**
 * Returns an empty, immutable map.
 */
const EMPTY_MAP_CACHE = new Map<any, any>();

export function emptyMap<K, V>(): MapLike<K, V> {
  const key = "map";
  if (!EMPTY_MAP_CACHE.has(key)) {
    const map = compose(readonly<MapLike<K, V>>())(hashMap<K, V>());
    EMPTY_MAP_CACHE.set(key, map);
  }
  return EMPTY_MAP_CACHE.get(key);
}

// ============================================================================
// Singleton collections (single element)
// ============================================================================

/**
 * Returns an immutable list containing only the specified element.
 *
 * @example
 * const list = singletonList(42)
 * list.size // 1
 * list.get(0) // 42
 * list.add(2) // Error: Cannot modify readonly collection
 */
export function singletonList<T>(element: T): List<T> {
  const list = arrayList<T>();
  list.add(element);
  return compose(readonly<List<T>>())(list);
}

/**
 * Returns an immutable map containing only the specified key-value mapping.
 */
export function singletonMap<K, V>(key: K, value: V): MapLike<K, V> {
  const map = hashMap<K, V>();
  map.set(key, value);
  return compose(readonly<MapLike<K, V>>())(map);
}

// ============================================================================
// N-copies collections
// ============================================================================

/**
 * Returns an immutable list consisting of n copies of the specified element.
 *
 * @example
 * const list = nCopies(5, 'hello')
 * list.size // 5
 * list.get(2) // 'hello'
 */
export function nCopies<T>(n: number, element: T): List<T> {
  if (n < 0) {
    throw new Error(`n must be non-negative, got ${n}`);
  }

  const list = arrayList<T>();
  for (let i = 0; i < n; i++) {
    list.add(element);
  }
  return compose(readonly<List<T>>())(list);
}

// ============================================================================
// Collection creation from iterables
// ============================================================================

/**
 * Creates a new ArrayList from the given elements.
 *
 * @example
 * const list = listOf(1, 2, 3, 4, 5)
 */
export function listOf<T>(...elements: T[]): ArrayList<T> {
  return arrayList(elements);
}

/**
 * Creates a new ArrayDeque from the given elements.
 */
export function queueOf<T>(...elements: T[]): ArrayDeque<T> {
  return arrayDeque(elements);
}

/**
 * Creates a new HashMap from the given key-value pairs.
 *
 * @example
 * const map = mapOf(['a', 1], ['b', 2], ['c', 3])
 */
export function mapOf<K, V>(...entries: [K, V][]): HashMap<K, V> {
  return hashMap(entries);
}

// ============================================================================
// Mutable collection factories
// ============================================================================

/**
 * Creates a new mutable ArrayList with optional initial elements.
 *
 * @example
 * const list = mutableListOf(1, 2, 3)
 * list.add(4)
 */
export function mutableListOf<T>(...elements: T[]): ArrayList<T> {
  return arrayList(elements);
}

/**
 * Creates a new mutable HashMap with optional initial entries.
 */
export function mutableMapOf<K, V>(...entries: [K, V][]): HashMap<K, V> {
  return hashMap(entries);
}

// ============================================================================
// Immutable collection factories
// ============================================================================

/**
 * Creates an immutable List from the given elements.
 *
 * @example
 * const list = immutableListOf(1, 2, 3)
 * list.get(0) // 1
 * list.add(4) // Error: Cannot modify readonly collection
 */
export function immutableListOf<T>(...elements: T[]): List<T> {
  if (elements.length === 0) {
    return emptyList<T>();
  }
  if (elements.length === 1) {
    return singletonList(elements[0]! as T);
  }
  const list = arrayList(elements);
  return compose(readonly<List<T>>())(list);
}

/**
 * Creates an immutable Map from the given entries.
 */
export function immutableMapOf<K, V>(...entries: [K, V][]): MapLike<K, V> {
  if (entries.length === 0) {
    return emptyMap<K, V>();
  }
  if (entries.length === 1) {
    return singletonMap(entries[0]![0], entries[0]![1]);
  }
  const map = hashMap(entries);
  return compose(readonly<MapLike<K, V>>())(map);
}

// ============================================================================
// Range factories
// ============================================================================

/**
 * Creates a list containing integers from start (inclusive) to end (exclusive).
 *
 * @example
 * const list = range(0, 5) // [0, 1, 2, 3, 4]
 * const list2 = range(10, 15) // [10, 11, 12, 13, 14]
 */
export function range(start: number, end: number, step: number = 1): ArrayList<number> {
  if (step === 0) {
    throw new Error("step cannot be zero");
  }

  const list = arrayList<number>();

  if (step > 0) {
    for (let i = start; i < end; i += step) {
      list.add(i);
    }
  } else {
    for (let i = start; i > end; i += step) {
      list.add(i);
    }
  }

  return list;
}

/**
 * Creates a list containing integers from 0 to n (exclusive).
 *
 * @example
 * const list = rangeTo(5) // [0, 1, 2, 3, 4]
 */
export function rangeTo(n: number): ArrayList<number> {
  return range(0, n);
}

// ============================================================================
// Collection builders
// ============================================================================

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
export function buildList<T>(builder: (list: ArrayList<T>) => void): ArrayList<T> {
  const list = arrayList<T>();
  builder(list);
  return list;
}

/**
 * Builder for constructing maps with a fluent API.
 */
export function buildMap<K, V>(builder: (map: HashMap<K, V>) => void): HashMap<K, V> {
  const map = hashMap<K, V>();
  builder(map);
  return map;
}

// ============================================================================
// Conversion utilities
// ============================================================================

/**
 * Converts an iterable to an ArrayList.
 *
 * @example
 * const set = new Set([1, 2, 3])
 * const list = toList(set)
 */
export function toList<T>(iterable: Iterable<T>): ArrayList<T> {
  return arrayList(iterable);
}

/**
 * Converts an iterable to a HashMap using a key extractor function.
 *
 * @example
 * const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
 * const userMap = toMap(users, u => u.id)
 */
export function toMap<T, K>(
  iterable: Iterable<T>,
  keyExtractor: (value: T) => K
): HashMap<K, T>;
export function toMap<T, K, V>(
  iterable: Iterable<T>,
  keyExtractor: (value: T) => K,
  valueExtractor: (value: T) => V
): HashMap<K, V>;
export function toMap<T, K, V>(
  iterable: Iterable<T>,
  keyExtractor: (value: T) => K,
  valueExtractor?: (value: T) => V
): HashMap<K, any> {
  const map = hashMap<K, any>();
  for (const item of iterable) {
    const key = keyExtractor(item);
    const value = valueExtractor ? valueExtractor(item) : item;
    map.set(key, value);
  }
  return map;
}

// ============================================================================
// Grouping utilities
// ============================================================================

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
export function groupBy<T, K>(
  iterable: Iterable<T>,
  keyExtractor: (value: T) => K
): HashMap<K, ArrayList<T>> {
  const map = hashMap<K, ArrayList<T>>();

  for (const item of iterable) {
    const key = keyExtractor(item);
    const list = map.computeIfAbsent(key, () => arrayList<T>());
    list.add(item);
  }

  return map;
}
