# @procedures/mcp-dev-tools

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8
  - @procedures/bundle-mcp@0.27.8
  - @procedures/fs@0.27.8
  - @procedures/mcp-server@0.27.8
  - @procedures/compiler@0.27.8

## 0.27.7

### Patch Changes

- Updated dependencies [72718d7]
  - @procedures/mcp-server@0.27.7
  - @procedures/bundle-mcp@0.27.7
  - @procedures/client@0.27.7
  - @procedures/fs@0.27.7
  - @procedures/compiler@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6
  - @procedures/bundle-mcp@0.27.6
  - @procedures/fs@0.27.6
  - @procedures/mcp-server@0.27.6
  - @procedures/compiler@0.27.6

## 0.27.5

### Patch Changes

- Updated dependencies [2daba21]
  - @procedures/fs@0.27.5
  - @procedures/bundle-mcp@0.27.5
  - @procedures/client@0.27.5
  - @procedures/mcp-server@0.27.5
  - @procedures/compiler@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4
  - @procedures/mcp-server@0.27.4
  - @procedures/bundle-mcp@0.27.4
  - @procedures/fs@0.27.4
  - @procedures/compiler@0.27.4

## 0.27.3

### Patch Changes

- Updated dependencies [194cdfb]
  - @procedures/fs@0.27.3
  - @procedures/bundle-mcp@0.27.3
  - @procedures/client@0.27.3
  - @procedures/mcp-server@0.27.3
  - @procedures/compiler@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2
  - @procedures/bundle-mcp@0.27.2
  - @procedures/fs@0.27.2
  - @procedures/mcp-server@0.27.2
  - @procedures/compiler@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1
  - @procedures/compiler@0.27.1
  - @procedures/bundle-mcp@0.27.1
  - @procedures/fs@0.27.1
  - @procedures/mcp-server@0.27.1

## 0.27.0

### Minor Changes

- 7eac8b5: Each request of each face has one check of its Host header, one check of its origin and one check of its credentials (CLI-2b). Before, the MCP HTTP face compared the token itself, next to the token check of the server. The peer also kept its own token, host and origin functions.
  
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

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0
  - @procedures/mcp-server@0.27.0
  - @procedures/bundle-mcp@0.27.0
  - @procedures/fs@0.27.0
  - @procedures/compiler@0.27.0

## 0.26.2

### Patch Changes

- @procedures/bundle-mcp@0.26.2
  - @procedures/client@0.26.2
  - @procedures/fs@0.26.2
  - @procedures/mcp-server@0.26.2
  - @procedures/compiler@0.26.2

## 0.26.1

### Patch Changes

- @procedures/bundle-mcp@0.26.1
  - @procedures/client@0.26.1
  - @procedures/fs@0.26.1
  - @procedures/mcp-server@0.26.1
  - @procedures/compiler@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/compiler@0.26.0
  - @procedures/bundle-mcp@0.26.0
  - @procedures/fs@0.26.0
  - @procedures/mcp-server@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [1d66fae]
- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/mcp-server@0.25.0
  - @procedures/client@0.25.0
  - @procedures/compiler@0.25.0
  - @procedures/bundle-mcp@0.25.0
  - @procedures/fs@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1
  - @procedures/mcp-server@0.24.1
  - @procedures/bundle-mcp@0.24.1
  - @procedures/fs@0.24.1
  - @procedures/compiler@0.24.1

## 0.24.0

### Patch Changes

- @procedures/bundle-mcp@0.24.0
  - @procedures/client@0.24.0
  - @procedures/fs@0.24.0
  - @procedures/mcp-server@0.24.0
  - @procedures/compiler@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/mcp-server@0.23.0
  - @procedures/client@0.23.0
  - @procedures/bundle-mcp@0.23.0
  - @procedures/fs@0.23.0
  - @procedures/compiler@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/bundle-mcp@0.22.1
  - @procedures/fs@0.22.1
  - @procedures/mcp-server@0.22.1
  - @procedures/compiler@0.22.1

## 0.22.0

### Minor Changes

- 25822ee: The Streamable HTTP face of an MCP host keeps at most 256 sessions by default, and a task store keeps at most 1000 tasks (CLI-51). Before, the sessions had no limit by default. Thus one client could increase the memory of the host without a limit.
  
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

### Patch Changes

- Updated dependencies [25822ee]
  - @procedures/mcp-server@0.22.0
  - @procedures/bundle-mcp@0.22.0
  - @procedures/client@0.22.0
  - @procedures/fs@0.22.0
  - @procedures/compiler@0.22.0

