---
"@procedures/collections": minor
"@procedures/store": patch
---

The new test-only entry `@procedures/collections/testing` holds one contract suite for `CollectionStorage`: `describeCollectionStorageContract(name, { create, createWithMaxTombstones, copies, nullValues }, { describe, it })`. It tests the reads, the writes, the batches, the order of the entries, the JSON values, `getChangesSince` and its versions, `flush`, `getMetadata`, `close` and the errors. A random sequence of writes runs against a `Map`. The suite imports no test framework, so the runtime entries never load vitest. `InMemoryStorage`, `SqliteStorage`, `ApiStorage` and `HybridStorage` run it.

The suite found two differences, and the contract fixes them:

- An error of a `find` predicate of `InMemoryStorage` threw at once. Each method of a storage gives a promise, so each method of `InMemoryStorage` is now `async`, and an error is a rejected promise.
- `getMetadata().size` of `HybridStorage` was the size of the local copy, which `remote-only` keeps empty. It is now the result of `size()`. The new `stats.localSize` gives the size of the local copy.
