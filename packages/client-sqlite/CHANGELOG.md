# @procedures/sqlite

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
