---
"@procedures/sqlite": patch
---

The engine `sqljs` of `SqliteStorage` is deprecated. Version 0.61.0 removes it and needs Node.js 22.13 or later.

- The first open of the engine `sqljs` in a process shows one `DeprecationWarning` with the code `PROCEDURES_SQLITE_SQLJS`. The engine `auto` on a Node.js without `node:sqlite` shows it too.
- To prepare, use Node.js 22.13 or later with the engine `node` or `auto`. A file of the engine `sqljs` opens with the engine `node`.
- The flag `--no-deprecation` of Node.js hides the warning.
