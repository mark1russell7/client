# Collections Framework

A comprehensive, Java Collections-inspired library for TypeScript with composable behaviors, functional operations, and async/concurrent patterns.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Interfaces](#interfaces)
  - [Implementations](#implementations)
  - [Composable Behaviors](#composable-behaviors)
  - [Functional Error Handling](#functional-error-handling)
- [Implementations Guide](#implementations-guide)
- [Behaviors Guide](#behaviors-guide)
- [Async/Concurrent Collections](#asyncconcurrent-collections)
- [Functional Operations](#functional-operations)
- [Advanced Patterns](#advanced-patterns)
- [API Reference](#api-reference)

## Overview

This framework provides a rich set of collection types and behaviors inspired by Java Collections Framework, with TypeScript-native features like:

- **Type Safety**: Full TypeScript strict mode support with rich generics
- **Composable Behaviors**: Middleware-based composition for DRY, SOLID design
- **Three Surfaces**: Sync, Async, and Event-driven APIs
- **Functional Error Handling**: Option/Result types instead of exceptions
- **Zero Dependencies**: Pure TypeScript implementation

## Key Features

### 🎯 Core Collection Types

- **Lists**: ArrayList, LinkedList (random access, ordered, duplicates allowed)
- **Sets**: HashSet (unique elements, fast lookup)
- **Maps**: HashMap (key-value pairs with custom equality)
- **Queues**: ArrayDeque, PriorityQueue, AsyncQueue
- **Specialized**: Stack, CircularList, BlockingQueue

### 🧩 Composable Behaviors

- **Bounded**: Capacity limits with overflow policies (drop-oldest, drop-newest, throw, block)
- **Readonly**: Immutable views with mutation blocking
- **Safe**: Option/Result-based error handling instead of exceptions
- **Evented**: Typed event emission on mutations
- **Synchronized**: Mutex-based thread safety
- **LRU**: Least Recently Used eviction for caching
- **TTL**: Time-to-live expiration with automatic cleanup

### ⚡ Async/Concurrent

- **AsyncQueue**: Backpressure-aware async queue with blocking operations
- **Channels**: Go-style CSP channels with select, timeout, pipeline patterns
- **Worker Pools**: Concurrent job processing with configurable parallelism

### 🔄 Functional Operations

- **Lazy Transforms**: map, filter, flatMap, reduce, scan (generator-based)
- **Stream Collectors**: groupBy, counting, summarizing, joining
- **Combinators**: zip, concat, partition, distinct, chunk, window
- **Composition**: Pipe-based function composition

## Installation

```typescript
import { arrayList, compose, boundedList } from '@common/collections'
```

## Quick Start

### Basic Usage

```typescript
import { arrayList } from '@common/collections'

const list = arrayList<number>()
list.add(1)
list.add(2)
list.add(3)

console.log(list.get(0)) // 1
console.log(list.size) // 3
```

### Composable Behaviors

```typescript
import { arrayList, compose, boundedList, eventedList } from '@common/collections'

const list = compose(
  eventedList<number>(),
  boundedList<number>({ capacity: 100, policy: 'drop-oldest' })
)(arrayList<number>())

// Listen to events
list.on('add', ({ value }) => console.log('Added:', value))
list.on('remove', ({ value }) => console.log('Removed:', value))

// Add elements
list.add(42) // Logs: "Added: 42"
```

### Safe Error Handling

```typescript
import { arrayList, safeList } from '@common/collections'

const list = safeList()(arrayList<string>())

// Returns Option<T> instead of throwing
const value = list.safe.get(999) // None
if (isSome(value)) {
  console.log(value.value)
} else {
  console.log('Index out of bounds')
}
```

### Functional Operations

```typescript
import { pipe, map, filter, take, collect, toList } from '@common/collections'

const result = pipe(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  (it) => map(it, x => x * 2),
  (it) => filter(it, x => x > 10),
  (it) => take(it, 3),
  (it) => collect(it, toList())
)
// ArrayList[12, 14, 16]
```

### Async Channels

```typescript
import { channel, select, timeout } from '@common/collections'

const ch = channel<number>()

// Producer
async function producer() {
  for (let i = 0; i < 5; i++) {
    await ch.send(i)
  }
  ch.close()
}

// Consumer with timeout
async function consumer() {
  while (true) {
    const result = await select(
      ch.case(value => ({ type: 'value', value })),
      timeout(1000).case(() => ({ type: 'timeout' }))
    )

    if (result.type === 'timeout') break
    console.log('Received:', result.value)
  }
}
```

## Core Concepts

### Interfaces

The framework defines a hierarchy of interfaces mirroring Java Collections:

```
Iterable<T>
  ↓
Collection<T>
  ↓
  ├─ List<T> ────────────── Stack<T>, Vector<T>, CircularList<T>
  ├─ Set<T> ─────────────── SortedSet<T> → NavigableSet<T>
  └─ Queue<T> ───────────── Deque<T>, PriorityQueue<T>, BlockingQueue<T>

MapLike<K, V>
  ↓
  ├─ SortedMap<K, V> ────── NavigableMap<K, V>
  ├─ MultiMap<K, V>
  └─ BiMap<K, V>
```

### Implementations

| Interface | Implementation | Backing | Time Complexity | Use Case |
|-----------|---------------|---------|-----------------|----------|
| List | ArrayList | Dynamic array | O(1) random access | General purpose, random access |
| List, Deque | LinkedList | Doubly-linked nodes | O(1) at ends | Insert/remove at ends |
| Set | HashSet | HashMap | O(1) lookup | Unique elements, fast lookup |
| Map | HashMap | Hash table | O(1) average | Key-value storage |
| Queue | ArrayDeque | Ring buffer | O(1) at ends | Queue, stack, deque |
| PriorityQueue | PriorityQueue | Binary heap | O(log n) enqueue/dequeue | Priority-based retrieval |
| AsyncQueue | AsyncQueue | Array + Promises | O(1) average | Async backpressure |

### Composable Behaviors

Behaviors are middleware functions that wrap collections to add functionality:

```typescript
type Middleware<C> = (next: C) => C

const compose = <C>(...layers: Middleware<C>[]) => (base: C): C =>
  layers.reduceRight((acc, layer) => layer(acc), base)
```

Behaviors can be composed in any order:

```typescript
const myList = compose(
  eventedList(),           // Emits events
  safeList(),              // Adds .safe property
  boundedList({ capacity: 100 }), // Enforces capacity
  readonly()               // Makes immutable
)(arrayList<number>())
```

### Functional Error Handling

Instead of throwing exceptions, the framework uses Option and Result types:

```typescript
type Option<T> = Some<T> | None
type Result<T, E> = Ok<T> | Err<E>

// Option usage
const list = arrayList(1, 2, 3)
const value = list.safe.get(10) // None (out of bounds)

if (isSome(value)) {
  console.log(value.value)
}

// Result usage
const result = tryCatch(() => riskyOperation())
result.match({
  Ok: (value) => console.log('Success:', value),
  Err: (error) => console.log('Error:', error)
})
```

## Implementations Guide

### ArrayList

Dynamic array with O(1) random access and amortized O(1) append.

```typescript
import { arrayList } from '@common/collections'

const list = arrayList<number>()
list.add(1)
list.add(2)
list.push(3)        // Alias for add at end
list.unshift(0)     // Add at beginning
list.set(1, 99)     // Replace element

list.sort((a, b) => a - b)
console.log(list.toArray()) // [0, 1, 99, 3]
```

### LinkedList

Doubly-linked list with O(1) insertion/removal at both ends.

```typescript
import { linkedList } from '@common/collections'

const list = linkedList<string>()
list.addFirst('a')
list.addLast('c')
list.add(1, 'b')    // Insert at index

console.log(list.getFirst()) // 'a'
console.log(list.getLast())  // 'c'
list.removeFirst()
```

### HashSet

Set with unique elements, backed by HashMap.

```typescript
import { hashSet } from '@common/collections'

const set1 = hashSet(1, 2, 3, 4)
const set2 = hashSet(3, 4, 5, 6)

const union = set1.union(set2)           // {1, 2, 3, 4, 5, 6}
const intersection = set1.intersection(set2) // {3, 4}
const difference = set1.difference(set2)     // {1, 2}

console.log(set1.isSubsetOf(union)) // true
```

### HashMap

Hash table with custom equality and hashing functions.

```typescript
import { hashMap } from '@common/collections'

const map = hashMap<string, number>()
map.set('a', 1)
map.set('b', 2)

console.log(map.get('a')) // 1
console.log(map.has('c')) // false

// Compute if absent
const value = map.computeIfAbsent('c', key => key.length)
console.log(value) // 1 (computed from 'c'.length)
```

### PriorityQueue

Binary heap with O(log n) operations, elements retrieved by priority.

```typescript
import { priorityQueue } from '@common/collections'

// Min heap (smallest first)
const minHeap = priorityQueue<number>((a, b) => a - b)
minHeap.offer(5)
minHeap.offer(2)
minHeap.offer(8)
minHeap.offer(1)

console.log(minHeap.poll()) // 1 (smallest)
console.log(minHeap.poll()) // 2
console.log(minHeap.peek()) // 5 (doesn't remove)

// Max heap (largest first)
const maxHeap = priorityQueue<number>((a, b) => b - a)
maxHeap.offer(5)
maxHeap.offer(2)
maxHeap.offer(8)
console.log(maxHeap.poll()) // 8 (largest)
```

## Behaviors Guide

### Bounded

Enforces capacity limits with configurable overflow policies.

```typescript
import { arrayList, boundedList } from '@common/collections'

// Drop oldest when full
const cache = boundedList<number>({
  capacity: 3,
  policy: 'drop-oldest'
})(arrayList<number>())

cache.add(1)
cache.add(2)
cache.add(3)
cache.add(4) // Drops 1
console.log(cache.toArray()) // [2, 3, 4]

// Throw when full
const strict = boundedList<number>({
  capacity: 2,
  policy: 'throw'
})(arrayList<number>())

strict.add(1)
strict.add(2)
strict.add(3) // Throws: "Collection is at capacity"
```

**Policies**: `'drop-oldest'`, `'drop-newest'`, `'throw'`, `'reject'`, `'grow'`, `'block'`

### Readonly

Creates immutable views by blocking all mutations.

```typescript
import { arrayList, readonly } from '@common/collections'

const list = arrayList(1, 2, 3)
const immutable = readonly()(list)

immutable.add(4)    // Throws: "Cannot modify readonly collection"
immutable.clear()   // Throws

// But you can read
console.log(immutable.get(0)) // 1
console.log(immutable.size)   // 3
```

### Safe

Provides Option/Result-based API via `.safe` property.

```typescript
import { arrayList, safeList } from '@common/collections'

const list = safeList()(arrayList(10, 20, 30))

// Safe access returns Option
const value = list.safe.get(1)
console.log(isSome(value) ? value.value : 'Not found') // 20

const missing = list.safe.get(999)
console.log(isSome(missing)) // false

// Safe operations return Result
const result = list.safe.add(40)
console.log(isOk(result)) // true
```

### Evented

Emits typed events on mutations.

```typescript
import { arrayList, eventedList } from '@common/collections'

const list = eventedList<number>()(arrayList<number>())

// Subscribe to events
list.on('add', ({ value, index }) => {
  console.log(`Added ${value} at index ${index}`)
})

list.on('remove', ({ value, index }) => {
  console.log(`Removed ${value} from index ${index}`)
})

list.add(42)      // Logs: "Added 42 at index 0"
list.remove(42)   // Logs: "Removed 42 from index 0"
```

**Events**: `add`, `remove`, `clear`, `set`, `change`

### Synchronized

Provides thread-safe access with mutex locking.

```typescript
import { arrayList, synchronized } from '@common/collections'

const list = synchronized()(arrayList<number>())

// All operations are automatically locked
await list.add(1)
await list.add(2)

// Prevents race conditions
await Promise.all([
  list.add(3),
  list.add(4),
  list.add(5)
])
```

### LRU (Least Recently Used)

Evicts least recently accessed items when capacity is reached.

```typescript
import { lruCache } from '@common/collections'

const cache = lruCache<string, number>(3) // Capacity 3

cache.set('a', 1)
cache.set('b', 2)
cache.set('c', 3)

cache.get('a')     // Accesses 'a' (moves to front)

cache.set('d', 4)  // Evicts 'b' (least recently used)

console.log(cache.has('b')) // false (evicted)
console.log(cache.has('a')) // true
```

### TTL (Time-to-Live)

Automatically expires elements after a specified time.

```typescript
import { ttlCache } from '@common/collections'

const cache = ttlCache<string, number>(5000) // 5 second TTL

cache.set('key', 42)
console.log(cache.get('key')) // 42

// After 5+ seconds
await new Promise(resolve => setTimeout(resolve, 5100))
console.log(cache.get('key')) // undefined (expired)

// Custom TTL per item
cache.set('short', 1, 1000)  // 1 second TTL
cache.set('long', 2, 10000)  // 10 second TTL

// Get remaining TTL
console.log(cache.getTTL('short')) // ~1000ms

// Refresh TTL
cache.touch('short', 5000) // Extend to 5 seconds
```

## Async/Concurrent Collections

### AsyncQueue

Async queue with backpressure and blocking operations.

```typescript
import { asyncQueue } from '@common/collections'

const queue = asyncQueue<number>({ capacity: 5 })

// Producer - blocks when full
async function producer() {
  for (let i = 0; i < 10; i++) {
    await queue.put(i)
    console.log('Produced:', i)
  }
  queue.close()
}

// Consumer - blocks when empty
async function consumer() {
  while (!queue.isClosed || queue.size > 0) {
    const value = await queue.take()
    console.log('Consumed:', value)
  }
}

// With timeout
try {
  await queue.take(1000) // Wait max 1 second
} catch (e) {
  console.log('Timeout')
}

// Async iteration
for await (const value of queue) {
  console.log(value)
}
```

### Channels

Go-style CSP channels with rich patterns.

```typescript
import { channel, select, timeout, ticker, pipeline, fanOut, workerPool } from '@common/collections'

// Basic channel
const ch = channel<number>()
await ch.send(42)
const value = await ch.receive()

// Buffered channel
const buffered = channel<string>(10) // Buffer size 10

// Select (multiplexing)
const ch1 = channel<number>()
const ch2 = channel<string>()

const result = await select(
  ch1.case(n => n * 2),
  ch2.case(s => s.length),
  timeout(1000).case(() => -1)
)

// Ticker (periodic values)
const tick = ticker(1000) // Every 1 second
for await (const t of tick) {
  console.log('Tick at:', t)
  if (shouldStop) {
    tick.close()
    break
  }
}

// Pipeline
const input = channel<number>()
const output = pipeline(input, x => x * 2)

// Fan-out (distribute to multiple workers)
const jobs = channel<number>()
const workers = fanOut(jobs, 5) // 5 workers

// Worker pool
const results = workerPool(
  jobs,
  async (job) => processJob(job),
  { concurrency: 10 }
)
```

## Functional Operations

### Lazy Transforms

Generator-based operations for memory-efficient processing.

```typescript
import { map, filter, flatMap, take, skip, chunk, window } from '@common/collections'

// Map
const doubled = map([1, 2, 3], x => x * 2) // Generator

// Filter
const evens = filter([1, 2, 3, 4, 5], x => x % 2 === 0)

// FlatMap
const nested = [[1, 2], [3, 4], [5]]
const flat = flatMap(nested, arr => arr) // [1, 2, 3, 4, 5]

// Take/Skip
const first3 = take([1, 2, 3, 4, 5], 3) // [1, 2, 3]
const skip2 = skip([1, 2, 3, 4, 5], 2)  // [3, 4, 5]

// Chunk (partition into groups)
const chunks = chunk([1, 2, 3, 4, 5], 2) // [[1,2], [3,4], [5]]

// Window (sliding window)
const windows = window([1, 2, 3, 4], 3) // [[1,2,3], [2,3,4]]
```

### Composition with Pipe

```typescript
import { pipe, map, filter, take, reduce, toArray } from '@common/collections'

const result = pipe(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  (it) => map(it, x => x * 2),
  (it) => filter(it, x => x > 10),
  (it) => take(it, 3),
  toArray
)
// [12, 14, 16]

// Or reduce
const sum = pipe(
  [1, 2, 3, 4, 5],
  (it) => reduce(it, (acc, x) => acc + x, 0)
)
// 15
```

### Stream Collectors

Java Stream-style collectors for terminal operations.

```typescript
import { collect, groupingBy, counting, summingNumber, averagingNumber, joining } from '@common/collections'

interface User {
  name: string
  age: number
  score: number
}

const users: User[] = [
  { name: 'Alice', age: 25, score: 100 },
  { name: 'Bob', age: 30, score: 85 },
  { name: 'Charlie', age: 25, score: 90 },
]

// Group by age
const byAge = collect(users, groupingBy(u => u.age))
// Map { 25 => ArrayList[Alice, Charlie], 30 => ArrayList[Bob] }

// Count by age
const countByAge = collect(
  users,
  groupingByWith(u => u.age, counting())
)
// Map { 25 => 2, 30 => 1 }

// Average score by age
const avgScoreByAge = collect(
  users,
  groupingByWith(u => u.age, averagingNumber(u => u.score))
)
// Map { 25 => 95, 30 => 85 }

// Join names
const names = collect(users, mapping(u => u.name, joining(', ')))
// "Alice, Bob, Charlie"

// Partition by condition
const partitioned = collect(
  users,
  partitioningBy(u => u.age >= 30)
)
// Map { true => ArrayList[Bob], false => ArrayList[Alice, Charlie] }

// Summary statistics
const stats = collect(
  users,
  summarizingNumber(u => u.score)
)
// { count: 3, sum: 275, min: 85, max: 100, average: 91.67 }
```

### Advanced Collectors

```typescript
import { teeing, mapping, filtering, reducing } from '@common/collections'

// Teeing (collect with two collectors and combine)
const stats = collect(
  [1, 2, 3, 4, 5],
  teeing(
    summingNumber(n => n),
    counting(),
    (sum, count) => ({ sum, count, avg: sum / count })
  )
)
// { sum: 15, count: 5, avg: 3 }

// Mapping before collecting
const upperNames = collect(
  users,
  mapping(u => u.name.toUpperCase(), toList())
)

// Filtering before collecting
const highScorers = collect(
  users,
  filtering(u => u.score >= 90, toList())
)

// Custom reduction
const product = collect(
  [1, 2, 3, 4, 5],
  reducing(1, (acc, x) => acc * x)
)
// 120
```

## Advanced Patterns

### Chaining Behaviors

```typescript
import { arrayList, compose, boundedList, eventedList, safeList, readonly } from '@common/collections'

// Build a sophisticated collection
const sophisticatedList = compose(
  eventedList<number>(),           // Layer 4: Events
  safeList<number>(),              // Layer 3: Safe API
  boundedList<number>({            // Layer 2: Capacity
    capacity: 100,
    policy: 'drop-oldest'
  }),
  readonly<List<number>>()         // Layer 1: Immutable
)(arrayList<number>())

// This gives you:
// - Event emission on changes
// - Option-based safe access
// - Automatic capacity management
// - Immutable view
```

### Custom Comparators

```typescript
import { priorityQueue, comparing, thenComparing, reversed } from '@common/collections'

interface Task {
  priority: number
  createdAt: Date
  name: string
}

// Multi-level sorting
const comparator = thenComparing<Task>(
  comparing(t => t.priority, reversed()), // Higher priority first
  comparing(t => t.createdAt.getTime())  // Then by creation time
)

const taskQueue = priorityQueue<Task>(comparator)
taskQueue.offer({ priority: 1, createdAt: new Date(), name: 'Low' })
taskQueue.offer({ priority: 5, createdAt: new Date(), name: 'High' })
taskQueue.offer({ priority: 3, createdAt: new Date(), name: 'Med' })

console.log(taskQueue.poll().name) // "High" (priority 5)
```

### Custom Equality/Hashing

```typescript
import { hashMap, hashSet } from '@common/collections'

interface Point {
  x: number
  y: number
}

// Custom equality
const eq = (a: Point, b: Point) => a.x === b.x && a.y === b.y

// Custom hash
const hash = (p: Point) => p.x * 31 + p.y

const points = hashSet<Point>({ eq, hash })
points.add({ x: 1, y: 2 })
points.add({ x: 1, y: 2 }) // Duplicate, not added
console.log(points.size) // 1
```

### Concurrent Processing Pipeline

```typescript
import { channel, pipeline, fanOut, fanIn, workerPool } from '@common/collections'

async function processData() {
  // Input data
  const input = channel<string>()

  // Stage 1: Parse
  const parsed = pipeline(input, str => JSON.parse(str))

  // Stage 2: Fan out to multiple validators
  const validators = fanOut(parsed, 5)

  // Stage 3: Validate concurrently
  const validated = fanIn(...validators.map(ch =>
    pipeline(ch, async data => await validate(data))
  ))

  // Stage 4: Worker pool for processing
  const results = workerPool(
    validated,
    async (data) => await process(data),
    { concurrency: 10 }
  )

  // Consume results
  for await (const result of results) {
    console.log('Processed:', result)
  }
}
```

## API Reference

### Core Interfaces

#### Collection<T>
Base interface for all collections.

```typescript
interface Collection<T> extends Iterable<T> {
  readonly size: number
  readonly isEmpty: boolean
  readonly eq: Eq<T>

  add(element: T): boolean
  remove(element: T): boolean
  contains(element: T): boolean
  containsAll(other: Iterable<T>): boolean

  clear(): void
  toArray(): T[]
  forEach(action: (element: T, index: number) => void): void
}
```

#### List<T>
Ordered collection with indexed access.

```typescript
interface List<T> extends Collection<T> {
  get(index: number): T
  set(index: number, element: T): T
  indexOf(element: T): number
  lastIndexOf(element: T): number

  push(element: T): void
  pop(): T
  shift(): T
  unshift(element: T): void

  subList(fromIndex: number, toIndex: number): List<T>
  sort(compare?: Compare<T>): void
  reverse(): void
}
```

#### Set<T>
Unordered collection of unique elements.

```typescript
interface Set<T> extends Collection<T> {
  union(other: Iterable<T>): Set<T>
  intersection(other: Iterable<T>): Set<T>
  difference(other: Iterable<T>): Set<T>
  symmetricDifference(other: Iterable<T>): Set<T>

  isSubsetOf(other: Iterable<T>): boolean
  isSupersetOf(other: Iterable<T>): boolean
  isDisjointFrom(other: Iterable<T>): boolean
}
```

#### Queue<T>
FIFO collection with queue operations.

```typescript
interface Queue<T> extends Collection<T> {
  offer(element: T): boolean
  poll(): T
  pollOrUndefined(): T | undefined
  peek(): T
  peekOrUndefined(): T | undefined
}
```

#### MapLike<K, V>
Key-value mapping.

```typescript
interface MapLike<K, V> extends Iterable<[K, V]> {
  readonly size: number
  readonly isEmpty: boolean

  get(key: K): V
  set(key: K, value: V): V | undefined
  has(key: K): boolean
  delete(key: K): V | undefined
  clear(): void

  keys(): Iterable<K>
  values(): Iterable<V>
  entries(): Iterable<[K, V]>

  computeIfAbsent(key: K, mappingFunction: (key: K) => V): V
  computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V): V | undefined
  merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V): V
}
```

### Option and Result Types

```typescript
type Option<T> = Some<T> | None
type Result<T, E> = Ok<T> | Err<E>

// Constructors
const None: None
const Some: <T>(value: T) => Some<T>
const Ok: <T>(value: T) => Ok<T>
const Err: <E>(error: E) => Err<E>

// Type guards
function isSome<T>(option: Option<T>): option is Some<T>
function isNone<T>(option: Option<T>): option is None
function isOk<T, E>(result: Result<T, E>): result is Ok<T>
function isErr<T, E>(result: Result<T, E>): result is Err<E>

// Utilities
function getOrElse<T>(option: Option<T>, defaultValue: T): T
function unwrap<T>(option: Option<T>): T // Throws if None
function mapOption<T, U>(option: Option<T>, fn: (value: T) => U): Option<U>
function flatMapOption<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U>
function tryCatch<T>(fn: () => T): Result<T, Error>
```

### Middleware Composition

```typescript
type Middleware<C> = (next: C) => C

function compose<C>(...layers: Middleware<C>[]): (base: C) => C
function bundle<C>(...layers: Middleware<C>[]): Middleware<C>
```

## Performance Characteristics

| Operation | ArrayList | LinkedList | HashSet | HashMap | ArrayDeque | PriorityQueue |
|-----------|-----------|------------|---------|---------|------------|---------------|
| add/offer | O(1)* | O(1) | O(1)* | O(1)* | O(1) | O(log n) |
| remove | O(n) | O(n) | O(1)* | O(1)* | O(n) | O(log n) |
| get | O(1) | O(n) | - | O(1)* | O(1) | O(1) |
| contains | O(n) | O(n) | O(1)* | O(1)* | O(n) | O(n) |
| peek | - | O(1) | - | - | O(1) | O(1) |
| poll | - | O(1) | - | - | O(1) | O(log n) |
| addFirst | O(n) | O(1) | - | - | O(1) | - |
| addLast | O(1)* | O(1) | - | - | O(1) | - |

\* Amortized time complexity

## Best Practices

### 1. Choose the Right Collection

- **ArrayList**: Default choice for lists, random access needed
- **LinkedList**: Frequent insertion/removal at ends
- **HashSet**: Unique elements, fast lookup
- **HashMap**: Key-value pairs
- **ArrayDeque**: Queue/stack operations
- **PriorityQueue**: Priority-based retrieval

### 2. Use Behaviors Judiciously

```typescript
// Good: Compose related behaviors
const cache = compose(
  ttlMap({ ttl: 60000 }),
  lruMap({ capacity: 100 }),
  eventedMap()
)(hashMap())

// Avoid: Too many layers can impact performance
```

### 3. Leverage Lazy Evaluation

```typescript
// Good: Lazy evaluation, processes only what's needed
const result = pipe(
  hugeArray,
  (it) => map(it, expensiveTransform),
  (it) => filter(it, condition),
  (it) => take(it, 10) // Only processes 10 elements
)

// Avoid: Eager evaluation materializes entire array
const result = hugeArray
  .map(expensiveTransform)
  .filter(condition)
  .slice(0, 10)
```

### 4. Use Safe API for Boundary Conditions

```typescript
// Good: Safe API handles errors gracefully
const list = safeList()(arrayList())
const value = list.safe.get(999)
if (isSome(value)) {
  // Handle value
}

// Avoid: Exception handling overhead
try {
  const value = list.get(999)
} catch (e) {
  // Handle error
}
```

### 5. Dispose of Resources

```typescript
// TTL and LRU use background intervals
const cache = ttlCache(60000)
// ... use cache
cache.dispose() // Clean up interval

// Channels should be closed
const ch = channel()
// ... use channel
ch.close()
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- Full type safety with strict TypeScript
- Comprehensive tests
- Documentation with examples
- Follows SOLID and DRY principles

## Support

For issues and questions:
- GitHub Issues: [Link]
- Documentation: [Link]
