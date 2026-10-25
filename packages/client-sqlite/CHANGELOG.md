# @procedures/sqlite

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Minor Changes

- c7198ca: Breaking (roadmap CLI-16, decision D11): the collection writes take an optional expected version. This is its own MINOR of the client group (D13).
  
  New:
  
  - `collections.<name>.set` and `delete` take `expectedVersion`, and each item of `setBatch` takes `expectedVersion`. The value is the version of the current item that the write expects. `null` expects no item.
  - A conflict changes nothing. The call fails with the new protocol code `VERSION_CONFLICT` (HTTP 409, not retryable). The metadata key `conflicts` (and the field `conflicts` of the HTTP body) has the current item and its version for each id.
  - `StorageItemWriteOptions.expectedVersion` (`set`, `delete`) and `StorageBatchWriteOptions.expectedVersions` (`setBatch`) in both copies of `CollectionStorage`. `VersionConflictError`, `versionConflictsOf()` and the other helpers come from `@procedures/client/query`, `@procedures/client` and `@procedures/collections`.
  - The option `versionOf` of `InMemoryStorage`, `SqliteStorage` and `MongoDocumentStorage` gives the version of an item. The test and the write are one step: synchronous in memory, one transaction in SQLite, the transaction or a compare-and-set on `_seq` in MongoDB. `MongoStorage` refuses a precondition.
  - `ApiStorage` sends the expected versions to the collection procedures, and gives a `VERSION_CONFLICT` back as a `VersionConflictError`.
  - `HybridStorage` sends the base version of each queued write as its expected version. A conflict of the remote goes to `conflictResolution`, as a conflict of a pull. The new option `sendBaseVersions: false` stops it.
  - `ClientError.metadata` gives the metadata of the error response.
  - The contract suite `@procedures/collections/testing` has the cases of the preconditions, and the option `createWithVersions`.
  
  The changes of behavior:
  
  - A storage must test a precondition, or refuse the write. A storage without `versionOf` refuses a write with an expected version with a `TypeError` whose code is `PRECONDITION_NOT_SUPPORTED`. The contract suite tests it for each storage.
  - A `HybridStorage` with `versionOf` now sends the base version of each queued write. A queued write over a change of another writer got through before. Now the remote refuses it with `VERSION_CONFLICT`, and `conflictResolution` decides: `remote` drops the queued write, `merge` sends the merged item, `local` sends the write again over the current version, and `error` throws `ConflictError` and keeps the queue. The remote must test the precondition: a server storage without `versionOf` refuses each push.
  - `ApiStorage`: a write without an expected version writes as before, and gets no `VERSION_CONFLICT`. Only a caller that gives an expected version, or a `HybridStorage` with `versionOf` over it, can get one.
  - `HybridStorage` with `versionOf`: a queued write that won before can now get the conflict path. The opt-out is `new HybridStorage(remote, { versionOf, sendBaseVersions: false })`: the push sends no expected version, and the last write wins, as before. The default is the new behavior.
  - A write without an expected version writes as before: the last write wins.
  
  Migration:
  
  - **Site.** No change. The site does not write collections.
  - **MiniMongo.** No change for a storage or a `HybridStorage` without `versionOf`. A `HybridStorage` with `versionOf` over `ApiStorage` needs a server storage with the same `versionOf` (for example `new InMemoryStorage({ versionOf })`), or the option `sendBaseVersions: false`.
  - **Graph.** Graph keeps last-write-wins first (D11): it gives no expected version, so nothing changes. `GraphDocsStorage` must refuse a write with an expected version until it tests one. Add the guard to its `set`, `delete` and `setBatch`, and run the contract suite: its first case tests the refusal. To adopt the version later, stamp a version field on the server, give the storage a `versionOf` that tests it in the write, and give the same `versionOf` to the `HybridStorage` of the client. Then add `createWithVersions` to the contract run.
  - **jarvis.** No change: jarvis gives no expected version. A storage of jarvis that implements `CollectionStorage` must refuse a write with an expected version, as for Graph.
  - **Other storages.** Each class that implements `CollectionStorage` reads the new options of `set`, `delete` and `setBatch`. It tests them in the write, or it rejects the write with `preconditionNotSupported()`. It never ignores them.

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- 1aa9ef7: The collection storages get a JSON query language with a query policy, change batches and patches in one step, and the sync of `@procedures/store` runs on the service clock and backoff (server stack CLI-20, CLI-14, CLI-13, CLI-34).
  
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
- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- 90ea741: The procedures declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33). Without a root, nothing changes. Under the root of a host (`confineToRoot()` of `@procedures/fs`):
  
  - `sqlite.*` and `logs.*` are confined: `dbPath` must be in the root, and a call must give it. `:memory:` is not a path.
  - `lib.scan`, `lib.graph`, `lib.audit`, `lib.rename` and `procedure.new` are confined: their folder must be in the root, and without it the folder is the root.
  - Most `docker.*` procedures run docker in a working folder of the root. `docker.run`, `docker.exec`, `docker.build` and `docker.compose.*` are refused.
  - `git.*`, `pnpm.*`, `lib.new`, `shell.exec` and `shell.which` are refused.
  - `shell.run` and `shell.stream` run only as the nested call of a confined procedure that names them in `metadata.calls`.
  - The help of the global flag `--fs-root` (`@procedures/lib/cli-flags`) tells the new rule.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Minor Changes

