# @procedures/peer

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
