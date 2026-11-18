---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

Handles: the objects with a state of a caller (d40-handles). A procedure keeps an object, for example a database, in the `HandleScope` of its caller, and gives `{ "handle": "<id>" }`. Other procedures take the handle and get the object. `handleModule` adds `handle.list` and `handle.close`. Each MCP session has its own scope, and the end of the session closes its objects. The option `handles` of the MCP transport sets the count limit and the idle time limit. A peer does not forward `handle.*`.
