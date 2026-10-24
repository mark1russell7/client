# @procedures/store

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/collections@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0
  - @procedures/collections@0.25.0

## 0.24.1

### Patch Changes

- ddf8328: Added: `TabGroup` does the sync of many collections with one lock and one channel (roadmap CLI-64). The option `snapshot` gives a new tab the entries of the leader (roadmap CLI-66). `TabCoordinator` does not change: its options, its messages and its lock stay the same.
  
  - `new TabGroup({ name, open })` holds one Web Lock and one `BroadcastChannel` for each name, for example for each tenant. `collection(name, options)` gives a `TabCollection`, with `observe()`, `onRole()`, `getStatus()`, `onStatus()`, `role` and `syncStorage`.
  - The leader of the group has one `HybridStorage` for each collection. Each message has the field `collection`. Each collection has its own batches, acknowledgements and status.
  - Each collection tells the other tabs when it leads. Thus a slow collection does not stop the batches of the other collections.
  - A collection whose setup fails tries again alone after its backoff (CLI-67), and the other collections keep their sync. The tab sends a status with the error to the other tabs (CLI-65).
  - When no collection of the group leads or loads its queue, the tab releases the lock, as a `TabCoordinator` does. This also applies to a collection that the application adds after the tab got the lock.
  - A `TabCoordinator` and a `TabGroup` do not see each other. When you move a collection to a `TabGroup`, give it a new queue store, or close the tabs of the older release first.
  - With the option `open`, the leader also makes a collection that only another tab opened.
  - The lock and the channel of a group have the prefix `@procedures/store/tabs:`, and those of a coordinator have `@procedures/store/tab:`. A group and a coordinator do not share a lock or a channel.
  - `snapshot: true` (only with `copy: "tab"`) lets a new tab ask the leader for the entries of its copy. The leader sends them in chunks of `snapshot.chunk` entries (500). Each chunk has the number of the last batch of each tab that the entries hold.
  - The new tab writes the entries first, and then only the batches after the snapshot. It keeps the values of its own writes. When the leader changes, it asks the new leader.
  - The snapshot can repeat a set that also comes in a later batch. The second write gives the same state. `snapshot.chunk` counts entries, not bytes.
  - When no chunk comes in `snapshot.timeout` (10 seconds), the tab gives an error to `onError` and continues without a snapshot. A leader of an older release does not answer.
  - In the tab that holds the lock, the wait renews itself while the collection loads its queue, at most 5 times.
  - The new message types `snapshot-request` and `snapshot` keep the version 1 of the messages. A tab of an older release ignores them.
- Updated dependencies [2735505]
  - @procedures/client@0.24.1
  - @procedures/collections@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0
  - @procedures/collections@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0
  - @procedures/collections@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/collections@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0
  - @procedures/collections@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0
  - @procedures/collections@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/collections@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/collections@0.19.0

## 0.18.1

### Patch Changes

- d2713c5: Changed: a `TabCoordinator` whose setup of the sync fails asks for the lock again after a backoff (roadmap CLI-67). Before, it released the lock and never asked again.
  
  - A tab becomes the leader only after its `HybridStorage` loaded the queue. Until then, the tab is a follower.
  - When `remote()` throws or the load of the queue fails, the tab gives the error to `onError` and releases the lock. Another tab can lead.
  - The tab stays a follower and asks again after the wait. `close()` stops the wait. In the single mode, the tab tries its setup again.
  - The new option `retry` sets the backoff: `delay` (1 second), `factor` (2), `maxDelay` (1 minute) and `jitter` (0.5). The options `clock` and `random` serve a test.
  
  Added: the status of the sync in each tab (roadmap CLI-65).
  
  - `TabCoordinator.getStatus()` gives the `SyncStatus` of the leader in each tab, or `undefined` before the first status.
  - `TabCoordinator.onStatus()` tells each new status to a listener, one time.
  - The leader sends each change of its status to the followers, and it answers the hello of a new tab with its status.
  - In a follower, `error.error` is an `Error` with the `name`, the `message` and the `code` of the error of the leader, because a message keeps only the values that a structured clone copies.
  - The new message type `status` keeps the version 1 of the messages. A tab of an older release ignores it and still copies the batches.
  
  PATCH: new methods, a new option with a default and a new message type that are backward compatible, before 1.0.0 (decision D13).
- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1
  - @procedures/collections@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/collections@0.18.0

## 0.17.4

