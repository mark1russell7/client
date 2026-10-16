---
"@procedures/sqlite": minor
---

The SQLite procedures have the namespace `sqlite`, not the general namespace `db`: `sqlite.query`, `sqlite.execute`, `sqlite.tables`, `sqlite.schema`, `sqlite.transaction`, `sqlite.migrate` and `sqlite.backup`. The `logs.*` procedures keep their names.

The old names stay for one release as deprecated aliases (`db.query` and the others). Each alias has the same handler, the same schemas and the same effects. Its description starts with `Deprecated: use sqlite.<name>`, and its metadata has `deprecated: true`. The next release removes the aliases.

The description of the `dbPath` field does not show the home folder of the computer any more. It says `~/logs/cli/cli.db`.
