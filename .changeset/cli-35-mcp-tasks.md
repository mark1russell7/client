---
"@procedures/mcp-server": patch
"@procedures/mcp": patch
"@procedures/client": patch
---

MCP tasks and the guards of the HTTP face (CLI-35).

- A procedure with `metadata.taskSupport` (`"optional"` or `"required"`) can run as an MCP task. `@procedures/mcp` gives it in the tool definition as `execution.taskSupport`, and exports `taskSupportOf`.
- `createMcpHost` and `McpServerTransport` take the option `tasks`: a store (`McpTaskStore`), or the options of a new store (`maxRunning`, `ttl`). The host shares one store with each face, and `host.tasks` gives it. A task holds its place in the limit until its procedure returns, also after a cancel. A task above the limit starts and then fails at once with the reason, and the store keeps it for 1 minute. The time to keep a task starts when the task ends, and each session keeps at most 100 tasks. A cancel aborts `ctx.signal` of the procedure. The close of a session and the stop of the host cancel their tasks. Without the option `tasks`, the tools do not change.
- The checks of a request to the Streamable HTTP face are in one function, `guardMcpRequest`, with the browser checks and `tokenMatches` of the core. A 401 now has a `WWW-Authenticate` header. The package also exports `assertLoopbackBind`, for the owner of a listener.
- The HTTP face takes `allowedHosts`, `maxSessions` and `maxBodyBytes`. `createMcpHost` and `mcpFace` give the face `browser.allowedHosts` of the policy, so a host of that list can reach the endpoint. Before, the face refused it. Thus a policy with `allowedHosts: "*"` now also turns off the DNS-rebinding check of the face, as it does for the other faces.
- `maxSessions` has no default: the sessions have no limit, as before. With it, a new session above the limit closes the session that was idle longest (no task in progress and no open response), and when each session is busy, the new session gets 503 with `Retry-After`.
- `maxBodyBytes` (4 MiB by default, the limit of the SDK) applies to each request of the face.
- The state of an HTTP face (`getState()`, and `host.state().faces`) gives `sessions`, the count of its open sessions.
- `@procedures/client/node` exports `readJsonBody` and `BodyError`: the procedure handler and the MCP face read a JSON body with this one function.

One default of the Streamable HTTP face changes: only an `initialize` request starts a session. Before, a POST without a session id made a new MCP server, and then the SDK refused the request with 400 ("Server not initialized"). Now the face refuses it with 400 before it makes a server, so a stray request uses no memory. This agrees with the MCP specification, and a caller sees the same status. When the SDK refuses an `initialize` (for example 406), the face now closes the server of that request.