### Patch Changes

- b0ccc96: Added: `TabCoordinator`, so one leader tab of a browser does the sync of a `HybridStorage`, and the other tabs copy its changes (roadmap CLI-25). It is in `@procedures/store/browser` and in the package root.
  
  - The election uses the Web Locks API. When the leader closes, or the browser closes its tab, the next tab becomes the leader.
  - Only the leader makes the `HybridStorage`, with `capture: "observe"`. The followers make no remote call and start no timer.
  - The tabs send the change batches of their local copies on a `BroadcastChannel`. `observe()` gives each batch of each tab one time, with its origin. A tab does not send again a batch that it got.
  - The leader captures the batches of the followers, and its queue store keeps them. Only the leader writes to the shared queue store.
  - A follower keeps each own batch until the leader acknowledges it. A new leader gets the batches that no leader acknowledged.
  - The option `copy` is `"shared"` for one durable local copy of all tabs, or `"tab"` for a local copy in each tab, for example a SignalDB collection.
  - Without the Web Locks API or `BroadcastChannel`, the tab does its own sync in the single mode.
  
  Added: `HybridStorage.whenQueued()`. It resolves when the queue store holds the queue, and it sends nothing.
  
  PATCH: new exports and a new method that are backward compatible, before 1.0.0.
- @procedures/client@0.17.4
  - @procedures/collections@0.17.4

## 0.17.3

### Patch Changes

- d552672: Added: `IndexedDbStorage`, a collection storage in the IndexedDB of a browser (roadmap CLI-22). It is in `@procedures/store/indexeddb` and `@procedures/store/browser`. It is the durable local copy of a `HybridStorage` in a browser app without SignalDB.
  
  - Each collection has its own database. The items, their order and the versions of `getChangesSince()` stay after a reload of the page.
  - The entries keep the order of the first set of each id, as a `Map` does.
  - Each write is one transaction of IndexedDB. A batch that fails changes nothing, and two patches at the same time keep each field.
  - The storage has `getEntries()`, `getIds()`, `getChangesSince()`, `query()`, `observe()` and `patch()`. With the option `versionOf`, a write can expect the version of the current item.
  - The storage checks each record that it reads. The contract suite of `@procedures/collections/testing` tests it.
  - The entry `@procedures/store/indexeddb` still does not import the root of the client or zod.
  
  PATCH: a new export that is backward compatible, before 1.0.0.
- @procedures/client@0.17.3
  - @procedures/collections@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2
  - @procedures/collections@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1
  - @procedures/collections@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0
  - @procedures/collections@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/collections@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/collections@0.15.1

## 0.15.0

### Minor Changes

