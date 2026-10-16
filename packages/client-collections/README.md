# @procedures/collections

[![npm](https://img.shields.io/npm/v/@procedures/collections?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/collections)

A comprehensive, transport-agnostic collections framework for TypeScript. Provides unified abstractions for data structures with pluggable storage backends, enabling seamless switching between local and remote storage.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                                  │
│                                                                              │
│   ArrayList<T>    HashMap<K,V>    TreeSet<T>    PriorityQueue<T>    ...     │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                          Behavior Decorators                                 │
│                                                                              │
│   Bounded    LRU    TTL    Evented    Synchronized    ReadOnly    Safe      │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                        CollectionStorage<T>                                  │
│                                                                              │
│   get()  set()  delete()  find()  getAll()  setBatch()  deleteBatch()  ...  │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  MemoryStorage  │   │   ApiStorage    │   │  HybridStorage  │
│                 │   │                 │   │                 │
│  In-memory Map  │   │  Remote via RPC │   │ Local + Remote  │
│  Fast, volatile │   │  Persistent     │   │ With sync       │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

## Key Design Principles

### Transport Agnosticism

All storage methods return `Promise<T>`, ensuring client code cannot distinguish between local and remote storage:

```typescript
// This code works identically whether storage is local or remote
const user = await storage.get("user-123");
await storage.set("user-456", { name: "Alice" });
const active = await storage.find(u => u.status === "active");
```

### Composable Behaviors

Behaviors can be stacked to add functionality:

```typescript
import { ArrayList, withBounded, withLRU, withEvented } from "@procedures/collections";

// Create a bounded, LRU-evicting, event-emitting list
const list = withEvented(
  withLRU(
    withBounded(new ArrayList<User>(), { maxSize: 1000 }),
    { maxAge: 3600000 }
  )
);

list.on("add", (item) => console.log("Added:", item));
list.on("evict", (item) => console.log("Evicted:", item));
```

## Installation

```bash
pnpm add @procedures/collections
```

## Core Interfaces

### CollectionStorage<T>

The foundational storage interface that all backends implement:

```typescript
interface CollectionStorage<T> {
  // Read Operations
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  find(predicate: (item: T) => boolean): Promise<T[]>;
  has(id: string): Promise<boolean>;
  size(): Promise<number>;

  // Write Operations
  set(id: string, value: T): Promise<void>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;

  // Bulk Operations
  setBatch(items: Array<[string, T]>): Promise<void>;
  deleteBatch(ids: string[]): Promise<number>;
  getBatch(ids: string[]): Promise<Map<string, T>>;

  // Lifecycle
  close(): Promise<void>;
  getMetadata?(): Promise<StorageMetadata>;
}
```

### The contract suite: `@procedures/collections/testing`

The test-only entry `@procedures/collections/testing` holds one test suite for the contract of `CollectionStorage`. A storage runs it with a factory:

```typescript
import { describe, it } from "vitest";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";

describeCollectionStorageContract(
  "MyStorage",
  {
    create: () => new MyStorage<ContractItem>(),
    createWithMaxTombstones: (max) => new MyStorage<ContractItem>({ maxTombstones: max }),
    copies: true,
  },
  { describe, it },
);
```

- The suite tests the reads, the writes and the batches, the order of the entries, the results as new arrays, the JSON values, the writes at the same time, `getChangesSince` and its versions, `flush`, `getMetadata`, `close` and the errors.
- A case for an optional method skips a storage without the method.
- A random sequence of writes runs against a `Map`, and each saved version must give the right changes.
- The suite imports no test framework. The caller gives `describe` and `it`, and a failed check throws `ContractViolation`. The runtime entries do not import this entry.
- `copies: true` declares that the storage keeps a copy of each value. `nullValues: false` declares that a stored `null` reads back as `undefined`.

| Storage | Package | Notes |
|---|---|---|
| `InMemoryStorage` | `@procedures/collections` | It keeps the values, not copies. |
| `SqliteStorage` (in memory and in a file) | `@procedures/sqlite` | It gives copies. |
| `ApiStorage` | `@procedures/store` | A stored `null` reads back as `undefined`. |
| `HybridStorage` (each mode, and a queue in IndexedDB) | `@procedures/store` | It has no `getChangesSince`. |

## Storage Backends

### MemoryStorage

Fast, in-memory storage using JavaScript Map:

```typescript
import { MemoryStorage } from "@procedures/collections";

const storage = new MemoryStorage<User>();
await storage.set("user-1", { name: "Alice", age: 30 });
const user = await storage.get("user-1");
```

### ApiStorage

Remote storage via RPC client:

```typescript
import { ApiStorage } from "@procedures/collections";
import { Client } from "@procedures/client";

const client = new Client({ transport });
const storage = new ApiStorage<User>(client, {
  collection: "users",
  endpoints: {
    get: { service: "users", operation: "get" },
    set: { service: "users", operation: "set" },
    // ... other endpoints
  }
});
```

### HybridStorage

Local cache with remote synchronization:

```typescript
import { HybridStorage, MemoryStorage, ApiStorage } from "@procedures/collections";

const hybrid = new HybridStorage<User>({
  local: new MemoryStorage<User>(),
  remote: apiStorage,
  syncStrategy: "write-through", // or "write-behind"
  conflictResolver: (local, remote) => remote.updatedAt > local.updatedAt ? remote : local
});
```

## Collection Implementations

### Lists

```typescript
import { ArrayList, LinkedList } from "@procedures/collections";

const arrayList = new ArrayList<number>();   // O(1) random access
const linkedList = new LinkedList<number>(); // O(1) insertions
```

### Maps

```typescript
import { HashMap, TreeMap, LinkedHashMap } from "@procedures/collections";

const hashMap = new HashMap<string, User>();       // O(1) access
const treeMap = new TreeMap<string, User>();       // Sorted keys
const linkedHashMap = new LinkedHashMap<string, User>(); // Insertion order
```

### Sets

```typescript
import { HashSet, TreeSet } from "@procedures/collections";

const hashSet = new HashSet<string>();  // O(1) membership
const treeSet = new TreeSet<number>();  // Sorted, O(log n)
```

### Queues

```typescript
import { PriorityQueue, ArrayDeque } from "@procedures/collections";

const pq = new PriorityQueue<Task>((a, b) => a.priority - b.priority);
const deque = new ArrayDeque<Message>(); // Double-ended queue
```

## Behavior Decorators

### Bounded Collections

```typescript
import { withBounded } from "@procedures/collections";

const bounded = withBounded(new ArrayList<Log>(), {
  maxSize: 10000,
  evictionPolicy: "oldest" // or "newest", "random"
});
```

### LRU Cache

```typescript
import { withLRU } from "@procedures/collections";

const lru = withLRU(new HashMap<string, Session>(), {
  maxSize: 1000,
  maxAge: 3600000 // 1 hour TTL
});
```

### TTL (Time-To-Live)

```typescript
import { withTTL } from "@procedures/collections";

const ttl = withTTL(new HashMap<string, Token>(), {
  defaultTTL: 300000, // 5 minutes
  checkInterval: 60000 // Check every minute
});
```

### Event Emission

```typescript
import { withEvented } from "@procedures/collections";

const evented = withEvented(new ArrayList<Order>());

evented.on("add", (item, index) => audit.log("order_added", item));
evented.on("remove", (item) => audit.log("order_removed", item));
evented.on("clear", () => audit.log("orders_cleared"));
```

### Thread Safety (Synchronized)

```typescript
import { withSynchronized } from "@procedures/collections";

const sync = withSynchronized(new HashMap<string, Counter>());
// All operations are automatically locked
```

## Async Utilities

### AsyncQueue

```typescript
import { AsyncQueue } from "@procedures/collections";

const queue = new AsyncQueue<Job>();

// Producer
await queue.enqueue({ id: 1, task: "process" });

// Consumer (blocks until item available)
const job = await queue.dequeue();
```

### Channels (Go-style)

```typescript
import { Channel } from "@procedures/collections";

const ch = new Channel<Message>(10); // Buffered channel

// Send (blocks if buffer full)
await ch.send({ type: "hello" });

// Receive (blocks if empty)
const msg = await ch.receive();

// Close channel
ch.close();
```

## Functional Utilities

### Iteration

```typescript
import { iter } from "@procedures/collections";

const result = iter([1, 2, 3, 4, 5])
  .filter(n => n % 2 === 0)
  .map(n => n * 2)
  .take(2)
  .collect();
// [4, 8]
```

### Collectors

```typescript
import { collect, toMap, groupBy, partition } from "@procedures/collections";

const users = [/* ... */];

const byId = collect(users, toMap(u => u.id));
const byRole = collect(users, groupBy(u => u.role));
const [admins, others] = collect(users, partition(u => u.isAdmin));
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Application                         │
│                                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │   Users     │  │   Orders    │  │   Products  │               │
│  │ Collection  │  │ Collection  │  │ Collection  │               │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │
│         │                │                │                       │
│         └────────────────┼────────────────┘                       │
│                          │                                        │
│                          ▼                                        │
│              ┌───────────────────────┐                            │
│              │   HybridStorage<T>    │                            │
│              │  ┌─────────────────┐  │                            │
│              │  │  MemoryStorage  │◄─┼── Fast reads               │
│              │  │    (L1 Cache)   │  │                            │
│              │  └────────┬────────┘  │                            │
│              │           │ sync      │                            │
│              │  ┌────────▼────────┐  │                            │
│              │  │   ApiStorage    │◄─┼── Persistent writes        │
│              │  │   (Remote)      │  │                            │
│              │  └─────────────────┘  │                            │
│              └───────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP/WebSocket
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Remote Server                              │
│                                                                    │
│              ┌───────────────────────┐                            │
│              │   MongoStorage<T>     │  (from client-mongo)       │
│              │                       │                            │
│              │  Implements           │                            │
│              │  CollectionStorage<T> │                            │
│              └───────────┬───────────┘                            │
│                          │                                        │
│                          ▼                                        │
│              ┌───────────────────────┐                            │
│              │       MongoDB         │                            │
│              └───────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

## Integration with MongoDB

The `client-mongo` package provides `MongoStorage<T>` implementing `CollectionStorage<T>`:

```typescript
import { MongoStorage } from "@procedures/mongo";
import { HybridStorage, MemoryStorage } from "@procedures/collections";

// MongoDB-backed storage
const mongoStorage = new MongoStorage<User>({ collection: "users" });

// Or hybrid with local cache
const hybrid = new HybridStorage<User>({
  local: new MemoryStorage<User>(),
  remote: mongoStorage
});
```

## API Reference

### StorageMetadata

```typescript
interface StorageMetadata {
  type: "memory" | "api" | "hybrid" | "synced" | "custom";
  size: number;
  stats?: {
    hitRate?: number;      // Cache hit rate
    lastSync?: number;     // Last sync timestamp
    pendingOps?: number;   // Pending sync operations
    memoryUsage?: number;  // Memory in bytes
  };
}
```

## License

MIT
