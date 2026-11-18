---
"@procedures/client": patch
"@procedures/bundle-mcp": patch
"@procedures/mcp-dev-tools": patch
"@procedures/sqlite": patch
---

The MCP server shows nine more tools (d40-handles). `handle.list` and `handle.close` are tools, and seven generated procedures of `@procedures/sqlite` are tools: `sqlite.openDatabase`, `sqlite.userVersion`, `sqlite.schemaVersion`, `sqlite.tableColumns`, `sqlite.addMissingColumns`, `sqlite.checkIntegrity` and `sqlite.checkpoint`. `sqlite.openDatabase` gives a handle, and the other six take it. Each MCP session has its own handles, and the end of the session closes them. `sqlite.clearDatabase` and `sqlite.snapshot` are not tools, because they destroy data.

Each output field of `handle.list` and `handle.close` has a description, and the `handle` field of each handle has a description. The MCP structured output of these tools then describes each field.