- c7198ca: Breaking (roadmap CLI-16, decision D11): the collection writes take an optional expected version. This is its own MINOR of the client group (D13).
  
  New:
  
  - `collections.<name>.set` and `delete` take `expectedVersion`, and each item of `setBatch` takes `expectedVersion`. The value is the version of the current item that the write expects. `null` expects no item.
  - A conflict changes nothing. The call fails with the new protocol code `VERSION_CONFLICT` (HTTP 409, not retryable). The metadata key `conflicts` (and the field `conflicts` of the HTTP body) has the current item and its version for each id.
  - `StorageItemWriteOptions.expectedVersion` (`set`, `delete`) and `StorageBatchWriteOptions.expectedVersions` (`setBatch`) in both copies of `CollectionStorage`. `VersionConflictError`, `versionConflictsOf()` and the other helpers come from `@procedures/client/query`, `@procedures/client` and `@procedures/collections`.
  - The option `versionOf` of `InMemoryStorage`, `SqliteStorage` and `MongoDocumentStorage` gives the version of an item. The test and the write are one step: synchronous in memory, one transaction in SQLite, the transaction or a compare-and-set on `_seq` in MongoDB. `MongoStorage` refuses a precondition.
  - `ApiStorage` sends the expected versions to the collection procedures, and gives a `VERSION_CONFLICT` back as a `VersionConflictError`.
  - `HybridStorage` sends the base version of each queued write as its expected version. A conflict of the remote goes to `conflictResolution`, as a conflict of a pull. The new option `sendBaseVersions: false` stops it.
  - `ClientError.metadata` gives the metadata of the error response.
  - The contract suite `@procedures/collections/testing` has the cases of the preconditions, and the option `createWithVersions`.
  
  The changes of behavior:
  
  - A storage must test a precondition, or refuse the write. A storage without `versionOf` refuses a write with an expected version with a `TypeError` whose code is `PRECONDITION_NOT_SUPPORTED`. The contract suite tests it for each storage.
  - A `HybridStorage` with `versionOf` now sends the base version of each queued write. A queued write over a change of another writer got through before. Now the remote refuses it with `VERSION_CONFLICT`, and `conflictResolution` decides: `remote` drops the queued write, `merge` sends the merged item, `local` sends the write again over the current version, and `error` throws `ConflictError` and keeps the queue. The remote must test the precondition: a server storage without `versionOf` refuses each push.
  - `ApiStorage`: a write without an expected version writes as before, and gets no `VERSION_CONFLICT`. Only a caller that gives an expected version, or a `HybridStorage` with `versionOf` over it, can get one.
  - `HybridStorage` with `versionOf`: a queued write that won before can now get the conflict path. The opt-out is `new HybridStorage(remote, { versionOf, sendBaseVersions: false })`: the push sends no expected version, and the last write wins, as before. The default is the new behavior.
  - A write without an expected version writes as before: the last write wins.
  
  Migration:
  
  - **Site.** No change. The site does not write collections.
  - **MiniMongo.** No change for a storage or a `HybridStorage` without `versionOf`. A `HybridStorage` with `versionOf` over `ApiStorage` needs a server storage with the same `versionOf` (for example `new InMemoryStorage({ versionOf })`), or the option `sendBaseVersions: false`.
  - **Graph.** Graph keeps last-write-wins first (D11): it gives no expected version, so nothing changes. `GraphDocsStorage` must refuse a write with an expected version until it tests one. Add the guard to its `set`, `delete` and `setBatch`, and run the contract suite: its first case tests the refusal. To adopt the version later, stamp a version field on the server, give the storage a `versionOf` that tests it in the write, and give the same `versionOf` to the `HybridStorage` of the client. Then add `createWithVersions` to the contract run.
  - **jarvis.** No change: jarvis gives no expected version. A storage of jarvis that implements `CollectionStorage` must refuse a write with an expected version, as for Graph.
  - **Other storages.** Each class that implements `CollectionStorage` reads the new options of `set`, `delete` and `setBatch`. It tests them in the write, or it rejects the write with `preconditionNotSupported()`. It never ignores them.

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/collections@0.15.0

## 0.14.1

### Patch Changes

- fc968f6: Fixed: `@procedures/geo`, `@procedures/ics` and `@procedures/splay` import `@procedures/client/browser`, not the root of `@procedures/client` (CLI-39). The root also exports `HttpServerTransport`, which imports `http`. Thus a browser build with Vite found `http` and gave a warning. The exports of the packages do not change.
  
  New: each package that operates in a browser names its browser entries in the field `client.browser` of its `package.json`. A CI check bundles each of these entries for a browser with esbuild. The check fails when an import reaches a Node built-in, with or without the prefix `node:`. The root of `@procedures/client` joins the check after CLI-6. `@procedures/splay` joins it when `splay.bridge.info` reads its version without `node:fs/promises`.
- 26a145d: The new entry `@procedures/store/browser` has the parts of the store that run in a browser (roadmap CLI-19). It exports `HybridStorage` with its errors, `ApiStorage`, `EventsChangeFeed` and all of `@procedures/store/indexeddb`. No module of the entry imports a module of Node. The entry does not have `FileProgramStore` or `FileQueueStore`, because they use `node:fs`.
  
  `HybridStorage`, `ApiStorage` and `EventsChangeFeed` import `@procedures/client/browser` and not the root of the client, because the root imports `http` and `ws`. The classes are the same as the classes of the root. PATCH: the change adds an entry, and nothing changes for the existing imports.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1
  - @procedures/collections@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/collections@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
- Updated dependencies [50d4818]
  - @procedures/client@0.13.2
  - @procedures/collections@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1
  - @procedures/collections@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/collections@0.13.0

## 0.12.2

### Patch Changes

- Updated dependencies [b6782c0]
  - @procedures/collections@0.12.2
  - @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
  - @procedures/collections@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0
  - @procedures/collections@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0
  - @procedures/collections@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/collections@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/collections@0.9.2

## 0.9.1

### Patch Changes

