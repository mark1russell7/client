---
"@procedures/collections": patch
"@procedures/client": patch
"@procedures/store": patch
"@procedures/sqlite": patch
---

The collection storages get a JSON query language, change batches and field merges, and the sync of `@procedures/store` runs on the service clock and backoff (server stack CLI-20, CLI-14, CLI-13).

- `CollectionStorage` of `@procedures/collections` has the optional `query(selector, { sort, skip, limit })`, `observe(observer)` and `patch(id, fields)`. A caller tests for each one. A storage without them still follows the contract.
- The selector is JSON: a subset of the query selectors of MongoDB. `queryEntries()` is the reference, and `selectorProblems()`, `queryOptionsProblems()`, `compileSelector()`, `compareStorageValues()` and `mergePatch()` are exported.
- `observe()` gives one batch of `set`, `delete` and `clear` changes for each write that changes the storage, before the write resolves. The write methods take `{ origin }`, and each change has it.
- `patch()` merges a JSON Merge Patch (RFC 7386) into one item in one step.
- `InMemoryStorage` has the three methods. The option `onObserverError` gets the error of an observer. `StorageListeners` is the set of listeners that the storages share.
- The contract suite of `@procedures/collections/testing` tests the selectors against `queryEntries()`, with fixed and random selectors, the patches at the same time, and the batches with their origins.
- The core collection procedures have `collections.<name>.find` (it reads) and `collections.<name>.patch` (it reads and writes, idempotent). `find` gives the selector to `query()` of the storage, or runs it on the entries. `patch` uses `patch()` of the storage, or a read and a write, one patch of an id at a time.
- The `CollectionStorage` of the core has the same optional methods and the write options. Its new types are exported from the root, `./browser` and `./procedures`.
- `ApiStorage` has `query()` (the procedure `find`, or the entries of an older server) and `patch()` (the procedure `patch`).
- `ApiStorage` waits `backoffDelay` of `@mark1russell7/service/backoff` between its tries, with full jitter, on the option `clock`. The timeout uses the clock too. The new options are `retryFactor`, `maxRetryDelay`, `retryJitter`, `clock` and `random`. An error with `retryAfterMs` gets at least that wait.
- `HybridStorage` has `query()`. Its timers run on the option `clock`, and the delay after a failure grows with the option `backoff`. `getStatus()` and `onStatus()` give the state of the sync and its failures. The storage writes nothing to the console.
- `SyncedProcedureRegistry` takes the option `clock` for its auto-sync. Its status has the failures of the auto-sync and of the write-through writes, and `onStatus()` sends them.
- `SqliteStorage` has `query()` and `patch()`. A patch runs in one transaction.
- `@procedures/store` depends on `@mark1russell7/service`, and `@procedures/sqlite` depends on `@procedures/collections` at run time.
