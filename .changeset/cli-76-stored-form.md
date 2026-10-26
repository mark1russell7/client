---
"@procedures/mongo": minor
---

`MongoDocumentStorage` can keep the stored form of an app (roadmap CLI-76), and `ViewMaterializer` leaves out the tombstones of its sources (roadmap CLI-79).

MINOR: the new options keep the old form, but the default behavior of `ViewMaterializer` changes. A source document with `_tomb: true` is no longer a row of a view. Before 1.0.0, a change of the default behavior raises the MINOR, and the fixed group shares one version.

- The new options `storedId(partition, id)` and `idOf(storedId, partition)` give the stored `_id` of an id and its inverse. The stored `_id` can be a value that is not a text. Give the two together.
- The new option `partitionFields(partition)` gives the fields that name a partition. Each document of the partition has them, and they are the filter of the reads, the change log and the aggregations. A field with the value `undefined` is absent: the filter is `{ $exists: false }`.
- The defaults (`defaultStoredId`, `defaultIdOf`, `defaultPartitionFields`) write the documents of 0.34.0, byte for byte. A test pins this.
- The storage keeps its fields (`_key`, `_seq`, `_ord`, `_tomb`, `_kid`, `_json`) in each form. `DOCUMENT_STORAGE_FIELDS` names them, and `TOMBSTONE_FIELD` names the field of a tombstone, for the readers of the raw documents.
- A document without the fields of the storage is an item. Its id comes from `idOf`, its version is `0`, and it comes before the other items. Its first write through the storage gives it a version and keeps its place.
- An item with a field of a partition field name is stored as JSON text, so it comes back as it was.
- `selectorPrefilter(selector, options)` takes the new optional `storedId` and `storageFields`. With `storedId`, a condition on `_id` tests the stored `_id`, so `query()` uses the index of `_id`.
- `ViewMaterializer` adds `_tomb: { $ne: true }` to the filter of the sources, so a deleted item of a `MongoDocumentStorage` is not in a view.