## 0.21.0

### Patch Changes

- @procedures/bundle-mcp@0.21.0
  - @procedures/client@0.21.0
  - @procedures/fs@0.21.0
  - @procedures/mcp-server@0.21.0
  - @procedures/compiler@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/bundle-mcp@0.20.0
  - @procedures/fs@0.20.0
  - @procedures/mcp-server@0.20.0
  - @procedures/compiler@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/mcp-server@0.19.0
  - @procedures/bundle-mcp@0.19.0
  - @procedures/fs@0.19.0
  - @procedures/compiler@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1
  - @procedures/bundle-mcp@0.18.1
  - @procedures/fs@0.18.1
  - @procedures/mcp-server@0.18.1
  - @procedures/compiler@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/bundle-mcp@0.18.0
  - @procedures/fs@0.18.0
  - @procedures/mcp-server@0.18.0
  - @procedures/compiler@0.18.0

## 0.17.4

### Patch Changes

- @procedures/bundle-mcp@0.17.4
  - @procedures/client@0.17.4
  - @procedures/fs@0.17.4
  - @procedures/mcp-server@0.17.4
  - @procedures/compiler@0.17.4

## 0.17.3

### Patch Changes

- @procedures/bundle-mcp@0.17.3
  - @procedures/client@0.17.3
  - @procedures/fs@0.17.3
  - @procedures/mcp-server@0.17.3
  - @procedures/compiler@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
- Updated dependencies [571dad1]
  - @procedures/client@0.17.2
  - @procedures/mcp-server@0.17.2
  - @procedures/bundle-mcp@0.17.2
  - @procedures/fs@0.17.2
  - @procedures/compiler@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1
  - @procedures/bundle-mcp@0.17.1
  - @procedures/fs@0.17.1
  - @procedures/mcp-server@0.17.1
  - @procedures/compiler@0.17.1

## 0.17.0

### Minor Changes

- 5fbc976: The Streamable HTTP face of an MCP host has no listener of its own (CLI-11, step 2). The runner of the process owns the port, the stop in stages and the exit.
  
  MINOR: a breaking change before 1.0. Version 0.14.x deprecated each part that this release removes (decision D13).
  
  Removed:
  
  - The options `port`, `host` and `server` of `HttpTransportOptions`, and the function `listen()` of `McpHttpTransport`. The endpoint answers only through its handler: `McpHost.handleHttp`, `McpServerTransport.handleHttp` or the face of `mcpFace()`. A request of another path gets false from the handler, and the listener answers it.
  - `McpServerTransportState.url` of an HTTP face is the path of the endpoint (`/mcp`), not a URL. The owner of the listener knows the address.
  - `startDevToolsServer()` of `@procedures/mcp-dev-tools`. Use `runDevToolsServer()`, which runs the server under `run()` of `@mark1russell7/service`.
  
  The option `mount` has no effect now, because the endpoint is always mounted. It stays one more release as a deprecated option, so code that followed the migration of 0.14.x compiles.
  
  Migration:
  
  - A host with `faces.http: { port, host }`: give `faces.http: {}`. Mount `host.handleHttp` on a listener, for example an `httpTransport` of `@mark1russell7/service/http`, and declare the listener and the host on a service (`host.declare(svc)`). The README of `@procedures/mcp-server` has the example.
  - A caller of `startDevToolsServer()`: call `runDevToolsServer(config)`.
  - The site, MiniMongo, Graph and jarvis: no change. Graph mounts `mcpFace()` on its procedures host, and its stdio MCP host and the host of jarvis use stdio and SDK faces.

### Patch Changes

- Updated dependencies [5fbc976]
  - @procedures/mcp-server@0.17.0
  - @procedures/bundle-mcp@0.17.0
  - @procedures/client@0.17.0
  - @procedures/fs@0.17.0
  - @procedures/compiler@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/bundle-mcp@0.16.0
  - @procedures/fs@0.16.0
  - @procedures/mcp-server@0.16.0
  - @procedures/compiler@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/mcp-server@0.15.1
  - @procedures/bundle-mcp@0.15.1
  - @procedures/fs@0.15.1
  - @procedures/compiler@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/bundle-mcp@0.15.0
  - @procedures/fs@0.15.0
  - @procedures/mcp-server@0.15.0
  - @procedures/compiler@0.15.0

## 0.14.1

### Patch Changes

