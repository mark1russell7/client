---
"@procedures/sqlite": minor
---

The new collection storage `SqliteStorage` (roadmap R45) keeps the items of one collection in one table of a SQLite database: a file, or `:memory:`. It implements `CollectionStorage`, so a `ProcedureServer`, an `ApiStorage` server and a `HybridStorage` use it as they use `InMemoryStorage`. The new entry `@procedures/sqlite/storage` has it alone, and the package root exports it too.

The table has the columns `id` and `value` (the JSON text of the item). The name of the table starts with a letter and has only letters, digits and underscores. `getChangesSince()` reads a change log in the tables `_storage_log` and `_storage_versions`, with versions `<epoch>:<seq>` as `InMemoryStorage` has. The epoch stays in the file, so a version stays valid after a restart. The option `maxTombstones` limits the deletes that the log keeps.

Each write runs in a transaction, so a batch that fails changes nothing. The storage keeps the database in memory and writes the file after each write. One file write can hold the changes of several writes. The storages of one file in one process share one database. A storage that only reads does not make the file.
