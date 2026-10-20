# @procedures/mongo

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

- @procedures/client@0.17.4
  - @procedures/collections@0.17.4

## 0.17.3

### Patch Changes

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

- bce8f5c: New: `MongoViewStorage`, a read-only storage of one materialized view for the collection procedures (roadmap CLI-38). A `ViewMaterializer` writes a big rebuild as a new generation in groups, and then it changes the generation in the status of the view. During the rebuild, a plain query of the target reads the rows of two generations.
  
  Each read of `MongoViewStorage` finds the current generation of the view one time, and reads only its rows (`viewFilter`). Thus `get`, `getAll`, `find`, `changes` and the other reads of the procedures give one whole generation. The key of a row is its text `_id` in the result of the pipeline. Each write rejects with `FORBIDDEN`, because only the materializer writes a target. Collections that are not views keep their storages, and nothing changes for them.
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

- e192622: New `ViewMaterializer`: materialized views driven by change streams. A view is a document of a views collection, with a pipeline over source collections and a target collection, for one partition. The materializer computes each view again when its sources change, in the order of the dependencies. It keeps the status of each view (`ok`, `errored`, `cycle`).
  
  - The rows of a view are a generation, and the status names the current one. A reader filters with the new `viewFilter(view)`, so it reads one whole generation.
  - A run writes only the rows that changed, and removes the rows that the result does not have, in one transaction. A larger view (`maxTransactionRows`), or a failed transaction, writes a whole new generation in groups. The previous generation stays for `generationGrace`. A pass in groups holds a lease on its view (`passLease`), so two processes can keep the same views. The time options are durations of `@procedures/client`.
  - The stored `_id` of a row carries its partition and its generation: `{ partition, generation, id }` by default (`partitionTargetId`), or the form of the option `targetId`. Two partitions with the same keys share a target.
  - Targets from an older materializer, with the plain key as `_id`, need no migration step. The first pass of each view replaces the rows of its partition.
  - Each pipeline goes through `scopePipeline` by default. It reads only its partition, in its sources, and the current generation of a target.
  
  The code comes from the server of Graph (its split plan, part P4). The jobs of CI with a replica set start MongoDB with the test commands, for the failpoint tests.
- 054ba7d: `ViewMaterializer`: a change reaches only the views of its partition when the partition is known (roadmap CLI-37). The filter only removes work: a change whose partition is unknown reaches the views of each partition, as before.
  
  - A delete has no document in its change event. Its partition comes from the pre-image, when its collection has `changeStreamPreAndPostImages`.
  - The new option `storageSources` gives, for a collection of `MongoDocumentStorage`, the function from the storage partition (at the start of the id) to the partition of the views. `identityPartition` is for two partitions that are the same.
  - With pre-images, an update that moves a document to another partition also reaches the views of its old partition.
  - Without pre-images, a replace and an update of the partition field reach the views of each partition, as a delete does. The document can leave any partition.
  - With `sourceFields`, the keys of an update are paths with dots: a `$push` (`tags.3`), a `$set` of `a.b`, a removal or a truncated array. Each key counts at the field, under it or above it, and the positions in arrays do not count (`lines.0.price` is `lines.price`). An update of the partition field starts a pass too.
- @procedures/client@0.9.2
  - @procedures/collections@0.9.2

## 0.9.1

### Patch Changes

- d7ad24e: New `MongoDocumentStorage` (roadmap CLI-24): a `CollectionStorage` over MongoDB. It has flat documents, a change log with tombstones for an exact `getChangesSince()`, versions (`versionOf()`), queries in the database (`query()`), `patch()` and partitions (`forPartition()`).
  
  On a replica set, each write is a transaction with its numbers. On a single server, a watermark of the pending numbers keeps the log exact, and a late write moves its documents to new numbers. An id cannot have the character U+001F, and each write filter has the partition. It passes the `CollectionStorage` contract on MongoDB 7. `MongoStorage` keeps its `{ _id, data }` documents. CI has a MongoDB job, and the coverage job starts the storage tests on MongoDB.
- 28d82c9: The time options of the new storage APIs take a `Duration` of `@procedures/client`, as the other time options of the client do (roadmap R11). A plain number is a `TypeError`.
  
  - `MongoDocumentStorage`: the option `writeLease` (default `seconds(60)`) replaces `writeLeaseMs`.
  - `MongoDocumentStorage.aggregate()` and `PipelineLimits`: `maxTime` (default `seconds(10)`) replaces `maxTimeMS`. `DEFAULT_PIPELINE_LIMITS` has `maxTime`.
  
  These APIs are new in this release, so no released code changes. The procedure `mongo.documents.aggregate` keeps its input `maxTimeMS` in milliseconds: the wire keeps milliseconds.
- 3b2ddcd: New `scopePipeline()`: the guard of an aggregation pipeline over shared collections. The filter of the scope goes on each read of the pipeline and of its sub-pipelines. The pipeline reads and writes only the collections of the scope. Only the document stages of `ALLOWED_PIPELINE_STAGES` pass. `$out` and the JavaScript operators of the server are refused, and `$merge` needs a stamp. New `boundPipeline()`, `cutResults()` and `isTimeLimitError()` give the limits of time and size.
  
  New `MongoDocumentStorage.aggregate()`: a read-only pipeline on the items of the partition, with these limits. The code comes from the server of Graph (its split plan, part P3).
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/collections@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [0dd1c86]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/collections@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/collections@0.8.1

## 0.8.0

### Patch Changes

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

- bc74091: After `close()`, each operation of `SqliteStorage` and `MongoStorage` rejects with an error that says "closed", and a second `close()` does nothing. Before, `SqliteStorage.flush()` and an empty batch resolved after `close()`, and `MongoStorage` kept working.

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

- c799cdd: `HybridStorage` cannot lose data (roadmap R2). A sync gets the ids of the remote items from the new `getEntries()` of a storage (the collection procedure `collections.<name>.entries`), or else from `keyOf`. A remote item without a key stops the sync with `MissingKeysError` before any change: before, such a list emptied the local cache. A write-through that the remote cannot take waits in the queue and throws `PendingWriteError`, and a timer sends the queue. A write that the remote refuses is undone in the local cache. A full queue refuses a write with `QueueFullError`: before, it dropped the oldest operation. A second try of a write replaces its queued operation. A write-through sends the older queued operations first. The reads wait for the first sync.
- 3aa6495: Four procedures (roadmap R44). `mongo.documents.distinct` gives the distinct values of a field. `mongo.documents.bulk` sends `insertOne`, `updateOne`, `updateMany`, `deleteOne` and `deleteMany` operations in one request, in order by default. An empty filter of an update or a delete needs `confirm: true`. `mongo.documents.explain` gives the plan of a find or an aggregation, and refuses `$out` and `$merge`.
  
  `mongo.watch` gives the changes of a collection or a database as a stream without an end. The stream closes when the reader stops or the call aborts. A change stream needs a replica set. The type `BulkOperation` also has `BulkUpdateMany` and `BulkDeleteMany`.
- 89d8a4a: Three procedures only read now (CAP-1, CAP-2, CAP-3, roadmap R7), so a read-only session (`mark mcp --read-only`) serves them. `db.query` refuses a statement that changes data (`PRAGMA query_only`), and the file keeps its bytes. `mongo.documents.aggregate` refuses `$out` and `$merge`, also in the pipelines of `$facet`, `$lookup` and `$unionWith`. `logs.query` gives no entries for a missing file or table, and does not make them.

### Patch Changes

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
