---
"@procedures/collections": minor
---

The contract of `CollectionStorage` has the optional method `getIds()`. It gives the ids in the order of the entries, and it does not read or copy the values.

- `InMemoryStorage.getIds()` gives the keys of its map, without a `structuredClone` of the values.
- The contract suite of `@procedures/collections/testing` tests `getIds()`: the order, a new array for each call, the ids of `getEntries()`, and the rejection after `close()`. A storage without `getIds()` skips the case.
