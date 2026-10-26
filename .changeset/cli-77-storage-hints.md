---
"@procedures/mongo": patch
---

`watchStorageChanges()` publishes the change stream of a `MongoDocumentStorage` collection as collection hints, and `versionOfStored()` gives the version of a raw stored document (roadmap CLI-77).

PATCH: the change only adds exports and keeps each behavior. Before 1.0.0, a new feature raises the PATCH. The fixed group shares one version, so this rides the next release (0.35.0 when it is not out yet).

- `versionOfStored(doc, form?, partition?)` gives the version that `storage.versionOf(id)` gives for a stored document: `_seq` as text, `0` for a document without `_seq`, and `undefined` for a tombstone or a document without an id. `versionOf()` of the storage uses it.
- `watchStorageChanges(storage, publish, options?)` watches the change stream of the collection. It publishes each change on the topic of the collection procedures, `collectionChangeTopic(name, partition)`, with the partition from `storage.form.partitionOf()`. The event is a `CollectionChangeEvent` without `since` (a hint), with the id in `changed` or `deleted` and the version of the item in `versions`. A tombstone and a delete are deletes. It returns `{ ready, stop() }`.
- With `ownWrites: "skip"` (the default), the watcher skips the events of the writes of this process through the storage, because the collection procedures publish them already. Each write of the storage notes its sequence numbers while a watcher is open. `ownWrites: "publish"` publishes each change.
- After an error of the stream, the watcher opens it again after a backoff (`backoff`, on the injected `clock`), from the resume token of the last event. When the server does not know the token any more, or the collection was dropped, it publishes a hint without ids on each topic that it published on.
- `storageChangeOf(change, form?)` reads the change of an item from a change event, for an app that watches the collection itself.
