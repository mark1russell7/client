---
"@procedures/store": minor
---

The new entry `@procedures/store/indexeddb` has the stores of a browser (roadmap R45). `IndexedDbProgramStore` keeps programs in IndexedDB, and it follows the contract of the other program stores. `IndexedDbQueueStore` keeps the queue of a `HybridStorage` in IndexedDB (the open point of R28). `hasIndexedDb()` tells if the browser has IndexedDB, and the entry also exports `MemoryProgramStore` and `MemoryQueueStore` as fallbacks. The entry does not import the client or zod, and the package root does not import it.

`HybridStorage` has the new option `local`: the storage of the local copy (the type `LocalCopyStorage`). The default is a new `InMemoryStorage`, as before. A durable local copy, for example `SqliteStorage` of `@procedures/sqlite`, keeps the items after a restart. Then a new storage in `local-only` mode reads the items of the last run (the open point "the local copy is not durable" of R28). `close()` now closes the local copy too. A local copy that cannot take the loaded queue makes the storage refuse each operation, as a queue store that cannot load does.
