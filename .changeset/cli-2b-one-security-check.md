---
"@procedures/client": minor
"@procedures/peer": minor
"@procedures/mcp-server": minor
"@procedures/mcp-dev-tools": minor
---

Each request of each face has one check of its Host header, one check of its origin and one check of its credentials (CLI-2b). Before, the MCP HTTP face compared the token itself, next to the token check of the server. The peer also kept its own token, host and origin functions.

MINOR: a breaking change before 1.0. Some refusals of the MCP HTTP face change, and some options of the MCP face stop with an error (decision D13).

Added:

- `ProcedureServer.admission(credentials)` admits a network request one time. It uses the request hook (`principalOf`), the token check and the authenticate function. It gives the admitted credentials and the principal, or `UNAUTHORIZED` with a message.
- A call with the admitted credentials gets the principal and the narrowing of the admission. The server does not do its checks again for it. A copy of the admitted credentials goes through the checks.
- The optional method `admission()` of `RequestHandler`, and the type `Admission`. The handler of a face of `createProcedureHost()` gives `admission()`.

Changed:

- The MCP HTTP face admits each HTTP request one time with `admission()` of its server. This applies to `initialize`, a tool call, the GET stream and the DELETE of a session.
- Each tool call of the request uses the admitted credentials.
- A request that the request hook refuses gets 401 with `WWW-Authenticate` at once. Before, such a client opened a session and listed the tools. Only each tool call got `UNAUTHORIZED`.
- The request hook operates for each HTTP request of the MCP face, also for a request without a tool call. A tool call adds no operation of the hook.
- A refusal of the token stays 401 with `UNAUTHORIZED`, the same message and the same `WWW-Authenticate` header.
- The token of `faces.http` of `createMcpHost()` becomes the token of the policy. The server checks it. Two different tokens in the policy and in `faces.http` stop the host with an error.
- `McpServerTransport` refuses `httpOptions.token` with an error at `start()`. Give the token to the server.
- `mcpFace({ token })` with a token that is not the token of the policy stops the factory with an error.
- `mcpFace()` stops with an error for a handler without `admission()` when the policy has a token or a request hook. Thus no request gets to the tools without a check.
- `guardMcpRequest` does only the browser checks. The option `token` is removed from `McpRequestGuardOptions`. A `token` option throws an error, so each token has its check.
- The MCP face takes `browser.allowedOrigins` of the policy as it is: a list, `"*"` or a function. Before, the face took only a list, and it ignored `"*"` and a function.
- The peer has no request checks of its own. Its origin rule (a loopback origin, or an origin of the list) is data for the browser checks of the core. The internal file `peer/security.ts` is removed. It was not an export.

Deprecated:

- `HttpTransportOptions.token` of `@procedures/mcp-server`. Give the token in the policy: `policy.token` of `createMcpHost()`, or `hostPolicy({ token })`.
- `McpFaceOptions.token`. Give the token only in the policy of the host.

Migration:

- A host with `faces: { http: { token } }`: no change. To prepare for the removal, move the token to `policy: { token }`.
- A caller of `new McpServerTransport(server, { httpOptions: { token } })`: give the token to the server, `new ProcedureServer({ token })`. Remove `token` from `httpOptions`.
- A caller of `guardMcpRequest(req, { token })` for a listener of its own: remove `token`. Then admit each request with `server.admission(credentials)`, and refuse it with 401 when `ok` is false.
- A caller of `mcpFace({ token })`: remove `token`, and give it in `hostPolicy({ token })`.
- A face of your own that gives `mcpFace()` a handler of its own: give the handler `admission: (credentials) => server.admission(credentials)`.
- An MCP client that a request hook refuses gets 401 at `initialize`. Give it valid credentials for each HTTP request.
- The site: no change. It has no MCP host, and it used no function of `peer/security.ts`.
- MiniMongo: no change. Its dev host has only the HTTP and WebSocket faces of `createProcedureHost()`. Each request of these faces had one check before.
- Graph: its `mcpFace()` on the procedures host uses the session hook for each HTTP request. An MCP client without a session gets 401 at `initialize`.
- Graph: outside the accounts mode, the policy has `allowedOrigins: "*"`. The MCP face takes it, as the HTTP face does. A request with a cookie still needs a named origin.
- Graph: to keep only the own origin on the MCP face, give `mcpFace({ allowedOrigins: [] })`. Its MCP host over stdio has no change.
- jarvis: no change. Its procedures host has only the HTTP face, and its MCP host has only stdio and SDK faces.
- `mark mcp --http --token` and `@procedures/mcp-dev-tools`: no change for a client. The token is the token of the server, and the server checks each HTTP request one time.
