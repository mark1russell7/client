# @procedures/mongo

## 0.41.1

### Patch Changes

- Updated dependencies [69cee92]
  - @procedures/client@0.41.1
  - @procedures/collections@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [37deb07]
- Updated dependencies [fc52431]
  - @procedures/client@0.41.0
  - @procedures/collections@0.41.0

## 0.40.0

### Patch Changes

- @procedures/client@0.40.0
  - @procedures/collections@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [55d1e4d]
  - @procedures/client@0.39.0
  - @procedures/collections@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [c6fba49]
  - @procedures/client@0.38.0
  - @procedures/collections@0.38.0

## 0.37.0

### Minor Changes

- 1cb4ebf: `ViewMaterializer` writes the rows of a view as documents of a `MongoDocumentStorage` when the target is in `storageTargets` (roadmap CLI-81). Then `changes(since)` and `watchStorageChanges()` have each write of a run. For another target, the option `publish` gets one hint for each run.
  
  MINOR (pre-1.0): a run with a write conflict (code 112) tries again in place before it gives way. This is a changed default for each view. Before 1.0.0, a changed default raises the MINOR. The other parts are new optional options.
  
  - The new option `storageTargets` names the targets in a stored form, by the name of the target collection. Give a storage, a stored form, or `{ target, storagePartitionOf }` (the new types `ViewStorageTarget` and `ViewStorageTargetEntry`). A function `(collection) => entry | undefined` also works: the materializer uses it at each run, and keeps the storage that it made for the same form. The materializer writes with its own database. It takes the form, the counters, `writeLease` and `maxTombstones` of a storage.
  - The materializer encodes each row as a write of the storage does. A row gets `_key`, `_seq`, `_ord` and the partition fields of the form. It also gets `_kid`, `_kpf` or `_json`. The fields of a storage in a row of the result do not go into the target. Thus `_json` comes from the content of the row, and each row has its own `_key`, `_kpf` and `_ord`.
  - The id of a row is `storageRowIdOf(_id)` (new option). The default, the new export `defaultStorageRowId`, keeps a text as it is. It gives another value its relaxed Extended JSON text, for example `"null"` and `"5"`. Two rows of a result with the same id are an error of the view. A row also gets the partition field of the materializer, so a view that reads the target finds it.
  - A run compares each row with its stored document, without the numbers. A row that did not change writes nothing, and a tombstone is not written again.
  - A run takes pending numbers of the storage after its reads, writes with them in its transaction, and ends them after the commit. A late run moves to new numbers, so a reader of `changes(since)` misses no row. The transaction does not write the counters.
  - The numbers are not noted as writes of this process. Thus a watcher of the target with `ownWrites: "skip"` publishes a hint for each write of a run, and has no raw write to adopt.
  - A row that the result does not have becomes a tombstone, and the prune of the storage raises the floor of the change log. A document that tells no id becomes a tombstone without `_key`.
  - A run that writes more than `maxTransactionRows` rows writes in place in groups, under its lease. A run also writes in groups when the target has more than `maxTransactionRows` live rows at its start. Its rows have no generation, so `viewFilter()` and `MongoViewStorage` do not read them.
  - The new option `publish` gets the hints of the other targets. Each run that changes rows gives one hint, with the ids of its changed and removed rows. Some runs give a reset hint (`reset: true`): a new generation in groups, an id that is not a text, or more than 10000 ids. The new options `hintTopic` and `rowIdOf` give the topic (default `collectionChangeTopic(view._id)`) and the id of a stored `_id`.
  - **A storage target partition must hold only the rows of this one view.** The run makes a tombstone of each other live document in that partition. A second view of the same target collection and partition of the storage gets the state `errored`.
  - **A target collection gets no images before the change from the materializer.** Turn on `changeStreamPreAndPostImages` on it if raw hard deletes can occur.
  - A transaction with a write conflict (code 112) tries again two times after a short wait on the clock of the materializer. Then the run gives way, and the view runs again after `rewatch`.
  - Fix: the prune of the tombstones of `MongoDocumentStorage` raises the floor of the change log before it deletes the tombstones. Before, a reader far behind could read between the two steps and get a delta without the deletes.
  
  Migration:
  
  - No step for a target that is not in `storageTargets`.
  - The site, MiniMongo, Graph and jarvis need no step, unless one of them uses `ViewMaterializer` with a target in a stored form. Graph sets `storageTargets` at its step 8.
  - To move a target to a stored form, add it to `storageTargets` in each materializer of the views. The first pass writes each row as a document of the storage. A row of the older form with the partition of the storage becomes a tombstone. A reader then reads the target through a `MongoDocumentStorage` with the same form.

