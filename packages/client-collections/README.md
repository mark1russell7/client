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
  getEntries?(): Promise<Array<[string, T]>>;
  getIds?(): Promise<string[]>;
  getChangesSince?(since?: string): Promise<StorageChanges<T>>;
  find(predicate: (item: T) => boolean): Promise<T[]>;
  query?(selector: StorageSelector, options?: StorageQueryOptions): Promise<Array<[string, T]>>;
  observe?(observer: StorageObserver<T>): () => void;
  has(id: string): Promise<boolean>;
  size(): Promise<number>;

  // Write Operations (the options give the origin of the write to the observers, and the
  // expected version of the current item: refer to "The precondition of a write")
  set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void>;
  delete(id: string, options?: StorageItemWriteOptions): Promise<boolean>;
  clear(options?: StorageWriteOptions): Promise<void>;
  patch?(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined>;

  // Bulk Operations
  setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void>;
  deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number>;
  getBatch(ids: string[]): Promise<Map<string, T>>;

  // Lifecycle
  close(): Promise<void>;
  getMetadata?(): Promise<StorageMetadata>;
}
```

Each storage agrees on these points:

- A storage keeps a copy of each value that a write takes, and each read gives a new copy. A change of a written or a read value does not change the stored item.
- A stored `null` reads back as `null`. A missing id reads back as `undefined`.
- The entries keep the order of the first set of each id, as a `Map` does.
- A delta of `getChangesSince` follows the order of the last change of each id. A full result follows the order of the entries.
- `getIds()` gives the ids in the order of the entries, and it does not read or copy the values. A storage that cannot give the ids cheaply does not have it. `HybridStorage` uses it for a full sync.
- After `close()`, each operation rejects with an error whose message says "closed". A second `close()` does nothing.
- `query()` gives the result of `queryEntries()` for the entries of the storage. Refer to "The query language".
- `observe()` gives one batch of changes for each write that changes the storage, before the write resolves. Each change has the `origin` of its write.
- `patch()` merges fields into one item in one step, as a JSON Merge Patch (RFC 7386). Two patches of one item at the same time keep each field.
- A write with an expected version tests the version of the current item and writes in one step. A storage that cannot test it rejects the write. Refer to "The precondition of a write".
- The optional methods are features. A caller tests for each one before it uses it.

### The precondition of a write

`set`, `delete` and `setBatch` take an expected version of the current item (roadmap CLI-16, decision D11). It is optimistic concurrency: two writers cannot write over the changes of each other without a notice.

```typescript
const notes = new InMemoryStorage<Note>({ versionOf: (note) => note.rev });

