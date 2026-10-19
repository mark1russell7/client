---
"@procedures/mcp-server": patch
"@procedures/mcp": patch
---

MCP tasks and the guards of the HTTP face (CLI-35).

- A procedure with `metadata.taskSupport` (`"optional"` or `"required"`) can run as an MCP task. `@procedures/mcp` gives it in the tool definition as `execution.taskSupport`, and exports `taskSupportOf`.
- `createMcpHost` and `McpServerTransport` take the option `tasks`: a store (`McpTaskStore`), or the options of a new store (`maxRunning`, `ttl`). The host shares one store with each face, and `host.tasks` gives it. A task above the limit starts and then fails at once with the reason. A cancel aborts `ctx.signal` of the procedure. The close of a session and the stop of the host cancel their tasks. Without the option `tasks`, the tools do not change.
- The checks of a request to the Streamable HTTP face are in one function, `guardMcpRequest`. The token check now compares SHA-256 digests in constant time, and a 401 has a `WWW-Authenticate` header. The package also exports `sameToken`, `readMcpBody` and `assertLoopbackBind`.

Two defaults of the Streamable HTTP face change:

- Only an `initialize` request starts a session. Before, a POST without a session id made a new MCP server, and then the SDK refused the request with 400 ("Server not initialized"). Now the face refuses it with 400 before it makes a server. This agrees with the MCP specification, and a stray request uses no memory. A caller of the specification sees the same status.
- The face keeps at most 32 sessions. A new session above the limit closes the session that was idle longest, with no task in progress and no open GET stream. Before, the sessions had no limit. The limit bounds the memory of the face. A client of the closed session gets 404, and a client of the MCP specification then sends a new `initialize`. To change the limit, give `maxSessions` in the HTTP options. `maxBodyBytes` changes the limit of the body of an `initialize` (4 MiB, the limit of the SDK).
