---
"@procedures/collections": patch
"@procedures/client": patch
"@procedures/store": patch
"@procedures/sqlite": patch
---

The collection storages get a JSON query language with a query policy, change batches and patches in one step, and the sync of `@procedures/store` runs on the service clock and backoff (server stack CLI-20, CLI-14, CLI-13, CLI-34).

- The query language is in the core, in the new entry `@procedures/client/query`, which imports nothing else. It is the one copy (CLI-34). `@procedures/collections` now depends on `@procedures/client` for it, and exports the same names again.
- The selector is JSON: a subset of the query selectors of MongoDB. `queryEntries()` is the reference, and `selectorProblems()`, `queryOptionsProblems()`, `compileSelector()`, `matchesSelector()` and `compareStorageValues()` are exported.
- A query policy (`StorageQueryPolicy`) limits the operators, the length and the flags of a `$regex`, the clauses and the depth of a selector, the lists of `$in`, `$nin` and `$all`, and the limit. The default policy does not permit `$regex`. A pattern that repeats a repetition, for example `(a+)+`, is always an error.
- `CollectionStorage` of `@procedures/collections` has the optional `query(selector, { sort, skip, limit }, policy)`, `observe(observer)` and `patch(id, fields)`. A caller tests for each one. A storage without them still follows the contract.
- `observe()` gives one batch of `set`, `delete` and `clear` changes for each write that changes the storage, before the write resolves. The write methods take `{ origin }`, and each change has it.
- `patch()` takes a JSON Merge Patch (RFC 7386), or the operations `{ $set, $unset }`, which can set `null` and nested field paths. A patch that mixes the two forms is an error. `applyPatch()`, `mergePatch()` and `patchProblems()` are exported.
- `InMemoryStorage` has the three methods, and the options `queryPolicy` and `onObserverError`. `StorageListeners` is the set of listeners that the storages share.
- The contract suite of `@procedures/collections/testing` tests the selectors against `queryEntries()`, with fixed and random selectors, the refusal of `$regex` by default, and, with `createWithQueryPolicy`, the opt-in of `$regex` and each limit of a policy. It also tests the two forms of a patch, the patches at the same time, and the batches with their origins.
- The core collection procedures have `collections.<name>.find` (it reads) and `collections.<name>.patch` (it reads and writes, idempotent). `find` refuses a selector or a limit that the policy does not permit with `VALIDATION_ERROR` and the reason, and a `find` without a limit gets at most `DEFAULT_FIND_LIMIT` (1000) items. It gives the selector and the policy to `query()` of the storage, or runs it on the entries. `patch` uses `patch()` of the storage, or a read and a write, one patch of an id at a time.
- `createCollectionProcedures(name, { queryPolicy })` and `ProcedureServer.registerCollectionProcedures(name, { queryPolicy })` take the policy of the host.
- The `CollectionStorage` of the core has the same optional methods and the write options. Its new types are exported from the root, `./browser` and `./procedures`.
- `ApiStorage` has `query()` (the procedure `find`, or the entries of an older server) and `patch()` (the procedure `patch`). Its option `queryPolicy` adds limits of the client.
- `ApiStorage` waits `backoffDelay` of `@mark1russell7/service/backoff` between its tries, with full jitter, on the option `clock`. The timeout uses the clock too. The new options are `retryFactor`, `maxRetryDelay`, `retryJitter`, `clock` and `random`. An error with `retryAfterMs` gets at least that wait.
- `HybridStorage` has `query()` and the option `queryPolicy`. Its timers run on the option `clock`, and the delay after a failure grows with the option `backoff`. `getStatus()` and `onStatus()` give the state of the sync and its failures. The storage writes nothing to the console.
- `SyncedProcedureRegistry` takes the option `clock` for its auto-sync. Its status has the failures of the auto-sync and of the write-through writes, and `onStatus()` sends them.
- `SqliteStorage` has `query()`, `patch()` and the option `queryPolicy`. A patch runs in one transaction.
- `@procedures/store` depends on `@mark1russell7/service`, and `@procedures/collections` depends on `@procedures/client`.