await notes.set("n1", { text: "a", rev: "1" }, { expectedVersion: null }); // only when "n1" has no item
await notes.set("n1", { text: "b", rev: "2" }, { expectedVersion: "1" }); // only when "n1" has the version "1"
await notes.setBatch([["n1", { text: "c", rev: "3" }]], { expectedVersions: [["n1", "2"]] });
await notes.delete("n1", { expectedVersion: "3" });
```

- The version of an item is the value of the function `versionOf` of the storage, for example a revision field. `HybridStorage` reads the same versions with its own `versionOf`.
- `null` expects no item.
- When the current item has another version, the write changes nothing. It rejects with `VersionConflictError`, whose `conflicts` have the current item and its version for each id.
- A `setBatch` with one conflict changes no item. An id without an expected version has no precondition.
- The test and the write are one step. Two writes with the same expected version at the same time: one writes, and the other gets the conflict.
- A storage without `versionOf` cannot test a precondition. It rejects such a write with a `TypeError` whose code is `PRECONDITION_NOT_SUPPORTED`, and it changes nothing. A storage never ignores a precondition.
- A write without an expected version writes as before: the last write wins.
- On the wire, the conflict is the error code `VERSION_CONFLICT` (HTTP 409). The metadata key `conflicts` has the current items. `ApiStorage` gives it back as a `VersionConflictError`.

| Storage | How it tests the precondition |
|---|---|
| `InMemoryStorage` | The test and the write are one synchronous step. |
| `SqliteStorage` | The test and the write are one transaction, also for two processes on one file. |
| `MongoDocumentStorage` | On a replica set, the test reads in the transaction of the write. On a single server, the write has the `_seq` of the test in its filter. A batch of more than one item is all or nothing only in a transaction. |
| `MongoStorage` | It cannot test it: its documents have no version. It rejects a write with an expected version. |
| `ApiStorage` | The server tests it: the collection procedures give the expected version to the storage of the server. |
| `HybridStorage` | The local copy tests it. In `write-through` mode, the remote tests it too. In `remote-only` mode, only the remote tests it. |

### The query language

A selector is JSON: a subset of the query selectors of MongoDB. The same selector goes to `query()` of a storage and to the procedure `collections.<name>.find` of `@procedures/client`.

The language is a part of the wire contract of the core, so its one copy is in `@procedures/client/query`, an entry that imports nothing else. This package depends on `@procedures/client` for it, and it exports the same names again.

```typescript
const storage = new InMemoryStorage<Task>();
const open = await storage.query(
  { done: false, "owner.team": "core", tags: { $in: ["bug", "urgent"] }, $or: [{ due: { $lt: "2026-11-01" } }, { due: null }] },
  { sort: { due: 1, title: 1 }, skip: 0, limit: 20 },
);
// open: [id, task] pairs, with copies of the tasks
```

- A key is a field path. A number in a path is an index of an array. A path through an array of objects looks into each object.
- A literal is a test for equality. An array field also matches an equal element. `null` also matches a missing field.
- The operators are `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`, `$not`, `$regex` with `$options`, `$size`, `$all`, `$elemMatch`, `$and`, `$or` and `$nor`.
- An operator that is not in the list is an error. `selectorProblems()` and `queryOptionsProblems()` give the problems, and `query()` rejects with a `TypeError`.
- The comparisons compare only values of one type. The order of a sort is `null`, numbers, strings, objects, arrays, then booleans.
- `queryEntries(entries, selector, options, policy)` is the reference. A storage that runs a selector itself, for example a database, gives the same result.
- `compileSelector(selector, policy)` gives a test for many items.

#### The query policy

A query policy limits the queries of a caller. The default policy does not permit `$regex`: a pattern runs in the process, and some patterns take an exponential time.

| Limit | Default | What a larger query gets |
|---|---|---|
| `operators` | `DEFAULT_QUERY_OPERATORS`: each operator except `$regex` | A `TypeError`, or `VALIDATION_ERROR` from `find` |
| `maxRegexLength` | 128 characters | The same |
| `regexFlags` | `"imsu"` | The same |
| `maxClauses` | 64: each condition of a field, each operator, each `$and`, `$or` and `$nor` | The same |
| `maxDepth` | 6: each `$and`, `$or`, `$nor`, `$not` and `$elemMatch` adds a level | The same |
| `maxListLength` | 256 values of `$in`, `$nin` and `$all` | The same |
| `maxLimit` | No limit for a storage. 1000 (`DEFAULT_FIND_LIMIT`) for the procedure `find`. | A larger `limit` is an error. A query without a limit gets `maxLimit`. |

```typescript
import { QUERY_OPERATORS } from "@procedures/collections";

// A storage of trusted data turns $regex on
const notes = new InMemoryStorage<Note>({ queryPolicy: { operators: QUERY_OPERATORS, maxRegexLength: 64 } });
await notes.query({ title: { $regex: "^draft", $options: "i" } });
```

- The option `queryPolicy` of a storage applies to each call without a policy. The third argument of `query()` gives the policy of one call.
- The procedure `find` gives the policy of its host to `query()` of the storage, so the host sets the policy in one place.
- A pattern that repeats a group that repeats without a bound, for example `(a+)+`, is always an error.
- A repeated group with a repetition of variable length, for example `(a{2,3})+`, is also an error.
- A repeated group with alternatives that can start with the same character, for example `(a|aa)+`, is also an error.
- A group with a bounded repetition and few ways to match passes, for example `(\d{1,3}\.){3}`.

#### The two forms of a patch

`patch(id, fields)` takes one of two forms. A patch whose keys each start with `$` is the operations form. A patch that mixes the two forms is an error.

| Form | Example | What it does |
|---|---|---|
| JSON Merge Patch (RFC 7386) | `{ title: "New", meta: { score: 2 }, draft: null }` | Each field replaces the field of the item. An object merges into an object field. `null` removes the field. |
| Operations | `{ $set: { "meta.score": 2, draft: null }, $unset: ["tags.0"] }` | `$set` sets field paths, also to `null`. `$unset` removes field paths. An element of an array becomes `null`. |
| Operations on arrays | `{ $remove: ["tags.0"], $insert: { "rows.2": { n: 1 } } }` | `$remove` takes an element out of an array, and the next elements move down. `$insert` adds an element at an index. These are the `remove` and the `add` of JSON Patch (RFC 6902). |

- `applyPatch(value, fields)` applies either form, and `mergePatch(value, fields)` applies only a JSON Merge Patch. `patchProblems(fields)` gives the problems of a patch.
- `$set` makes each missing or `null` part of a path an object. A path through another value, or past the end of an array, is a `TypeError`, and the item does not change.
- `$set` comes before `$unset`. Two paths that overlap, for example `a` and `a.b`, are an error.
- Each index of a patch refers to the item before the patch. `$remove` and `$insert` come after `$set` and `$unset`.
- `$remove` of a field of an object is the same as `$unset`. `$remove` of a missing path changes nothing.
- `$insert` at the index that is equal to the length adds the element at the end. An index past the end is a `TypeError`.
- A patch that removes and inserts elements of the same array is an error.

### The overlay: a document through a stack of layers

An app can keep copies of one logical document in layers, for example a space, a board, a group and a user. A read merges the copies of a stack, top layer first:

```ts
import { mergeCopies, resolveStacks, stackOf, UNSET } from "@procedures/collections";

