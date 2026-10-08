# Collections Framework

A Java Collections-inspired framework with composable behaviors.

## Overview

```
                      Iterable<T>
                          │
                  ┌───────┴───────┐
                  │               │
           Collection<T>      Map<K,V>
                  │               │
          ┌───────┼───────┐       ├── HashMap
          │       │       │       ├── LinkedHashMap
       List<T> Set<T>  Queue<T>   └── TreeMap
          │       │       │
    ┌─────┴─────┐ │    ┌──┴───────┐
    │           │ │    │          │
ArrayList  LinkedList │  ArrayDeque
               │      │  PriorityQueue
            HashSet TreeSet
```

---

## Quick Start

```typescript
import {
  arrayList, linkedList,
  hashMap, linkedHashMap, treeMap,
  hashSet, treeSet,
  arrayDeque, priorityQueue,
  compose, lruMap, ttlMap, boundedList, eventedList,
} from "client/collections";

// Basic collections
const list = arrayList<number>();
list.add(1);
list.add(2);
list.add(3);

const map = hashMap<string, User>();
map.set("user1", { id: "1", name: "John" });

// Composed collections with behaviors
const cache = compose(
  lruMap({ capacity: 100 }),
  ttlMap({ ttl: 60000 })
)(hashMap<string, CachedValue>());

const eventedBoundedList = compose(
  eventedList<Event>(),
  boundedList({ capacity: 1000, policy: "drop-oldest" })
)(arrayList<Event>());
```

---

## Collection Types

### Lists

Ordered collections with indexed access.

#### ArrayList

Dynamic array with O(1) random access.

```typescript
const list = arrayList<number>();

// Add elements
list.add(1);                    // append
list.addAt(0, 0);               // insert at index
list.addAll([2, 3, 4]);         // append multiple

// Access elements
list.get(0);                    // O(1)
list.first();                   // first element
list.last();                    // last element

// Modify elements
list.set(0, 10);                // replace at index
list.remove(1);                 // remove by value
list.removeAt(0);               // remove by index

// Query
list.size;                      // number of elements
list.isEmpty;                   // is empty?
list.contains(1);               // has element?
list.indexOf(2);                // find index
list.lastIndexOf(2);            // find last index

// Iterate
for (const item of list) { ... }
list.forEach((item, index) => { ... });
list.toArray();                 // convert to array

// Transform
list.sort((a, b) => a - b);     // in-place sort
list.reverse();                 // in-place reverse
list.subList(1, 3);             // slice (new list)
```

#### LinkedList

Doubly-linked list with O(1) at ends.

```typescript
const list = linkedList<number>();

// All List operations plus:
list.addFirst(0);               // O(1)
list.addLast(10);               // O(1)
list.removeFirst();             // O(1)
list.removeLast();              // O(1)
list.peekFirst();               // O(1)
list.peekLast();                // O(1)
```

### Maps

Key-value pair collections.

#### HashMap

Hash table with custom equality/hashing.

```typescript
const map = hashMap<string, User>();

// Basic operations
map.set("key", value);          // O(1) average
map.get("key");                 // O(1) average
map.has("key");                 // O(1) average
map.delete("key");              // O(1) average

// Query
map.size;
map.isEmpty;

// Iterate
map.keys();                     // keys iterator
map.values();                   // values iterator
map.entries();                  // [key, value] iterator
map.forEach((value, key) => { ... });

// Custom equality/hashing
const customMap = hashMap<ComplexKey, Value>({
  hashCode: (key) => computeHash(key),
  equals: (a, b) => a.id === b.id,
});
```

#### LinkedHashMap

HashMap that preserves insertion order.

```typescript
const map = linkedHashMap<string, number>();
map.set("a", 1);
map.set("b", 2);
map.set("c", 3);

// Iteration in insertion order
for (const [key, value] of map.entries()) {
  console.log(key, value);  // a:1, b:2, c:3
}
```

#### TreeMap

Sorted map using BST.

```typescript
const map = treeMap<number, string>();
map.set(3, "three");
map.set(1, "one");
map.set(2, "two");

// Sorted iteration
for (const [key, value] of map.entries()) {
  console.log(key, value);  // 1:one, 2:two, 3:three
}

// Range queries
map.firstKey();                 // smallest key
map.lastKey();                  // largest key
map.ceilingKey(2);              // smallest key >= 2
map.floorKey(2);                // largest key <= 2
```

### Sets

Unique element collections.

#### HashSet

Hash-based uniqueness.

```typescript
const set = hashSet<string>();
set.add("a");
set.add("b");
set.add("a");                   // ignored (duplicate)
set.size;                       // 2

// Operations
set.has("a");                   // true
set.delete("a");
set.clear();

// Set operations (if implemented)
set.union(otherSet);
set.intersection(otherSet);
set.difference(otherSet);
```

