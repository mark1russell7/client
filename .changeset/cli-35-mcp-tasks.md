---
"@procedures/mcp-server": patch
"@procedures/mcp": patch
---

MCP tasks and the guards of the HTTP face (CLI-35). The options are new, and nothing changes without them.

- A procedure with `metadata.taskSupport` (`"optional"` or `"required"`) can run as an MCP task. `@procedures/mcp` gives it in the tool definition as `execution.taskSupport`, and exports `taskSupportOf`.
- `createMcpHost` and `McpServerTransport` take the option `tasks`: a store (`McpTaskStore`), or the options of a new store (`maxRunning`, `ttl`). The host shares one store with each face, and `host.tasks` gives it. A task above the limit starts and then fails at once with the reason. A cancel aborts `ctx.signal` of the procedure. The close of a session and the stop of the host cancel their tasks.
- The checks of a request to the Streamable HTTP face are in one function, `guardMcpRequest`. The token check now compares SHA-256 digests in constant time, and a 401 has a `WWW-Authenticate` header. Only an `initialize` request starts a session, its body has a limit of 4 MiB, and the face keeps at most 32 sessions. The package also exports `sameToken`, `readMcpBody` and `assertLoopbackBind`.
