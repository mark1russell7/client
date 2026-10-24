# @procedures/signaldb

[![npm](https://img.shields.io/npm/v/@procedures/signaldb?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/signaldb)

`SignalDbStorage` is a `CollectionStorage` over the [SignalDB](https://signaldb.js.org) collection of an app (roadmap CLI-23). The collection is then the local copy of a `HybridStorage`. The app keeps its cursors, its selectors and its reactivity, and the `HybridStorage` does the sync.

```sh
npm install @procedures/signaldb @procedures/store @signaldb/core
```

The package has classes and no procedures. An import of the package registers nothing.

## Example

```ts
import { Collection } from "@signaldb/core";
import createIndexedDBAdapter from "@signaldb/indexeddb";
import { ApiStorage, HybridStorage, IndexedDbQueueStore, IndexedDbSyncStateStore } from "@procedures/store/browser";
import { SignalDbStorage } from "@procedures/signaldb";

// The app owns the collection and its persistence
const todos = new Collection<Todo>({ persistence: createIndexedDBAdapter("todos") });

const storage = new HybridStorage<Todo>(new ApiStorage(client, { collection: "todos" }), {
  mode: "write-back",
  local: new SignalDbStorage<Todo>(todos),
  capture: "observe",
  queueStore: new IndexedDbQueueStore("todos-queue"),
  syncState: new IndexedDbSyncStateStore("todos-sync"),
});

// A write of the app on the collection goes into the queue, and the sync sends it
todos.insert({ id: "t1", title: "Write the docs" });

// A cursor of the app sees the changes that the sync writes
todos.find({ done: false }).fetch();
```

## How the storage operates

- The app owns the collection. `close()` stops the storage, and the collection stays open with its items.
- Each operation waits for the load of the persistence of the collection (`isReady()`). After a failed load, the collection operates in memory, and the storage also operates.
- Each write of SignalDB is synchronous. The storage reads, tests and writes in one step, so a `patch()` and an expected version are atomic.
- A write of several items is one `batch()` of the collection. The validators of the collection examine each item first, so a refused item changes nothing.
- Each write takes a copy of its value, and each read gives a new copy.
- The entries keep the order of the collection: the order of the first set of each id.

## The items of the collection

A codec changes a value to an item of the collection and back. The default codec is `documentCodec()`:

| Value | Item in the collection |
| --- | --- |
| A plain object whose `id` is the key, for example `{ id: "t1", title: "Write" }` | The object itself |
| Each other value: an object without that `id`, an array, `null`, a text, a number or a boolean | An envelope: `{ id, __value: value }` |

- The field `__value` is reserved. `documentCodec("other")` gives an envelope with another field.
- An app whose items have another form gives its own codec with the option `codec`.
- `toItem(id, value)` must give a plain object whose `id` is the key. Another result rejects the write with a `TypeError`.
- Each id is a text. An item of the collection whose `id` is not a text is an error of the read.
- The collection must not have a `transform`. The storage reads the items through cursors.

```ts
// An app that keeps the Mongo key `_id` of a document in the field `id` of the item
const codec: SignalDbItemCodec<Doc> = {
  toItem: (id, { _id, ...fields }) => ({ ...fields, id }),
  fromItem: ({ id, ...fields }) => ({ _id: id, ...fields }),
};
const storage = new SignalDbStorage<Doc>(collection, { codec });
```

## The changes: `observe()`

`observe()` tells two kinds of changes:

| Change | Batch |
| --- | --- |
| A write of the storage | One batch for each write, with the `origin` of the write, before the write resolves |
| A change that the app makes directly on the collection: `insert`, `updateOne`, `replaceOne`, `removeOne` and the others | One batch for each change, with no origin, at once |

- A `HybridStorage` with `capture: "observe"` puts the changes of the app into its queue.
- The writes of the `HybridStorage` have its origin, so the capture does not send them back to the remote.
- The storage listens to the collection only while an observer is there.
- A load of the persistence changes the items without the events of a change. `observe()` does not tell it.
- An item of a change that the storage cannot read goes to the option `onObserverError`. The write of the app does not fail.

## Queries and versions

- `query()` applies the selector of `@procedures/client/query` to the values, with `queryEntries()`. It does not give the selector to SignalDB.
- SignalDB runs Mongo selectors on the items with `mingo`. The contract needs the query language of the client on the values, so the storage does not translate a selector.
- The cursors of the app keep the selectors of SignalDB and the indexes of the collection.
- With the option `versionOf`, a write can expect the version of the current item. Give the `versionOf` of the `HybridStorage` to the local copy.
- The option `queryPolicy` is the query policy of a call without a policy.

## What the storage does not have

- `getChangesSince()`: the storage keeps no change log. The `HybridStorage` asks its remote for the changes.
- `getIds()`: a cursor of SignalDB copies each item, so the ids cost as much as the entries.

## Tests

The contract suite of `@procedures/collections/testing` tests the storage, and a `HybridStorage` with the storage as its local copy. More tests examine the capture of the writes of the app and the pulls that the capture does not send back. Other tests examine the live cursors, the persistence, the validators and the close.
