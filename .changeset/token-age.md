---
"@procedures/mongo": patch
---

The handles of `watchDatabaseChanges()` and `watchStorageChanges()` have the new getter `tokenAgeMs` (roadmap CLI-110). It gives the milliseconds of the clock of the watcher since the resume token last moved to a later cluster time. Before the first move, it counts from the start of the watcher. A new token at the same cluster time does not move it. An app reads a stalled feed from it, without a sampler of its own.
