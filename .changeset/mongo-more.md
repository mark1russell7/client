---
"@procedures/mongo": minor
---

Four procedures (roadmap R44). `mongo.documents.distinct` gives the distinct values of a field. `mongo.documents.bulk` sends `insertOne`, `updateOne`, `updateMany`, `deleteOne` and `deleteMany` operations in one request, in order by default. An empty filter of an update or a delete needs `confirm: true`. `mongo.documents.explain` gives the plan of a find or an aggregation, and refuses `$out` and `$merge`. `mongo.watch` gives the changes of a collection or a database as a stream without an end. The stream closes when the reader stops or the call aborts. A change stream needs a replica set. The type `BulkOperation` now also has `BulkUpdateMany` and `BulkDeleteMany`.
