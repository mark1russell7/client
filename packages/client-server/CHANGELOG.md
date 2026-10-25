# @procedures/peer

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- 345c740: `server.create` counts the procedures when `autoRegister` has its default (true). Before, `procedureCount` was 0 (second code audit, roadmap O57).
- 2572f41: The MCP face stays on its listener through the drain (roadmap CLI-74).
  
  PATCH: a fix with no API change (D34).
  
  - Before, the mount of the MCP face stopped at the stage `stop intake`. On the listener of a procedures host, the listener closed, and each request got its plain 503. Thus the answer of an elicitation and a cancel did not reach a call in progress.
  - Now the handler of `mcpFace()` and `McpHost.handleHttp` have `until: "close transports"`, as a `RequestHandler` of `@mark1russell7/service/http`. The procedures host gives the `until` of the handler of each face to its mount.
  - During the drain, the answer of an elicitation, a cancel and a ping reach the session. A new session and a new GET stream get the 503 of the face. A new tool call gets `UNAVAILABLE` from the server.
  - The face ends the SSE stream of a cancelled call. The SDK sends no answer to a cancel, so that stream held the drain of the listener until its deadline.
  - Mount `host.handleHttp` itself, for example `listener.mount(host.handleHttp)`. A function that wraps it loses `until`. The dev-tools server mounts it in this way.
  - A change you can see: during a drain, a listener with the MCP face answers a new connection with 503 and `Retry-After` until the stage `close transports`. Before, the listener closed at the stage `stop intake`.
  - Note on the stop time: the cap of the drain does not change, and a stream of the face does not hold the drain past its deadline. A listener with the MCP face now answers a new connection with 503 until the stage `close transports`, and does not refuse it. The test `mcp-stop.test.ts` of `@procedures/peer` measures each stop on the fake clock.
- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- 1834a5e: Fixes for the correctness findings of the second audit pass (roadmap O56).
  
  PATCH: bug fixes. A caller that used the documented behavior sees no change.
  
  - `server.call` of `@procedures/peer` with `address` closes the connection that it makes for the call: after a success, an error and an abort. Before, each call left its client, its entry in the map of the connections and, with WebSocket, an open socket.
  - `parseIcs()` of `@procedures/ics` ignores the properties of a component inside an event. Before, the UID and the SUMMARY of a VALARM (Apple and iCloud give each alarm a UID) replaced those of the event.
  - EXDATE and RECURRENCE-ID of an event with a TZID now name an occurrence by its date in that zone. Before, the occurrences were compared by their date in UTC, so an evening event in a zone west of UTC kept its excluded occurrence and showed its override next to the original. `exdates` and `recurrenceId` hold dates in the zone of `tzid`: a value in UTC or in another zone changes to it.
  - `select()` of `@procedures/collections` withdraws the receives of the cases that lose, and `merge()` keeps no receive on an input while it waits for its reader. Before, each case that lost took the next value of its channel and dropped it, and `merge()` dropped about half of the values. `select()` now also gives a value that is `undefined` (a `Channel<void>`). New: `AsyncQueue.waitTake()`, `Channel.waitReceive()` and the optional `wait` of a `SelectCase`. `merge()` takes the inputs in turn.
  - `shell.run` of `@procedures/shell` refuses an encoding that `Buffer` does not know at the validation of its input. `runCommand()` gives a failure result and `streamCommand()` throws, before they start the program. Before, the decode threw in the listener of the child, which ended the host, and the call never settled. Each encoding that worked before still works.
  - `getTree()` of `ProcedureRegistry` in `@procedures/client` no longer writes into the stored procedures. When a path is a procedure and also the namespace of longer paths, its node is a namespace, and the procedure is at the key `""` of that node. Before, a longer path wrote its segment into the stored procedure of the shorter path (a segment such as `handler` replaced its handler), or replaced the namespace.
  
  Notice of the next MINOR: it makes the ReDoS guard of `$regex` in the collection queries of `@procedures/client` stricter. The guard will refuse a pattern with a variable or overlapping repeated group, for example `(a|a)*` or `(\w+\s){2}`. Write such a pattern without the repeated group, for example `\w+\s\w+\s`. Only a host that turns `$regex` on sees the change.
- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- 8970a1e: The credentials of a network request have the connection of its socket (CLI-71). Thus the request hook (`principalOf`), `authenticate` and `ProcedureServer.admission()` can find the caller from its TCP peer. The fleet site finds the Claude session of a caller with it and `resources.peer` of headroom.
  
  PATCH: a new optional field and a new optional input. Before 1.0, a feature that is compatible with the old API is a PATCH. A hook that does not read the field sees no change.
  
  Added:
  
  - `Credentials.connection`, of the new type `RequestConnection`: the `remoteAddress`, the `remotePort`, the `localAddress` and the `localPort` of the socket, as frozen plain data.
  - Each field of `RequestConnection` is optional. A Unix socket and a named pipe have no ports, and a socket that closed has no addresses.
  - The optional `socket` of the request of `requestCredentials()`. With it, the credentials have the connection. Without it, the credentials stay as before.
  
  Changed:
  
  - The HTTP face (`procedureHandler`, `HttpServerTransport`) sets the connection on the credentials of each request.
  - The WebSocket face sets it on the credentials of the upgrade (`admits()`) and of each call over that connection.
  - The MCP HTTP face sets it on the credentials of the one admission of each HTTP request. The admitted credentials keep it. A tool call uses them, and the server does not do the checks again for it (CLI-2b).
  - With a handler without `admission()`, the MCP HTTP face gives each tool call the credentials of its HTTP request, with the connection. Before, the face read the same headers and query again from the request information of the SDK, without the connection.
  - A local request has no connection: a call in this process, MCP over stdio or a message port.
  - An SDK transport of the application (`sdkTransport` of `McpServerTransport`, for example the legacy SSE transport of the MCP SDK) gives no connection. The SDK gives only the headers and the URL of each request, not its socket.
  
  Notes:
  
  - The connection comes only from the socket. It does not come from `X-Forwarded-For` or `Forwarded`. Behind a proxy, the peer is the proxy. Thus a request hook that trusts the connection there sees the proxy.
  - The key of the idempotency cache has the principal (audit s21). When the principal comes from the connection, two callers behind one address can have one principal. Then a call of one caller can get the cached result of a call of the other caller with the same idempotency key.
  - The admitted credentials and their identity (CLI-2b) do not change. A copy of the admitted credentials still goes through the checks.
- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

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

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- 4261f65: Breaking: each `mark` command starts under `run()` of `@mark1russell7/service` (CLI-26, decision D17). The cold mode runs the procedures host of the CLI server in its own process. The runner owns the signals, the stop in stages and the exit. Thus the exit codes of a signal change. The release before this one marked the old behaviors as deprecated.
  
  The new behavior:
  
  - Each `mark` command that runs a procedure is a service of one request, with the profile `ephemeral`. `mark` has no signal handler and no `process.exit` of its own in this path. `interruptSignal()` is gone.
  - The cold mode (no CLI server in this folder, or `--local`): the host has the same registry and policy as `mark --server` (`markHostOptions()`), and no listener, port, token or lockfile. The client sends each call through the local face of the host.
  - `localFace()` of `@procedures/peer` is new. It gives a face factory and a transport of `@procedures/client`. A `Client` on the transport sends its calls to the host of the same process, through the request tracking of the service, with `LOCAL_CREDENTIALS`.
  - A first Ctrl-C starts the stop, and the drain aborts the call at once.
  - The warm mode: the call to the CLI server gets the abort signal. A Ctrl-C aborts the call on the server too. Before, the signal ended `mark`, and the server continued the call.
  - After the command, the runner ends the process with the exit code of the command. A timer or a socket that a procedure left open does not keep the process alive.
  - `run()` and `main()` of `@procedures/mark` get the optional options `run` (the options of `run()`: the process port and the clock) and `ownsProcess`. The bin gives `ownsProcess: true`. Without it, a program keeps its process: no signal handler, and the exit code goes to `process.exitCode`.
  - `CliContext` gets the optional field `registry`. `executeArgs()` does not use `ctx.client` for a command any more.
  - A program that calls `run()` or `executeArgs()` without a port, and the REPL (`mark -i`), get no signal handler for a command.
  
  The exit codes, in the cold mode and in the warm mode:
  
  | Event | Before | From this release |
  |---|---|---|
  | The command ends without a failure | 0 | 0 |
  | The command fails | 1 | 1 |
  | The first Ctrl-C, cold mode | 1 | 130 |
  | The first Ctrl-C, warm mode | the signal ended the process (the shell showed 130) | 130 |
  | `SIGTERM` | the signal ended the process (the shell showed 143) | 143 |
  | A second signal during the stop, cold mode | 130 | 1 |
  
  A cold `mark server create` keeps its peer only until the end of the command. Before, the peer kept the process alive after the command.
  
  Migration:
  
  - A script that reads the exit code of an interrupted `mark` command: read 130 for a Ctrl-C, also in the cold mode. Read 1 for a second signal.
  - A script that starts `mark server create` as a server in the foreground: start `mark --server` or `procedure-server` in its place.
  - A program that calls `run()`, `main()` or `executeArgs()` of `@procedures/mark`: no change. It keeps its process. Give `ownsProcess: true` to give the process to the runner, as the bin does.
  - The site: no change. It does not start `mark`.
  - MiniMongo: no change. Its dev host starts through `runProcedureHost()`, not through `mark`.
  - Graph: no change. It does not start `mark`.
  - jarvis: no change, unless a script of jarvis reads the exit code of an interrupted `mark` command. Then apply the first step.
- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- f20beb1: The task store of an MCP host gives each client a fair share of its tasks (CLI-69). Before, the sessions of one client could fill the store (CLI-51). Then each other client got `TASKS_FULL` until those tasks ended their time.
  
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
- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- 8281370: The probes use the option `kinds` of `@mark1russell7/service` 0.5.8 (SYS-30).
  
  - Each listener of `createProcedureHost()` asks `probeHandler()` for the kinds `startup`, `readiness` and `liveness`. The host has no filter of its own for `/_probes/report`. The answers do not change: the report path goes on to the next handler, as before.
  - The probe port of `runProcedureHost()` takes the new option `probes.kinds`. The default is all four kinds, as in 0.17.3. Leave out `report` on a port that is not private.
  - The packages of the group use `@mark1russell7/service` `^0.5.8`, so a host has one copy of the service.
- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- 636f098: New: the procedures host answers the health probes of its service (CLI-9, decision D5). The probes come from `probeHandler()` and `probeServer()` of `@mark1russell7/service/http`. This change is additive, thus it is a PATCH of the client group (decision D13).
  
  - Each listener of `createProcedureHost()` answers `GET /_probes/startup`, `/_probes/readiness` and `/_probes/liveness` from the health of the service. The answer is 200, or 503 with `Retry-After` during the startup and the shutdown. `/_probes/readiness/<controller>` gives the readiness of one controller.
  - The probes need no token and pass no browser check. They give only the status. They mount before the faces, thus a probe path never reaches a procedure. Each other path goes to the faces with the token and the browser checks, as before.
  - A listener does not answer the report of the service (`/_probes/report`), because it names the checks and the dependencies. The procedure `host.health` gives the details with the token.
  - The probes of a listener stop when the intake stops. Thus the listener still closes at the stop of the intake, and a new connection is refused, as before. `probes: { until: "close transports" }` keeps the listener open through the drain: the probes answer 503, and each other request gets 503 with `Retry-After`.
  - The new option `probes` of `createProcedureHost()`: `{ prefix, until }` changes the prefix and the last stage, and `false` turns the probes off. `HOST_PROBE_PREFIX` is `/_probes`. `host.info.probes()` gives the base URL of the probes on each listener.
  - The new option `probes` of `runProcedureHost()`: `{ port, host, prefix, retryAfter }` declares a probe server on a port of its own (`svc.healthServer(probeServer(...))`). It starts first and closes last, thus its probes answer through the whole drain. It also answers `/report`. The listeners of the host then answer no probes, unless the host options give `probes`. `probes()` of the result gives the base URL of each place that answers the probes.
  - The new flag `--probe-port <port>` of `procedure-server`, `mark serve` and `mark --server` gives the probe server, on the address of `--host`. `mark` refuses it without `--server` before a command, as it refuses `--port`. The startup prints the URL of the probes.
  
  Deprecated: at the timeout of 15 s, `server.start` gives `success: true` with the message "still loading" while the process still starts. From the next MINOR of the client group, a start that is not ready at the timeout gives `success: false`, with the PID of the process that still starts. Read the readiness probe or `mark server status` for the state.
  
  The site, MiniMongo, Graph and jarvis: no change. A host with a listener now also answers the paths under `/_probes`. Before, these paths got 404.
- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- c78da2d: The procedures server can limit the calls of each principal, tenant or route (server stack CLI-40). This change is additive. Without the new option, nothing changes. Thus it is a PATCH of the client group (decision D13).
  
  The new behavior:
  
  - `hostPolicy()` and `ProcedureServer` of `@procedures/client` have the new option `limits`. Each limit has a name, a key over the call, the calls that it covers, a limit policy, a store and a bound on its keys.
  - The key is the principal, a claim of the principal (`{ claim: "tenant" }`), the route, a list of these, or a function of the call. A call without a value of its key is outside the limit.
  - The option `covers` takes `{ writes: true }` for only the calls that can change data, `{ routes: [...] }` for some procedures, or a function of the call.
  - Each limit is a keyed limiter of `@mark1russell7/service/limiter` (SYS-28) on the clock of the server. The option `limitStores` gives the stores that the replicas share.
  - The server takes one unit of each limit that covers a call, after the authentication and before the run. This is one step for each face: HTTP, WebSocket, MCP and the calls in the process.
  - A call above a limit gets the new error code `RATE_LIMITED` (retryable). Its metadata has the wait in `retry-after` (milliseconds) and the cause in `reason` (`limit`, `cap` or `store`). The call does not run.
  - HTTP gives 429 with `Retry-After` in whole seconds. WebSocket gives the same code and metadata. MCP gives the code, `reason` and `retryAfterMs` in `_meta`.
  - A circuit breaker does not count `RATE_LIMITED`, because the server is healthy.
  - `createProcedureHost()` of `@procedures/peer` declares each limiter on its service with `svc.limiter()`. Thus `describe()` and `lint()` see it. `host.limiters` gives the limiters, and `ProcedureServer.limiters()` gives them too.
  - The rate limit middleware of the client (`createRateLimitMiddleware`) uses the same keyed limiter. Its bucket, its queue and its statistics do not change. The new option `clock` gives the clock of the bucket and of the queue. The default is `Date.now()` and `setTimeout`, as before.
  - The `Retry-After` header of the HTTP face rounds the wait up to whole seconds with the rule of `@mark1russell7/service`. A wait above a whole second only by an error of floating point does not add a second.
  - The client packages use `@mark1russell7/service` 0.5.3 and `@mark1russell7/algebra` 0.7.2.
  
  An example for the writes of each tenant:
  
  ```ts
  hostPolicy({
    principalOf,
    limits: [
      {
        name: "graph.writes",
        key: { claim: "tenant" },
        covers: { writes: true },
        policy: { type: "sliding-window", limit: { value: 120, unit: "count" }, window: { value: 1, unit: "min" } },
        store: { kind: "local" },
        evict: { maxKeys: { value: 10000, unit: "count" } },
      },
    ],
  });
  ```
