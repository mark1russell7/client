---
"@procedures/sqlite": minor
---

Five database procedures (roadmap R44). `db.tables` lists the tables and views, and `db.schema` gives the columns, indexes and foreign keys of a table. Both only read, and a missing file is an error. `db.query` stays read only.

`db.transaction` puts a list of statements in one transaction, and rolls it back when one fails. `db.migrate` applies numbered migrations from a folder or a list, in one transaction, with a table of the applied migrations and their sha256. A second call applies nothing. `db.backup` copies a database to a new file and checks the copy. It does not replace a file. With `vacuum: true`, it compacts the copy.