- b5db4d8: The other procedures that reach files declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33, tracker item O36). Without a root, nothing changes. PATCH: each procedure was refused under a root before, and now it is confined, or it is refused with a reason.
  
  - Confined: `s3.download` (`destPath`), `s3.presign` (no path input), `exif.read` (`path`), `privacyScan.files` (`paths`, `termsFile`, `allowFile`), `claude.read` and `claude.follow` (`outputFile`), and `manifest.generate` (`outputDir`).
  - Confined with no path input, because the store of the host holds the data: `schedule.add`, `schedule.list`, `schedule.remove`, `procedure.store`, `procedure.load` and `procedure.sync`.
  - Confined: each `gh.*` procedure starts gh in a working folder of the root, and the `dir` of `gh.run.download` is in the root. Its nested `shell.run` now runs under a root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`.
  - Refused, with the reason in the rules: `snapshot.create`, `snapshot.restore`, `snapshot.diff`, `iosBackup.*`, `claude.start`, `server.start`, `server.stop` and `server.status`.
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/collections@0.9.1

## 0.9.0

### Patch Changes

- dca28c1: The packages accept `@mark1russell7/service` 0.5.1 and later 0.5 versions, and `@procedures/client` accepts `@mark1russell7/algebra` 0.7.1. Before, the range `^0.4.1` stopped below 0.5. An application on service 0.5 then got a second copy of service inside the client.
  
  - The client uses only the `/backoff`, `/heartbeat` and `/testing` entries of service. The code of `/backoff`, `/heartbeat` and the clock is the same in 0.4.1 and 0.5.1. `/testing` only gets new exports.
  - The public API of the client does not change.
- Updated dependencies [8bb469c]
- Updated dependencies [0dd1c86]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/collections@0.9.0

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
- c559b00: `HybridStorage` captures the writes of the application to its local copy, keeps its sync state after a reload and takes a push feed of the remote changes. Each write of the core collection procedures publishes a change event (server stack CLI-21, CLI-15, decision D9).
  
  - `HybridStorage.observe(observer)` gives one batch of changes for each change of the storage. A write of the storage gives its batch with the origin of its options. A pull and a delta of the feed give their changes with the origin of the option `syncOrigin` (`"sync"` by default). In `remote-only` mode, the batches tell the writes of the storage to the remote.
  - The option `origin` of `HybridStorage` is the tag of the storage (a random `hybrid-…` tag by default). Each write of the storage to the local copy and to the remote has it. The write methods of `HybridStorage` and `ApiStorage` take `{ origin }`.
  - `capture: "observe"`: the storage observes the local copy and queues each change with another origin. Thus an application can write to the local copy directly, for example with the synchronous writes of a SignalDB collection. In `write-through` and `remote-only` mode, the storage sends a captured change at once.
  - The option `syncState` takes a `SyncStateStore`: `MemorySyncStateStore`, or `IndexedDbSyncStateStore` of `@procedures/store/indexeddb`. The store keeps the cursor and the base versions. A new storage with the same store and a durable local copy asks only for the changes since the cursor, and it finds the conflicts of the base versions. A failure of the store goes to the status (`operation: "store"`, `SyncStateError`), and the storage goes on.
  - The option `feed` takes a `RemoteChangeFeed`. A delta whose `since` is the cursor applies without a read of the remote. A gap, a lost event, a new subscription or another delta makes one pull. A delta that comes during a pull applies after the pull, so the pull does not erase it (the LiveLog rule of Graph).
  - In `write-through` mode, a pull or a delta does not write over an own write that waits for the remote, a set or a delete. The storage keeps the remote value of the id, and after the write it reads the id again: then the rules of a pull decide. A read of a missing id does not bring back an item whose own delete waits.
  - With `versionOf`, the storage keeps the versions of its own writes until their echoes come (option `echoWindow`, 30 seconds by default). The echo of an older own write does not write over a newer local write (the EchoLedger rule of Graph).
  - `EventsChangeFeed` of `@procedures/store` is the feed of the change events. Its source is a `Client`, a `WebSocketTransport` or another transport. It treats the events as hints: a gap of the numbers, a lost event, a hint and each confirmation of the subscription call `onGap()`.
  - The core collection procedures publish `CollectionChangeEvent` `{ since, version, changed, deleted, origin }` on `ctx.bus`, under the topic `collections.<name>` (`collectionChangeTopic()`), while a subscriber listens. The changes come from `getChangesSince()` of the storage, and the events of one storage make a chain of versions. The option `changeEvents` of `createCollectionProcedures()` turns them off, or gives the topic of each call: the partition of CLI-17 goes there.
  - A value reaches a subscriber only through the checks of a read. By default, an event has the ids and the versions only, and `EventsChangeFeed` gives it to `onHint()`: `HybridStorage` reads the values with `changes`, and a hint with only deletes applies without a read. With `changeEvents: { values: true }`, an event also has `values`: each row `{ id, value }` passes the output filter of the host (`admitItem`) for each subscriber, and a refused id goes in `withheld`, so the storage pulls it.
  - `EventPublisher` refuses a topic whose reads the capability of the call does not permit (`FORBIDDEN`, `effects-exceeded`). Its new option `reads` gives the reads of a topic. The default, `collectionTopicReads()`, gives `collection:<name>` for `collections.<name>` and `collections.<name>.<partition>`. `ctx.admit` gives a procedure the output filter of its host for the data that it sends later.
  - The syncs of one `HybridStorage` run one at a time: the deltas and the hints of the feed, the pulls, the pushes, the reads after an own write and the mode switches. A remote delta and a full sync never run at the same time (Graph R18).
  - The write inputs of the collection procedures take an optional `origin` (1 to 256 characters). The procedure gives it to the storage and to the event. A server before this change ignores the field.
  - `Client.subscribe()` and `Client.events()` subscribe to the topics of the bus of the server through the middleware and the context of the client. A subscription has no deadline: the timeouts of the client do not apply to it, and only `metadata: { timeout }` in its options gives one.
  - New exports: `collectionChangeTopic`, `CollectionChangeEvent` and `CollectionChangeEventsOptions` from `@procedures/client`, `./browser` and `./procedures`. `EventsChangeFeed`, `MemorySyncStateStore`, `SyncStateError` and the types `RemoteChangeFeed`, `RemoteChangeListener`, `RemoteChanges`, `EventSubscriber`, `ChangeEventSource`, `EventsChangeFeedOptions`, `SyncState`, `SyncStateChange` and `SyncStateStore` from `@procedures/store`. `IndexedDbSyncStateStore` and `MemorySyncStateStore` from `@procedures/store/indexeddb`.
- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/collections@0.8.1

## 0.8.0

### Patch Changes

- aa6e3aa: `ApiStorage` has `getIds()`. A full pull through it does not read each entry for the ids.
  
  - The collections have the procedure `collections.<name>.ids`. It gives the ids in the order of the entries, without the values. Its effects read the collection and write nothing. A storage without `getIds()` gives the ids of its entries.
  - The `CollectionStorage` of the core has the optional method `getIds()`, as the `CollectionStorage` of `@procedures/collections` has.
  - `ApiStorage.getIds()` uses the procedure `ids`. An older server without it answers `NOT_FOUND`. Then the storage reads the ids from the entries, and it does not ask for `ids` again.
  - `ApiStorageOptions.operations` takes `ids`, the name of the operation. The default is `ids`.
- 9380ba0: `FileQueueStore.load` names the right line in its "not JSON (line N)" error when blank lines come before the bad line. Before, it counted the lines after it had removed the blank ones.
- 276b93c: A pull of `HybridStorage` reads a local item only when the result depends on it. Before, the pull read each local item. The results do not change.
  
  - A pull does not read the item of a queued write that wins: without versions, or when the remote version did not change after the last sync.
  - With `versionOf`, the storage keeps the version of each local item that it wrote or read. A pull then reads a local item only for a conflict, or when it does not know the version. A full pull of a collection without a change reads no local item.
  - Without versions, a pull reads each local item without a queued write. It compares the JSON of the two items, as before.
  - Only the storage writes to its local copy: with `versionOf`, a pull does not see a write from outside.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/collections@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [5837c2d]
- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/collections@0.7.0
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/collections@0.6.0

## 0.5.0

### Minor Changes

- 89481b0: A full pull of `HybridStorage` reads the local ids with `getIds()` of the local copy. Before, it read each local entry only for the ids, and `InMemoryStorage` copied each value (`structuredClone`) for it. A local copy without `getIds()` gives its entries, as before.
  
  - `HybridStorage.getIds()` gives the ids of the local copy, or of the remote in `remote-only` mode.
  - A new nightly benchmark measures a full pull of 1,000 items with and without `getIds()`. In one CI run, the mean time went from 15.3 ms to 10.7 ms.
- bc74091: `ApiStorage` and `HybridStorage` agree with the contract of `CollectionStorage`:
  
  - `ApiStorage.get()` asks the procedure `collections.<name>.get` for `{ found, value }`. A stored `null` reads back as `null`. Before, it read back as `undefined`. A custom `service` or `get` operation gets the input `{ id }`, as before.
  - `HybridStorage` takes a copy of each written value for the local copy, the queue and the remote. Before, a change of a value after a `set()` in the mode `write-back` changed the queued write.
  - After `close()`, each operation of `ApiStorage` and `HybridStorage` rejects with an error that says "closed", and a second `close()` does nothing. `HybridStorage.close()` waits for the operations, the mode switch and the syncs that run. A `close()` before the first sync makes no remote call.
  - After `close()`, `SyncedProcedureRegistry.register()` and `unregister()` change only the registry in memory, and a second `close()` does nothing. `close()` waits for the auto-sync that runs.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
- Updated dependencies [bc74091]
- Updated dependencies [89481b0]
  - @procedures/client@0.5.0
  - @procedures/collections@0.5.0

## 0.4.0

### Patch Changes

- 0abf2ec: The new test-only entry `@procedures/collections/testing` holds one contract suite for `CollectionStorage`: `describeCollectionStorageContract(name, { create, createWithMaxTombstones, copies, nullValues }, { describe, it })`. It tests the reads, the writes, the batches, the order of the entries, the JSON values, `getChangesSince` and its versions, `flush`, `getMetadata`, `close` and the errors. A random sequence of writes runs against a `Map`. The suite imports no test framework, so the runtime entries never load vitest. `InMemoryStorage`, `SqliteStorage`, `ApiStorage` and `HybridStorage` run it.
  
  The suite found two differences, and the contract fixes them:
  
  - An error of a `find` predicate of `InMemoryStorage` threw at once. Each method of a storage gives a promise, so each method of `InMemoryStorage` is now `async`, and an error is a rejected promise.
  - `getMetadata().size` of `HybridStorage` was the size of the local copy, which `remote-only` keeps empty. It is now the result of `size()`. The new `stats.localSize` gives the size of the local copy.
- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [0abf2ec]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/collections@0.4.0

## 0.3.0

### Minor Changes

- 7873940: The collection mode switch (roadmap R28). `HybridStorage` has four modes: `local-only` (no remote call, each write waits in the queue), `write-through`, `write-back` and `remote-only` (no local copy). The option `mode` gives the first mode, and `writeStrategy` stays as a deprecated name of it. `setMode()` changes the mode while the storage operates. The switch waits for the operations that run, sends the queue to the remote first, and syncs the local copy when it leaves `local-only` or `remote-only`. A switch to `remote-only` drops the local copy only after the flush. When the remote fails, the mode stays and `setMode()` throws `ModeSwitchError`. A switch to `local-only` makes no remote call.
  
  The queue is durable: the option `queueStore` takes a `QueueStore` (`load`, `append`, `replace`, `clear`). `MemoryQueueStore` is the default, and `FileQueueStore` of the new entry `@procedures/store/file-queue` keeps the queue in a JSON Lines file. A write ends only after the store kept it (`QueueStoreError` when it cannot). A new storage with the same store loads the queue, shows its writes and sends them. The modes `write-back` and `local-only` always use the queue: before, `write-back` with `offlineQueue: false` never sent a write.
  
  A sync asks for the changes since the version of the last sync. Storages get the optional `getChangesSince(version)` (`InMemoryStorage` keeps a change log with tombstones, `ApiStorage` calls the new collection procedure `collections.<name>.changes`), and a remote without it gives all its entries. The option `versionOf` gives the version of an item: with versions, a conflict is a queued local write of an id whose remote version changed, and `conflictResolution` decides (`error` throws `ConflictError`). The option `pullInterval` starts a periodic pull. Storages get the optional `flush()`, and `ProcedureServer.useStorage(name, storage, { drain, close })` flushes the old storage before the change. `createSyncedRegistry({ type: "hybrid", mode })` takes the mode, and the synced registry has `setMode()` and `getMode()`.
- c799cdd: `HybridStorage` cannot lose data (roadmap R2). A sync gets the ids of the remote items from the new `getEntries()` of a storage (the collection procedure `collections.<name>.entries`), or else from `keyOf`. A remote item without a key stops the sync with `MissingKeysError` before any change: before, such a list emptied the local cache. A write-through that the remote cannot take waits in the queue and throws `PendingWriteError`, and a timer sends the queue. A write that the remote refuses is undone in the local cache. A full queue refuses a write with `QueueFullError`: before, it dropped the oldest operation. A second try of a write replaces its queued operation. A write-through sends the older queued operations first. The reads wait for the first sync.
- 4ef0d44: The new entry `@procedures/store/indexeddb` has the stores of a browser (roadmap R45). `IndexedDbProgramStore` keeps programs in IndexedDB, and it follows the contract of the other program stores. `IndexedDbQueueStore` keeps the queue of a `HybridStorage` in IndexedDB (the open point of R28). `hasIndexedDb()` tells if the browser has IndexedDB, and the entry also exports `MemoryProgramStore` and `MemoryQueueStore` as fallbacks. The entry does not import the client or zod, and the package root does not import it.
  
  `HybridStorage` has the new option `local`: the storage of the local copy (the type `LocalCopyStorage`). The default is a new `InMemoryStorage`, as before. A durable local copy, for example `SqliteStorage` of `@procedures/sqlite`, keeps the items after a restart. Then a new storage in `local-only` mode reads the items of the last run (the open point "the local copy is not durable" of R28). `close()` now closes the local copy too. A local copy that cannot take the loaded queue makes the storage refuse each operation, as a queue store that cannot load does.
- fb30718: Typed durations (roadmap R11). This change breaks the API. Each public option that is a time takes a `Duration` of `@mark1russell7/quantity`, made with `ms()`, `seconds()`, `minutes()` or `hours()` of `@procedures/client`. A plain number is a type error, and at run time the option throws a `TypeError` that names it. This covers the timeouts and `resilience()`, the retry delays, the cache, the circuit breaker, the rate limit, the HTTP, WebSocket and mock transports, the WebSocket server heartbeat, `timeoutInterceptor({ limit })` (was `ms`), `hostPolicy({ timeout })` (was `timeoutMs`), the idempotency cache (`ttl`, was `ttlMs`), `ApiStorage`, `HybridStorage`, the synced registry and `connect()` of the peer. The per-call overrides in a context (`timeout`, `retry.delay`, `cache.ttl`) and the `route()` overrides (`timeout.overall`, was `timeout.ms`) take durations too. The wire and the inputs of procedures keep milliseconds.
  
  Migration: `createOverallTimeoutMiddleware({ overall: 5000 })` becomes `createOverallTimeoutMiddleware({ overall: seconds(5) })`.

### Patch Changes

- 43f7de5: Retry and the circuit breaker (roadmap R12). The retry middleware has a retry budget (`budget`, default: 0.2 of the calls and at least 10 retries a second), so a failing service gets a fraction more requests and not `maxRetries` times more. The delay has full jitter by default (`jitter: 1`: a random time from 0 to the backoff, before ±10 percent). A server that asks for a wait gets it: `retryAfterMs` of a thrown error becomes the `Retry-After` header and the `retry-after` metadata, and the retry waits at least that long. `maxAttempts` in a context counts the tries, as its name says (before, it counted the retries). The circuit breaker counts only the failures of availability (`isAvailabilityFailure`: UNAVAILABLE, TIMEOUT, a stopped server, a gateway error, network errors): an abort or a validation error no longer opens it. Its windows use a monotonic clock. `ApiStorage` asks a retry middleware of its client for one try, so the two loops cannot multiply.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/collections@0.3.0

## 0.2.3

### Patch Changes

- 15e48cf: Three fixes of the architecture review (2026-10-16). A `timeoutMs` that is not a finite number of zero or more asks for nothing: before, `NaN` removed the deadline. A procedure of `procedure.define` declares no effects of its own, so a read-only capability runs it and examines each nested call. `mcp.list-tools`, `mcp.serve`, `_discovery.announce`, `manifest.generate`, `server.create`, `procedure.export` and `lib.audit` read the registry of the call, not the global registry. `getProcedureInfos` and `watchProcedures` take a registry.
- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/collections@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/collections@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/collections@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/collections@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

- The program store: `ProgramStore`, `MemoryProgramStore`, `FileProgramStore`, `CollectionProgramStore`, `attachProgramStore()`.
- `procedure.store`, `load` and `sync` work on the program store. A stored program loads back as a runtime-defined procedure.
- The storage layer moved here from `@procedures/client`: `ApiStorage`, `HybridStorage`, the synced registry, the serialization, the dynamic handler loader and `procedure.register`.