- 534e4ea: Fixed: `bearerOf` also reads the scheme of an `Authorization` header in another case (CLI-60). RFC 7235 makes the scheme case-insensitive, with one or more spaces (`1*SP`) before the token. Before, `bearerOf` read only a header that starts with `Bearer ` and one space, so a correct `bearer <token>` got 401.
  
  Each header that `bearerOf` read before gives the same token. A correct header in another case passes too, also with more spaces before the token.
  
  - A header that starts with `Bearer ` gives the rest of the header, as before.
  - A header with the scheme in another case, for example `bearer` or `BEARER`, gives the token after one or more spaces. Spaces or tabs can come after the token. The token has no whitespace (`token68`).
  - A tab between the scheme and the token is not `1*SP`, so it gives no token.
  - `Basic x`, `Bearer` with no space and an empty header give no token, as before.
  - The token comparison (`tokenMatches`) does not change.
  
  Each user of `bearerOf` gets the change. These users are `credentialsOf`, `requestCredentials`, `procedureHandler` and the WebSocket server. The WebSocket admission of `createProcedureHost()`, `guardMcpRequest` and the credentials of the MCP face also get it.
- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- 66ab24c: New: the requests of the auth face go through the request tracking of the procedures host (CLI-54). Before, `betterAuthFace()` served its routes outside the tracking, so the stop of the host could cut a sign-in after Better Auth wrote the session and before the answer. The context of each face of `createProcedureHost()` now has `track`: a function that does the work of one HTTP request through `life.request`, on the route `<face> <key>` of the controller of the host. Thus the route pattern of the face (`auth *`) applies. A request after the stop of the intake gets 503, the drain waits for a request in flight, and the readiness of the controller applies. `httpTracker()` gives this function, and `betterAuthHandler()` has the new option `track`. A preflight does not go through the tracking. Without a service, each request starts directly, as before.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Minor Changes

- 217a90f: From 0.14.0, a call that the shutdown cuts ends with `UNAVAILABLE` and `retryable: false` when the call can have had its effect. Before, it ended with `INTERNAL_ERROR` (server stack CLI-48). This is true before and after the first item. This change is a break of the server stack, thus it is its own MINOR (decision D13). No 0.13 release marks the old code as deprecated, because no host relies on it.
  
  The error registry gives `INTERNAL_ERROR` to a bug of the server, with the severity `CRITICAL`. A cut is not a bug: the server stopped. Thus an alert on `INTERNAL_ERROR` does not fire at each deploy that cuts a write. The code tells why the call ended, and the flag `retryable` tells if a retry is safe.
  
  The behavior that changes:
  
  - `createProcedureHost()` of `@procedures/peer`: each cut has the code `UNAVAILABLE`. This is the same on HTTP, WebSocket and MCP.
  - A cut after the first item ends the stream in-band. A cut before the first item is the answer of the call. Before, a cut of a call that can have had its effect had the code `INTERNAL_ERROR` in the two cases.
  - The flag `retryable` of a cut comes from the operation of the call. It is false for a call that can have had its effect (the operation `once`), and true for a repeatable call.
  - `procedureHandler()` of `@procedures/client`: a handler error with `retryable: false` gets the HTTP status 500, not 503. A 503 invites a retry at the HTTP level (decision D3). Thus a cut before the first item of a call that can have had its effect is 500 with `UNAVAILABLE`, with no `Retry-After`. A retryable cut stays 503.
  - `ProcedureServer` of `@procedures/client`: a handler error without a retryable flag gets the flag of its code in `ERROR_CODES`. Before, it got false. Thus `UNAVAILABLE` without a flag is retryable, and it keeps the HTTP status 503.
  - The close of each face and of each listener of the host first waits until each answer that a face ended has gone out. It waits for the event `finish` of each ended response, and for the write callback of each upgraded socket. Thus the close of the transports does not lose the answer of a call that the deadline of the drain cuts. An open stream that is not ended does not hold the close.
  - The WebSocket face keeps its connections open after the cooperative abort of the drain, until each cut call ends in-band. Before, the connections closed at the abort, and a cut call lost its end.
  - `@procedures/mcp-server`: the error result of a failed stream has `_meta` with `code` and `retryable`. The error result of a failed call also has `retryable` in `_meta`. These fields are new.
  
  The behavior that does not change:
  
  - A real failure of a handler keeps its own code, for example `INTERNAL_ERROR` or `HANDLER_ERROR`.
  - A refusal at the stop of the intake stays `UNAVAILABLE`, 503 and retryable.
  - The retry middleware reads the flag `retryable`, not the code. Thus it does not retry a cut of a call that can have had its effect.
  
  Migration steps:
  
  - A caller that finds a cut by the code `INTERNAL_ERROR`: look for `UNAVAILABLE` in its place. Do not retry the call when `retryable` is false.
  - A handler that throws `UNAVAILABLE` with `retryable: false`: its HTTP status is 500 in place of 503. Without the flag, the error is retryable and gets 503. A retry middleware then sends the call again, so give `retryable: false` when the call can have had its effect.
  - The site: no change is necessary. Its code does not read the code of a cut, or the HTTP status 503.
  - MiniMongo: no change is necessary. Its code does not read `INTERNAL_ERROR`, `UNAVAILABLE` or the severity of an error.
  - The procedures host of Graph (GRAPH-11): no change is necessary. Its code does not read `INTERNAL_ERROR`. Its error "the server has no AGENT_TOKEN" is `UNAVAILABLE` with `retryable: false`, so its HTTP status is 500 in place of 503. No code of Graph reads that status.
  - jarvis: no change is necessary. Its drain test already expects `UNAVAILABLE` with `retryable: false` for a cut procedure call (S6 A12). Its code reads only `NOT_FOUND` and `FORBIDDEN`.
  - The `mark` CLI and `procedure-server`: no change is necessary. The lifecycle test of CI-2 expects `UNAVAILABLE` for the cut of `lifecycle.ticksOnce`.

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Minor Changes

