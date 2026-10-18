---
"@procedures/mongo": patch
---

New `MongoDocumentStorage` (roadmap CLI-24): a `CollectionStorage` over MongoDB. It has flat documents, a change log with tombstones for an exact `getChangesSince()`, versions (`versionOf()`), queries in the database (`query()`), `patch()` and partitions (`forPartition()`).

On a replica set, each write is a transaction with its numbers. On a single server, a watermark of the pending numbers keeps the log exact, and a late write moves its documents to new numbers. An id cannot have the character U+001F, and each write filter has the partition. It passes the `CollectionStorage` contract on MongoDB 7. `MongoStorage` keeps its `{ _id, data }` documents. CI has a MongoDB job, and the coverage job starts the storage tests on MongoDB.