- a96c870: The MCP hosts run under `run()` of `@mark1russell7/service` (CLI-11, step 1).
  
  - `McpHost.declare(svc)` gives an MCP host to a service. The server of the host is a transport part, and each storage is a dependency. A host with a stdio face declares the trigger `stdin-close`. Then the runner starts the host and stops it in stages.
  - `McpHost.handleHttp(req, res)` answers for the Streamable HTTP face with `mount: true`. Mount it on a listener, for example an `httpTransport` of `@mark1russell7/service/http`.
  - `runDevToolsServer()` of `@procedures/mcp-dev-tools` runs the dev-tools server under `run()`. Over stdio, the profile is `ephemeral`, and the end of the input stops the server. With HTTP, the profile is `localDev`, and a listener of the service answers at `/mcp`. `dist/server.js` and `mark mcp` use it.
  
  PATCH: each change adds a function or an option, and the old ones still operate.
  
  Deprecated, and the next MINOR removes them (decision D13):
  
  - The listener of the Streamable HTTP face: the options `port`, `host` and `server` of `HttpTransportOptions`, and `McpHttpTransport.listen()`. Give `mount: true`, and mount `McpHost.handleHttp` on a listener of the service.
  - `startDevToolsServer()` of `@procedures/mcp-dev-tools`. Use `runDevToolsServer()`.
  
  Migration for the next MINOR: the site uses none of them. MiniMongo uses none of them. Graph mounts `mcpFace()` on its host, and its stdio host keeps `createMcpHost()` with `stdio`: no change. jarvis uses `createMcpHost()` with stdio and SDK faces: no change. A host with `faces.http: { port }` moves to `faces.http: { mount: true }` and a listener of the service.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [5efe2d2]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
- Updated dependencies [a96c870]
  - @procedures/mcp-server@0.14.1
  - @procedures/client@0.14.1
  - @procedures/compiler@0.14.1
  - @procedures/bundle-mcp@0.14.1
  - @procedures/fs@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/mcp-server@0.14.0
  - @procedures/bundle-mcp@0.14.0
  - @procedures/fs@0.14.0
  - @procedures/compiler@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/bundle-mcp@0.13.2
  - @procedures/fs@0.13.2
  - @procedures/mcp-server@0.13.2
  - @procedures/compiler@0.13.2

## 0.13.1

### Patch Changes

- @procedures/bundle-mcp@0.13.1
  - @procedures/client@0.13.1
  - @procedures/fs@0.13.1
  - @procedures/mcp-server@0.13.1
  - @procedures/compiler@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/bundle-mcp@0.13.0
  - @procedures/fs@0.13.0
  - @procedures/mcp-server@0.13.0
  - @procedures/compiler@0.13.0

## 0.12.2

### Patch Changes

- @procedures/bundle-mcp@0.12.2
  - @procedures/client@0.12.2
  - @procedures/fs@0.12.2
  - @procedures/mcp-server@0.12.2
  - @procedures/compiler@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
  - @procedures/bundle-mcp@0.12.1
  - @procedures/fs@0.12.1
  - @procedures/mcp-server@0.12.1
  - @procedures/compiler@0.12.1

## 0.12.0

### Patch Changes

- @procedures/bundle-mcp@0.12.0
  - @procedures/client@0.12.0
  - @procedures/fs@0.12.0
  - @procedures/mcp-server@0.12.0
  - @procedures/compiler@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/mcp-server@0.11.0
  - @procedures/client@0.11.0
  - @procedures/bundle-mcp@0.11.0
  - @procedures/fs@0.11.0
  - @procedures/compiler@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/bundle-mcp@0.10.0
  - @procedures/fs@0.10.0
  - @procedures/mcp-server@0.10.0
  - @procedures/compiler@0.10.0

## 0.9.2

### Patch Changes

- @procedures/bundle-mcp@0.9.2
  - @procedures/client@0.9.2
  - @procedures/fs@0.9.2
  - @procedures/mcp-server@0.9.2
  - @procedures/compiler@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/mcp-server@0.9.1
  - @procedures/fs@0.9.1
  - @procedures/bundle-mcp@0.9.1
  - @procedures/compiler@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/bundle-mcp@0.9.0
  - @procedures/fs@0.9.0
  - @procedures/mcp-server@0.9.0
  - @procedures/compiler@0.9.0

## 0.8.1

### Patch Changes