- e2fe006: The expose rule of a server applies to each procedure that it serves, also to each procedure that it pins (server stack CLI-47). Only an explicit `alwaysOn` pin is outside the rule. This change is a break of the server stack, thus it is its own MINOR (decision D13). No 0.12 release marks the old behavior as deprecated, because no host relies on it. A deprecation release keeps the bypass open for one more release.
  
  Before, `ProcedureServer` examined the expose rule only for a procedure of its registry. A procedure that `registerProcedure()` or `registerProcedures()` pinned was outside the rule. The collection procedures of `registerCollectionProcedures()` and of the option `collections` of `createProcedureHost()` are pins, so the rule did not hide them. For example, `hostPolicy({ exclude: ["collections.examples.clear"] })` had no effect on a call of `collections.examples.clear`.
  
  - New option `alwaysOn` of `ProcedureServer.registerProcedure(procedure, options)`, `registerProcedures(procedures, options)` and `registerModule(module, options)`, with the new type `RegisterProcedureOptions`. True: the server serves the pin, also when its expose rule does not match the path. The default is false.
  - Only the procedures of the host set it. `createProcedureHost()` pins `host.health`, `host.info` and `host.metrics` with `{ alwaysOn: true }`. The server pins `events.subscribe` with `{ alwaysOn: true }`, because the topic rule is its expose rule.
  - Each other pin passes the same expose rule as a procedure of the registry: the lookup of each call (HTTP, WebSocket and MCP), `hasProcedure()`, `procedureOf()` and `procedureCount`. The manifests, the discovery and the MCP tool list already used the rule. The rule of the nested calls is the same as before.
  - `createProcedureHost()`: the option `expose` wins over the rule of the policy, for the server and now also for each face. `host.policy` has this rule. Before, the MCP face listed the tools of the rule of the policy.
  
  The behavior that changes:
  
  - A server with an expose rule does not serve a pin that its rule does not match. A call gets `NOT_FOUND`, as for a procedure of the registry that the rule hides.
  - A host with an expose rule serves only the collection procedures that its rule lists. An `exclude` of the policy hides one of them.
  - `host.health`, `host.info`, `host.metrics` and `events.subscribe` stay on, whatever the expose rule says.
  - A server or a host without an expose rule changes nothing.
  
  Migration steps:
  
  - A host with an `expose` rule must list the collection procedures that it serves, for example `collections.notes.*`. `host.*` and `events.subscribe` stay always on.
  - An app that pins its own procedures with `registerProcedures()` on a server with an expose rule: list them in the rule. Give `{ alwaysOn: true }` only to a procedure of the host itself.
  - The site: no change is necessary. Its servers have no expose rule.
  - MiniMongo: no change is necessary. Its server has an expose rule, but it pins no procedure and serves no collection.
  - The `mark` CLI and `procedure-server`: no change is necessary. They serve no collection, and `--expose` keeps `host.*` and `events.subscribe` on.
  - jarvis: no change is necessary. Its host has no expose rule.
  - The procedures host of Graph (GRAPH-11): no change is necessary. Its rule `["collections.*", "graph.*"]` lists the collection procedures. To hide `clear`, an `exclude` of the policy now has an effect.

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- 9fccd90: `createProcedureHost()` has the new option `controller` (server stack CLI-45). `controller.requires` names the dependencies of the service that each call of the host needs. `host.controllers` gives them, and `host.declare(svc)` declares them on the controller of the host. While a check of one of them fails readiness, the service refuses each call with `UNAVAILABLE`, which a caller can send again. Without the option, the controller needs no dependency, as before.
  
  jarvis needs this option: its procedure calls need its world store.
- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Minor Changes

- 9ea2030: `runProcedureHost()` of `@procedures/server` is the one runner entry on `run()` of `@mark1russell7/service`, for `procedure-server`, `mark serve` and `mark --server` (server stack CLI-8, decisions D6, D7 and D17). This change is a break of the server stack, thus it is its own MINOR (decision D13).
  
  - New `runProcedureHost({ name, host, mode, profile, lockfile, log, run })`. It declares the parts of `createProcedureHost()` in one service, and starts `run()`. It gives `{ host, service, life }` when the startup ends.
  - The mode `foreground` has the profile `localDev`: a second Ctrl-C exits at once. The mode `background` has the profile `daemon`: a repeat signal has no effect. Each run declares `onRepeatSignal`. `HOST_PROFILES` gives the profiles as data.
  - The caps of the stages sum to 10 s. They replace the hard-exit timer of 10 s of the entries.
  - The lockfile is a dependency of the service: its connect writes it before the listeners start, and its close removes it after the listeners close. New `lockfileHandle(data)` of `@procedures/peer/lockfile`.
  - `runServer()` (the bin `procedure-server` and `mark serve`) and `startServerMode()` (`mark --server`) install no signal handler and no hard-exit timer. Their promise ends with the lifecycle.
  - `mark --server` is the background host (decision D17). `procedure-server` and `mark serve` run in the foreground.
  - The entries map their transports to a host with `peerHostOptions()` of `@procedures/peer` (CLI-7).
  - `ServerRunOptions.run` and the second argument of `startServerMode()` take the options of `run()`, for a test: a process port and a clock.
  - A random token of `procedure-server` has 32 bytes, as the token of `mark --server`.
  - The one-shot commands of `mark` keep their interrupt. CLI-26 moves them under `run()`.
  
  The behavior that changes:
  
  - A second Ctrl-C of `mark --server` has no effect: the host ends its drain, in 10 s at most. A second Ctrl-C of `procedure-server` and `mark serve` exits at once with the code 1, as before.
  - The process exits with the code of the lifecycle: 0 after a clean shutdown, and 1 after an error or a startup that failed.
  - A random token of `procedure-server` has 64 hexadecimal characters, not 48.
  
  Migration steps:
  
  - The site, MiniMongo, Graph and jarvis: no change is necessary. They do not start these entries.
  - A script that starts `procedure-server` or `mark serve` and stops it with a signal: no change is necessary. Wait for the exit, in 10 s at most.
  - A program that embeds the server outside a service: use `startServer()`, which starts it as a peer, and `peer.stop()`.

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Minor Changes

