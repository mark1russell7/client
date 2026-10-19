# The server layers

This document is the contract of the server stack. One service runner is in `systems`, one procedures server is in this repository, and the apps use the two. The contract replaces the host ownership brief (decision D14).

- The cross-repo tracker is https://claude.ai/artifact/QbZd2i5apzg3ip5yiE57Pb. Each item ID of this document (`CLI-3`, `SYS-1`, `D9`) is a row of its database.
- The client items are also in [ROADMAP-2026-10.md](./ROADMAP-2026-10.md), in the section "The server stack (R37)".
- A change to a layer, an owner or a rule of this document needs a decision of Mark. Record the decision in the tracker first.

## The design rule

Mark set this rule on 2026-10-17. In each decision, choose the most general and dynamic option for the long term. Do not choose an option only because it is the smaller piece of work.

## What the procedures server is for

The procedures server takes a registry of typed procedures and gives one request handler. Each face uses that same handler:

- HTTP with NDJSON.
- WebSocket in the two directions.
- MCP over stdio or Streamable HTTP.
- `MessagePort`.
- The calls in the same process.

Each call goes through one invocation path:

- The schema validation.
- The effects and the capability (the clearance, the resources and `admitItem`).
- The rules of nested calls.
- The deadlines and the idempotency keys.
- The authentication to a principal.

Each answer uses one wire vocabulary: values, `seq` streams with credit and keep-alive, `events.subscribe`, and one list of error codes with `retryable` and `retry-after`. The server can also serve `collections.<name>.*`, so the remote and the hybrid storages sync over the same path.

The procedures server has no port, no process and no signals. Thus it also operates in browsers and in workers. In Node, the runner of `systems` has the listener and the stop. The procedures server connects its handler and its stop parts to the runner.

An app gets all of this when it registers its procedures and mounts one handler. The app does not write its own RPC endpoint, stream writer, error mapping or token check.

## The layers and their owners

| Layer | Repository | Package |
|---|---|---|
| The runner core: lifecycle, health, signals, timers | `systems` | `@mark1russell7/service`: the root, `./clock`, `./heartbeat`, `./backoff` and `./testing` |
| The HTTP edge of the runner, with no procedure code | `systems` | `@mark1russell7/service/http`, a new Node entry |
| The procedure engine, browser-safe | client | `@procedures/client`: the root and `./browser` |
| The Node faces of the procedures | client | `@procedures/client/node` |
| The host and the runner entry: the one procedures server in Node | client | `@procedures/peer` (`createProcedureHost`) and `@procedures/server` (`runProcedureHost`, the bin `procedure-server`) |
| The MCP host | client | `@procedures/mcp-server`: `McpServerTransport` and an exported `createMcpHost` |
| Collections and sync | client | `@procedures/collections`, `@procedures/store` with a new browser-safe entry, and the core procedures `collections.<name>.*` |
| Apps | jarvis, Graph, MiniMongo. Later morsel, courier and money-machine. | The app packages |

The dependencies go in one direction only. The apps use the client and `systems`. The client uses `systems`. `systems` uses no package of the client.

### The runner core

The runner core owns:

- The `service()` declarations, `describe()`, `lint()` and the timer law.
- `start()`: the health checks, the latches, and the answers of `probe()` as data.
- `run()`: the order of the start and the process signals (`SIGINT`, `SIGTERM`, `SIGQUIT`). It also has the stop in stages with a limit for each stage, the cooperative abort and one exit.
- The contracts `TransportImpl`, `DependencyHandle`, `HealthServer` and `ProcessPort`.
- The request tracking (`life.request`), with dynamic routes and an idempotency function for each request (D3).
- One request kind: each request is a stream (D4).
- The shutdown triggers of `ProcessPort`: the exit signals and a trigger for a closed stdin.
- Profiles as explicit data (`local-dev`, `kubernetes`) and a declared policy for a second signal (D6, D7).
- The browser-safe clock, heartbeat and backoff that the client uses.
- `./testing`: the fakes, `contractCases` and the conformance kit of the transports (`transportConformance()`).

The limits of the runner core:

- It must not import a `@procedures/*` package, in its code or in its lockfile.
- It must not know the procedure paths, the wire protocol of the procedures, the error codes, the capabilities or `HostPolicy`.
- It must not hold the authorization or the routes of an app.
- It must not put `node:` imports in the root, `./clock`, `./heartbeat` or `./backoff`.

### The HTTP edge of the runner

The HTTP edge owns:

- `httpTransport(server, knobs)`: a `node:http` server as a `TransportImpl`. Its count of the requests in flight comes from the server events and includes the upgrade sockets.
- The stop of that listener: the intake stop closes the server and closes the idle connections each second. The drain goes to the deadline with the cooperative abort. The close closes all the connections.
- A small mount list on that listener: request handlers (`(req, res) => boolean`, the first match wins) and upgrade handlers by path. Thus several faces and app routes share one port.
- `probeServer({ port, host })` on a dedicated port, and `probeHandler(health, { prefix })` on the port of the app (D5).
- `writeOutcome(res, outcome, { keepAlive })`: the status, `Retry-After` and `Connection: close` from a `RequestOutcome`.

The limits of the HTTP edge:

- It must not become a web framework. It has no route language, no body parser and no middleware chain.
- It must not depend on Express, Fastify or `ws`. A thin shim for one of them stays with its consumer.
- It must not know the procedures, the tokens or the principals.

### The procedure engine

The engine owns:

- `ProcedureServer`: the dispatch, the invocation path, the schemas, the effects and the capability, and the rules of nested calls. It also has the idempotency, the errors of wire v1, the `seq` streams, the events and `collections.*`.
- Stop parts in the shape of the runner: `stopIntake()`, `drain(deadline, signal)`, `inFlight()` and `close()`. The storages are dependency handles. The engine uses only structural types of the runner (CLI-5).
- The host authentication to a principal. One request hook of the host policy reads the credentials and a narrowing from a cookie, a header or the query (CLI-2a).
- One exported constant-time `tokenMatches`, which is browser-safe.
- The client side: `Client`, `HttpTransport` with a `credentials` option for `fetch` (CLI-18), `WebSocketTransport` and `PortTransport`.

The limits of the engine:

- It must not import `node:` modules in the root or in `./browser`. `HttpServerTransport` and `WebSocketServerTransport` move to `./node` (CLI-6).
- It must not install signal handlers, use `process.exit` or own a port.
- It must not copy the drain of the runner with its own raw timers. It uses the deadline and the signal that it gets, and the clock.

### The Node faces

The Node faces own:

- `procedureHandler(server, opts)`: a handler `(IncomingMessage, ServerResponse) => boolean` with no framework (CLI-3).
- `upgradeHandler(server, opts)`: a handler `(req, socket, head)` for the `noServer` mode of `ws`.
- `writeNdjsonStream`.
- `HttpServerTransport` and `WebSocketServerTransport` as thin shims for compatibility. Only the shim uses Express.

The limits of the Node faces:

- They must not make a `node:http` server or listen on one. The `httpTransport` of `systems` owns the listener.
- They must not keep error codes outside wire v1. `SERVER_STOPPED` and the other stray codes fold into `UNAVAILABLE`, `FORBIDDEN` and `INTERNAL_ERROR` (CLI-4).

### The host and the runner entry

This layer is the one procedures server in Node. `mark serve` and `mark --server` use it. It owns:

- `createProcedureHost({ registry, policy, faces: { http, ws, mcp }, collections })`. It gives `{ handler, upgrade, parts, dependencies, checks, info }`, and the service of a parent declares them (D2, CLI-7).
- `runProcedureHost(config)`: the only entry that starts `run()` for `procedure-server`, `mark serve` and `mark --server`. The lockfile is a phase of it (CLI-8).
- `host.info`, `host.health` and `host.metrics` as procedures, with the identity of the host: the peer ID and the count of the procedures.
- One expose rule for the server and each face. It applies to each procedure that the host serves, also to the collection procedures. Only `host.*` and `events.subscribe` are always on (CLI-47).
- `server.create`, with the same factory and the same `HostPolicy`.

The limits of the host:

- It must not write signal handlers, hard-exit timers or a `/health` route by hand.
- It must not examine the token, the host or the origin again outside `HostPolicy` (CLI-2b).
- It must not own a listener, other than through the `httpTransport` of `systems`.