- 2523b1b: One MCP host factory, `createMcpHost()`, and the questions of a procedure to the person at the caller (CLI-10, CLI-12). PATCH: new exports and new optional options before 1.0.0. The old exports and their behavior stay.
  
  - `@procedures/mcp-server`: `createMcpHost(options)` builds the registry (or the modules), the tool surface, the read-only narrowing, the host policy, the `ProcedureServer` and one `McpServerTransport` for each face (stdio, Streamable HTTP, SDK transports). The stdio face stops the host when its input ends, and `host.closed` resolves. `mcp.serve` and the dev-tools server use the factory. Thus `mcp.serve` gets its options from `hostPolicy()`, and it takes `readOnly` and `instructions`.
  - `@procedures/client`: `ctx.elicit` asks the person at the caller for input or a confirmation. The helpers `elicitInput()` and `elicitConfirmation()` give the action `unavailable` with a reason when no one can answer. `elicitWithPolicy()` adds the consents of the operator (`operatorConsent`), and `ask: false` turns the questions off. The operator answers only when the face cannot ask. A failed question of a face that can ask (a timeout, a lost connection) gives `unavailable`, and an abort gives `cancel`. `ServerRequest` and `InvokeOptions` get `elicit` and `progress`.
  - `@procedures/client`: `ctx.progress` tells the caller the progress of the call of the host. `metadata.untrusted` declares the output fields with text from outside the host, and `metadata.title` gives the title of a tool. `metadata.toolHints` can make a tool look more dangerous than its effects (`readOnlyHint: false`, `idempotentHint: false`, `destructiveHint: true`, `openWorldHint: true`). The registry refuses each other value, and `toolHintsOf()` gives the hints with the override.
  - `@procedures/mcp-server`: `McpServerTransport` answers `ctx.elicit` with MCP elicitation (form and URL), over stdio and Streamable HTTP. It sends `ctx.progress` as `notifications/progress`, and it gives the instructions of the server. An untrusted field goes in envelopes with a random id, and its text cannot close its envelope. The option `content` can give other text blocks for a result. The option `json: "compact"` gives the JSON of the default blocks on one line. The option `toolName` gives the name of each tool, so a server that moves to the host keeps its tool names. A call finds its procedure by the tool, not by the decoded name. Each tool call over Streamable HTTP carries the credentials of its HTTP request, so the request hook `principalOf` and the token check of the server apply to it. A server that reads cookies gets the CSRF rule on this face too.
  - `@procedures/mcp`: a tool gets `title` from `metadata.title`. In the output schema, each untrusted field is a string.
  - `@procedures/mcp-dev-tools`: `createDevToolsHost()` gives the MCP host as `mcp`. `dist/server.js` ends its process when the client closes the input of stdio. The tool list stays the same.
- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/mcp-server@0.8.1
  - @procedures/bundle-mcp@0.8.1
  - @procedures/fs@0.8.1
  - @procedures/compiler@0.8.1

## 0.8.0

### Minor Changes

- 3f376af: The root of the files confines each procedure, not only `fs.*` (roadmap R33). `mark --fs-root`, `procedure-server --fs-root` and `MCP_FS_ROOT` start `confineToRoot()` of `@procedures/fs`. Each procedure keeps its paths in the root, or the host refuses it with `FORBIDDEN` and the reason `outside-root`.
  
  This change is breaking under a root. The hosts refuse procedures that they ran before: `git.*`, `pnpm.*`, `docker.run`, `docker.build`, `docker.compose.*`, a call of `shell.run`, and each procedure that reaches files without `metadata.fsRoot`. `lib.scan` of a workspace outside the root gives `FORBIDDEN`, not a warning. Without a root, nothing changes. The list of the MCP tools does not change.

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/fs@0.8.0
  - @procedures/bundle-mcp@0.8.0
  - @procedures/mcp-server@0.8.0
  - @procedures/compiler@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/bundle-mcp@0.7.0
  - @procedures/fs@0.7.0
  - @procedures/mcp-server@0.7.0
  - @procedures/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [72a8c65]
  - @procedures/bundle-mcp@0.6.0
  - @procedures/client@0.6.0
  - @procedures/fs@0.6.0
  - @procedures/mcp-server@0.6.0
  - @procedures/compiler@0.6.0

## 0.5.0

### Minor Changes

