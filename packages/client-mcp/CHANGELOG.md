# @procedures/mcp-server

## 0.14.0

### Patch Changes

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
- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/mcp@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/mcp@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1
  - @procedures/mcp@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/mcp@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2
  - @procedures/mcp@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
  - @procedures/mcp@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0
  - @procedures/mcp@0.12.0

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
  - @procedures/mcp@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/mcp@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/mcp@0.9.2

## 0.9.1

### Patch Changes

- 61d60c6: Procedure paths of each length on each face (server stack CLI-28). A path has one segment or more. Each change is additive: each path of two segments or more keeps its method, its URL and its tool name.
  
  - `pathToMethod()` takes a path of one segment, for example `["morning"]`: its method has the empty service, `{ service: "", operation: "morning" }`. An empty path still throws. New `methodName(method)` gives the name with dots (`morning`, `docker.compose.up`).
  - HTTP: the URL of a path of one segment is `{base}/{operation}`, for example `/api/morning`. `procedureHandler`, `HttpServerTransport` and `rpcServerUrlStrategy` (`/rpc/morning`) read it, and `bodyPathAddressing()` takes a path of one segment too. A URL with one segment under the base path names a procedure now: an unknown one gets `NOT_FOUND`, not `INVALID_REQUEST`.
  - The version of the URL keeps its old form `{base}/{version}/{service}/{operation}`. Only the version makes three URL segments, so the forms do not collide. A path of one segment has no version in the URL, because `{base}/{version}/{operation}` reads as a service and an operation. The server ignores the version (wire protocol v1).
  - `defaultUrlPattern` URI-encodes each URL segment and decodes it again. Thus a segment with `/`, `?` or a space round-trips, and a segment never makes a URL separator. A segment of letters, digits, `-`, `.`, `_` and `~` keeps its URL.
  - `methodToPath()` keeps each empty segment but the empty service. Thus a method with `..` or a stray dot names no procedure and gets `NOT_FOUND`. Before, the empty segments fell away, so `/api/notes/..` could reach the procedure `notes`.
  - WebSocket, the message port and `LocalTransport` call a path of one segment. A handler of `LocalTransport` with the key `morning` answers it.
  - MCP: a path of one segment has a tool name, for example `morning`. When two procedures have one tool name after the join of the segments (`["a_b", "c"]` and `["a", "b_c"]` with `path.join("_")`), the face leaves out the two tools and writes the reason to stderr. Before, the face kept the last one, so a call could reach the wrong procedure. `host.tools()` gives the same list.
  - `WIRE-PROTOCOL.md` states the rule.
- 79f750a: A narrowing key on the wire, and an addressing hook for HTTP (server stack CLI-30 and CLI-31). Each change is additive: without the new key or the new option, the behavior stays the same.
  
  - A call can ask for a narrower capability than its principal holds, with the narrowing key `procedure-narrowing`. Its value is a `CapabilityRequest` as JSON (`clearance`, `effects` and `timeoutMs`), or a list of them.
  - Each face carries the key. HTTP has each line of the header `Procedure-Narrowing` (raw or URI-encoded JSON), the key in `X-Metadata` and a query parameter. WebSocket has the key in the metadata of a `request` frame. MCP has the key in the `_meta` of `tools/call` and the header of Streamable HTTP. In the process, the key of the metadata of `ProcedureServer.handle()`, `LocalTransport`, `invokeProcedure()` and `Client.exec()` applies.
  - No source replaces another: a gateway's header and the client's key of `X-Metadata` both apply. `invokeProcedure()` is the one place that applies the sources, for the call of a host, with the narrowing of `principalOf` and the new option `narrow`. The clearance is the meet of the clearance order, the effects are the intersection, and the deadline is the earliest. Each source can only narrow, in each sequence.
  - A valid part that asks for more has no effect: the meet removes it. A part that is not valid refuses the call, so a typo of a gateway does not leave the call wider. A part that is not well formed (not JSON, an unknown field, a time that is not a number) gives `INVALID_REQUEST`. A clearance outside the order, or two different clearances without a clearance order, give `FORBIDDEN` (reason `clearance`).
  - New option `debug` of `ProcedureServer`: `true` writes each report with `console.debug`, and a function gets each `ServerDebugReport`. The server reports each part of the narrowing that has no effect, and each refusal.
  - New options of `invokeProcedure()` and `invokePath()`: `narrow` (one more source) and `onNarrowingNotes` (the notes of the narrowing). New option `metadata` of `Client.exec()` and `Client.execStream()`: a local procedure gets it as `ctx.metadata`, and a remote call sends it.
  - New exports: `NARROWING_METADATA_KEY`, `NARROWING_HEADER`, `narrowingOf()` (the decoder of the key), `addNarrowing()` (adds a source to the key) and `narrowWithin()` (a narrowing of many sources that does not throw and gives notes). New types: `NarrowingNote`, `WireNarrowing`, `NarrowedCapability` and `ServerDebugReport`.
  - The default CORS headers include `Procedure-Narrowing`.
  - `procedureHandler` and `HttpServerTransport` copy each key of the query as an own property, so a `__proto__` key changes no prototype.
  - `@procedures/client/node`: new option `addressing` of `procedureHandler`. The hook gets the request and its body, and it gives `{ method, payload }`. `urlAddressing()` is the default, the URL format of `HttpTransport`. `bodyPathAddressing()` reads the path and the input from the body of a single endpoint, for example `POST /api/proc` with `{"path": ["notes", "list"], "input": {}}`. With it, the handler also takes the base path itself.
  - `HttpServerTransport` takes the same option `addressing`. With `bodyPathAddressing()`, its route also takes the base path itself.
  - New types of `@procedures/client/node`: `Addressing`, `CallAddress`, `UrlAddressingOptions` and `BodyPathAddressingOptions`.
  - `WIRE-PROTOCOL.md` specifies the narrowing key and its sources, the addressing hook, `procedureHandler`, the credentials of a request and the reasons of `FORBIDDEN`, with the four reasons of the browser checks.
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/mcp@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/mcp@0.9.0

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
  - @procedures/mcp@0.8.1