### The MCP host

The MCP host owns:

- The MCP tools from the registry of a `ProcedureServer`, with `surface`, `readOnly` and `hostPolicy` (CLI-10).
- The progress and the elicitation (CLI-12).
- A stdio face under `run()` with the trigger for a closed stdin, and Streamable HTTP mounted at `/mcp` on the shared listener (CLI-11).

The limits of the MCP host:

- It must not own a listener or a token check. It uses the `HostPolicy` of the host.
- It must not build the options of `ProcedureServer` by hand. `mcp.serve` uses `createMcpHost`.

### Collections and sync

This layer owns:

- The contract `CollectionStorage`, its contract test suite, and the optional `observe()` and `query()` (CLI-20).
- The procedures `collections.<name>.*`, with `find` and a selector that serializes, change hints through the events, an optional `expectedVersion` and a partition resolver (CLI-14 to CLI-17).
- `HybridStorage` and `ApiStorage` on the clock and the backoff of `service` (CLI-13).
- The sync. `HybridStorage` owns the queue, the sync state and the remote. Refer to "SignalDB under `HybridStorage`".

The limits of this layer:

- It must not import code for Node only from the browser entry of `@procedures/store`.
- It must not replace the reactive cache of an app. SignalDB stays the cache of Graph.

### Apps

An app owns:

- One `service()` declaration for each process, with `run()` as the entry.
- Its app routes. In jarvis: the UI, the CSP, the login and the cookies, blobs, tiles, ICS, briefs, chat and ingest. In Graph: `/auth/*`, SSR, the materializer and the workers of the change streams.
- The authorization of the app inside its procedures: `can()` of Graph, the audience policy of jarvis, the job tokens of morsel.
- Its own procedures (`graph.*`, the domain of jarvis) and its storage adapters.

The limits of an app:

- It must not write its own signal handlers, drain, health route or HTTP listener transport.
- It must not write its own RPC endpoint, NDJSON writer, mapping of procedure errors or host token check.
- It must not assemble a `ProcedureServer` and its transports by hand. It uses the host factory, or it mounts the handler.

## Each request is a stream

Decision D4 sets one request kind for all of the stack.

- A unary call is a stream of one item. The client has this shape: each `Transport.send` gives an `AsyncIterable`, and `client.call` is the last item of `client.stream`.
- In the runner, a `RequestFn` can give an `AsyncIterable`. The request stays in flight until the iterator ends.
- A failure after the first item ends the stream in-band, with an error line that gives the count of the items that went out. The answer is not a `503`.
- At the cooperative abort, the runner closes the iterator with `iterator.return()`.
- One kind thus covers values, NDJSON rows, SSE tails, subscriptions and WebSocket sessions. A transport can change, and the runner gets no new concept.

## SignalDB under `HybridStorage`

Decision D9 gives the sync to the client. SignalDB is one strategy for the local copy, under `HybridStorage`.

- `HybridStorage` owns the sync, and `ApiStorage` is its remote.
- The new package `@procedures/signaldb` has `SignalDbStorage` (CLI-23). It implements `CollectionStorage` over a SignalDB `Collection`.
- Graph keeps SignalDB as its reactive cache in the browser, and it keeps its `live()` cursors.
- `IndexedDbStorage` (CLI-22) gives a durable local copy to a browser app without SignalDB.
- `TabCoordinator` (CLI-25) lets one leader tab do the sync, and the other tabs copy its changes.
- The sync code of Graph goes: its `SyncManager`, the pull and the push with `fetch`, `LiveLog`, `EchoLedger`, its realtime WebSocket and its multi-tab service.

## One-shot commands also start under `run()`

Decision D17 makes a one-shot command a service too: a `mark` command, and the kit and the CLI of jarvis.

- In the warm mode, the background host operates under `runProcedureHost` with the daemon profile.
- In the cold mode, the same host operates in the process under `run()`, with the ephemeral profile. It has no port and no lockfile.
- In the two modes, the command is one request through the same `Client` call site.
- After the command, the process exits with the exit code of the command (CLI-26, SYS-16).

## The three decisions of the brief

The brief asked three questions. This contract keeps the three decisions with a new scope.