- a47bee6: The hosts can confine the file procedures to a root (roadmap R33).
  
  - `confineFsProcedures(registry, root)` of `@procedures/fs` replaces the handler of each `fs.*` procedure of a registry with the handler of `createFsModule({ root })`. It adds no procedure. A nested `fs.*` call of another procedure is confined too. The root must be a folder that exists.
  - `mark --fs-root <folder>` confines the `fs.*` procedures of each mode and host of `mark`: a command, the REPL, `--server`, `serve` and `mcp`. Give the flag before the command.
  - A `mark` command uses a CLI server only when the server has the same root. The lockfile of `@procedures/peer` has the new field `fsRoot`, and `findServer()` compares it.
  - `procedure-server --fs-root <folder>` and `mark serve --fs-root <folder>` confine the procedures of the server.
  - The MCP server reads `MCP_FS_ROOT`, and `mark mcp` has the flag `--fs-root`. `fs` is not a tool namespace, so the tools do not change.
  - A path outside the root gives `FORBIDDEN` with the reason `outside-root`. A procedure that reads files with `node:fs`, or that starts a program, is not confined.
  - `@procedures/lib/cli-flags` has the global flags `--fs-root` and `--events`, and the field `repeatable`.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/fs@0.5.0
  - @procedures/bundle-mcp@0.5.0
  - @procedures/mcp-server@0.5.0
  - @procedures/compiler@0.5.0

## 0.4.0

### Minor Changes

- cc3f5f6: Breaking change of the MCP tool names: the tools `db.query`, `db.execute`, `db.tables` and `db.schema` change to `sqlite.query`, `sqlite.execute`, `sqlite.tables` and `sqlite.schema`. A client or a stored program that calls a `db.*` tool must use the new name. The number of tools stays 91.
  
  `mcpNamespaces` has `sqlite` and not `db`, so the deprecated `db.*` aliases of `@procedures/sqlite` are not tools. `mcpExclude` has `sqlite.transaction`, `sqlite.migrate` and `sqlite.backup`. The bundle also registers the module of `@procedures/dag` (`dag.traverse`), but `dag` is not a tool namespace.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [cc3f5f6]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/bundle-mcp@0.4.0
  - @procedures/mcp-server@0.4.0
  - @procedures/compiler@0.4.0

## 0.3.0

### Minor Changes

- 29a7b29: Outputs of the compiler (roadmap R23). `toMermaid()`, `diagramProgram()` and the procedure `program.diagram` draw a program as a Mermaid flowchart from its IR: the steps of a chain in order, the fork and the join of `client.parallel`, the decision of `client.conditional`, the `try` part and the `error` arrow of `client.tryCatch`, the loop of `client.map` and `client.reduce`, the stop arrows of `client.and` and `client.or`, and a dotted arrow from each name to each `$ref` that reads it. Dynamic and deferred calls have their own class, and `mermaidText()` writes each unsafe character as an entity code, so no label can break the syntax. `explainProgram()` and the procedure `program.explain` give the effects of a program, each call with its declared effects and the answer of `explainInvocation()` under the capability (the capability of the caller when the input has none), the diagnostics and a short summary. `toOpenRpc()` and the procedure `sdk.openrpc` write the manifest as an OpenRPC 1.3 document, with the effects as `x-effects`. `toTypeScriptSdk()` and the procedure `sdk.typescript` write a typed TypeScript SDK: an input type and an output type for each procedure, and `createSdk(client)` with `sdk.<namespace>.<name>(input)` methods. A test type-checks the SDK of the core procedures. `sdk` is not an MCP tool namespace. In `@procedures/mcp`, the description of a tool for a defined procedure with `inferredEffects` gets a sentence such as "It reads fs and changes store." (`toolDescription()`). The MCP server of `@procedures/mcp-dev-tools` has the tools `program.diagram` and `program.explain` (67 tools).
- c66f0c4: Twelve new `docker.*` tools of roadmap R41: `compose.build`, `compose.logs`, `compose.ps`, `compose.restart`, `images`, `inspect`, `network.create`, `network.list`, `network.remove`, `tag`, `volume.create` and `volume.list`. The MCP server has 79 tools. `docker.prune`, `docker.push` and `docker.volume.remove` are not tools: the first one deletes in bulk, the second one can carry an image out, and the third one deletes the data of a volume.
- 1779d96: The pure transforms of `@procedures/json` are MCP tools (roadmap R39): `json.query`, `json.patch`, `json.diff`, `json.merge`, `json.validate`, `yaml.parse` and `yaml.stringify`. A program that Claude runs through `client.chain` can use them in its steps. The MCP server has 86 tools. `@procedures/http` is not a tool namespace, because a request can carry data out.
- 3d24d5b: MCP over Streamable HTTP (roadmap R26), the HTTP transport of the current MCP specification. `McpServerTransport` takes `transport: "http"` and `httpOptions` (port, host, path, token, allowed origins, or an HTTP server of its own). Each client gets a session with an MCP server of its own, and so gets the progress of a tool call and the `list_changed` notifications. The endpoint listens on loopback by default, refuses a web page of another host or origin, and with a token refuses a request without the token. `mark mcp --http <port> [--host <host>] [--token <token>]` (or `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN`) serves the dev tools over it. Before, the package had only stdio, and its SSE transport only threw.
- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- f5ed492: The check before the run in the hosts (roadmap R22). `programCheckInterceptor()` of `@procedures/compiler` checks the program of each call to a data-driven procedure before the first step. When the check finds an error, no step starts, so a refusal in step 3 comes before the write of step 1. The MCP server of `@procedures/mcp-dev-tools` uses it (`MCP_PROGRAM_CHECK=false` turns it off). `bundle-mcp` and `bundle-dev` have the compiler module, so Claude gets the tools `program.check` and `program.compile` (65 tools), and `mark program check` works.
- 5b7b673: Five new tools of roadmap R44: `db.tables`, `db.schema`, `lib.graph`, `mongo.documents.distinct` and `mongo.documents.explain`. They change nothing. The MCP server has 91 tools. `mongo.watch`, `mongo.documents.bulk`, `db.transaction`, `db.migrate` and `db.backup` are not tools: the first one is a stream without an end, and the others change data in bulk or change the database file.

