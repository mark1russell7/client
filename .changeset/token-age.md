---
"@procedures/mongo": minor
---

Breaking change (roadmap CLI-110): the types `DatabaseChangesWatch` and `StorageChangesWatch` have the new getter `tokenAgeMs`, and it is not optional. The handles of `watchDatabaseChanges()` and `watchStorageChanges()` give it. It gives the milliseconds of the clock of the watcher since the resume token last moved to a later cluster time. Before the first move, it counts from the start of the watcher. A new token at the same cluster time does not move it. An app reads a stalled feed from it, without a sampler of its own.

Some apps make their own objects of the type `DatabaseChangesWatch` or `StorageChangesWatch`, for example a fake of a test. To migrate, add the getter `tokenAgeMs` to each of these objects. Code that only reads a handle needs no change.
