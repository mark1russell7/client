---
"@procedures/store": patch
---

With `versionOf` and `conflictResolution: "merge"`, `HybridStorage` keeps the remote value that each queued write changed (roadmap CLI-109). `mergeFn(local, remote, base)` gets it as its third argument, for a three-way merge. `base` is `null` when the remote had no item, and undefined when the storage does not know it. The queue store keeps the value, so a restart does not lose it. Old queued operations load with no base value. A merge function with two parameters works as before.
