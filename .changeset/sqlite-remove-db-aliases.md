---
"@procedures/sqlite": minor
"@procedures/bundle-mcp": patch
---

The deprecated `db.*` aliases are gone: `db.query`, `db.execute`, `db.tables`, `db.schema`, `db.transaction`, `db.migrate` and `db.backup`. Use `sqlite.query` and the other `sqlite.*` names. Version 0.4.0 renamed them and kept the old names for one release.
