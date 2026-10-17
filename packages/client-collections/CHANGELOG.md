# @procedures/collections

## 0.7.0

### Minor Changes

- 5837c2d: `asSettled(promises)` gives the result of each promise when it settles, in settle order, with the index of its promise. A rejection is a result, not an error. jarvis used the same `Promise.race` loop in two places.

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- bc74091: The storages agree on the contract of `CollectionStorage`. `InMemoryStorage` changes in three points:
  
  - It keeps copies. Each write takes a copy of the value (`structuredClone`), and each read gives a new copy. Before, it kept the values themselves. The option `copies: false` gives the old behavior for a caller that changes no value.
  - A delta of `getChangesSince` follows the order of the last change of each id. Before, it followed the first write of each id.
  - After `close()`, each operation rejects with an error that says "closed", and a second `close()` does nothing. Before, `close()` emptied the storage, and the storage kept working.
  
  The contract suite of `@procedures/collections/testing` has no options `copies` and `nullValues` now. It tests the copies, a stored `null`, the order of each delta and the operations after `close()` for each storage. The helper `byId` is removed.
- 89481b0: The contract of `CollectionStorage` has the optional method `getIds()`. It gives the ids in the order of the entries, and it does not read or copy the values.
  
  - `InMemoryStorage.getIds()` gives the keys of its map, without a `structuredClone` of the values.
  - The contract suite of `@procedures/collections/testing` tests `getIds()`: the order, a new array for each call, the ids of `getEntries()`, and the rejection after `close()`. A storage without `getIds()` skips the case.

## 0.4.0

### Minor Changes

- 0abf2ec: The new test-only entry `@procedures/collections/testing` holds one contract suite for `CollectionStorage`: `describeCollectionStorageContract(name, { create, createWithMaxTombstones, copies, nullValues }, { describe, it })`. It tests the reads, the writes, the batches, the order of the entries, the JSON values, `getChangesSince` and its versions, `flush`, `getMetadata`, `close` and the errors. A random sequence of writes runs against a `Map`. The suite imports no test framework, so the runtime entries never load vitest. `InMemoryStorage`, `SqliteStorage`, `ApiStorage` and `HybridStorage` run it.
  
  The suite found two differences, and the contract fixes them:
  
  - An error of a `find` predicate of `InMemoryStorage` threw at once. Each method of a storage gives a promise, so each method of `InMemoryStorage` is now `async`, and an error is a rejected promise.
  - `getMetadata().size` of `HybridStorage` was the size of the local copy, which `remote-only` keeps empty. It is now the result of `size()`. The new `stats.localSize` gives the size of the local copy.

## 0.3.0

### Minor Changes

- 7873940: The collection mode switch (roadmap R28). `HybridStorage` has four modes: `local-only` (no remote call, each write waits in the queue), `write-through`, `write-back` and `remote-only` (no local copy). The option `mode` gives the first mode, and `writeStrategy` stays as a deprecated name of it. `setMode()` changes the mode while the storage operates. The switch waits for the operations that run, sends the queue to the remote first, and syncs the local copy when it leaves `local-only` or `remote-only`. A switch to `remote-only` drops the local copy only after the flush. When the remote fails, the mode stays and `setMode()` throws `ModeSwitchError`. A switch to `local-only` makes no remote call.
  
  The queue is durable: the option `queueStore` takes a `QueueStore` (`load`, `append`, `replace`, `clear`). `MemoryQueueStore` is the default, and `FileQueueStore` of the new entry `@procedures/store/file-queue` keeps the queue in a JSON Lines file. A write ends only after the store kept it (`QueueStoreError` when it cannot). A new storage with the same store loads the queue, shows its writes and sends them. The modes `write-back` and `local-only` always use the queue: before, `write-back` with `offlineQueue: false` never sent a write.
  
  A sync asks for the changes since the version of the last sync. Storages get the optional `getChangesSince(version)` (`InMemoryStorage` keeps a change log with tombstones, `ApiStorage` calls the new collection procedure `collections.<name>.changes`), and a remote without it gives all its entries. The option `versionOf` gives the version of an item: with versions, a conflict is a queued local write of an id whose remote version changed, and `conflictResolution` decides (`error` throws `ConflictError`). The option `pullInterval` starts a periodic pull. Storages get the optional `flush()`, and `ProcedureServer.useStorage(name, storage, { drain, close })` flushes the old storage before the change. `createSyncedRegistry({ type: "hybrid", mode })` takes the mode, and the synced registry has `setMode()` and `getMode()`.
- c799cdd: `HybridStorage` cannot lose data (roadmap R2). A sync gets the ids of the remote items from the new `getEntries()` of a storage (the collection procedure `collections.<name>.entries`), or else from `keyOf`. A remote item without a key stops the sync with `MissingKeysError` before any change: before, such a list emptied the local cache. A write-through that the remote cannot take waits in the queue and throws `PendingWriteError`, and a timer sends the queue. A write that the remote refuses is undone in the local cache. A full queue refuses a write with `QueueFullError`: before, it dropped the oldest operation. A second try of a write replaces its queued operation. A write-through sends the older queued operations first. The reads wait for the first sync.

## 0.2.3

No changes in this release.

## 0.2.2

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