- 72a8c65: The deprecated `db.*` aliases are gone: `db.query`, `db.execute`, `db.tables`, `db.schema`, `db.transaction`, `db.migrate` and `db.backup`. Use `sqlite.query` and the other `sqlite.*` names. Version 0.4.0 renamed them and kept the old names for one release.

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Minor Changes

- 89481b0: `SqliteStorage` has two engines. The new option `engine` is `"auto"` (the default), `"node"` or `"sqljs"`.
  
  - The engine `node` is `node:sqlite` of Node.js 22.13 and later. SQLite writes only the changed pages of the file. Before, sql.js wrote the whole file after each write, so a write to a large collection was slow.
  - In the nightly benchmark, 1,000 writes one after the other to a file of 1,000 items take 141 ms with `node` and 1,246 ms with `sqljs`.
  - With `node`, the file is in WAL mode with a busy timeout (the new option `busyTimeout`, 5 seconds by default). Two processes can use one file: a write waits for the lock of the other process, and the versions of the change log agree.
  - The engine `sqljs` is sql.js, as before. The engine `auto` uses it when the import of `node:sqlite` fails, for example on Node.js 22.12 and before.
  - The two engines use one file format: a file of one engine opens with the other, with its items and its versions.
  - The guarantees stay for each engine:
    - Each write runs in one transaction.
    - The storages of one file in one process share one database.
    - The change log and its versions stay valid after a restart.
    - A storage that only reads does not make the file.
    - The contract of `close()` does not change.
  - The storages of one file in one process share one engine. A storage with the other engine refuses the open database.
  - sql.js refuses a file with a write-ahead log of the engine `node` that holds changes.
  - New: `getEngine()`, `getIds()` (the ids without the values), `isNodeSqliteAvailable()`, and `stats.engine` in `getMetadata()`.
  - `getChangesSince()` reads in one read transaction, and it reads the epoch from the file at each call.
- bc74091: After `close()`, each operation of `SqliteStorage` and `MongoStorage` rejects with an error that says "closed", and a second `close()` does nothing. Before, `SqliteStorage.flush()` and an empty batch resolved after `close()`, and `MongoStorage` kept working.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- cc3f5f6: The SQLite procedures have the namespace `sqlite`, not the general namespace `db`: `sqlite.query`, `sqlite.execute`, `sqlite.tables`, `sqlite.schema`, `sqlite.transaction`, `sqlite.migrate` and `sqlite.backup`. The `logs.*` procedures keep their names.
  
  The old names stay for one release as deprecated aliases (`db.query` and the others). Each alias has the same handler, the same schemas and the same effects. Its description starts with `Deprecated: use sqlite.<name>`, and its metadata has `deprecated: true`. The next release removes the aliases.
  
  The description of the `dbPath` field does not show the home folder of the computer any more. It says `~/logs/cli/cli.db`.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 89d8a4a: Three procedures only read now (CAP-1, CAP-2, CAP-3, roadmap R7), so a read-only session (`mark mcp --read-only`) serves them. `db.query` refuses a statement that changes data (`PRAGMA query_only`), and the file keeps its bytes. `mongo.documents.aggregate` refuses `$out` and `$merge`, also in the pipelines of `$facet`, `$lookup` and `$unionWith`. `logs.query` gives no entries for a missing file or table, and does not make them.
- 94dd2a0: Five database procedures (roadmap R44). `db.tables` lists the tables and views, and `db.schema` gives the columns, indexes and foreign keys of a table. Both only read, and a missing file is an error. `db.query` stays read only.
  
  `db.transaction` puts a list of statements in one transaction, and rolls it back when one fails. `db.migrate` applies numbered migrations from a folder or a list, in one transaction, with a table of the applied migrations and their sha256. A second call applies nothing. `db.backup` copies a database to a new file and checks the copy. It does not replace a file. With `vacuum: true`, it compacts the copy.
- 4ef0d44: The new collection storage `SqliteStorage` (roadmap R45) keeps the items of one collection in one table of a SQLite database: a file, or `:memory:`. It implements `CollectionStorage`, so a `ProcedureServer`, an `ApiStorage` server and a `HybridStorage` use it as they use `InMemoryStorage`. The new entry `@procedures/sqlite/storage` has it alone, and the package root exports it too.
  
  The table has the columns `id` and `value` (the JSON text of the item). The name of the table starts with a letter and has only letters, digits and underscores. `getChangesSince()` reads a change log in the tables `_storage_log` and `_storage_versions`, with versions `<epoch>:<seq>` as `InMemoryStorage` has. The epoch stays in the file, so a version stays valid after a restart. The option `maxTombstones` limits the deletes that the log keeps.
  
  Each write runs in a transaction, so a batch that fails changes nothing. The storage keeps the database in memory and writes the file after each write. One file write can hold the changes of several writes. The storages of one file in one process share one database. A storage that only reads does not make the file.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
