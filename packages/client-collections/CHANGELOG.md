# @procedures/collections

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- b6782c0: New: the order of a list as data (Graph's split, wave 2, W1). `keyBetween(prev, next)` gives a string key between two neighbors, so a move writes one item and no other. The keys use fractional indexing with 62 digits: they do not run out, and the list needs no rebalance. `keysForDrop` gives all the writes of a move, also when two writers gave two items the same key. `keysBetween` gives several keys, `compareKeys` sorts them, `isValidKey` examines a key that a client writes, and `dropIndex(point, centers)` gives the index of a point among the items on the screen, in reading order.
- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- 0dd1c86: The overlay: one logical document read through a stack of layers. `mergeCopies` merges the copies field by field (`UNSET` hides a field, `_deleted` hides the document) or takes the top copy whole. `copyAsPatch` gives a copy as the patch operations of `applyPatch`.
  
  `resolveStacks` and `stackOf` give the read stack, the write targets and the merge mode of each collection and document. The rules name the layers with variables, and the app resolves them. Each change is additive. The code comes from Graph (its split plan, part P2).
- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- 1aa9ef7: The collection storages get a JSON query language with a query policy, change batches and patches in one step, and the sync of `@procedures/store` runs on the service clock and backoff (server stack CLI-20, CLI-14, CLI-13, CLI-34).
  
  - The query language is in the core, in the new entry `@procedures/client/query`, which imports nothing else. It is the one copy (CLI-34). `@procedures/collections` now depends on `@procedures/client` for it, and exports the same names again.
  - The selector is JSON: a subset of the query selectors of MongoDB. `queryEntries()` is the reference, and `selectorProblems()`, `queryOptionsProblems()`, `compileSelector()`, `matchesSelector()` and `compareStorageValues()` are exported.
  - A query policy (`StorageQueryPolicy`) limits the operators, the length and the flags of a `$regex`, the clauses and the depth of a selector, the lists of `$in`, `$nin` and `$all`, and the limit. The default policy does not permit `$regex`. A pattern that repeats a repetition, for example `(a+)+`, is always an error.
  - `CollectionStorage` of `@procedures/collections` has the optional `query(selector, { sort, skip, limit }, policy)`, `observe(observer)` and `patch(id, fields)`. A caller tests for each one. A storage without them still follows the contract.
  - `observe()` gives one batch of `set`, `delete` and `clear` changes for each write that changes the storage, before the write resolves. The write methods take `{ origin }`, and each change has it.
  - `patch()` takes a JSON Merge Patch (RFC 7386), or the operations `{ $set, $unset }`, which can set `null` and nested field paths. A patch that mixes the two forms is an error. `applyPatch()`, `mergePatch()` and `patchProblems()` are exported.
  - `InMemoryStorage` has the three methods, and the options `queryPolicy` and `onObserverError`. `StorageListeners` is the set of listeners that the storages share.
  - The contract suite of `@procedures/collections/testing` tests the selectors against `queryEntries()`, with fixed and random selectors, the refusal of `$regex` by default, and, with `createWithQueryPolicy`, the opt-in of `$regex` and each limit of a policy. It also tests the two forms of a patch, the patches at the same time, and the batches with their origins.
  - The core collection procedures have `collections.<name>.find` (it reads) and `collections.<name>.patch` (it reads and writes, idempotent). `find` refuses a selector or a limit that the policy does not permit with `VALIDATION_ERROR` and the reason, and a `find` without a limit gets at most `DEFAULT_FIND_LIMIT` (1000) items. It gives the selector and the policy to `query()` of the storage, or runs it on the entries. `patch` uses `patch()` of the storage, or a read and a write, one patch of an id at a time.
  - `createCollectionProcedures(name, { queryPolicy })` and `ProcedureServer.registerCollectionProcedures(name, { queryPolicy })` take the policy of the host.
  - The `CollectionStorage` of the core has the same optional methods and the write options. Its new types are exported from the root, `./browser` and `./procedures`.
  - `ApiStorage` has `query()` (the procedure `find`, or the entries of an older server) and `patch()` (the procedure `patch`). Its option `queryPolicy` adds limits of the client.
  - `ApiStorage` waits `backoffDelay` of `@mark1russell7/service/backoff` between its tries, with full jitter, on the option `clock`. The timeout uses the clock too. The new options are `retryFactor`, `maxRetryDelay`, `retryJitter`, `clock` and `random`. An error with `retryAfterMs` gets at least that wait.
  - `HybridStorage` has `query()` and the option `queryPolicy`. Its timers run on the option `clock`, and the delay after a failure grows with the option `backoff`. `getStatus()` and `onStatus()` give the state of the sync and its failures. The storage writes nothing to the console.
  - `SyncedProcedureRegistry` takes the option `clock` for its auto-sync. Its status has the failures of the auto-sync and of the write-through writes, and `onStatus()` sends them.
  - `SqliteStorage` has `query()`, `patch()` and the option `queryPolicy`. A patch runs in one transaction.
  - `@procedures/store` depends on `@mark1russell7/service`, and `@procedures/collections` depends on `@procedures/client`.
- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- aa6e3aa: `ApiStorage` has `getIds()`. A full pull through it does not read each entry for the ids.
  
  - The collections have the procedure `collections.<name>.ids`. It gives the ids in the order of the entries, without the values. Its effects read the collection and write nothing. A storage without `getIds()` gives the ids of its entries.
  - The `CollectionStorage` of the core has the optional method `getIds()`, as the `CollectionStorage` of `@procedures/collections` has.
  - `ApiStorage.getIds()` uses the procedure `ids`. An older server without it answers `NOT_FOUND`. Then the storage reads the ids from the entries, and it does not ask for `ids` again.
  - `ApiStorageOptions.operations` takes `ids`, the name of the operation. The default is `ids`.

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
