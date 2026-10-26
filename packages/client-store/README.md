# @procedures/store

[![npm](https://img.shields.io/npm/v/@procedures/store?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/store)

The program store of the [client](https://github.com/mark1russell7/client) ecosystem. A program is procedure-as-data: the aggregation that `procedure.define` turns into a procedure. The store keeps programs after the process ends, and `procedure.load` defines them again.

```sh
npm install @procedures/client @procedures/store
```

## Example

```ts
import { Client, LocalTransport, PROCEDURE_REGISTRY, allCoreProcedures } from "@procedures/client";
import { attachProgramStore, FileProgramStore } from "@procedures/store";

PROCEDURE_REGISTRY.registerAll(allCoreProcedures, { override: true });
attachProgramStore(PROCEDURE_REGISTRY, new FileProgramStore("./programs.json"));
const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// Define a program, then store it
await client.exec({
  $proc: ["procedure", "define"],
  input: { path: ["math", "addTen"], aggregation: { $proc: ["client", "add"], input: { a: { $ref: "input.x" }, b: 10 } } },
});
await client.exec(["procedure", "store"], { path: "math.addTen" });

// After a restart: load the stored programs, then call them
await client.exec(["procedure", "load"], { all: true });
console.log(await client.exec(["math", "addTen"], { x: 5 })); // 15
```

## The program store

| Backend | Where the programs are |
|---|---|
| `MemoryProgramStore` | In the memory of the process |
| `FileProgramStore` | In one JSON file. A lock file and an atomic rename keep the programs of two processes. |
| `CollectionProgramStore` | In a collection storage: `InMemoryStorage` of `@procedures/collections`, `ApiStorage` (the collection procedures of a server) or `HybridStorage` (a local cache with a remote copy) |
| `IndexedDbProgramStore` | In the IndexedDB of a browser. It is in `@procedures/store/indexeddb`. |

### The stores of a browser

The entry `@procedures/store/indexeddb` has the stores of a browser. The package root does not import it. It does not import the root of the client or zod.

- `IndexedDbStorage` is a collection storage in IndexedDB. Refer to "The collection storage of a browser".
- `IndexedDbProgramStore` keeps the programs in one database, `procedures-programs` by default.
- `IndexedDbQueueStore` keeps the queue of a `HybridStorage`. Give each storage its own database.
- `hasIndexedDb()` tells if the browser has IndexedDB. `MemoryProgramStore` and `MemoryQueueStore` are the fallbacks.
- A browser can refuse to open a database, for example in a private window. Then the first operation of a store fails.
- The store checks each record that it reads. A record of an old version or of another application is an error.

```ts
import { IndexedDbProgramStore, MemoryProgramStore, hasIndexedDb } from "@procedures/store/indexeddb";

const programs = hasIndexedDb() ? new IndexedDbProgramStore("my-app-programs") : new MemoryProgramStore();
await programs.put({ key: "reports.weekly", path: ["reports", "weekly"], program, storedAt: Date.now() });
```

The Composer of the site saves programs with `IndexedDbProgramStore`. It loads the store only when the reader opens the saved programs.

A host gives a registry its store with `attachProgramStore(registry, store)`. The procedures use the store of the caller's registry:

| Procedure | What it does |
|---|---|
| `procedure.store` | Writes the program of a procedure that `procedure.define` made. A code procedure is the error `NOT_A_PROGRAM`. |
| `procedure.load` | Defines the stored programs of a `path`, a `prefix` or `all`. A program at the path of a code procedure is a conflict: the code stays. |
| `procedure.sync` | `push` writes the programs of the registry. `pull` defines the stored programs. `both` pushes, then pulls the programs that the registry does not have. |
| `procedure.remote` | `status` gives the kind of the store. `connect` and `disconnect` are `NOT_IMPLEMENTED`: the host makes the store. |

Without a store, `procedure.store`, `load` and `sync` fail with the code `NOT_CONFIGURED`.

A loaded program is a runtime-defined procedure, so it is data-driven: a server with an expose rule lets it call only the exposed procedures. Load programs only from a store that you trust. A host with no expose rule does not limit the calls of a program.

## The storage layer

These parts moved here from `@procedures/client` (roadmap 3.2):

- `ApiStorage` and `HybridStorage`, the collection storages that need a `Client`. Before, they were in `@procedures/client/collections`.
- The synced registry (`createSyncedRegistry()`, `SyncedProcedureRegistry`), the serialization of procedures, and the dynamic handler loader with an allowlist (`createDynamicHandlerLoader`).
- `procedure.register`, which registers a procedure from a handler reference.

An import of `@procedures/store/register` registers its procedures. An import of the package root registers nothing.

### The contract of `ApiStorage` and `HybridStorage`

The contract suite of `@procedures/collections/testing` tests `ApiStorage`, and `HybridStorage` in each mode. The two storages agree with `InMemoryStorage` and `SqliteStorage`:

- **Copies.** A change of a written or a read value does not change the stored item. `HybridStorage` takes a copy of each written value for the local copy, the queue and the remote. The values that `ApiStorage` sends and reads go through the transport.
- **`null`.** A stored `null` reads back as `null`. `ApiStorage.get()` sends `{ id, found: true }` to the procedure `collections.<name>.get`. The procedure then gives `{ found, value }` in one call.
- **The order of a delta.** `getChangesSince()` follows the order of the last change of each id.
- **The ids.** `getIds()` gives the ids in the order of the entries. `ApiStorage.getIds()` uses the procedure `collections.<name>.ids`, so the values stay on the server.
- **After `close()`.** Each operation rejects with an error whose message says "closed". A second `close()` does nothing.

- **The queries.** `query(selector, { sort, skip, limit })` gives the result of `queryEntries()` of `@procedures/collections`. `ApiStorage.query()` sends the JSON selector to the procedure `collections.<name>.find`, so the server applies it.
- **The patches.** `ApiStorage.patch(id, fields)` sends a patch to the procedure `collections.<name>.patch`. The server changes the item in one step. A patch is a JSON Merge Patch, or the operations `{ $set, $unset, $remove, $insert }`. An index of `$remove` or `$insert` is a position at the time of the patch. A client that works from an older read uses the version check of the collection, where the collection has one.
- **The query policy.** The server applies the policy of its host to each `find`. The default policy does not permit `$regex`, and a `find` gets at most 1000 items.
- **The preconditions.** `set`, `delete` and `setBatch` take an expected version of the current item (roadmap CLI-16). `ApiStorage` sends it to the collection procedures, and the storage of the server tests it. A conflict rejects with `VersionConflictError`, with the current items. A storage that cannot test it rejects the write.

Notes:

- A custom `service` or a custom `get` operation gets the input `{ id }`, as before. Its `null` reads back as `undefined`.
- A custom `service` gets no expected version. `ApiStorage` rejects a write with one, so the precondition is not lost.
- `HybridStorage` gives the expected version of a caller to its local copy. The default local copy gets the option `versionOf` of the storage. In `write-through` mode, the remote write gets it too. In `remote-only` mode, only the remote tests it.
- A server before the procedure `find` answers `NOT_FOUND`. Then `ApiStorage.query()` reads the entries and applies the query in the client, with the same result.
- `ApiStorage.find(predicate)` reads each item, because a function cannot go over the network. Use `query()` with a selector to filter on the server.
- `HybridStorage.query()` reads the local copy, or the remote in `remote-only` mode. Its option `queryPolicy` goes to the storage under it.
- `ApiStorage.query()` examines the form of a selector before it sends it. Its option `queryPolicy` adds the limits of the client.
- A host turns `$regex` on with `server.registerCollectionProcedures(name, { queryPolicy })` or `createCollectionProcedures(name, { queryPolicy })`.
- A server before `found` ignores it and gives the item. Then a stored `null` reads back as `undefined`, as before.
- A server before the procedure `ids` answers `NOT_FOUND`. Then `ApiStorage.getIds()` reads the ids from the entries, and it does not ask for `ids` again.
- `HybridStorage.close()` waits for the operations, the switch and the syncs that run. Then it sends the queue, and it closes the remote and the local copy.
- `SyncedProcedureRegistry.close()` closes its storage. After it, `register()` and `unregister()` change only the registry in memory.

### The collection storage of a browser

`IndexedDbStorage` of `@procedures/store/indexeddb` keeps the items of one collection in IndexedDB (roadmap CLI-22). It is the durable local copy of a `HybridStorage` in a browser app without SignalDB.

- Give each collection its own database. The storage makes the database at the first operation.
- The items stay after `close()` and after a reload of the page. A new storage of the same database reads them.
- The entries keep the order of the first set of each id, as a `Map` does. Each record keeps the number of its first set.
- `getChangesSince()` gives the changes after a version. A version stays valid after a reload.
- Each write is one transaction of IndexedDB. A batch that fails changes nothing. Two patches at the same time keep each field.
- `query()` applies a selector. `patch()` changes an item in one transaction.
- `observe()` tells each write of this storage before the write resolves. It does not tell the writes of another tab.
- With the option `versionOf`, a write can expect the version of the current item. The test and the write are one transaction.
- The storage checks each record that it reads. A record of another application or of another version is an error.
- The contract suite of `@procedures/collections/testing` tests the storage, and a `HybridStorage` with the storage as its local copy.
- `InMemoryStorage` of `@procedures/collections` is the fallback for a browser without IndexedDB.

```ts
import { ApiStorage, HybridStorage, IndexedDbQueueStore, IndexedDbStorage, IndexedDbSyncStateStore } from "@procedures/store/browser";

const versionOf = (user: User) => user.rev;
const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
  local: new IndexedDbStorage<User>("users", { versionOf }),
  versionOf,
  queueStore: new IndexedDbQueueStore("users-queue"),
  syncState: new IndexedDbSyncStateStore("users-sync"),
});
```

## The modes of `HybridStorage`

`HybridStorage` keeps a local copy of a remote collection storage. It has four modes, and `setMode()` changes the mode while the storage operates.

| Mode | Reads | Writes | Remote calls |
|---|---|---|---|
| `local-only` | The local copy | The local copy and the queue | None |
| `write-through` | The local copy, and the remote on a miss | The local copy, then the remote | Yes |
| `write-back` | The local copy, and the remote on a miss | The local copy and the queue. A timer sends the queue. | Yes |
| `remote-only` | The remote | The remote | Yes. The storage keeps no local copy. |

```ts
import { minutes } from "@procedures/client";
import { ApiStorage, HybridStorage } from "@procedures/store";
import { FileQueueStore } from "@procedures/store/file-queue";

const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
  mode: "write-back",
  queueStore: new FileQueueStore("./users.queue.jsonl"),
  versionOf: (user) => user.etag,
  conflictResolution: "remote",
  pullInterval: minutes(1),
});

await users.setMode("local-only"); // No remote call. The writes wait in the queue.
await users.setMode("write-through"); // The switch sends the queue, then syncs the local copy.
```

### The switch

- A switch waits for the operations that run. An operation that starts during the switch waits for the switch.
- A switch to a remote mode sends the queue first. When the remote fails, the mode stays, and `setMode()` throws `ModeSwitchError`.
- A switch to `local-only` makes no remote call. The queue stays until the next switch to a remote mode.
- A switch to `remote-only` drops the local copy after the queue arrives at the remote.
- A switch from `local-only` or `remote-only` to a mode with a local copy syncs the local copy. The reads wait for the sync.
- The switches and the syncs run one at a time.

### The queue

- In the modes `local-only` and `write-back`, each write goes in the queue.
- In the mode `write-through`, a write that the remote cannot take goes in the queue, and the write throws `PendingWriteError`.
- A full queue refuses the next write with `QueueFullError`. The limit is `maxOfflineOps`, 1000 by default.
- A push keeps a write that the remote cannot take at this time (`isUnavailable` gives true). This write and the later writes stay in the queue.
- A queued write that the remote refuses leaves the queue, and the push goes on with the next write.
- After a refusal, the local copy gets the remote values of its ids again. An id that a later queued write changes keeps its local value.
- The option `onRefused` gets each refusal: the write, its ids, the error, and `restored`. An error of the hook does not stop the push.
- The option `queueStore` keeps the queue. The storage writes each change to the store before the write ends.
- A new storage with the same store loads the queue, shows its writes, and sends them.
- `MemoryQueueStore` is the default. `FileQueueStore` keeps the queue in a JSON Lines file, for Node.
- `FileQueueStore` is in `@procedures/store/file-queue`, because it uses `node:fs`. The package root does not import it.
- `IndexedDbQueueStore` keeps the queue in IndexedDB, for a browser. It is in `@procedures/store/indexeddb`.

### The local copy

- The option `local` gives the storage of the local copy. The default is a new `InMemoryStorage`.
- A durable local copy keeps the items after a restart. `SqliteStorage` of `@procedures/sqlite` keeps them in a SQLite file.
- `IndexedDbStorage` of `@procedures/store/indexeddb` keeps them in the IndexedDB of a browser.
- With a durable local copy, a new storage in `local-only` mode reads the items of the last run. It makes no remote call.
- Give a durable `queueStore` with a durable local copy. A restart applies the loaded queue to the local copy again, and the result does not change.
- The first sync after a restart reads all remote items. It removes each local item that the remote deleted and that no queued write changes.
- A full sync reads the local ids with `getIds()` of the local copy. `InMemoryStorage`, `SqliteStorage` and `IndexedDbStorage` give the ids without a copy of the values. A local copy without `getIds()` gives its entries.
- `HybridStorage.getIds()` gives the ids of the local copy, or of the remote in `remote-only` mode.
- `close()` closes the local copy and the remote. A durable local copy keeps its items. A remote stays open when its own `close()` leaves it open, as `ApiStorage.close()` leaves the server.

```ts
import { ApiStorage, HybridStorage } from "@procedures/store";
import { FileQueueStore } from "@procedures/store/file-queue";
import { SqliteStorage } from "@procedures/sqlite/storage";

const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
  mode: "write-back",
  local: new SqliteStorage({ path: "./users.db", table: "users" }),
  queueStore: new FileQueueStore("./users.queue.jsonl"),
});
```

### The sync, the versions and the conflicts

- A sync asks the remote for the changes since the version of the last sync. `ApiStorage` uses the procedure `collections.<name>.changes`.
- A remote without a change log gives all its entries.
- The option `versionOf` gives the version of an item, for example its ETag.
- With versions, a conflict is a queued local write of an id whose remote version changed. The option `conflictResolution` gives the result.
- The values of `conflictResolution` are `local`, `remote`, `merge` with `mergeFn`, and `error`. With `error`, the sync throws `ConflictError`.
- Without versions, a queued write always wins. A local value that differs from the remote value is a conflict.
- A pull reads a local item only when the result depends on it. A pull does not read the item of a queued write that wins.
- With versions, the storage knows the version of each local item that it wrote or read. Then a pull reads a local item only for a conflict, or when the version is not known.
- Without versions, a pull reads each local item without a queued write. It compares the JSON of the local item and the remote item.
- The option `pullInterval` starts a periodic pull in the modes `write-through` and `write-back`. `close()` stops it.

### The base versions on the server

With `versionOf`, the push of a queued write sends its base version as the expected version (roadmap CLI-16, decision D11). The base version is the remote version of the id when the local write went in the queue. The server then refuses a write over a change of another writer.

- The remote answers `VERSION_CONFLICT` with the current item. The storage gives the conflict to `conflictResolution`, as a conflict of a pull.
- `remote`: the remote item replaces the local item, and the queued writes of the id go.
- `merge`: `mergeFn` gives the item. A new queued write sends it, with the current version as its base.
- `local`: the current version becomes the base, and the push sends the queued write again. It replaces the remote item.
- `error`: the push throws `ConflictError` with the ids. The queue and the remote keep their items, and the next push tries again.
- A remote item that is the value of the queued write is not a conflict. An earlier send reached the remote, and its answer was lost.
- An id without a known base version gets no expected version. Its queued write wins, as before.
- The remote must test the precondition: an `ApiStorage` of the collection procedures over a storage with the same `versionOf`. A remote that cannot test it refuses each push.
- The option `sendBaseVersions: false` stops the expected versions. Then a queued write replaces the remote item, as before CLI-16.
- A write of the mode `write-through` goes to the remote directly. It sends only the expected version of its caller.

### The clock, the backoff and the status

The timers and the retries run on a clock: `Clock` of `@mark1russell7/service/clock`. A test gives `fakeClock` of `@mark1russell7/service/testing`, and the times are then exact.

- The option `clock` of `HybridStorage` and of `ApiStorage` gives the clock. The default is `realClock` of `@procedures/client`.
- The timers of `HybridStorage` do not keep a Node process alive. These timers are the push of `write-back`, the periodic pull, and the send of the queue after a failure.
- After a failed run of a timer, the next delay grows with `backoffDelay` of `@mark1russell7/service/backoff`. The option `backoff` gives the `factor`, the `maxDelay` and the `jitter`.
- A run that succeeds sets the delay back to its interval.
- `ApiStorage` waits `backoffDelay` between its tries, with full jitter. The options are `retryDelay`, `retryFactor`, `maxRetryDelay` and `retryJitter`.
- An error with `retryAfterMs` gets at least that wait.
- The timeout of each call of `ApiStorage` uses the clock too.

`HybridStorage.getStatus()` gives the state of the sync. `onStatus(listener)` sends the status at each change. The storages of this package do not write to the console.

| Field | Value |
|---|---|
| `connected` | False after a remote call failed, until a remote call succeeds |
| `pendingChanges` | The number of operations in the queue |
| `syncing` | True while a push or a pull runs |
| `lastSync` | The time of the last pull that succeeded |
| `mode` | The mode of the storage |
| `error` | The newest failure of a load, a push, a pull, the queue store or the sync state store, with its `operation` and its `error`. A later success of the same work clears it. |

```ts
const stop = users.onStatus((status) => {
  if (status.error) showBanner(`The sync failed: ${String(status.error.error)}`);
  else if (status.pendingChanges > 0) showBanner(`${status.pendingChanges} changes wait for the server`);
});
```

`SyncedProcedureRegistry` takes the option `clock` for its auto-sync. Its `getStatus()` and `onStatus()` give the failures of the auto-sync and of the write-through writes.

### The changes, the capture, the sync state and the push feed

`HybridStorage` is a sync engine for each local copy: `InMemoryStorage`, `SqliteStorage`, `IndexedDbStorage` or a SignalDB collection (server stack D9, CLI-21, CLI-15).

- `observe(observer)` gives one batch of `set`, `delete` and `clear` changes for each change of the storage.
- A write of the storage gives its batch with the `origin` of its options. A pull and a delta of the feed give their changes with the origin `syncOrigin`, `"sync"` by default.
- The option `origin` is the tag of the storage. Each write of the storage to the local copy and to the remote has it.
- With `capture: "observe"`, the storage observes the local copy. It puts each change with another origin in the queue. Thus the application can write to the local copy directly.
- A captured change always goes in the queue, because the application made it already. In `write-through` mode, the storage sends it at once.
- The option `syncState` keeps the cursor and the base versions. A new storage with the same store asks only for the changes since the cursor.
- `MemorySyncStateStore` keeps the state in memory. `IndexedDbSyncStateStore` of `@procedures/store/indexeddb` keeps it in a browser.
- The storage uses a loaded cursor only with the option `local` and a local copy that has items. Give the state store with a durable local copy.
- The option `feed` takes a push feed of the remote changes, for example `EventsChangeFeed`. The storage subscribes in the modes `write-through` and `write-back`.
- A delta whose `since` is the cursor of the storage applies without a read of the remote.
- A gap, a lost event, a new subscription or another delta makes the storage pull the changes since its cursor.
- A delta that comes during a pull applies after the pull. Thus a pull does not erase a change that came during it.
- In `write-through` mode, a pull or a delta does not write over an own write that waits for the remote. After the write, the storage reads the id again, and the rules of a pull decide.
- With `versionOf`, the storage keeps the versions of its own writes until their echoes come. The echo of an older own write does not write over a newer local write.
- The option `echoWindow` gives the time that the storage waits for an echo. The default is 30 seconds.

`EventsChangeFeed` subscribes to the change events of the core collection procedures. Each write of `collections.<name>.*` publishes `{ since, version, changed, deleted, origin }` on the topic `collections.<name>`.

- An event has the ids and the versions, and no value. The storage reads the values with `changes`, so the checks of a read apply. A hint with only deletes applies without a read.
- A subscriber must have a capability that reads `collection:<name>`, as for a read.
- With `changeEvents: { values: true }` on the server, the events also have the values. Each row passes the output filter of the host for each subscriber, and a refused id goes in `withheld`.
- An event with a value for each changed id applies without a read. An event with a withheld id makes the storage pull.
- The syncs of one storage run one at a time: the deltas, the hints, the pulls, the pushes and the mode switches. Thus a remote delta and a full sync do not run at the same time.

```ts
import { ApiStorage, EventsChangeFeed, HybridStorage } from "@procedures/store";
import { IndexedDbQueueStore, IndexedDbSyncStateStore } from "@procedures/store/indexeddb";

const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
  local: signalDbStorage,
  capture: "observe",
  versionOf: (user) => user.rev,
  queueStore: new IndexedDbQueueStore("users-queue"),
  syncState: new IndexedDbSyncStateStore("users-sync"),
  feed: new EventsChangeFeed(client, { collection: "users" }),
});
```

- The source of an `EventsChangeFeed` is a `Client`, a `WebSocketTransport`, or another transport of `@procedures/client`. `Client.subscribe()` sends the subscription through the middleware of the client.
- The delivery of the events is at most once. Thus the feed gives each loss to the storage, and the storage pulls.
- The server serves the events with the option `events` of `ProcedureServer`, for example `{ topics: ["collections.*"] }`. Without a subscriber, the procedures publish nothing.
- `ApiStorage` sends the `origin` of a write to the procedure. Thus the storage of the server and the event have it.

### The hook around a remote apply

The option `aroundRemoteApply` puts each apply of the remote changes inside a hook (graph W8). For example, the hook starts a span of a trace with the `traceparent` of the server.

- The hook gets `hint`, `apply` and `context`. It starts `apply` one time and gives back its promise.
- `context.cause` is `"delta"`, `"hint"`, `"gap"` or `"pull"`. `context.hints` has the hints of the apply.
- A delta and a hint of the feed give their hint. A gap and a pull of the storage give the hint `undefined`.
- A pull of the storage is the timer of `pullInterval`, `syncFromRemote()`, `sync()` or the first sync.
- A pull that many hints asked for runs one time. Its hint is the last hint, and `context.hints` has the last 128 hints.
- `EventsChangeFeed` puts the other fields of a change event in `hint.extra`, for example `traceparent` and `tracestate`.
- An error of `apply` or of the hook makes the pull fail. The status keeps the error until a pull succeeds.
- When the hook does not start `apply` one time, the pull fails with `RemoteApplyHookError`. The changes apply one time all the same.
- Only the leader of a `TabCoordinator` or a `TabGroup` uses the hook. Give the hook in the option `hybrid`.
- Without the hook, the storage applies the changes as before.

```ts
import { context, propagation, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("app");

const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
  feed: new EventsChangeFeed(client, { collection: "users" }),
  aroundRemoteApply: (hint, apply, { cause }) => {
    const traceparent = hint?.extra?.["traceparent"];
    const parent = typeof traceparent === "string" ? propagation.extract(context.active(), { traceparent }) : context.active();
    return tracer.startActiveSpan("users.apply", { attributes: { cause } }, parent, async (span) => {
      try {
        await apply();
      } finally {
        span.end();
      }
    });
  },
});
```

### The tabs of a browser

`TabCoordinator` of `@procedures/store/browser` lets one leader tab run the sync of a `HybridStorage` (roadmap CLI-25). The other tabs copy its changes. Without it, each tab pulls and pushes, and each tab writes over the queue of the other tabs.

- The election uses the Web Locks API. The tab that holds the lock of the coordinator is the leader.
- Only the leader makes the `HybridStorage`, with `capture: "observe"` on its local copy. The followers make no remote call and start no timer.
- The application writes to the local copy in each tab. A tab sends the change batches of its local copy to the other tabs on a `BroadcastChannel`.
- `observe()` gives the batches of this tab and of the other tabs, each batch one time, with the origin of each change.
- The leader also sends the changes of its sync. They have the origin `syncOrigin`, `"sync"` by default.
- A tab does not send again a batch of another tab.
- The leader captures the batches of the followers: its `HybridStorage` queues them and pushes them. Thus a write of a follower reaches the remote one time.
- Only the leader writes to the queue store and to the store of the sync state. Give the same `IndexedDbQueueStore` and `IndexedDbSyncStateStore` in each tab.

The option `copy` tells the kind of the local copy:

- `"shared"`: the tabs open the same durable local copy, for example an `IndexedDbStorage` of one database. A tab gives the batches of the other tabs only to its observers.
- `"tab"`: each tab has its own local copy, for example a SignalDB collection. A tab writes the batches of the other tabs to its copy, and then gives them to its observers.
- In the mode `"tab"`, a new tab gets only the changes after its start. Its local copy loads the older items itself, for example from its persistence. The option `snapshot` gives it the entries of the leader (roadmap CLI-66).
- In the mode `"shared"`, a pull of the leader can come between the write of a follower and its capture. The tabs agree again after the push and the next pull.

A new leader and a closed tab:

- A follower keeps each own batch until the leader acknowledges it. The leader acknowledges a batch when its queue store holds it.
- A new leader tells the other tabs. Each follower then sends the batches that no leader acknowledged. Thus a write during the change of the leader reaches the new leader.
- `close()` of the leader sends the queue, and then it releases the lock. The queue store keeps the operations that the remote did not take.
- When the browser closes the tab of the leader, the browser releases the lock. The next leader loads the shared queue store and pushes the queue.
- When the leader stops during a push, the next leader sends the operation again. A set or a delete gives the same result two times.
- The load of the queue writes the queued operations to the local copy again. Thus the observers can get them again, with the origin `syncOrigin`.
- `close()` of a follower stops its lock request. `close()` does not close the local copy, because the application owns it.

A setup that fails (roadmap CLI-67):

- A tab becomes the leader only after its `HybridStorage` loaded the queue. Until then, the tab is a follower.
- When `remote()` throws or the load of the queue fails, the tab gives the error to `onError`. Then it releases the lock, and another tab can lead.
- The tab stays a follower, and it asks for the lock again after a backoff. Thus a short failure does not leave the browser without a sync.
- The option `retry` sets the backoff: `delay` (1 second), `factor` (2), `maxDelay` (1 minute) and `jitter` (0.5).
- After `n` failures in a row, the wait is `delay × factor^(n − 1)`, at most `maxDelay`. The jitter makes each wait shorter by up to its fraction.
- A setup that succeeds sets the wait back to `delay`. `close()` stops a wait.
- In the single mode, the tab tries its setup again after the same backoff.
- The options `clock` and `random` take the clock and the random numbers of the backoff, for example `fakeClock` of `@mark1russell7/service/testing` in a test.

The status of the sync (roadmap CLI-65):

- `getStatus()` gives the `SyncStatus` in each tab. Before the first status and after `close()`, it gives `undefined`.
- `onStatus()` tells each new status to a listener, one time.
- The leader gives the status of its own `HybridStorage`. It sends each change to the followers, and it answers the hello of a new tab with its status.
- After a change of the leader, a follower keeps the last status until the new leader sends its status.
- A message keeps only values that a structured clone can copy. Thus in a follower, `error.error` is an `Error` with the `name`, the `message` and the `code` of the error of the leader.
- A tab of an older release ignores the status messages. It still copies the batches, because the version of the messages stays 1.

Without the Web Locks API or `BroadcastChannel`, the coordinator is in the single mode. The tab does its own sync, and it opens no channel. A browser has the Web Locks API only in a secure context, for example HTTPS or `localhost`.

```ts
import { ApiStorage, IndexedDbQueueStore, IndexedDbStorage, IndexedDbSyncStateStore, TabCoordinator } from "@procedures/store/browser";

const local = new IndexedDbStorage<User>("users");
const users = new TabCoordinator<User>({
  name: "users",
  local,
  copy: "shared",
  remote: () => new ApiStorage(client, { collection: "users" }),
  hybrid: {
    mode: "write-back",
    queueStore: new IndexedDbQueueStore("users-queue"),
    syncState: new IndexedDbSyncStateStore("users-sync"),
  },
});

users.observe((batch) => render(batch));
users.onStatus((status) => showSync(status)); // The status of the sync, in each tab
await local.set("1", { name: "Ada" });
users.getStatus(); // The last status, in each tab
```

- `role` is `follower`, `leader`, `single` or `closed`. `onRole()` tells each change.
- The options `locks` and `channel` take a lock manager and a channel factory, for example the ones of a test. `null` sets the single mode.
- `HybridStorage.whenQueued()` resolves when the queue store holds the queue. The leader acknowledges the batches of the followers after it.

Many collections in one group (roadmap CLI-64):

`TabGroup` does the sync of many collections with one lock and one channel, for example all the collections of a tenant. With a `TabCoordinator` for each collection, each tab holds one lock and one channel for each collection.

- `collection(name, options)` adds a collection to the group and gives its `TabCollection`. A second use with the same name gives the same collection.
- A `TabCollection` has `observe()`, `onRole()`, `getStatus()`, `onStatus()`, `role`, `isLeader` and `syncStorage`, as a `TabCoordinator`.
- The options of a collection are `local`, `copy`, `remote`, `hybrid` and `snapshot`, as the options of a `TabCoordinator`. Give a different `queueStore` to each collection.
- The leader of the group has one `HybridStorage` for each collection. Each message has the name of its collection. Each collection has its own batches, acknowledgements and status.
- Each collection leads when its own queue loaded. It tells the other tabs at once, and the followers then send their batches of that collection. Thus a slow collection does not stop the batches of the other collections.
- A collection whose setup fails tries again alone after its backoff, and the other collections keep their sync.
- After a failed setup, the tab sends a status of the collection with the error (operation `load`) to the other tabs. Thus a follower does not show the status of an old leader.
- When no collection of the group leads or loads its queue, the tab releases the lock. It asks for the lock again after the backoff, as a `TabCoordinator` does.
- This rule also applies to a collection that the application adds after the tab got the lock. A group without collections keeps the lock until its first collection.
- The option `open` gives the options of a collection from its name. `collection(name)` uses it. The leader also uses it for a collection that only another tab opened.
- Without `open`, the leader does the sync of its own collections only. A write of a follower to another collection waits in the follower until a leader has that collection.
- `close()` of the group closes each collection. A collection has no `close()` of its own.
- The lock and the channel of a group have the name `@procedures/store/tabs:<name>`. A `TabCoordinator` uses `@procedures/store/tab:<name>`. Thus a group and a coordinator do not share a lock or a channel.
- A `TabCoordinator` sends its messages without the name of a collection, as before. Thus it works with a tab of an older release.

> **Warning:** A `TabCoordinator` and a `TabGroup` do not see each other. Thus, when you move a collection from a `TabCoordinator` to a `TabGroup`, a tab of the older release can stay open. Then two tabs lead the collection, with one queue store and one remote. To prevent this, give new names to the queue store and the sync state store of that collection. Or close the tabs of the older release before the new release opens. The operations in the old queue store stay there until a tab loads that store.

```ts
import { ApiStorage, IndexedDbQueueStore, TabGroup } from "@procedures/store/browser";

const tenant = new TabGroup({
  name: tenantId,
  open: (collection) => ({
    local: localCopyOf(collection),
    copy: "tab",
    remote: () => new ApiStorage(client, { collection }),
    hybrid: { queueStore: new IndexedDbQueueStore(`${tenantId}-${collection}-queue`) },
    snapshot: true,
  }),
});

const notes = tenant.collection<Note>("notes");
notes.observe((batch) => render(batch));
notes.onStatus((status) => showSync("notes", status)); // The status of the sync of notes, in each tab
```

A snapshot for a new tab (roadmap CLI-66):

- In the mode `"tab"`, the option `snapshot: true` lets a new tab ask the leader for the entries of its local copy. The mode `"shared"` does not take the option.
- The leader reads the entries of its copy with `getEntries()`. It sends them in chunks of `snapshot.chunk` entries, 500 by default.
- Each chunk has the number of the last batch of each tab that the entries hold.
- The new tab keeps the batches of the other tabs until the last chunk comes. Then it writes the entries to its copy, and then the batches with a later number.
- The snapshot can repeat a set. For example, a write of the leader during `getEntries()` can be in the entries and also in a later batch. The second write of the set gives the same state.
- The observers get the entries in one batch of sets, with the origin `syncOrigin`.
- The new tab keeps the values of its own writes after the snapshot. The snapshot does not delete an item that only the new tab has.
- When the leader changes before the last chunk, the tab asks the new leader. It does not use the chunks of the old leader.
- When no chunk comes in the time `snapshot.timeout` (10 seconds by default), the tab gives an error to `onError`. Then it writes the batches that waited, without a snapshot.
- In the tab that holds the lock, no other tab sends a snapshot. The snapshot ends when the collection leads. While the collection loads its queue, the wait renews itself, at most 5 times. Thus the batches wait at most 6 × `snapshot.timeout`, also when the load stops.
- A leader of an older release does not answer. Thus a new tab with a leader of an older release gets the error after the timeout.
- The leader reads all the entries at one time, and the new tab keeps all the chunks until the last one. Thus a snapshot is for a copy that fits in the memory of a tab.
- `snapshot.chunk` limits the number of entries in a message, not its bytes. Thus large items give large messages.
- The snapshot is an option, because the coordinator cannot know if a local copy is durable. A copy with persistence is empty until its load ends, so an empty copy is not a sign.

### The change of a storage in a server

`ProcedureServer.useStorage(name, storage, { drain: true, close: true })` first starts `flush()` of the old storage. Then it uses the new storage and closes the old one. When the flush fails, the old storage stays.

- The new calls use the new storage at once.
- Before the close, the server waits for the calls that took the old storage. A stream holds its storage until its end.
- The option `grace` gives the longest wait, for example `seconds(5)`. The default is 30 seconds. A plain number is a `TypeError`.
- When the time ends, the server closes the old storage. A call that still uses it then fails with the error of a closed storage.

`ProcedureServer.stop()` closes each storage one time and removes the storages from the server. A closed storage rejects each operation. Before the server starts again, give it new storages with `useStorage()`.

### The mode of a synced registry

`createSyncedRegistry({ type: "hybrid", client, mode })` takes the first mode. `setMode()` of the registry changes the mode of its storage.

## The browser entry

The entry `@procedures/store/browser` has the parts of the store that run in a browser (roadmap CLI-19). A page imports this entry and not the package root.

- `HybridStorage`, its errors and its types.
- `ApiStorage`, the remote storage over the collection procedures of a server.
- `EventsChangeFeed`, the push feed of the remote changes.
- `TabCoordinator`: one leader tab does the sync of a `HybridStorage`, and the other tabs copy its changes.
- `TabGroup`: one leader tab does the sync of many collections, with one lock and one channel.
- All of `@procedures/store/indexeddb`: `IndexedDbStorage`, the IndexedDB stores and their fallbacks in memory.

No module of the entry imports a module of Node. The modules import `@procedures/client/browser` and not the root of the client, because the root imports `http` and `ws`. The test `src/browser.test.ts` examines the imports of each module of the entry. The entry is in `client.browser` of `package.json`, so the CI check of the browser entries (`scripts/check-browser-entries.mjs`) bundles it for a browser too.

The entry does not have these parts:

- `FileProgramStore` and `FileQueueStore`. They use `node:fs`.
- The procedures, the synced registry and the serialization. They import the root of the client. They are in the package root, for Node.

An import of the entry registers nothing. Its classes are the same as the classes of the package root.

```ts
import { ApiStorage, EventsChangeFeed, HybridStorage, IndexedDbQueueStore, IndexedDbSyncStateStore } from "@procedures/store/browser";

const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
  queueStore: new IndexedDbQueueStore("users-queue"),
  syncState: new IndexedDbSyncStateStore("users-sync"),
  feed: new EventsChangeFeed(client, { collection: "users" }),
});
```

## The root of the files

No input of `procedure.store`, `procedure.load` and `procedure.sync` names a file. Under the root of a host (`mark --fs-root`, `procedure-server --fs-root`, `MCP_FS_ROOT`), they use the program store of the host. The host chooses the file of a file store, also outside the root. A loaded program is data-driven, so its nested calls get their own rules.

## License

MIT
