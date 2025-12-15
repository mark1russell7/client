/**
 * Factory utilities for creating collections.
 *
 * Provides convenient factory methods similar to Java's Collections class.
 * These mirror methods like Collections.emptyList(), singletonList(), etc.
 */
import { arrayList, ArrayList } from "../impl/array-list.js";
import { arrayDeque, ArrayDeque } from "../impl/array-deque.js";
import { hashMap, HashMap } from "../impl/hash-map.js";
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
const EMPTY_LIST_CACHE = new Map();
export function emptyList() {
    const key = "list";
    if (!EMPTY_LIST_CACHE.has(key)) {
        const list = compose(readonly())(arrayList());
        EMPTY_LIST_CACHE.set(key, list);
    }
    return EMPTY_LIST_CACHE.get(key);
}
/**
 * Returns an empty, immutable queue.
 */
const EMPTY_QUEUE_CACHE = new Map();
export function emptyQueue() {
    const key = "queue";
    if (!EMPTY_QUEUE_CACHE.has(key)) {
        const queue = compose(readonly())(arrayDeque());
        EMPTY_QUEUE_CACHE.set(key, queue);
    }
    return EMPTY_QUEUE_CACHE.get(key);
}
/**
 * Returns an empty, immutable map.
 */
const EMPTY_MAP_CACHE = new Map();
export function emptyMap() {
    const key = "map";
    if (!EMPTY_MAP_CACHE.has(key)) {
        const map = compose(readonly())(hashMap());
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
export function singletonList(element) {
    const list = arrayList();
    list.add(element);
    return compose(readonly())(list);
}
/**
 * Returns an immutable map containing only the specified key-value mapping.
 */
export function singletonMap(key, value) {
    const map = hashMap();
    map.set(key, value);
    return compose(readonly())(map);
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
export function nCopies(n, element) {
    if (n < 0) {
        throw new Error(`n must be non-negative, got ${n}`);
    }
    const list = arrayList();
    for (let i = 0; i < n; i++) {
        list.add(element);
    }
    return compose(readonly())(list);
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
export function listOf(...elements) {
    return arrayList(elements);
}
/**
 * Creates a new ArrayDeque from the given elements.
 */
export function queueOf(...elements) {
    return arrayDeque(elements);
}
/**
 * Creates a new HashMap from the given key-value pairs.
 *
 * @example
 * const map = mapOf(['a', 1], ['b', 2], ['c', 3])
 */
export function mapOf(...entries) {
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
export function mutableListOf(...elements) {
    return arrayList(elements);
}
/**
 * Creates a new mutable HashMap with optional initial entries.
 */
export function mutableMapOf(...entries) {
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
export function immutableListOf(...elements) {
    if (elements.length === 0) {
        return emptyList();
    }
    if (elements.length === 1) {
        return singletonList(elements[0]);
    }
    const list = arrayList(elements);
    return compose(readonly())(list);
}
/**
 * Creates an immutable Map from the given entries.
 */
export function immutableMapOf(...entries) {
    if (entries.length === 0) {
        return emptyMap();
    }
    if (entries.length === 1) {
        return singletonMap(entries[0][0], entries[0][1]);
    }
    const map = hashMap(entries);
    return compose(readonly())(map);
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
export function range(start, end, step = 1) {
    if (step === 0) {
        throw new Error("step cannot be zero");
    }
    const list = arrayList();
    if (step > 0) {
        for (let i = start; i < end; i += step) {
            list.add(i);
        }
    }
    else {
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
export function rangeTo(n) {
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
export function buildList(builder) {
    const list = arrayList();
    builder(list);
    return list;
}
/**
 * Builder for constructing maps with a fluent API.
 */
export function buildMap(builder) {
    const map = hashMap();
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
export function toList(iterable) {
    return arrayList(iterable);
}
export function toMap(iterable, keyExtractor, valueExtractor) {
    const map = hashMap();
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
export function groupBy(iterable, keyExtractor) {
    const map = hashMap();
    for (const item of iterable) {
        const key = keyExtractor(item);
        const list = map.computeIfAbsent(key, () => arrayList());
        list.add(item);
    }
    return map;
}
//# sourceMappingURL=factories.js.map