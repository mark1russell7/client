---
"@procedures/mongo": patch
---

`MongoDocumentStorage` writes the floor document of its partition at its first write (roadmap O66). A gap of `watchStorageChanges()` then sends a reset hint to each partition with a write through a storage, also without a prune.

PATCH: a fix, with no change to the API. Before 1.0.0, a fix raises the PATCH.

- The floor document has the floor `0`: the change log reads a missing floor as `0` too, so no result of `getChangesSince` changes. The upsert writes only a new document, so the floor of a prune stays.
- The upsert runs once for each storage, before its first write and outside each transaction. A failure does not fail the write: the next write tries again.
- `gapPartitions` is necessary only for the partitions that only raw writes wrote.