| Decision of the brief | Result | Items |
|---|---|---|
| A host that an app can mount | Kept. The procedure handler and the upgrade handler mount on the listener of `systems`, through the mount list of `@mark1russell7/service/http`. | CLI-3, SYS-1 |
| The stop and the health of the client hosts | The server exposes parts. Only the entry of the process starts `run()`. | CLI-5, CLI-7, CLI-8, CLI-9 |
| One place for authentication | Kept, and narrowed to the host authentication. The app authorization stays in the apps. | CLI-1, CLI-2a, CLI-2b |

The questions of the mount:

- The principal and the audience of a request come from the request hook (CLI-2a) and from the narrowing key on the wire (CLI-30).
- The procedure handler writes the headers of a procedure answer. `writeOutcome` writes the answer when the runner refuses a request during a stop.
- At a stop, the stages of `run()` use the stop parts of the host. A stream ends in-band.

The questions of the stop and the health:

- `ProcedureServer.stop({ grace })` stays as a convenience over the parts. It does not hide the close order of the storages.
- The probes come from `start()`, through `probeHandler` or `probeServer`. `host.health` stays a procedure.
- The static `/health` routes of the peer go. The lockfile check reads the peer ID from `host.info`.
- The Node packages of the client (`@procedures/peer`, `@procedures/server`) import the root and `./http` of `service`. The engine imports only the browser-safe entries.

The questions of the authentication:

- The host policy of the client is the one place that makes a principal from a request. `systems` holds no authentication.
- The client exports one constant-time `tokenMatches`. Each face uses it through the host policy.
- When the host has a token, it refuses a request without credentials (CLI-1). A local face sets an explicit local marker, `LOCAL_CREDENTIALS`. The key of the marker is a symbol, so a network request cannot carry it.
- The cookie and the header of jarvis are options of the request hook. Its guard of the loopback `Host` goes into the browser checks of `HostPolicy`.

## Facts that the brief had wrong

The audit of 2026-10-17 found these facts. The line numbers of the other repositories are from that day.

| The brief said | The fact | Evidence |
|---|---|---|
| jarvis uses `service()`, `start()` and `run()`. | jarvis declares `jarvisService()` and examines it with `lint()` only in a test. `serve.ts` imports nothing from `service` and stops only on `SIGINT`. | jarvis: `packages/instance/src/serve.ts:163-169`, `packages/instance/src/service.test.ts` |
| Only jarvis uses the stop in stages of `service`. | The only runtime user of `run()` is the kind lab of `systems`. No package of the client starts `service()`, `run()` or `start()`. | systems: `packages/kind/image/app.mjs`. Client: `packages/systems/src/lint.ts:11` imports only the law. |
| Four functions compare a token: two in the client and two in jarvis. | The client has two, and they are constant-time. jarvis has one constant-time copy. Graph has two: its tenant token uses `===`, and its agent token tells its length. | Client: `packages/client/src/server/procedure-server.ts:168-174`, `packages/client-server/src/peer/security.ts:47-55`. jarvis: `packages/http/src/token.ts:12-15`. Graph: `packages/server/server.ts:288-292`, `:478-483`. |
| The root of `@procedures/client` is free of `node:` imports. | The root is not node-free at this time. It exports `HttpServerTransport`, which imports `http`, and `WebSocketServerTransport`, which imports `ws`. CLI-6 moves them to `./node`. | `packages/client/src/index.ts:18-33`, `packages/client/src/adapters/http/server/transport.ts:9-10` |

## The decisions D1 to D18

Mark decided each of these on 2026-10-17.