- 37c96a3: `createProcedureHost()` of `@procedures/peer` is one factory for each procedures server in Node. It gives the parts of a service of `@mark1russell7/service`, and `createPeer()` is a thin wrapper over it (server stack CLI-7, decisions D2, D3 and D4). This change is a break of the server stack, thus it is its own MINOR (decision D13).
  
  - New `createProcedureHost({ registry, policy, faces: { http, ws, mcp }, listen, collections })`. It gives `{ handler, upgrade, parts, dependencies, checks, controllers, info }` and `declare(svc)`. It starts nothing and installs no signal handler.
  - The parts: the procedure server (its stop parts of CLI-5), the stop parts of each face, and an `httpTransport` of `@mark1russell7/service/http` for each listener that the host owns. The faces of a listener mount on its mount list, so they share one port.
  - Without a listener, the app mounts `host.handler` and `host.upgrade` on its own listener.
  - The request tracking: each call goes through `life.request`, with the route `<face> <procedure>`. One route pattern for each face (`http *`, `ws *`, `mcp *`) matches each call. The function of the pattern gives the idempotency of each call: `repeatable`, `keyed` (an idempotency key) or `once` (decision D3).
  - Each call is a stream (decision D4). A stream stays in flight until its last item. A cut after the first item ends the stream with an error line, and the line tells the count of the items.
  - The faces are factories: `httpFace()` and `wsFace()` of `@procedures/peer`, and the new `mcpFace()` of `@procedures/mcp-server`. A face of another package has the same shape.
  - The collections come from the option `collections`. The host serves `collections.<name>.*`, and each storage is a dependency handle of the service.
  - `createPeer()` is for a process that has no service of its own. It declares the parts of its host in a service of its own, and starts `run()` of `@mark1russell7/service` on `embeddedProcess()`, a process port that installs no signal handler and never ends the process. `stop()` asks that lifecycle for its shutdown. The new option `profile` gives the profile of that service, and the default is `PEER_PROFILE`.
  - The WebSocket face refuses an upgrade that the server does not admit, with the path of each call: 401 without the token or for a refusal of the request hook, and 403 for a failed browser check. A request hook that admits a request without credentials lets the connection open.
  - New exports of `@procedures/peer`: `createProcedureHost`, `httpFace`, `wsFace`, `LOCAL_LISTENER_KNOBS`, `peerHostOptions`, `PEER_PROFILE`, `faceHandler`, `callOperations`, `operationOfCall`, and their types. `Peer.getHost()` gives the host of a peer.
  - `@procedures/mcp-server`: new `mcpFace()`. New option `httpOptions.mount` and method `McpServerTransport.handleHttp()`: a Streamable HTTP endpoint on a listener of another part. `McpServerTransport` takes each `RequestHandler`, not only a `Server`.
  - `@procedures/client`: new `ProcedureServer.procedureOf(method)`, and `ProcedureServer.admits(credentials)`: the request hook, the token check and the authenticate function of a call, for a connection before its first call.
  - `@procedures/peer` depends on `@mark1russell7/service` `^0.5.2`, for `embeddedProcess()` (SYS-27), and no longer on Express.
  
  The behavior that changes:
  
  - A peer has no `/health` and no `/api/health` route. The probes come from the runner. `checkServer()` of `@procedures/peer/lockfile` calls `host.info` with the token of the lockfile (a part of CLI-9).
  - A peer has one token: the token of its transports, or else the token of its policy. Two different tokens throw at `createPeer()`. The token applies to each face.
  - The token of a peer applies to the upgrade of each WebSocket connection, also for a transport with no token of its own.
  - `peer.stop({ grace })`: the grace has no effect, and the option is deprecated. The profile of the peer gives the drain, and `PEER_PROFILE` aborts the calls in flight at the start of the drain, as `stop()` without a grace did.
  - A refused browser request gets the error of wire v1: `FORBIDDEN` with a `reason`. Before, the peer sent its own JSON.
  - A peer starts one time. A `start()` after `stop()` throws: create a new peer.
  - A listener that the peer cannot use gives `The HTTP server cannot listen on <host>:<port>` or `The WebSocket server cannot listen on <host>:<port>`.
  - `HttpTransportConfig.cors: true` gives the CORS of `procedureHandler`: each origin, without credentials.
  
  Migration steps:
  
  - The site and MiniMongo: no change is necessary, unless they read `/health` of a peer. Then call `host.info` with the token.
  - The MCP host of Graph: no change is necessary. To share the port of the Graph host, mount `mcpFace()` on its listener.
  - jarvis and Graph under `run()`: build the procedures with `createProcedureHost()`, and call `host.declare(svc)` in the service of the process. Give `listen` for a port of the host, or mount `host.handler` and `host.upgrade` on the listener of the app.
  - A caller of `createPeer()` with a different token for each transport: give one token.
  - A Docker `HEALTHCHECK` or a probe of Kubernetes that read `/health` of a peer: use the probes of the service. Give the service `probeServer({ port, server_retry_after })` on a port of its own, or mount `probeHandler(health, { prefix: "/health" })` on the port of the app. Both come from `@mark1russell7/service/http`, and they answer `/health/startup`, `/health/readiness` and `/health/liveness`. The lockfile check of a client calls `host.info` with the token of the lockfile.
  - A test that read `/health` of a peer: call `host.info` with the token, or check the status 404.

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- b5db4d8: The other procedures that reach files declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33, tracker item O36). Without a root, nothing changes. PATCH: each procedure was refused under a root before, and now it is confined, or it is refused with a reason.
  
  - Confined: `s3.download` (`destPath`), `s3.presign` (no path input), `exif.read` (`path`), `privacyScan.files` (`paths`, `termsFile`, `allowFile`), `claude.read` and `claude.follow` (`outputFile`), and `manifest.generate` (`outputDir`).
  - Confined with no path input, because the store of the host holds the data: `schedule.add`, `schedule.list`, `schedule.remove`, `procedure.store`, `procedure.load` and `procedure.sync`.
  - Confined: each `gh.*` procedure starts gh in a working folder of the root, and the `dir` of `gh.run.download` is in the root. Its nested `shell.run` now runs under a root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`.
  - Refused, with the reason in the rules: `snapshot.create`, `snapshot.restore`, `snapshot.diff`, `iosBackup.*`, `claude.start`, `server.start`, `server.stop` and `server.status`.
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- 600c497: A server on port 0 tells its real port.
  
  - New `HttpServerTransport.port()` returns the port that the server listens on. With the option `port` 0, the system gives a free port, and the function returns that port.
  - `peer.getEndpoints()` gives the real port of each HTTP and WebSocket endpoint. Before, a peer on port 0 gave the address `:0`.
  - The tests of the body and the stop of the peer listen on port 0. Before, a helper found a free port and closed it before the peer took it, so one CI run failed with `EADDRINUSE`.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- 389b054: A token check no longer tells the length of the token through its time. The peer compares the SHA-256 digests of the two tokens with `timingSafeEqual`. The `tokenMatches` of the client, which runs in a browser too, compares each character of the expected token for each presented token. Before, a token of another length returned at once. The re-audit of jarvis found it.
- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0

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
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- d42d716: `server.start`, `server.stop` and `server.status` moved from `@procedures/peer` to `@procedures/server`, the package of the host. Their names, schemas and effects stay the same. They manage the background server of the `mark` CLI.
  
  In this version, `@procedures/server` has a `./module` entry, a `./register` entry and the `client.procedures` field, so `mark server start`, `mark server stop` and `mark server status` keep working. The registry of `procedure-server` and `mark serve` has the module of the peer package and the module of the server package, as before.
  
  The module of `@procedures/peer` does not register the three procedures any more, and `@procedures/peer/procedures` does not export them. The lockfiles stay in `@procedures/peer/lockfile`.
  
  `connect()` of `@procedures/peer` takes `WebSocketTransport` from `@procedures/client/node`, not from the root of `@procedures/client`. Thus a peer connection in Node uses the `WebSocket` class of `ws`, and a drop ends the socket at once with `terminate()`.

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
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- b2a3e3a: The bidirectional peer (roadmap R24). The calls over one WebSocket go in the two directions with the same frames: a request, then a response, an error or a stream with credit, and a cancel. The client serves the calls of the server with the new `serve` option of `WebSocketTransport` (for example a `ProcedureServer` with its registry), so a call gets validation, the expose rule, the capability, streaming, cancel, the signal and the deadline. The server sends them with `callConnection()`, or with a `Client` over `transportFor(connectionId)`, and a peer has `connections()` and `clientFor(connectionId)`. `callClient()` and `onServerRequest` stay as wrappers of the new calls, and the old `server-request` frames are no longer sent. The shared code of the two sides (`OutgoingCalls`, `IncomingCalls`) serves the calls of the client too.
- 381ce3a: Cancellation scopes and a graceful stop (roadmap R14). `ProcedureServer.stop({ grace })` refuses new calls with a retryable `UNAVAILABLE` and lets the calls in flight end until the grace time ends, then aborts them (`peer.stop({ grace })` passes it; `mark --server` and the `server` bin give 5 seconds). The signal of each call joins its request and the server, and `callsInFlight` counts the calls, streams included. `exec()` and `execStream()` take a `signal`. `LocalTransport` takes `interceptors`, `capability` and `clearanceOrder`, and gives a call the deadline that its client sends, so a client timeout ends a local handler too. `mark` aborts a command in its own process on the first Ctrl+C. A remote leaf of `route()` and `server.call` send the deadline of their caller, and `server.call` relays the signal.
- 07cc998: The procedures of a host (roadmap R19). `hostProcedures(source)` gives `host.health` (the state, the uptime, the procedures and the calls in flight), `host.info` (the id, the start time, the endpoints and the runtime) and `host.metrics` (the counts of `metricsInterceptor` for each procedure). A peer pins them on its server, so the registry of its caller does not change, and counts its calls (option `metrics`, default true). `ProcedureServer.stopping` tells when a graceful stop runs.
- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- fb30718: Typed durations (roadmap R11). This change breaks the API. Each public option that is a time takes a `Duration` of `@mark1russell7/quantity`, made with `ms()`, `seconds()`, `minutes()` or `hours()` of `@procedures/client`. A plain number is a type error, and at run time the option throws a `TypeError` that names it. This covers the timeouts and `resilience()`, the retry delays, the cache, the circuit breaker, the rate limit, the HTTP, WebSocket and mock transports, the WebSocket server heartbeat, `timeoutInterceptor({ limit })` (was `ms`), `hostPolicy({ timeout })` (was `timeoutMs`), the idempotency cache (`ttl`, was `ttlMs`), `ApiStorage`, `HybridStorage`, the synced registry and `connect()` of the peer. The per-call overrides in a context (`timeout`, `retry.delay`, `cache.ttl`) and the `route()` overrides (`timeout.overall`, was `timeout.ms`) take durations too. The wire and the inputs of procedures keep milliseconds.
  
  Migration: `createOverallTimeoutMiddleware({ overall: 5000 })` becomes `createOverallTimeoutMiddleware({ overall: seconds(5) })`.

### Patch Changes

- aaa7462: The peer accepts a bare JSON value and obeys `bodyLimit` (roadmap R5). Before, its strict JSON parser refused a number, a string or `null` with 400, and its limit of 100 kB replaced `bodyLimit`. The HTTP transport config of the peer takes `bodyLimit`. `peer.stop()` closes the HTTP server that the peer made for its WebSocket transport, so the port is free again. `mark --server` and the `server` bin stop the peer before they exit, with a limit of 10 seconds, and a second signal exits at once.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
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

## 0.2.3

### Patch Changes

- 15e48cf: Three fixes of the architecture review (2026-10-16). A `timeoutMs` that is not a finite number of zero or more asks for nothing: before, `NaN` removed the deadline. A procedure of `procedure.define` declares no effects of its own, so a read-only capability runs it and examines each nested call. `mcp.list-tools`, `mcp.serve`, `_discovery.announce`, `manifest.generate`, `server.create`, `procedure.export` and `lib.audit` read the registry of the call, not the global registry. `getProcedureInfos` and `watchProcedures` take a registry.
- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
