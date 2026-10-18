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

The entry `@procedures/store/indexeddb` has the stores of a browser. The package root does not import it, and it does not import the client or zod.

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
- **The patches.** `ApiStorage.patch(id, fields)` sends a patch to the procedure `collections.<name>.patch`. The server changes the item in one step. A patch is a JSON Merge Patch, or the operations `{ $set, $unset, $remove, $insert }`.
- **The query policy.** The server applies the policy of its host to each `find`. The default policy does not permit `$regex`, and a `find` gets at most 1000 items.

Notes:

- A custom `service` or a custom `get` operation gets the input `{ id }`, as before. Its `null` reads back as `undefined`.
- A server before the procedure `find` answers `NOT_FOUND`. Then `ApiStorage.query()` reads the entries and applies the query in the client, with the same result.
- `ApiStorage.find(predicate)` reads each item, because a function cannot go over the network. Use `query()` with a selector to filter on the server.
- `HybridStorage.query()` reads the local copy, or the remote in `remote-only` mode. Its option `queryPolicy` goes to the storage under it.
- `ApiStorage.query()` examines the form of a selector before it sends it. Its option `queryPolicy` adds the limits of the client.
- A host turns `$regex` on with `server.registerCollectionProcedures(name, { queryPolicy })` or `createCollectionProcedures(name, { queryPolicy })`.
- A server before `found` ignores it and gives the item. Then a stored `null` reads back as `undefined`, as before.
- A server before the procedure `ids` answers `NOT_FOUND`. Then `ApiStorage.getIds()` reads the ids from the entries, and it does not ask for `ids` again.
- `HybridStorage.close()` waits for the operations, the switch and the syncs that run. Then it sends the queue, and it closes the remote and the local copy.
- `SyncedProcedureRegistry.close()` closes its storage. After it, `register()` and `unregister()` change only the registry in memory.

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
- The option `queueStore` keeps the queue. The storage writes each change to the store before the write ends.
- A new storage with the same store loads the queue, shows its writes, and sends them.
- `MemoryQueueStore` is the default. `FileQueueStore` keeps the queue in a JSON Lines file, for Node.
- `FileQueueStore` is in `@procedures/store/file-queue`, because it uses `node:fs`. The package root does not import it.
- `IndexedDbQueueStore` keeps the queue in IndexedDB, for a browser. It is in `@procedures/store/indexeddb`.

### The local copy

- The option `local` gives the storage of the local copy. The default is a new `InMemoryStorage`.
- A durable local copy keeps the items after a restart. `SqliteStorage` of `@procedures/sqlite` keeps them in a SQLite file.
- With a durable local copy, a new storage in `local-only` mode reads the items of the last run. It makes no remote call.
- Give a durable `queueStore` with a durable local copy. A restart applies the loaded queue to the local copy again, and the result does not change.
- The first sync after a restart reads all remote items. It removes each local item that the remote deleted and that no queued write changes.
- A full sync reads the local ids with `getIds()` of the local copy. `InMemoryStorage` and `SqliteStorage` give the ids without a copy of the values. A local copy without `getIds()` gives its entries.
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

`HybridStorage` is a sync engine for each local copy: `InMemoryStorage`, `SqliteStorage`, IndexedDB or a SignalDB collection (server stack D9, CLI-21, CLI-15).

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

### The change of a storage in a server

`ProcedureServer.useStorage(name, storage, { drain: true, close: true })` first starts `flush()` of the old storage. Then it uses the new storage and closes the old one. When the flush fails, the old storage stays.

- The new calls use the new storage at once.
- Before the close, the server waits for the calls that took the old storage. A stream holds its storage until its end.
- The option `grace` gives the longest wait, for example `seconds(5)`. The default is 30 seconds. A plain number is a `TypeError`.
- When the time ends, the server closes the old storage. A call that still uses it then fails with the error of a closed storage.

`ProcedureServer.stop()` closes each storage one time and removes the storages from the server. A closed storage rejects each operation. Before the server starts again, give it new storages with `useStorage()`.

### The mode of a synced registry

`createSyncedRegistry({ type: "hybrid", client, mode })` takes the first mode. `setMode()` of the registry changes the mode of its storage.

## The root of the files

No input of `procedure.store`, `procedure.load` and `procedure.sync` names a file. Under the root of a host (`mark --fs-root`, `procedure-server --fs-root`, `MCP_FS_ROOT`), they use the program store of the host. The host chooses the file of a file store, also outside the root. A loaded program is data-driven, so its nested calls get their own rules.

## License

MIT