| ID | Question | The answer of Mark | Items |
|---|---|---|---|
| D1 | Where does the general `node:http` listener adapter go? | A: in `systems`, as the new entry `@mark1russell7/service/http`. It is small and has no framework: `httpTransport`, a mount list, `probeServer`, `probeHandler` and `writeOutcome`. | SYS-1 |
| D2 | Is the procedures server a process or a component? | A: a component. `createProcedureHost` gives parts, and the service of the process declares them. Only that entry starts `run()`. `systems` documents the pattern, with no embedded mode. | SYS-8, CLI-7, JAR-4, GRAPH-6, SYS-15 |
| D3 | How does the request tracking follow a dynamic registry? | B: dynamic routes. A controller can match a path pattern, and a function gives the idempotency of each request. | SYS-5, CLI-7 |
| D4 | Does `systems` get a stream request kind? | C: each request is a stream, and a unary call is a stream of one. | SYS-6, JAR-7 |
| D5 | Where do the health probes answer? | A: on a dedicated port or on the port of the app, as each process chooses. | SYS-2, CLI-9, JAR-4 |
| D6 | What does a second `SIGINT` do under `run()`? | A: a declared option `onRepeatSignal`, with the value `"ignore"` or `"exit"`. The `local-dev` profile sets `"exit"`. The sum of the stage limits replaces the hard-exit timer of the client. | SYS-9, CLI-8 |
| D7 | Can `systems` ship named profiles, with its rule of no defaults? | A: yes. A profile (`local-dev`, `kubernetes`) is exported data that a caller spreads explicitly. | SYS-10, CLI-8 |
| D8 | Does the rule of one procedures server apply to jarvis? | A: yes. jarvis mounts the procedure handler of the client and moves to the standard wire. The `{items}` body goes, and each reader reads the stream. | JAR-1, JAR-5, JAR-6, CLI-2a, CLI-28, CLI-30, CLI-31 |
| D9 | How does the sync of Graph relate to the collections of the client? | D: SignalDB is one local-copy strategy under `HybridStorage`, and the client owns the sync. | CLI-14, CLI-15, CLI-17, CLI-20, CLI-21, GRAPH-9, GRAPH-11 |
| D10 | How does the CommonJS server of Graph load the ESM packages? | A: `@graph/server` becomes ESM. OTel loads through `node --import`, and SSR through a dynamic import. A telemetry job in CI proves the load order. | GRAPH-5 |
| D11 | Do the collection writes get a conflict check on the server? | A: an optional `expectedVersion` on `set`, `setBatch` and `delete`. Graph keeps last-write-wins first, and it uses the version later. | CLI-16 |
| D12 | Can Vex and polite-crawler use `@procedures/mcp-server` for their MCP entries? | A: yes, for the MCP entry only. The step waits until the host factory works for `mark mcp`, Graph and jarvis. | OTH-2, OTH-3 |
| D13 | How do the breaking changes of the client group ship? | B: each break is its own MINOR of the client group. Refer to "Releases of the server stack". | CLI-1, CLI-2b, REL-2, DOC-4 |
| D14 | What happens to the host ownership brief? | A: a layer contract replaces it and keeps its three decisions with a new scope. This document is that contract. | DOC-1 |
| D15 | What happens to the stale copies of the repositories? | Nobody deletes or moves a folder without Mark. Mark and Claude examine the folders together, one at a time. | CLEAN-2 |
| D16 | Can the published harness of `systems` ship an image that installs `@procedures/client`? | C: the harness takes its test subjects as data, and the client owns its procedures subject image. | SYS-17, CLI-33, SYS-18 |
| D17 | Do one-shot commands start under `run()`? | B: yes, with the minimal profile. Refer to "One-shot commands also start under `run()`". | CLI-8, CLI-26, SYS-16 |
| D18 | Does the REST data API of Graph move to procedures? | B: yes. All of the Graph server moves in this migration. | GRAPH-7 |

## Releases of the server stack

The public packages of the client group have one version together. Decision D13 sets these rules for the changes of the server stack:

- An additive change ships as a PATCH of the client group, at any time.
- Before 1.0.0, a breaking change raises the MINOR. Each break is its own MINOR of the client group.
- A break merges alone. The next release of the group carries it, and the next break waits for that release.
- One release before the break, a PATCH marks each export or behavior that the break moves or removes as `@deprecated`. The tag names the replacement.
- The changeset of a break has the type `minor`. Its text gives the migration steps for each known consumer: the site, MiniMongo, the MCP host of Graph and jarvis.
- Thus the CHANGELOG entry of each MINOR carries its migration steps.
- A release candidate goes under the dist-tag `next`, not under `latest`.
- `RELEASE.md`, `scripts/publish-ci.mjs` and `.github/workflows/release.yml` stay as they are. Only Mark and the npm owner session publish.
