---
"@procedures/mcp-server": minor
"@procedures/mcp-dev-tools": minor
"@procedures/mark": minor
---

The Streamable HTTP face of an MCP host keeps at most 256 sessions by default, and a task store keeps at most 1000 tasks (CLI-51). Before, the sessions had no limit by default. Thus one client could increase the memory of the host without a limit.

MINOR: a breaking change before 1.0. A new default limit changes a behavior that callers rely on (decision D13).

Changed:

- The default of `maxSessions` is 256, not `Infinity`. This default applies to `faces.http` of `createMcpHost()`, to `mcpFace()` and to `mark mcp --http`. `MCP_HTTP_LIMITS.maxSessions` is 256.
- A new session above the limit closes the session that was idle longest. When each session is busy, the new session gets 503 with a `Retry-After` header, as before with a limit.
- Each live client of the MCP SDK keeps its GET stream open, so the limit does not close its session. Thus the limit is much more than the clients of one host. Each live session also holds a socket, and 256 is much less than the usual limit of 1024 open files of a process.
- `maxSessions: Infinity` stays valid. It turns the limit off.

Added:

- The option `maxStored` of `McpTaskStore`, and of `tasks` of `createMcpHost()` and `mcpFace()`. It is the most tasks that the store keeps for all the sessions together. The default is 1000 (`MCP_TASK_LIMITS.maxStored`). Before, only the limit of 100 tasks for each session bounded the store.
- A new task removes the oldest task of its own session that ended. The store can be full, and the session can have no task that ended. Then the request of the new task gets the error `-32600` with the code `TASKS_FULL`. The store keeps nothing of that task. Thus a client cannot remove the results of another session. `maxStored: Infinity` turns the limit off.
- The flag `--max-sessions <n>` of `mark mcp`, and the variable `MCP_HTTP_MAX_SESSIONS` of `@procedures/mcp-dev-tools`. They set `maxSessions` of the HTTP face. `Infinity` turns the limit off.

Migration:

- A host with more than 256 clients at one time: give a larger `maxSessions`, or `maxSessions: Infinity` for no limit. Give it in `faces.http` of `createMcpHost()`, in `mcpFace()`, or with `mark mcp --http <port> --max-sessions <n>`.
- A host that keeps more than 1000 tasks: give a larger `maxStored`, or `maxStored: Infinity`, in `tasks` of the host or in `new McpTaskStore()`.
- The site and MiniMongo: no change. They have no MCP host.
- Graph: no change. Its `mcpFace()` on the procedures host gets the limit of 256 sessions, and its MCP host over stdio has no HTTP face. To keep no limit, give `mcpFace({ maxSessions: Infinity })`.
- jarvis: no change. Its MCP host has only stdio and SDK faces, and it has no tasks.
- polite-crawler-mcp: no change for the sessions, because it sets `maxSessions: 32`. Its `McpTaskStore` gets the limit of 1000 stored tasks. Before, 32 sessions of 100 tasks bounded the store at 3200 tasks. To keep that bound, give `new McpTaskStore({ maxStored: 3200 })`.
- polite-crawler-mcp also gives the deprecated option `mount: true`, which has no effect. Remove it when it moves to the new range.
