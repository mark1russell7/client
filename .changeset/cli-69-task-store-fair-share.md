---
"@procedures/mcp-server": minor
"@procedures/client": patch
"@procedures/peer": patch
---

The task store of an MCP host gives each client a fair share of its tasks (CLI-69). Before, the sessions of one client could fill the store (CLI-51). Then each other client got `TASKS_FULL` until those tasks ended their time.

MINOR: a breaking change before 1.0. Near the limit, the store refuses a client with its share or more, also when the store has free slots. Before, the store refused a task only when it was full (decision D13).

Changed:

- The key of a task (`shareKey`) tells its client. The default `mcpTaskShareKey` gives the principal of the request, else the session. The principal of the host token is the same for each caller, so a request with only the token gets the key of its session.
- The share of a client is `maxStored / (k + 1)`. `k` is the number of clients with tasks in the store, the new client included.
- When `reserve` slots or fewer are free, a client with its share or more gets no more tasks. Its new task replaces the oldest task of its session that ended. Without such a task, the request gets the error `-32600` with the code `TASKS_FULL`, as for a full store.
- A client below its share gets a task while the store has a free slot. Thus one client keeps at most `maxStored - reserve` tasks, also with many sessions.
- The total limit (`maxStored`, 1000 by default) and the limit of 100 tasks of a session stay as they are.

Added:

- The options `reserve`, `shareKey` and `clock` of `McpTaskStore`, and of `tasks` of `createMcpHost()` and `mcpFace()`. The default `reserve` is a tenth of `maxStored`, rounded down: 100 of 1000. `reserve: 0` turns the fair share off.
- `mcpTaskShareKey`, and the types `McpTaskShareContext` and `McpTaskCaller`. `createTask` of the store takes the caller as its fifth argument.
- `MCP_TASK_LIMITS.reserveDivisor`: 10.
- `identify(credentials)` of `ProcedureServer`, and the optional `identify` of `RequestHandler`. It gives the principal of a request before a call, from the checks of each call. The face handler of the procedures host and the narrowed handler of `mcpFace()` give it too. The MCP face uses it for the key of a task. Thus the request hook and the authenticate function run one more time for each new task.

Migration:

- The site and MiniMongo: no change. They have no MCP host.
- Graph: no change. Its MCP hosts have no task store.
- jarvis: no change. Its MCP host has no tasks.
- polite-crawler-mcp: no change. Each request has the host token, so each session is one client. A session with 100 tasks gets fewer tasks only when ten or more sessions are near the limit. To keep the rule of CLI-51, give `new McpTaskStore({ reserve: 0 })`.
- A host whose clients each have many sessions under one principal: each client keeps at most `maxStored - reserve` tasks. To keep the rule of CLI-51, give `reserve: 0` in `tasks` of the host or in `new McpTaskStore()`.
