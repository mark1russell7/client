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
- On the MCP HTTP face, the request hook and the authenticate function operate one time for each HTTP request. Their request has an empty method, the id `admission`, no payload and no metadata. Thus a hook must not use the method, the payload or the transport of the request.
- `admits()` and `identify()` give the same shape of request, with the ids `connection` and `identify`. The doc comments of `PrincipalOf` and `authenticate` tell this.
- An error of the request hook gives 401 with `UNAUTHORIZED`, as before. The code of the error, for example `UNAVAILABLE`, and its retry flag are not in the answer.
- A refusal of the token stays 401 with `UNAUTHORIZED`, the same message and the same `WWW-Authenticate` header.
- The token of `faces.http` of `createMcpHost()` becomes the token of the policy. The server checks it. Two different tokens in the policy and in `faces.http` stop the host with an error.
- `McpServerTransport` refuses `httpOptions.token` with an error at `start()`. Give the token to the server.
- `mcpFace({ token })` with a token that is not the token of the policy stops the factory with an error.
- `mcpFace()` stops with an error for a handler without `admission()` when the policy has a token or a request hook. Thus no request gets to the tools without a check.
- `guardMcpRequest` does only the browser checks. The option `token` is removed from `McpRequestGuardOptions`.
- `guardMcpRequest` has no point of creation. Thus the first call with a `token` option throws a `TypeError` that names the migration. Each later call with it gives a refusal with the status 500 and the same message, without an error. Each request stays refused, and the log of the app gets one error.
- `McpGuardResult.status` can also be 500, with the code `INTERNAL_ERROR`. Before, it was only 401, 403, 405 or 415. A caller that switches on `status` must handle 500.
- The MCP face takes `browser.allowedOrigins` of the policy as it is: a list, `"*"` or a function. Before, the face took only a list, and it ignored `"*"` and a function.
- With `"*"`, the MCP face sends no CORS header, as the HTTP face. A request with a cookie still needs a named origin (CSRF).
- A server with a request hook trusts the cookies of each request by default (`ambientCredentials: "always"`). On such a server, `"*"` permits no other origin, also for a request without a cookie.
- The peer has no request checks of its own. Its origin rule (a loopback origin, or an origin of the list) is data for the browser checks of the core. The internal file `peer/security.ts` is removed. It was not an export.

Deprecated:

- `HttpTransportOptions.token` of `@procedures/mcp-server`. Give the token in the policy: `policy.token` of `createMcpHost()`, or `hostPolicy({ token })`.
- `McpFaceOptions.token`. Give the token only in the policy of the host.

Migration:

- A host with `faces: { http: { token } }`: no change. To prepare for the removal, move the token to `policy: { token }`.
- A caller of `new McpServerTransport(server, { httpOptions: { token } })`: give the token to the server, `new ProcedureServer({ token })`. Remove `token` from `httpOptions`.
- A caller of `guardMcpRequest(req, { token })` for a listener of its own: remove `token`. Then admit each request with `server.admission(credentials)`, and refuse it with 401 when `ok` is false. Until you do this, the first request throws a `TypeError`, and each later request gets 500.
- A caller of `mcpFace({ token })`: remove `token`, and give it in `hostPolicy({ token })`.
- A face of your own that gives `mcpFace()` a handler of its own: give the handler `admission: (credentials) => server.admission(credentials)`.
- An MCP client that a request hook refuses gets 401 at `initialize`. Give it valid credentials for each HTTP request.
- The site: no change. It has no MCP host, and it used no function of `peer/security.ts`.
- MiniMongo: no change. Its dev host has only the HTTP and WebSocket faces of `createProcedureHost()`. Each request of these faces had one check before.
- Graph: its `mcpFace()` on the procedures host uses `graphPrincipalOf` for each HTTP request. In the accounts mode, a request without a session gets `ANONYMOUS`. Thus an MCP client without a session gets no 401 at `initialize`.
- Graph: in the mode `on` (`AUTH_MODE=on`), a request without a tenant token gets 401 at `initialize`. Before, the client opened a session and listed the tools, and each tool call got `UNAUTHORIZED`.
- Graph: accounts that are not ready (the error `UNAVAILABLE` of the hook) give 401 at `initialize`, with `WWW-Authenticate: Bearer`. Before, `initialize` passed, and each tool call got `UNAUTHORIZED`. An MCP client can start its OAuth discovery on this 401.
- Graph: outside the accounts mode, the policy has `allowedOrigins: "*"`. The MCP face takes it, as the HTTP face does. A request with a cookie still needs a named origin. With the default `ambientCredentials: "always"` of its request hook, `"*"` permits no other origin.
- Graph: to keep only the own origin on the MCP face, give `mcpFace({ allowedOrigins: [] })`. Its MCP host over stdio has no change.
- jarvis: no change. Its procedures host has only the HTTP face, and its MCP host has only stdio and SDK faces.
- `mark mcp --http --token` and `@procedures/mcp-dev-tools`: no change for a client. The token is the token of the server, and the server checks each HTTP request one time.
