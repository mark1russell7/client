/**
 * This module is the root of `@procedures/collections`.
 *
 * The storage, the overlay and the undo log are in this package. The lists, sets, maps, queues, behaviors and lazy
 * operations come from `@mark1russell7/collections`. Each name with a `@deprecated` tag goes away in a later MINOR.
 *
 * @example
 * import { arrayList, compose, boundedList, eventedList } from "@procedures/collections";
 *
 * const list = compose(eventedList(), boundedList({ capacity: 100, policy: "drop-oldest" }))(arrayList<number>());
 * list.on("add", ({ value }) => console.log("Added:", value));
 * list.add(42);
 */

// The storage, the overlay and the undo log stay in this package.
export * from "./storage/index.js";
export * from "./overlay/index.js";
export * from "./undo/index.js";

// The lists, sets, maps, queues, behaviors, channels and lazy operations are in the general package.
export {
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ArrayConvertible,
  ArrayDeque,
  type ArrayDequeOptions,
  ArrayList,
  type ArrayListOptions,
  type Async,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  AsyncEmitter,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type AsyncOption,
  AsyncQueue,
  type AsyncQueueOptions,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type AsyncResult,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Asyncify,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type BiMap,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type BlockingQueue,
  type Bounded,
  type BoundedCollection,
  type BoundedOptions,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `Channel` of `@mark1russell7/service/channel`. */
  Channel,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type CircularList,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Clearable,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Cloneable,
  type Collection,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  CollectionBuilder,
  type CollectionEvents,
  type Collector,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type CompactionPolicy,
  type Compare,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ComparisonProvider,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ConflictResolutionPolicy,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  DEFAULT_CONFLICT_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  DEFAULT_EVICTION_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  DEFAULT_GROWTH_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  DEFAULT_OVERFLOW_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. The retries of `@mark1russell7/service` replace it. */
  DEFAULT_RETRY_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  DEFAULT_UNDERFLOW_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  DEFAULT_VALIDATION_POLICY,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type DelayQueue,
  type Deque,
  type DequeEvents,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Disposable,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ElementOf,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ElementType,
  Emitter,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Emptiable,
  type Entry,
  type Eq,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type EqualityProvider,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `err` of `@mark1russell7/optional`. */
  Err,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  EventBatcher,
  type EventMap,
  type Evented,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type EvictionCandidate,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type EvictionMetadata,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type EvictionPolicy,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type EvictionSelector,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Freezable,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type GrowthPolicy,
  type Hash,
  HashMap,
  type HashMapOptions,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type HashProvider,
  HashSet,
  type HashSetOptions,
  type IAsyncQueue,
  type IPriorityQueue,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type IsReadonly,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  KEY_DIGITS,
  type KeyCheckOptions,
  type KeyedItem,
  LRUCache,
  type LRUOptions,
  LinkedHashMap,
  type LinkedHashMapOptions,
  LinkedList,
  type LinkedListOptions,
  type List,
  type ListEvents,
  type Listener,
  type MapEvents,
  type MapLike,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type MergeFunction,
  type Middleware,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type MultiMap,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type MutableCollectionBase,
  type NavigableMap,
  type NavigableSet,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `none` of `@mark1russell7/optional`. */
  None,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `ok` of `@mark1russell7/optional`. */
  Ok,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `Optional` of `@mark1russell7/optional`. */
  type Option,
  type OverflowContext,
  type OverflowHandler,
  type OverflowPolicy,
  type Point,
  PriorityQueue,
  type PriorityQueueOptions,
  type Queue,
  type QueueEvents,
  type RandomAccess,
  type Readonly,
  type ReadonlyCollection,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ReadonlyCollectionBase,
  type ReadonlyList,
  type ReadonlyMapLike,
  type ReadonlyOptions,
  type ReadonlyQueue,
  type ReadonlySet,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `Result` of `@mark1russell7/optional`. */
  type Result,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. The retries of `@mark1russell7/service` replace it. */
  type RetryContext,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. The retries of `@mark1russell7/service` replace it. */
  type RetryPolicy,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. The retries of `@mark1russell7/service` replace it. */
  type RetryPredicate,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type SafeCollection,
  type SafeDequeOperations,
  type SafeListOperations,
  type SafeMapOperations,
  type SafeQueueOperations,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `SelectCase` of `@mark1russell7/service/channel`. */
  type SelectCase,
  type Set,
  type Settled,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Sized,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `some` of `@mark1russell7/optional`. */
  Some,
  type SortedMap,
  type SortedSet,
  type Stack,
  type SummaryLocation,
  type SummaryMonoid,
  type SummarySearch,
  type SummarySpec,
  type SummaryStatistics,
  SummaryTree,
  TTLCache,
  type TTLOptions,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type TransferQueue,
  TreeMap,
  type TreeMapOptions,
  TreeSet,
  type TreeSetOptions,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type UnderflowContext,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type UnderflowHandler,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type UnderflowPolicy,
  type Unsubscribe,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ValidationContext,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ValidationHandler,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type ValidationPolicy,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type Vector,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type WeakMapLike,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  type WithCapability,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  arrayContains,
  arrayDeque,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  arrayIterator,
  arrayList,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  arrayRemove,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  arrayRemoveAll,
  asSettled,
  asyncQueue,
  average,
  averagingNumber,
  blockMethods,
  booleanCompare,
  bounded,
  boundedDeque,
  boundedList,
  boundedMap,
  boundedQueue,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `buffered` of `@mark1russell7/service/channel`. */
  buffered,
  buildList,
  buildMap,
  bundle,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `channel` of `@mark1russell7/service/channel`. */
  channel,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  checkBounds,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  checkInsertBounds,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  checkRangeBounds,
  chunk,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  clamp,
  collect,
  collectToArray,
  collectToList,
  collectToMap,
  collectToSet,
  combineHashes,
  compareKeys,
  comparing,
  comparingKey,
  compose,
  concat,
  count,
  counting,
  createEmitter,
  dateCompare,
  deepEq,
  defaultCompare,
  defaultEq,
  defaultHash,
  delegate,
  distinct,
  distinctConsecutive,
  dropIndex,
  emptyList,
  emptyMap,
  emptyQueue,
  enhanceMethod,
  enumerate,
  eqBy,
  evented,
  eventedDeque,
  eventedList,
  eventedMap,
  eventedQueue,
  every,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `fanIn` of `@mark1russell7/service/channel`. */
  fanIn,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `fanOut` of `@mark1russell7/service/channel`. */
  fanOut,
  filter,
  filtering,
  find,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  findIndex,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  findLastIndex,
  first,
  flatMap,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `flatMap` of `@mark1russell7/optional`. */
  flatMapOption,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `flatMapResult` of `@mark1russell7/optional`. */
  flatMapResult,
  flatMapping,
  flatten,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  forwardEvent,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `fromNullable` of `@mark1russell7/optional`. */
  fromNullable,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `getOr` of `@mark1russell7/optional`. */
  getOrElse,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `getOkOr` of `@mark1russell7/optional`. */
  getOrElseResult,
  groupBy,
  groupingBy,
  groupingByWith,
  hasCapability,
  hashBy,
  hashMap,
  hashNumber,
  hashSet,
  hashString,
  immutableListOf,
  immutableMapOf,
  interceptMethods,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `isErr` of `@mark1russell7/optional`. */
  isErr,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `isNone` of `@mark1russell7/optional`. */
  isNone,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `isOk` of `@mark1russell7/optional`. */
  isOk,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `isSome` of `@mark1russell7/optional`. */
  isSome,
  isValidKey,
  iterToMap,
  joining,
  keyBetween,
  keysBetween,
  keysForDrop,
  last,
  linkedHashMap,
  linkedList,
  listOf,
  lruCache,
  lruMap,
  map,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  mapAsyncOption,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  mapAsyncResult,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `mapErr` of `@mark1russell7/optional`. */
  mapError,
  mapOf,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `map` of `@mark1russell7/optional`. */
  mapOption,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `mapResult` of `@mark1russell7/optional`. */
  mapResult,
  mapping,
  max,
  maxBy,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `merge` of `@mark1russell7/service/channel`. */
  merge,
  min,
  minBy,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `listOf`. */
  mutableListOf,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `mapOf`. */
  mutableMapOf,
  nCopies,
  none,
  nullsFirst,
  nullsLast,
  numberCompare,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  onWhen,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `fromOptional` of `@mark1russell7/optional`. */
  optionToResult,
  partition,
  partitioningBy,
  pipe,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `pipeline` of `@mark1russell7/service/channel`. */
  pipeline,
  priorityQueue,
  queueOf,
  range,
  rangeTo,
  readWriteLock,
  readonly,
  readonlyCollection,
  readonlyList,
  readonlyMap,
  readonlyQueue,
  reduce,
  reducing,
  reducingWith,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `synchronized`, and do not nest locked uses. */
  reentrantSynchronized,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  requireNonEmpty,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  requireNonNull,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `toOptional` of `@mark1russell7/optional`. */
  resultToOption,
  reverse,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  reverseArrayIterator,
  reversed,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `safeList`, `safeQueue`, `safeDeque` or `safeMap`. */
  safe,
  safeDeque,
  safeList,
  safeMap,
  safeQueue,
  scan,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `select` of `@mark1russell7/service/channel`. */
  select,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  sequence,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  sequenceResults,
  shallowEq,
  singletonList,
  singletonMap,
  skip,
  skipWhile,
  some,
  sort,
  stringCompare,
  stringCompareIgnoreCase,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  stringHashCode,
  sum,
  summarizingNumber,
  summaryTree,
  summingNumber,
  synchronized,
  synchronizedCollection,
  synchronizedList,
  synchronizedMap,
  synchronizedSet,
  take,
  takeWhile,
  tap,
  teeing,
  thenComparing,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `ticker` of `@mark1russell7/service/channel`. */
  ticker,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `timeout` of `@mark1russell7/service/channel`. */
  timeout,
  toArray,
  toList,
  toMap,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `unwrap` of `@mark1russell7/optional`. */
  toNullable,
  toSet,
  treeMap,
  treeSet,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `tryCatch` of `@mark1russell7/optional`. */
  tryCatch,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name. Use `tryCatchAsync` of `@mark1russell7/optional`. */
  tryCatchAsync,
  ttlCache,
  ttlCollection,
  ttlMap,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `unbuffered` of `@mark1russell7/service/channel`. */
  unbuffered,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `readonlyCollection`. */
  unmodifiableCollection,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `readonlyList`. */
  unmodifiableList,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `readonlyMap`. */
  unmodifiableMap,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  unwrap,
  /** @deprecated Version 0.7.0 of `@mark1russell7/collections` removes this name, with no replacement. */
  unwrapResult,
  window,
  /** @deprecated Version 0.10.0 of `@mark1russell7/collections` removes this name. Use `workerPool` of `@mark1russell7/service/channel`. */
  workerPool,
  zip,
} from "@mark1russell7/collections";
