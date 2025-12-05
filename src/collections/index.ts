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

export * from "./core/traits";
export * from "./core/effects";
export * from "./core/policies";
export * from "./core/middleware";
export * from "./core/events";

// ============================================================================
// Interfaces
// ============================================================================

export * from "./interfaces/collection";
export * from "./interfaces/list";
export * from "./interfaces/map";
export * from "./interfaces/set";

// Export queue interfaces with disambiguation for PriorityQueue
export type {
  ReadonlyQueue,
  Queue,
  Deque,
  BlockingQueue,
  PriorityQueue as IPriorityQueue,
  AsyncQueue as IAsyncQueue,
  TransferQueue,
  DelayQueue,
} from "./interfaces/queue";

// ============================================================================
// Implementations
// ============================================================================

export * from "./impl/array-list";
export * from "./impl/array-deque";
export * from "./impl/hash-map";
export * from "./impl/linked-hash-map";
export * from "./impl/tree-map";
export * from "./impl/tree-set";
export * from "./impl/linked-list";
export * from "./impl/hash-set";
export * from "./impl/priority-queue";

// ============================================================================
// Behaviors
// ============================================================================

// Export bounded behaviors (excluding duplicate BoundedCollection interface)
export {
  type BoundedOptions,
  boundedList,
  boundedQueue,
  boundedDeque,
  boundedMap,
  bounded,
} from "./behaviors/bounded";

export * from "./behaviors/readonly";
export * from "./behaviors/safe";
export * from "./behaviors/evented";
export * from "./behaviors/synchronized";
export * from "./behaviors/lru";
export * from "./behaviors/ttl";

// ============================================================================
// Async/Concurrent
// ============================================================================

export * from "./async/async-queue";
export * from "./async/channels";

// ============================================================================
// Functional Operations
// ============================================================================

export * from "./fx/iter";
export * from "./fx/collectors";

// ============================================================================
// Utilities
// ============================================================================

export * from "./utils/defaults";
export * from "./utils/factories";
export * from "./utils/helpers";

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Most commonly used exports
export { compose, bundle } from "./core/middleware";
export { arrayList } from "./impl/array-list";
export { arrayDeque } from "./impl/array-deque";
export { hashMap } from "./impl/hash-map";
export { linkedHashMap } from "./impl/linked-hash-map";
export { treeMap } from "./impl/tree-map";
export { treeSet } from "./impl/tree-set";
export { linkedList } from "./impl/linked-list";
export { hashSet } from "./impl/hash-set";
export { priorityQueue } from "./impl/priority-queue";

// Common behaviors
export { readonly, readonlyList, readonlyMap } from "./behaviors/readonly";
export { safeList, safeQueue, safeMap } from "./behaviors/safe";
export { eventedList, eventedQueue, eventedMap } from "./behaviors/evented";
export { synchronized } from "./behaviors/synchronized";
export { lruMap, lruCache, LRUCache } from "./behaviors/lru";
export { ttlMap, ttlCache, TTLCache, ttlCollection } from "./behaviors/ttl";

// Async/Concurrent
export { asyncQueue, AsyncQueue } from "./async/async-queue";
export {
  channel,
  Channel,
  select,
  timeout,
  ticker,
  pipeline,
  fanOut,
  fanIn,
  merge,
  workerPool,
} from "./async/channels";

// Functional operations
export {
  map,
  filter,
  flatMap,
  flatten,
  take,
  skip,
  takeWhile,
  skipWhile,
  concat,
  zip,
  enumerate,
  chunk,
  window,
  partition,
  reduce,
  scan,
  sort,
  reverse,
  distinct,
  distinctConsecutive,
  tap,
  some,
  every,
  none,
  find,
  count,
  min,
  max,
  sum,
  average,
  toArray,
  toSet,
  toMap as iterToMap,
  pipe,
} from "./fx/iter";

export {
  collect,
  toList as collectToList,
  toArray as collectToArray,
  toSet as collectToSet,
  toMap as collectToMap,
  groupingBy,
  groupingByWith,
  partitioningBy,
  counting,
  summingNumber,
  averagingNumber,
  minBy,
  maxBy,
  joining,
  mapping,
  filtering,
  flatMapping,
  reducing,
  reducingWith,
  teeing,
  first,
  last,
  summarizingNumber,
} from "./fx/collectors";

// Common factories
export {
  emptyList,
  emptyMap,
  emptyQueue,
  singletonList,
  singletonMap,
  nCopies,
  listOf,
  mapOf,
  range,
  rangeTo,
  toList,
  toMap,
  groupBy,
} from "./utils/factories";

// Effects
export {
  None,
  Some,
  type Option,
  Ok,
  Err,
  type Result,
  isSome,
  isNone,
  isOk,
  isErr,
  getOrElse,
  unwrap,
} from "./core/effects";
