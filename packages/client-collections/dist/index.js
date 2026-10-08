/**
 * Collections Framework - A comprehensive Java Collections-inspired library for TypeScript.
 *
 * Provides:
 * - Core collection interfaces (List, Set, Queue, Map, etc.)
 * - Rich implementations (ArrayList, LinkedList, HashSet, HashMap, PriorityQueue, etc.)
 * - Composable behaviors (bounded, readonly, safe, evented, synchronized, LRU, TTL)
 * - Functional error handling (Option, Result)
 * - Event-driven collections with typed events
 * - Async/concurrent collections (AsyncQueue, Channels with CSP patterns)
 * - Lazy functional operations (map, filter, reduce, etc.)
 * - Stream-style collectors (groupBy, counting, summarizing, etc.)
 * - Pluggable equality/hashing/comparison
 *
 * @example
 * // Composable behaviors
 * import { arrayList, compose, boundedList, eventedList } from '@common/collections'
 *
 * const list = compose(
 *   eventedList(),
 *   boundedList({ capacity: 100, policy: 'drop-oldest' })
 * )(arrayList<number>())
 *
 * list.on('add', ({ value }) => console.log('Added:', value))
 * list.add(42)
 *
 * @example
 * // Functional operations with lazy evaluation
 * import { pipe, map, filter, take, collect, toList } from '@common/collections'
 *
 * const result = pipe(
 *   [1, 2, 3, 4, 5],
 *   (it) => map(it, x => x * 2),
 *   (it) => filter(it, x => x > 5),
 *   (it) => take(it, 2),
 *   (it) => collect(it, toList())
 * )
 *
 * @example
 * // Async channels with Go-style CSP
 * import { channel, select, timeout, pipeline } from '@common/collections'
 *
 * const ch = channel<number>()
 * await ch.send(42)
 * const value = await select(
 *   ch.case(v => v),
 *   timeout(1000).case(() => null)
 * )
 */
// ============================================================================
// Core types and utilities
// ============================================================================
export * from "./core/traits.js";
export * from "./core/effects.js";
export * from "./core/policies.js";
export * from "./core/middleware.js";
export * from "./core/events.js";
// ============================================================================
// Interfaces
// ============================================================================
export * from "./interfaces/collection.js";
export * from "./interfaces/list.js";
export * from "./interfaces/map.js";
export * from "./interfaces/set.js";
// ============================================================================
// Storage
// ============================================================================
export * from "./storage/index.js";
// ============================================================================
// Implementations
// ============================================================================
export * from "./impl/array-list.js";
export * from "./impl/array-deque.js";
export * from "./impl/hash-map.js";
export * from "./impl/linked-hash-map.js";
export * from "./impl/tree-map.js";
export * from "./impl/tree-set.js";
export * from "./impl/linked-list.js";
export * from "./impl/hash-set.js";
export * from "./impl/priority-queue.js";
// ============================================================================
// Behaviors
// ============================================================================
// Export bounded behaviors (excluding duplicate BoundedCollection interface)
export { boundedList, boundedQueue, boundedDeque, boundedMap, bounded, } from "./behaviors/bounded.js";
export * from "./behaviors/readonly.js";
export * from "./behaviors/safe.js";
export * from "./behaviors/evented.js";
export * from "./behaviors/synchronized.js";
export * from "./behaviors/lru.js";
export * from "./behaviors/ttl.js";
// ============================================================================
// Async/Concurrent
// ============================================================================
export * from "./async/async-queue.js";
export * from "./async/channels.js";
// ============================================================================
// Functional Operations
// ============================================================================
export * from "./fx/iter.js";
export * from "./fx/collectors.js";
// ============================================================================
// Utilities
// ============================================================================
export * from "./utils/defaults.js";
export * from "./utils/factories.js";
export * from "./utils/helpers.js";
// ============================================================================
// Re-exports for convenience
// ============================================================================
// Most commonly used exports
export { compose, bundle } from "./core/middleware.js";
export { arrayList } from "./impl/array-list.js";
export { arrayDeque } from "./impl/array-deque.js";
export { hashMap } from "./impl/hash-map.js";
export { linkedHashMap } from "./impl/linked-hash-map.js";
export { treeMap } from "./impl/tree-map.js";
export { treeSet } from "./impl/tree-set.js";
export { linkedList } from "./impl/linked-list.js";
export { hashSet } from "./impl/hash-set.js";
export { priorityQueue } from "./impl/priority-queue.js";
// Common behaviors
export { readonly, readonlyList, readonlyMap } from "./behaviors/readonly.js";
export { safeList, safeQueue, safeMap } from "./behaviors/safe.js";
export { eventedList, eventedQueue, eventedMap } from "./behaviors/evented.js";
export { synchronized } from "./behaviors/synchronized.js";
export { lruMap, lruCache, LRUCache } from "./behaviors/lru.js";
export { ttlMap, ttlCache, TTLCache, ttlCollection } from "./behaviors/ttl.js";
// Async/Concurrent
export { asyncQueue, AsyncQueue } from "./async/async-queue.js";
export { channel, Channel, select, timeout, ticker, pipeline, fanOut, fanIn, merge, workerPool, } from "./async/channels.js";
// Functional operations
export { map, filter, flatMap, flatten, take, skip, takeWhile, skipWhile, concat, zip, enumerate, chunk, window, partition, reduce, scan, sort, reverse, distinct, distinctConsecutive, tap, some, every, none, find, count, min, max, sum, average, toArray, toSet, toMap as iterToMap, pipe, } from "./fx/iter.js";
export { collect, toList as collectToList, toArray as collectToArray, toSet as collectToSet, toMap as collectToMap, groupingBy, groupingByWith, partitioningBy, counting, summingNumber, averagingNumber, minBy, maxBy, joining, mapping, filtering, flatMapping, reducing, reducingWith, teeing, first, last, summarizingNumber, } from "./fx/collectors.js";
// Common factories
export { emptyList, emptyMap, emptyQueue, singletonList, singletonMap, nCopies, listOf, mapOf, range, rangeTo, toList, toMap, groupBy, } from "./utils/factories.js";
// Effects
export { None, Some, Ok, Err, isSome, isNone, isOk, isErr, getOrElse, unwrap, } from "./core/effects.js";
//# sourceMappingURL=index.js.map