#### TreeSet

Sorted set using BST.

```typescript
const set = treeSet<number>();
set.add(3);
set.add(1);
set.add(2);

for (const item of set) {
  console.log(item);            // 1, 2, 3
}
```

### Queues/Deques

#### ArrayDeque

Double-ended queue with O(1) at both ends.

```typescript
const deque = arrayDeque<number>();

// Front operations
deque.addFirst(1);
deque.peekFirst();
deque.removeFirst();

// Back operations
deque.addLast(2);
deque.peekLast();
deque.removeLast();

// Queue-like (FIFO)
deque.addLast(item);            // enqueue
deque.removeFirst();            // dequeue

// Stack-like (LIFO)
deque.addFirst(item);           // push
deque.removeFirst();            // pop
```

#### PriorityQueue

Min-heap with custom comparator.

```typescript
const pq = priorityQueue<Task>({
  comparator: (a, b) => a.priority - b.priority,
});

pq.add({ priority: 3, name: "low" });
pq.add({ priority: 1, name: "high" });
pq.add({ priority: 2, name: "medium" });

pq.peek();                      // { priority: 1, name: "high" }
pq.poll();                      // removes and returns highest priority
```

---

## Composable Behaviors

Behaviors are middleware that add capabilities to collections.

```
┌─────────────────────────────────────────────────────────────┐
│  compose(evented(), lru({ capacity: 100 }), bounded())     │
│                           │                                 │
│              ┌────────────┼────────────┐                   │
│              ▼            ▼            ▼                   │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│         │ Evented │──│   LRU   │──│ Bounded │── HashMap   │
│         └─────────┘  └─────────┘  └─────────┘             │
│              │            │            │                   │
│         emit events  track access  enforce cap            │
└─────────────────────────────────────────────────────────────┘
```

### Bounded

Enforce capacity limits with overflow policies.

```typescript
import { boundedList, boundedMap } from "client/collections";

const list = compose(
  boundedList({
    capacity: 100,
    policy: "drop-oldest",  // or: "drop-newest", "throw", "reject", "block"
  })
)(arrayList<Event>());

// Additional properties
list.isFull;                    // boolean
list.remainingCapacity;         // number
```

**Overflow Policies:**
- `throw`: Throw error when full
- `drop-oldest`: Remove oldest element to make room
- `drop-newest`: Reject new element (no-op)
- `reject`: Return false on add
- `block`: Wait for space (async only)

### LRU (Least Recently Used)

Eviction based on access patterns.

```typescript
import { lruMap, LRUCache } from "client/collections";

// As middleware
const cache = compose(
  lruMap({
    capacity: 100,
    onEvict: ({ key, value }) => console.log("Evicted:", key),
  })
)(hashMap<string, CachedData>());

// As standalone class
const lru = new LRUCache<string, Data>(100);
lru.set("key", data);
lru.get("key");                 // marks as recently used
```

### TTL (Time-To-Live)

Automatic expiration.

```typescript
import { ttlMap, TTLCache } from "client/collections";

// As middleware
const cache = compose(
  ttlMap({
    ttl: 60000,                 // 60 seconds
    checkInterval: 5000,        // cleanup every 5s
    onExpire: ({ key }) => console.log("Expired:", key),
  })
)(hashMap<string, Session>());

// As standalone class
const ttl = new TTLCache<string, Token>({ ttl: 3600000 });
ttl.set("token", data);
ttl.set("token2", data, 60000); // custom TTL
ttl.getTTL("token");            // remaining time
ttl.touch("token");             // refresh TTL
```

### Evented

Typed event emission on mutations.

```typescript
import { eventedList, eventedMap } from "client/collections";

const list = compose(
  eventedList<User>()
)(arrayList<User>());

// Subscribe to events
list.on("add", ({ item, index }) => console.log("Added:", item));
list.on("remove", ({ item, index }) => console.log("Removed:", item));
list.on("set", ({ item, index, previous }) => console.log("Set:", item));
list.on("clear", () => console.log("Cleared"));

// Map events
const map = compose(eventedMap<string, User>())(hashMap());
map.on("set", ({ key, value, previous }) => { ... });
map.on("delete", ({ key, value }) => { ... });
```

### Safe

Option/Result-based error handling.

```typescript
import { safeList, safeMap, Option, Result } from "client/collections";

const list = compose(safeList<number>())(arrayList());

// Returns Option instead of throwing
const item: Option<number> = list.safeGet(0);

if (item.isSome()) {
  console.log(item.value);
} else {
  console.log("Not found");
}

// Pattern matching
item.match({
  Some: (value) => console.log("Found:", value),
  None: () => console.log("Not found"),
});
```

### Readonly

Immutable views.

```typescript
import { readonly } from "client/collections";

const list = arrayList([1, 2, 3]);
const view = compose(readonly())(list);

view.get(0);                    // OK: read
view.add(4);                    // ERROR: mutating method blocked
```