## 0.8.0

### Patch Changes

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
  - @procedures/mcp@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/mcp@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/mcp@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/mcp@0.5.0

## 0.4.0

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
  - @procedures/mcp@0.4.0

## 0.3.0

### Minor Changes

- 3d24d5b: MCP over Streamable HTTP (roadmap R26), the HTTP transport of the current MCP specification. `McpServerTransport` takes `transport: "http"` and `httpOptions` (port, host, path, token, allowed origins, or an HTTP server of its own). Each client gets a session with an MCP server of its own, and so gets the progress of a tool call and the `list_changed` notifications. The endpoint listens on loopback by default, refuses a web page of another host or origin, and with a token refuses a request without the token. `mark mcp --http <port> [--host <host>] [--token <token>]` (or `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN`) serves the dev tools over it. Before, the package had only stdio, and its SSE transport only threw.
- c5528e4: Streams that can run without an end (roadmap R15). A procedure declares `stream: { unbounded: true }` in its metadata (`docker.logs`, for `follow`, and `shell.stream` do). `ProcedureServer` marks its stream response, and the faces that collect a stream obey the mark: HTTP without NDJSON answers 406 `NOT_ACCEPTABLE` at once (before, the request waited until a timeout), and the MCP transport stops the stream at its `streamLimits` (default 100 items or 30 seconds) and says so in the result (before, `docker.logs` with `follow` ended only at the time limit of 10 minutes).

### Patch Changes

- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- fb30718: Typed durations (roadmap R11). This change breaks the API. Each public option that is a time takes a `Duration` of `@mark1russell7/quantity`, made with `ms()`, `seconds()`, `minutes()` or `hours()` of `@procedures/client`. A plain number is a type error, and at run time the option throws a `TypeError` that names it. This covers the timeouts and `resilience()`, the retry delays, the cache, the circuit breaker, the rate limit, the HTTP, WebSocket and mock transports, the WebSocket server heartbeat, `timeoutInterceptor({ limit })` (was `ms`), `hostPolicy({ timeout })` (was `timeoutMs`), the idempotency cache (`ttl`, was `ttlMs`), `ApiStorage`, `HybridStorage`, the synced registry and `connect()` of the peer. The per-call overrides in a context (`timeout`, `retry.delay`, `cache.ttl`) and the `route()` overrides (`timeout.overall`, was `timeout.ms`) take durations too. The wire and the inputs of procedures keep milliseconds.
  
  Migration: `createOverallTimeoutMiddleware({ overall: 5000 })` becomes `createOverallTimeoutMiddleware({ overall: seconds(5) })`.
- 21f7743: Wire protocol v1 (roadmap R25). `WIRE-PROTOCOL.md` specifies the HTTP and WebSocket formats. A WebSocket connection starts with a `hello` frame of each side (`getServerProtocol()` on the client), and HTTP sends the header `Procedures-Protocol: 1` on each request and response. A side refuses a newer version with `PROTOCOL_VERSION`. `ERROR_CODES` is the one list of error codes and HTTP statuses of all faces. The reason of a `FORBIDDEN` error travels on each face: in the HTTP error body, in the item metadata of the HTTP and local transports, and in the `_meta` of an MCP error result. `Method.version` is deprecated: the server ignores it. Golden tests in `packages/client/test/wire/` pin the frames.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [29a7b29]
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
  - @procedures/mcp@0.3.0

## 0.2.3

### Patch Changes

- 15e48cf: Three fixes of the architecture review (2026-10-16). A `timeoutMs` that is not a finite number of zero or more asks for nothing: before, `NaN` removed the deadline. A procedure of `procedure.define` declares no effects of its own, so a read-only capability runs it and examines each nested call. `mcp.list-tools`, `mcp.serve`, `_discovery.announce`, `manifest.generate`, `server.create`, `procedure.export` and `lib.audit` read the registry of the call, not the global registry. `getProcedureInfos` and `watchProcedures` take a registry.
- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/mcp@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/mcp@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/mcp@0.2.1

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
  - @procedures/mcp@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
