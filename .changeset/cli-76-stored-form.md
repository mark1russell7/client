---
"@procedures/mongo": minor
---

`MongoDocumentStorage` can keep the stored form of an app (roadmap CLI-76), and `ViewMaterializer` leaves out the tombstones of its sources (roadmap CLI-79).

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
- A document without the fields of the storage is an item. Its id comes from `idOf`, else `_key`. Its item gets the id as `_id` and keeps its partition fields. Its version is `0`, and it comes before the other items, then by `_id`. Its first write through the storage gives it a version and keeps its place. A document whose id neither tells is not an item: the reads and `size()` leave it out.
- The order of the entries is `_ord`, then `_id`, so the documents from outside the storage (all at the place 0) have a fixed order.
- `selectorPrefilter(selector, options)` takes the new optional `storedId` and `storageFields`. With `storedId`, a condition on `_id` tests the stored `_id`, so `query()` uses the index of `_id`. A path with a part that starts with `$` does not go in the filter.
- The docs tell three limits. Write through the storage: a raw write takes no number of the sequence, so a delta does not give it. A raw writer must not hard-delete an item while the storage writes it. On a single server, a precondition of a document without `_seq` does not see a writer outside the storage between the test and the write; a replica set is safe. With `db` and no `client`, a write uses the watermark, also on a replica set.
- `ViewMaterializer` adds `_tomb: { $ne: true }` to the filter of the sources, so a deleted item of a `MongoDocumentStorage` is not in a view.
