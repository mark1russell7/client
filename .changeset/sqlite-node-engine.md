---
"@procedures/sqlite": minor
---

`SqliteStorage` has two engines. The new option `engine` is `"auto"` (the default), `"node"` or `"sqljs"`.

- The engine `node` is `node:sqlite` of Node.js 22.13 and later. SQLite writes only the changed pages of the file. Before, sql.js wrote the whole file after each write, so a write to a large collection was slow.
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
