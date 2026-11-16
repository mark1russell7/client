---
"@procedures/sqlite": minor
---

The SQLite procedures and `SqliteStorage` use only `node:sqlite`, through the engine of `@mark1russell7/sqlite`. Version 0.61.0 removes the engine `sqljs` and the package `@mark1russell7/docker-sqlite`.

Breaking changes, with the steps to migrate:

- `sqlite.query`, `sqlite.execute`, `sqlite.transaction` and `sqlite.migrate` need Node.js 24.10 or later: they refuse with `CONFINE_UNAVAILABLE` before it. To migrate, run the host on Node.js 24.10 or later. The other procedures and `SqliteStorage` work on Node.js 22.13 or later.
- The package needs Node.js 22.13 or later. Earlier versions of Node.js have no `node:sqlite` without a flag.
- `SqliteStorage` refuses the engine `sqljs` with a `TypeError`. To migrate, use the engine `auto` or `node`. A file of the engine `sqljs` opens with the engine `node`, with its items and its versions.
- The root entry no longer exports the functions and the types of `@mark1russell7/docker-sqlite` (`withConnection`, `createConnection`, `query`, `execute`, `execMultiple`, `lastInsertRowId`, `tableExists`, `getMigrationStatus`, `runMigrations`, `rollbackMigration`, `createMigration`, `ConnectionConfig`, `ConnectionCallback`, `QueryResult`, `ExecuteResult`, `Migration`, `MigrationStatus`, `Database`). To migrate, import `openDatabase`, `transaction` and `migrate` from `@mark1russell7/sqlite`.
- A script of several statements in `sqlite.execute` runs in one transaction: all its statements take effect, or none does. A script that starts with `BEGIN`, `SAVEPOINT` or another statement that controls a transaction runs as written. A later statement that controls a transaction is refused. So a `VACUUM` in a script fails: send it alone.
- `sqlite.execute`, `sqlite.transaction`, `sqlite.migrate` and `logs.store` make a missing file when they open it, also when the work then fails.

Other changes:

- Each procedure writes only the changed pages of the file, and it waits for the lock of another process. A file keeps its journal mode: a WAL file stays in WAL mode.
- The number of changes of `sqlite.execute` is correct for a change of the schema: `0`.
- `sqlite.backup` writes a snapshot of the file with `snapshot` of `@mark1russell7/sqlite`, checks the copy, and then renames it. The copy is consistent, has the changes in the WAL file, and is always compact. The option `vacuum` has no effect and is deprecated. A later minor version removes it.
- A file that an earlier version migrated keeps its migration table and its checksums. A log file of an earlier version keeps its entries.
- `flush()` of `SqliteStorage` does no work. It stays for the callers of the engine `sqljs`.

MINOR: breaking changes before 1.0.0.
