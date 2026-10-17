---
"@procedures/store": patch
---

A pull of `HybridStorage` reads a local item only when the result depends on it. Before, the pull read each local item. The results do not change.

- A pull does not read the item of a queued write that wins: without versions, or when the remote version did not change after the last sync.
- With `versionOf`, the storage keeps the version of each local item that it wrote or read. A pull then reads a local item only for a conflict, or when it does not know the version. A full pull of a collection without a change reads no local item.
- Without versions, a pull reads each local item without a queued write. It compares the JSON of the two items, as before.
- Only the storage writes to its local copy: with `versionOf`, a pull does not see a write from outside.