### Patch Changes

- 9659afd: The `ViewMaterializer` does not lose a change of a view document or of a source that comes at once after `start()`, or during the open of a stream (roadmap O63).
  
  PATCH: a fix, with no change to the API. Before 1.0.0, a fix raises the PATCH.
  
  - The cause: the driver sends the `aggregate` of a change stream only after `watch()` returns. `start()` read the views, and then started the stream of the views without a wait. A change of a view before the stream was open on the server did not reach the materializer.
  - `start()` now waits until the stream of the views is open on the server, and then reads the views. A change between the two reaches both.
  - A run of a view now starts after the streams of its sources are open on the server. A pass after a rewatch also waits for the new stream.
  - The changes of the set of views run one at a time, in the order of the stream. A change of a view during a resync applies after the read of the resync.
  - When a change of a view document replaces a view while its streams open, the run of the old view does not start.
- @procedures/client@0.37.0
  - @procedures/collections@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0
  - @procedures/collections@0.36.0

## 0.35.1

### Patch Changes

- 9f0405d: `watchStorageChanges()` publishes the change stream of a `MongoDocumentStorage` collection as collection hints, and `versionOfStored()` gives the version of a raw stored document (roadmap CLI-77).
  
  PATCH: the change only adds exports and new optional options, and keeps each behavior of 0.35.0 (the watcher is not released yet). Before 1.0.0, a new feature raises the PATCH. The fixed group shares one version, so this rides the next release (0.35.0 when it is not out yet).
  
  - `versionOfStored(doc, form?, partition?)` gives the version that `storage.versionOf(id)` gives for a stored document: `_seq` as text, `0` for a document without `_seq`, and `undefined` for a tombstone or a document without an id. It gives the value that `versionOf()` reads.
  - `watchStorageChanges(storage, publish, options?)` watches the change stream of the collection. It publishes each change on the topic of the collection procedures, `collectionChangeTopic(name, partition)`, with the partition from `storage.form.partitionOf()`. The event is a `CollectionChangeEvent` without `since` (a hint), with the id in `changed` or `deleted` and the version of the item in `versions`. A tombstone and a delete are deletes. It returns `{ ready, stop() }`.
  - With `ownWrites: "skip"` (the default), the watcher skips the events of the writes of this process through the storage, because the collection procedures publish them already. Each write of the storage notes its sequence numbers while a watcher is open. `ownWrites: "publish"` publishes each change.
  - With `rawWrites: "adopt"` (the default), the watcher gives a raw write a new `_seq` through the write path of the storage, so `changes(since)` has it. It reads from the event alone whether a write is raw. It gives back the storage fields and the partition fields that a raw replace took, and never changes a field of the item. The write matches only the state that the event saw, so one of two racing watchers wins and the other does nothing. The event of that write publishes the hint with the new version; a raw write does not carry its old version. The adoptions of a watcher wait in one bounded queue, one at a time, in batches that take one block of numbers. The watcher keeps the ids of the raw writes that do not fit in a full queue or whose last try failed (up to 10,000), and adopts them again when the queue is empty, with the documents then. A failure that can go away tries again after the backoff. A failed last try, a second failure, or an id over that limit gives the partition a reset hint. The adoption is exact only with `changeStreamPreAndPostImages`. With the images before the change (`changeStreamPreAndPostImages`), a raw delete becomes a tombstone; without them, it is a hint without a version. A prune of tombstones publishes nothing. `rawWrites: "ignore"` writes nothing and publishes a hint without a version. A read-only user gets the same hint, with one log.
  - With `sweep` (on by default with `rawWrites: "adopt"`), the watcher adopts each document without `_seq` after each gap, in pages of the index of `_id`. `sweepAtOpen: true` (off by default) also sweeps when the stream opens: the first watcher on a legacy collection adopts every legacy document, and the next delta of every subscriber is the whole collection. A document that the sweep cannot place goes to the log once, and the next sweeps leave it.
  - `ready` rejects when the first open fails with an error that does not go away (a single server, a refused access, a wrong option). The watcher asks the server with `hello` first, so on a single server `ready` rejects at once. The watcher tries again after other errors.
  - After an error of the stream, the watcher opens it again after a backoff (`backoff`, on the injected `clock`), from the resume token of the last event. When the server does not know the token any more, or the collection was dropped or renamed, it publishes a reset hint (no ids, `reset: true`) on the plain topic, on each partition of the counters, on each partition that it saw, and on each channel of the bus of the collection. The option `gapPartitions` adds more.
  - `@procedures/client`: `CollectionChangeEvent` has the new optional field `versions`, `[{ id, version }]`: the version of each changed item, as `versionOf(id)` of the storage gives it. A publisher that knows the versions sets it. The new optional field `reset`: `true` tells the subscriber to read the collection in full, with `changes` and no `since`. PATCH: new optional fields of an output type, and before 1.0.0 a new feature raises the PATCH.
  - `@procedures/store`: `EventsChangeFeed` reads `versions` and `reset` of an event, and `HybridStorage` does a full pull for a hint with `reset: true`. PATCH: a fix, so that a store does not miss the changes of a reset.
  - `storageChangeOf(change, form?)` reads the change of an item from a change event, for an app that watches the collection itself.
  - Fix: `ViewMaterializer` leaves `_seq` and `_tomb` of a source out of the content of a row, before the hash. A row is no write of a storage, so the watcher of the target does not read it as a raw write. The other fields of the source stay in the row.