### Synchronized

Thread-safe operations.

```typescript
import { synchronized } from "client/collections";

const map = compose(synchronized())(hashMap<string, Data>());

// All operations are now mutex-protected
await map.set("key", value);
await map.get("key");
```

---

## Functional Operations

### Lazy Iterables

```typescript
import { map, filter, take, reduce, pipe, toArray } from "client/collections/fx";

const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const result = pipe(
  numbers,
  (it) => filter(it, x => x % 2 === 0),  // [2, 4, 6, 8, 10]
  (it) => map(it, x => x * 2),            // [4, 8, 12, 16, 20]
  (it) => take(it, 3),                    // [4, 8, 12]
  toArray
);
// result: [4, 8, 12]
```

**Available Operations:**
- Transform: `map`, `flatMap`, `flatten`
- Filter: `filter`, `take`, `skip`, `takeWhile`, `skipWhile`, `distinct`
- Combine: `concat`, `zip`, `enumerate`
- Window: `chunk`, `window`, `partition`
- Aggregate: `reduce`, `scan`, `count`, `sum`, `min`, `max`, `average`
- Check: `some`, `every`, `none`, `find`

### Collectors

```typescript
import { collect, groupingBy, counting, joining } from "client/collections/fx";

const users = [
  { name: "Alice", dept: "Engineering" },
  { name: "Bob", dept: "Engineering" },
  { name: "Carol", dept: "Sales" },
];

// Group by department
const byDept = collect(users, groupingBy(u => u.dept));
// Map { "Engineering" => [Alice, Bob], "Sales" => [Carol] }

// Count by department
const counts = collect(users, groupingBy(u => u.dept, counting()));
// Map { "Engineering" => 2, "Sales" => 1 }

// Join names
const names = collect(users, mapping(u => u.name, joining(", ")));
// "Alice, Bob, Carol"
```

---

## Async Collections

### Channel

Go-style CSP channels.

```typescript
import { Channel, select } from "client/collections/async";

const ch = new Channel<number>(10);  // buffered channel

// Producer
ch.send(1);
ch.send(2);
ch.close();

// Consumer
for await (const item of ch) {
  console.log(item);
}

// Select (multiplexing)
const ch1 = new Channel<string>();
const ch2 = new Channel<number>();

await select(
  ch1.onReceive((msg) => console.log("String:", msg)),
  ch2.onReceive((num) => console.log("Number:", num)),
  timeout(1000, () => console.log("Timeout"))
);
```

### AsyncQueue

Backpressure-aware queue.

```typescript
import { AsyncQueue } from "client/collections/async";

const queue = new AsyncQueue<Task>(100);  // max 100 items

// Producer (blocks if full)
await queue.put(task);

// Consumer (blocks if empty)
const task = await queue.take();

// Non-blocking
const task = queue.tryTake();  // Option<Task>
const success = queue.tryPut(task);  // boolean
```

---

## Effect Types

### Option

Represents optional values.

```typescript
import { Option, Some, None, isSome, isNone } from "client/collections";

function findUser(id: string): Option<User> {
  const user = db.find(id);
  return user ? Some(user) : None();
}

const result = findUser("123");

// Check
if (isSome(result)) {
  console.log(result.value);
}

// Map
const name = result.map(u => u.name);  // Option<string>

// Default
const user = result.getOrElse(defaultUser);

// Chain
const email = findUser("123")
  .flatMap(user => user.email ? Some(user.email) : None())
  .getOrElse("no email");
```

### Result

Represents success/failure.

```typescript
import { Result, Ok, Err, isOk, isErr } from "client/collections";

function parseJson<T>(json: string): Result<T, Error> {
  try {
    return Ok(JSON.parse(json));
  } catch (e) {
    return Err(e as Error);
  }
}

const result = parseJson<User>(jsonString);

// Check
if (isOk(result)) {
  console.log(result.value);
} else {
  console.error(result.error);
}

// Map
const name = result.map(user => user.name);  // Result<string, Error>

// Chain
const validated = parseJson<User>(json)
  .flatMap(validateUser)
  .flatMap(saveUser);
```

---

## Traits

Custom equality, hashing, and comparison.

```typescript
import { Eq, Hash, Compare } from "client/collections";

// Custom equality
const eq: Eq<User> = {
  equals: (a, b) => a.id === b.id,
};

// Custom hash
const hash: Hash<User> = {
  hashCode: (user) => hashString(user.id),
};

// Custom comparison
const compare: Compare<User> = {
  compare: (a, b) => a.name.localeCompare(b.name),
};

// Use with collections
const set = hashSet<User>({ equals: eq.equals, hashCode: hash.hashCode });
const sortedSet = treeSet<User>({ comparator: compare.compare });
```