mergeCopies([{ _id: "card", top: 99 }, undefined, { _id: "card", top: 10, left: 20 }]);
// { _id: "card", top: 99, left: 20 }
mergeCopies([{ _id: "card", left: UNSET }, { _id: "card", top: 10, left: 20 }]);
// { _id: "card", top: 10 }
```

| Mode | What a read gives |
|---|---|
| `field` (the default) | Each top-level field comes from the highest copy that has it. A field set to `UNSET` hides its lower values. |
| `doc` | The highest copy, whole. |

- A copy with `_deleted: true` hides the whole document. In the mode `field`, it also hides the copies under it.
- The merge removes `_scope` and `_deleted`. The option `fields` gives other names.
- A copy is the operations form of a patch over the copies under it: `applyPatch(lower, copyAsPatch(copy))` gives the same result for field names without a dot. It is not a JSON Merge Patch: in a copy, `null` is a value, and an object field replaces the lower object whole.
- `resolveStacks(rules, resolve)` gives the read stack, the write targets and the mode of each collection. The rules name layers with variables, and `resolve` gives each layer. `stackOf(stacks, collection, id)` gives the stack of one document. A rule for some documents goes before the rule of their collection.

### The order of a list as data

Each item of an ordered list keeps a string key, and the list sorts by it. An item that moves between two others gets a key between theirs. Thus a move writes one item and no other. The keys use fractional indexing with 62 digits, so they do not run out, and the list needs no rebalance.

```ts
import { compareKeys, dropIndex, isValidKey, keyBetween, keysBetween, keysForDrop } from "@procedures/collections";

keyBetween(undefined, undefined); // "a0": the first key of a list
keyBetween("a0", undefined); // "a1": after a0
keyBetween("a0", "a1"); // "a0V"
keysBetween(undefined, undefined, 3); // ["a0", "a1", "a2"]: keys for a list without keys
const index = dropIndex(pointer, others.map(centerOf));
for (const { id, key } of keysForDrop(others, index, dragged.id)) await save(id, { rank: key });
```

- `keyBetween(prev, next)` gives a key between two neighbors. Without `prev`, the key comes before `next`. Without `next`, it comes after `prev`. A key that is not valid, or a `prev` that is not before `next`, gives a `RangeError`.
- Sort the keys by the code units of the strings: `compareKeys`, or `a < b`. Do not use `localeCompare`. A database must also sort them by their bytes: in MongoDB, do not give the index or the query a locale collation. In PostgreSQL, use `COLLATE "C"`.
- Two writers that move items into one gap at the same time can get the same key. Sort by the key, then by the id of the item, so each reader sees one order.
- `keysForDrop(others, index, movingId)` gives the writes of a move, `{ id, key }` each. Give it the other items in order, without the item that moves. A drop between two items with the same key has no key between them. Thus the helper first gives new keys to those items, and the key of the moving item comes last. A UI that uses it does not call `keyBetween` itself.
- `isValidKey(key, { maxLength })` examines a key that a client writes. The default longest key is 1024 characters.
- `dropIndex(point, centers, rowTolerance)` gives the index of a point among the items on the screen, from 0 to the number of items. Give the centers in reading order (the rows from top to bottom, and each row from left to right). They are in the order of the keys, without the item that moves.

### The undo of a change

`inversePatch(before, patch)` gives the patch that undoes a patch. `UndoLog` keeps the undo of each change in a storage, and undoes the newest change:

```ts
import { InMemoryStorage, inversePatch, UndoLog, type UndoEntry } from "@procedures/collections";

inversePatch({ tags: ["a", "b"] }, { $remove: ["tags.0"] }); // { $insert: { "tags.0": "a" } }