### Patch Changes

- fb30718: Typed durations (roadmap R11). This change breaks the API. Each public option that is a time takes a `Duration` of `@mark1russell7/quantity`, made with `ms()`, `seconds()`, `minutes()` or `hours()` of `@procedures/client`. A plain number is a type error, and at run time the option throws a `TypeError` that names it. This covers the timeouts and `resilience()`, the retry delays, the cache, the circuit breaker, the rate limit, the HTTP, WebSocket and mock transports, the WebSocket server heartbeat, `timeoutInterceptor({ limit })` (was `ms`), `hostPolicy({ timeout })` (was `timeoutMs`), the idempotency cache (`ttl`, was `ttlMs`), `ApiStorage`, `HybridStorage`, the synced registry and `connect()` of the peer. The per-call overrides in a context (`timeout`, `retry.delay`, `cache.ttl`) and the `route()` overrides (`timeout.overall`, was `timeout.ms`) take durations too. The wire and the inputs of procedures keep milliseconds.
  
  Migration: `createOverallTimeoutMiddleware({ overall: 5000 })` becomes `createOverallTimeoutMiddleware({ overall: seconds(5) })`.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [29a7b29]
- Updated dependencies [9bc2ddb]
- Updated dependencies [a70d445]
- Updated dependencies [c66f0c4]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [1779d96]
- Updated dependencies [3d24d5b]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [f5ed492]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [5b7b673]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/compiler@0.3.0
  - @procedures/bundle-mcp@0.3.0
  - @procedures/mcp-server@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/mcp-server@0.2.3
  - @procedures/bundle-mcp@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/bundle-mcp@0.2.2
  - @procedures/mcp-server@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/bundle-mcp@0.2.1
  - @procedures/mcp-server@0.2.1

## 0.2.0

### Minor Changes

- 0cf4bea: **Invocation capabilities** (packages/documentation/CAPABILITIES-2026-10.md, the guide is client/docs/CAPABILITIES.md). Each call operates with a capability: a clearance, permitted effects and a deadline. A nested call gets the same capability or a narrower one.
  
  - Procedures declare `metadata.effects` (`reads`, `writes`, `destructive`, `idempotent`). Each procedure of these packages declares them.
  - `hostPolicy({ capability, readOnly, clearanceOrder, resources, admitItem })`, and `new Client({ capability })`. A refused call gives `FORBIDDEN` (HTTP 403) with a reason.
  - `ctx.capability` and `ctx.resources` are new required fields of `ProcedureContext`. A test that makes a context by hand adds `capability: {}` and `resources: {}`.
  - An application gives its clearance and resource types by augmenting `Register`.
  - The timeout interceptor sets the deadline of the capability, and a remote call sends the remaining time.
  - The MCP tools have hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) from the effects. `mark mcp --read-only` (or `MCP_READ_ONLY=1`) serves only the tools that change nothing.
  - **Breaking:** `git.remote` only reads the URL. `git.remote.set` sets it (before: `git.remote` with `url`).

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/bundle-mcp@0.2.0
  - @procedures/mcp-server@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
