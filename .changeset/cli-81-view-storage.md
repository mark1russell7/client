---
"@procedures/mongo": minor
---

`ViewMaterializer` writes the rows of a view as documents of a `MongoDocumentStorage` when the target is in `storageTargets` (roadmap CLI-81). Then `changes(since)` and `watchStorageChanges()` have each write of a run. For another target, the option `publish` gets one hint for each run.

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

Migration:

- No step for a target that is not in `storageTargets`.
- The site, MiniMongo, Graph and jarvis need no step, unless one of them uses `ViewMaterializer` with a target in a stored form. Graph sets `storageTargets` at its step 8.
- To move a target to a stored form, add it to `storageTargets` in each materializer of the views. The first pass writes each row as a document of the storage. A row of the older form with the partition of the storage becomes a tombstone. A reader then reads the target through a `MongoDocumentStorage` with the same form.
