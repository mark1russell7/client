---
"@procedures/bundle-mcp": minor
"@procedures/mcp-dev-tools": minor
---

Breaking change of the MCP tool names: the tools `db.query`, `db.execute`, `db.tables` and `db.schema` change to `sqlite.query`, `sqlite.execute`, `sqlite.tables` and `sqlite.schema`. A client or a stored program that calls a `db.*` tool must use the new name. The number of tools stays 91.

`mcpNamespaces` has `sqlite` and not `db`, so the deprecated `db.*` aliases of `@procedures/sqlite` are not tools. `mcpExclude` has `sqlite.transaction`, `sqlite.migrate` and `sqlite.backup`. The bundle also registers the module of `@procedures/dag` (`dag.traverse`), but `dag` is not a tool namespace.