const log = new UndoLog(new InMemoryStorage<UndoEntry>(), (name) => storages[name], { cap: 50 });
const after = await notes.patch!("n1", patch);
await log.record({ collection: "notes", id: "n1", before, patch, after });
await log.undo(); // one write to "notes", or an UndoConflictError
```

- The inverse of a removal of an element is an insertion of the element, and the inverse of an insertion is a removal. The undo does not keep the whole array.
- The inverse uses the indices of the item after the patch. The function applies the inverse to check it.
- When no patch can undo a change exactly, `inversePatch` gives `undefined`. Then the log keeps the whole item before the change. An example is the removal of two adjacent elements.
- A change without a patch replaced or removed the whole item. Its entry keeps the item before it, or `null` when the item did not exist. Give `after`: the item after the change, or nothing when the change removed it.
- Each entry keeps the fingerprint of the item after the change (`fingerprintOf`, a hash of its JSON text with the keys in order). With a patch, the default `after` is `applyPatch(before, patch)`. Give the result of `patch` of the storage when the storage changes the value.
- The changes with the same `group` undo together, the newest first, for example the two items of a move. Give each action a new group id.
- `undo()` reads each item of the group before the first write. When another writer changed an item after its recorded change, the undo writes nothing. It gives an `UndoConflictError`, and the entries stay in the log. Otherwise each item gets one `set` or `delete`.
- The log removes the oldest entries past the cap.

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
    createWithVersions: (versionOf) => new MyStorage<ContractItem>({ versionOf }),
  },
  { describe, it },
);
```

- The suite tests the reads, the writes and the batches, the order of the entries, `getIds`, and the results as new arrays.
- It tests the copies, the JSON values with `null`, and the writes at the same time.
- It tests `getChangesSince` with its versions and its order, `flush`, `getMetadata`, `close` and the errors.
- It tests `query()` with fixed and random selectors against `queryEntries()`, `patch()` with patches at the same time, and the batches and origins of `observe()`.
- It tests the preconditions of the writes. A storage of `create()` must reject a write with an expected version. With `createWithVersions`, the suite tests the conflicts, the current items, `null`, the batches, and two writes at the same time.
- A case for an optional method skips a storage without the method.
- A random sequence of writes runs against a `Map`. Each saved version must give the right changes, in the order of the last change of each id.
- The suite imports no test framework. The caller gives `describe` and `it`, and a failed check throws `ContractViolation`. The runtime entries do not import this entry.
- The suite has no option that hides a difference of a storage. Before, the options `copies` and `nullValues` declared the differences, and the suite sorted each delta.

| Storage | Package | Notes |
|---|---|---|
| `InMemoryStorage` | `@procedures/collections` | It copies with `structuredClone`. The run with `copies: false` skips only the case of the copies. It has `query`, `observe` and `patch`. |
| `SqliteStorage` (each engine, in memory and in a file) | `@procedures/sqlite` | It keeps JSON text, so it gives copies. Its `patch` runs in one transaction. |
| `ApiStorage` | `@procedures/store` | It reads `{ found, value }` from the procedure `get`, so a stored `null` stays `null`. Its `getIds` uses the procedure `ids`, its `query` the procedure `find`, and its `patch` the procedure `patch`. |
| `HybridStorage` (each mode, and a queue in IndexedDB) | `@procedures/store` | It has no `getChangesSince`. Its `query` reads the local copy, or the remote in `remote-only` mode. |

## Storage Backends

### InMemoryStorage

Fast, in-memory storage using JavaScript Map:

```typescript
import { InMemoryStorage } from "@procedures/collections";

const storage = new InMemoryStorage<User>();
await storage.set("user-1", { name: "Alice", age: 30 });
const user = await storage.get("user-1");
```

- The storage keeps a copy of each written value, and each read gives a new copy (`structuredClone`). A `Date` stays a `Date`. A function in a value makes the write reject.
- The option `copies: false` turns the copies off: the storage keeps the values themselves, and the reads give them. It is faster. Give it only when no caller changes a value after a write or a read.
- `getIds()` gives the ids without a copy of the values.
- `observe()` gives each batch before the write resolves. The error of an observer goes to the option `onObserverError`. The default throws it again in a microtask, as an `EventTarget` does.
- `close()` drops the items. After it, each operation rejects, and the methods of the `Map` interface (`keys()`, `values()`, `entries()`, `forEach()`) throw.
- The option `versionOf` gives the version of an item. Then `set`, `delete` and `setBatch` take an expected version. Refer to "The precondition of a write".

### ApiStorage and HybridStorage

These two storages need a `Client`, so they are in [`@procedures/store`](../client-store/README.md), not in this package.

- `ApiStorage` sends each operation to the collection procedures of a server: `collections.<collection>.<operation>`. The server registers them with `createCollectionProcedures(collection)`.
- `HybridStorage` keeps a local copy of a remote storage. It has four modes: `local-only`, `write-through`, `write-back` and `remote-only`. `setMode()` changes the mode while the storage operates.

```typescript
import { ApiStorage, HybridStorage } from "@procedures/store";

const remote = new ApiStorage<User>(client, { collection: "users" });
const users = new HybridStorage<User>(remote, { mode: "write-through", conflictResolution: "remote" });
```

The README of `@procedures/store` gives the options, the queue of `write-back`, the conflict rules and the contract of the two storages.

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
