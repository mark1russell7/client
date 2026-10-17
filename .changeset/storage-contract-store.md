---
"@procedures/store": minor
---

`ApiStorage` and `HybridStorage` agree with the contract of `CollectionStorage`:

- `ApiStorage.get()` asks the procedure `collections.<name>.get` for `{ found, value }`. A stored `null` reads back as `null`. Before, it read back as `undefined`. A custom `service` or `get` operation gets the input `{ id }`, as before.
- `HybridStorage` takes a copy of each written value for the local copy, the queue and the remote. Before, a change of a value after a `set()` in the mode `write-back` changed the queued write.
- After `close()`, each operation of `ApiStorage` and `HybridStorage` rejects with an error that says "closed", and a second `close()` does nothing. `HybridStorage.close()` waits for the operations, the mode switch and the syncs that run. A `close()` before the first sync makes no remote call.
- After `close()`, `SyncedProcedureRegistry.register()` and `unregister()` change only the registry in memory, and a second `close()` does nothing. `close()` waits for the auto-sync that runs.