- cc80f74: PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.
  
  - The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
  - The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
  - The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
- c9239a5: `MongoDocumentStorage` writes the floor document of its partition at its first write (roadmap O66). A gap of `watchStorageChanges()` then sends a reset hint to each partition with a write through a storage, also without a prune.
  
  PATCH: a fix, with no change to the API. Before 1.0.0, a fix raises the PATCH.
  
  - The floor document has the floor `0`: the change log reads a missing floor as `0` too, so no result of `getChangesSince` changes. The upsert writes only a new document, so the floor of a prune stays.
  - The upsert runs once for each storage, before its first write and outside each transaction. A failure does not fail the write: the next write tries again.
  - `gapPartitions` is necessary only for the partitions that only raw writes wrote.
- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1
  - @procedures/collections@0.35.1

## 0.35.0

### Minor Changes

- ab54137: `MongoDocumentStorage` can keep the stored form of an app (roadmap CLI-76), and `ViewMaterializer` leaves out the tombstones of its sources (roadmap CLI-79).
  
  MINOR: some default behaviors change. A source document with `_tomb: true` is no longer a row of a view. An item with a key with `$` or a dot below the top level is stored flat, not as JSON text. An item with a partition field of another value is refused. Before 1.0.0, a change of a default behavior raises the MINOR, and the fixed group shares one version.
  
  - The new option `form` takes a `StoredForm`: one object with `storedId(partition, id)`, `idOf(storedId, partition)`, `partitionFields(partition)` and `partitionOf(doc)`. `storage.form` gives it back. The stored `_id` can be a value that is not a text.
  - `partitionFields` gives the fields that name a partition. Each document of the partition has them, and they are the filter of the reads, the change log and the aggregations. A field with the value `undefined` is absent: the filter is `{ $exists: false }`.
  - `partitionOf(doc)` gives the partition of a stored document. A delete event has only `documentKey`, so with another `storedId`, the `_id` must tell the partition, or the collection needs `changeStreamPreAndPostImages`. The storage writes tombstones (replace events with the whole document), so the gap is only for a raw hard delete.
  - `DEFAULT_STORED_FORM` writes the documents of 0.34.0, byte for byte. A test pins this. Its `partitionOf` reads `_part`, else the part of `_id` before U+001F.
  - A source of the `ViewMaterializer` option `storageSources` is a function (the default form) or the new `ViewStorageSource` `{ form, viewPartitionOf }`. The materializer reads the partition of a change without a pre-image with `partitionOf`, from `fullDocument`, else `fullDocumentBeforeChange`, else `documentKey`.
  - The storage keeps its fields (`_key`, `_seq`, `_ord`, `_tomb`, `_kid`, `_kpf`, `_json`) in each form. `DOCUMENT_STORAGE_FIELDS` names them, and `TOMBSTONE_FIELD` names the field of a tombstone.
  - The new `decodeStoredDocument(doc, options)` reads a raw document as the storage reads it: `undefined` for a tombstone, `_json` parsed, the fields of the storage left out, and the id as `_id`.
  - Keys with `$` or dots below the top level, and a top-level key with a dot, stay as they are in the document (MongoDB 5.0 or later). `_json` stays for an item that is not a plain object, a top-level key of the storage or with `$`, a key `__proto__`, and a class instance other than `Date`. An object with a text `$ref` and an `$id` is refused with a `TypeError`: MongoDB gives it back as a `DBRef`.
  - An item can have a partition field with the value of its partition. The write leaves it out and notes it in `_kpf`, and the read gives it back. Another value is refused with a `TypeError`.
  - A document without the fields of the storage is an item. Its id comes from `idOf`, else `_key`. Its item gets the id as `_id`. Its partition fields follow the rule of a written document without `_kpf`: a field with the value of the partition stays out, and a field with another value stays in. So the item has the same form before and after its first write. Its version is `0`, and it comes before the other items, then by `_id`. Its first write through the storage gives it a version and keeps its place. A document whose id neither tells is not an item: the reads and `size()` leave it out.
  - The order of the entries is `_ord`, then `_id`, so the documents from outside the storage (all at the place 0) have a fixed order.
  - `selectorPrefilter(selector, options)` takes the new optional `storedId` and `storageFields`. With `storedId`, a condition on `_id` tests the stored `_id`, so `query()` uses the index of `_id`. A path with a part that starts with `$` does not go in the filter.
  - The docs tell three limits. Write through the storage: a raw write takes no number of the sequence, so a delta does not give it. A raw writer must not hard-delete an item while the storage writes it. On a single server, a precondition of a document without `_seq` does not see a writer outside the storage between the test and the write; a replica set is safe. With `db` and no `client`, a write uses the watermark, also on a replica set.
  - `ViewMaterializer` adds `_tomb: { $ne: true }` to the filter of the sources, so a deleted item of a `MongoDocumentStorage` is not in a view.
  
  Migration:
  
  - MiniMongo, Graph and jarvis: an item with a dotted key or a `$` key below the top level needs MongoDB 5.0 or later. On a 4.x server, the write of such an item fails, because 0.34.0 stored it in `_json` and 0.35.0 stores it flat. An item that is already in `_json` reads as before.
  - A view pipeline reads `"a.b"` as a nested path. A literal dotted key of an item is not reachable there without `$getField`.

### Patch Changes

- @procedures/client@0.35.0
  - @procedures/collections@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0
  - @procedures/collections@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0
  - @procedures/collections@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0
  - @procedures/collections@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0
  - @procedures/collections@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0
  - @procedures/collections@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0
  - @procedures/collections@0.29.0

## 0.28.1

### Patch Changes

- 345c740: Fixes of the low findings of the second code audit (roadmap O57).
  
  - A scoped pipeline: a first `$match` with `$text` takes the scope filter itself and stays the first stage.
  - A scoped `$search` keeps its stage options (`highlight`, `count`, `sort`, `returnStoredSource`, `scoreDetails` and others) out of the compound operator.
  - `MongoViewStorage.getBatch()` reads the view one time, so its ids and its filter are of one generation.
- Updated dependencies [345c740]
- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1
  - @procedures/collections@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0
  - @procedures/collections@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/collections@0.27.8
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7
  - @procedures/collections@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6
  - @procedures/collections@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5
  - @procedures/collections@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4
  - @procedures/collections@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3
  - @procedures/collections@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2
  - @procedures/collections@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1
  - @procedures/collections@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0
  - @procedures/collections@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2
  - @procedures/collections@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1
  - @procedures/collections@0.26.1

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
