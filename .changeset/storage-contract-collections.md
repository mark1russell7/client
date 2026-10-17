---
"@procedures/collections": minor
---

The storages agree on the contract of `CollectionStorage`. `InMemoryStorage` changes in three points:

- It keeps copies. Each write takes a copy of the value (`structuredClone`), and each read gives a new copy. Before, it kept the values themselves. The option `copies: false` gives the old behavior for a caller that changes no value.
- A delta of `getChangesSince` follows the order of the last change of each id. Before, it followed the first write of each id.
- After `close()`, each operation rejects with an error that says "closed", and a second `close()` does nothing. Before, `close()` emptied the storage, and the storage kept working.

The contract suite of `@procedures/collections/testing` has no options `copies` and `nullValues` now. It tests the copies, a stored `null`, the order of each delta and the operations after `close()` for each storage. The helper `byId` is removed.
