---
"@procedures/mongo": patch
---

New `MongoDocumentStorage` (roadmap CLI-24): a `CollectionStorage` over MongoDB. It has flat documents, a change log with tombstones for an exact `getChangesSince()`, versions (`versionOf()`), queries in the database (`query()`), `patch()` and partitions (`forPartition()`). It passes the `CollectionStorage` contract on MongoDB 7. `MongoStorage` keeps its `{ _id, data }` documents. CI has a MongoDB job, and the coverage job starts the storage tests on MongoDB.
