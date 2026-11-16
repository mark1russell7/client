---
"@procedures/sqlite": patch
---

`SqliteStorage` uses `@mark1russell7/sqlite` for its SQLite work. The public API and the behavior of the storage do not change.

- The engine `node` opens a file with `openDatabase` of `@mark1russell7/sqlite`. The pragmas stay the same: WAL, the busy timeout and `synchronous = NORMAL`. A read-only file keeps its journal mode.
- The engine `sqljs` gives its database to `sqlJsConnection` of `@mark1russell7/sqlite`. Thus both engines give one kind of connection, and the storage has one set of queries.
- The write transaction, the read transaction and the check of the columns come from the entry `@mark1russell7/sqlite/portable`. That entry imports no module of Node.js.
- The engine `auto` uses `node:sqlite` from Node.js 22.13, as before. `@mark1russell7/sqlite` adds a probe of the transaction state for Node.js 22.13 to 22.15, which have no `isTransaction`.
- The new dependency is `@mark1russell7/sqlite`.

PATCH: an internal change with no change to the public API.
