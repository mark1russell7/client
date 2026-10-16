# Roadmap: October 2026

> This roadmap comes from the architecture review of 2026-10-16. The review page is at https://claude.ai/artifact/49vNStauE2K7pScAuxDGWr. The owner approved all of its items on 2026-10-16.
>
> The work goes in the order of the IDs. A lower ID comes first. Each item records its status and its commits.
> The status values are the values of [deep-dive-2026-10/STATUS.md](./deep-dive-2026-10/STATUS.md): **open**, **partly**, **fixed**, **done** and **decision**.

## Decisions of the owner (2026-10-16)

| Question | Decision | Items |
|---|---|---|
| Do we finish the bidirectional peer, or do we rename the peer to host? | Finish the bidirectional peer. | R24 |
| Do we use the typed durations of `@mark1russell7/quantity` in the public options? | Yes. The change breaks the API, so it goes in the same release as the deadline model. | R11 |
| Do we make the compiler? | Yes, the full compiler: the check before the run and the code generation. | R20 to R23 |
| Do we make the collection mode switch real, or do we remove `HybridStorage`? | Make the switch real. | R2, R28 |
| Do we freeze a wire protocol v1? | Recommended, and in the plan after the peer. The owner can stop it. | R25 |
| Do we use the service abstraction of `systems` in the client? | Yes, where it fits. A study gives the parts to adopt and the parts to move out of the client. | R34 to R37 |

### The check before the run

A program is a procedure as data: a tree of calls, names and references. Today the interpreter finds a problem only when it arrives at the problem.

- Example: step 1 writes a file, step 2 writes a commit, and step 3 calls a procedure that the capability refuses. The refusal comes after two writes.
- `program.check` examines the whole tree before the first call. It finds the effects of each call and each `$ref` that has no name. It also finds each input that does not agree with its schema, and each refused call.
- When the check finds a problem, nothing runs. This part of the compiler gives the most safety, so it comes first (R20).
- The code generation (R21) then writes the checked tree as a plain `async` function.

### The freeze of the wire protocol

The wire protocol is the format of the bytes between a client and a server. It is the HTTP path, the `X-Metadata` header, the fields of a WebSocket frame and the error codes.

- Today the format has no version number. The 30 packages have a release each, so a client of one release can connect to a server of a different release.
- If a release changes a frame field, the old side does not understand the new frame. No message tells the user why.
- To freeze v1 is to write the format in a specification and to put a version number in the first message of each connection. One list of error codes then applies to all transports, and golden tests fail when a frame changes.
- After the freeze, a change adds only optional fields, or it makes a v2 that the server can refuse with a clear error.
- The freeze comes after the bidirectional peer (R24), because the peer adds new frames.

## Rules for the work

- Each change brings its tests. A defect gets a test that fails before the fix.
- Before a commit, start `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm lint:ste`. Then start `node .github/scripts/typecheck-tests.mjs`, `node scripts/check-packages.mjs` and `node scripts/check-scope.mjs`.
- A change that the user can see gets a changeset. A change that breaks the API gets a minor version while the packages are below 1.0.
- R10, R11 and R12 change the same options. They go in one release, so the API breaks one time.
- Do not delete framework code without a decision of the owner. The section "Items for a decision" lists the candidates.
- Other sessions commit to `main`. Commit only your own files, and examine `git log origin/main..HEAD` before each push.

## The items

| ID | Tier | Item | Size | Status | Commit |
|---|---|---|---|---|---|
| R1 | 1 | Retry obeys the effects, and an idempotency key removes duplicate writes | M | fixed | `cfb9d69`, `ad8d8c2` |
| R2 | 1 | `HybridStorage` cannot empty its local copy, and a failed write is not lost | S–M | fixed | `c799cdd` |
| R3 | 1 | WebSocket: a time limit for the handshake, a server heartbeat, reconnect jitter | S–M | fixed | `fee5d9c` |
| R4 | 1 | `$never` holds back each operand of the control flow (REV-4) | S | fixed | `540f8d9` |
| R5 | 1 | The peer accepts a bare JSON value, obeys `bodyLimit` and stops cleanly | S | fixed | `aaa7462` |
| R6 | 1 | `object.set` and `object.get` refuse the prototype keys | S | fixed | `b6daaec` |
| R7 | 1 | The read-only guards of CAP-1, CAP-2 and CAP-3 | S | fixed | `89d8a4a` |
| R8 | 1 | The CI gates of stage 0 | S | fixed | `82f8270` |
| R9 | 1 | The timeout examples in the documents set a timeout | S | fixed | `f7c4a7f` |
| R10 | 2 | One deadline model: the client timeouts send `procedure-timeout` (REV-6) | M | fixed | `5b9264e` |
| R11 | 2 | Typed durations in the public options | M | fixed | `fb30718` |
| R12 | 2 | Retry budget, full jitter, `Retry-After`, a circuit breaker that counts only failures | S–M | fixed | `43f7de5` |
| R13 | 2 | The cache: one call for the same key, a write removes entries, the principal in the key | S–M | fixed | `a8c47f1` |
| R14 | 2 | Cancellation scopes and a graceful stop | M | fixed | `381ce3a` |
| R15 | 2 | Unbounded streams on the faces that collect a stream | S–M | fixed | `c5528e4` |
| R16 | 2 | One trace from the client to the handler | S–M | fixed | `ff62281` |
| R17 | 3 | One manifest type, built from the registry and the expose rule | M | fixed | `956e88b` |
| R18 | 3 | A typed server-transport contract, a principal, the token in `ProcedureServer` | M | fixed | `b07bb50`, `6982e04` |
| R19 | 3 | `host.health`, `host.info` and `host.metrics` | S | fixed | `07cc998` |
| R20 | 4 | `@procedures/compiler`: the IR and `program.check` | M | fixed (the host check is in R22) | `9bc2ddb` |
| R21 | 4 | `program.compile` and the equivalence tests | M | fixed | `9bc2ddb` |
| R22 | 4 | The interpreter and the site use the IR of the compiler | M | fixed (the plan changed: see R22) | `f5ed492`, `a70d445`, `6c688e1` |
| R23 | 4 | Outputs of the compiler: diagrams, tool descriptions, typed SDK, `procedure.explain` | M | fixed | `6bf62d4`, `29a7b29` |
| R24 | 5 | The bidirectional peer | M–L | fixed | `b2a3e3a` |
| R25 | 5 | Wire protocol v1 | M | fixed | `21f7743` |
| R26 | 5 | MCP Streamable HTTP | M | fixed | `3d24d5b`, `b42f3c8` |
| R27 | 5 | A `MessagePort` transport for workers | S–M | fixed | `d81d0ed` |
| R28 | 6 | The collection mode switch | L | fixed | `7873940` |
| R29 | 7 | Testing stage 1: property tests and a catalog test of the core procedures | M | fixed | `06d9e52`, `0c627f8`, `ddea529` |
| R30 | 7 | Testing stage 2: faults, contracts and leaks | L | fixed | `bd0b626` |
| R31 | 7 | Coverage with a ratchet | S | fixed (the first floors come from CI) | `26aad49` |
| R32 | 7 | Testing stage 3: mutation, benchmarks, soak, real services, Windows | M | fixed, the five nightly jobs pass | `26aad49`, `3c40d2d`, `a7db4a6` |
| R33 | 7 | Tests of the thin packages, and path confinement in `client-fs` | M | fixed | `bc70357`, `95b660d` |
| R34 | 8 | `@procedures/systems` and the timer law | M | fixed | `4a3bfa1` |
| R35 | 8 | State machines as data and an injectable monotonic clock | M | fixed | `ae7f05f` |
| R36 | 8 | A harness cell for a procedures WebSocket pair | M–L | open | |
| R37 | 8 | The service abstraction of `systems` in the client | M–L | fixed: the clock, the heartbeat, the backoff and `replay` | systems PR #15 (`ba06091`), client `061fa22` |
| R38 | 9 | `@procedures/http` | S–M | fixed, not an MCP tool | `a6b01a9` |
| R39 | 9 | JSON and YAML transforms | S | fixed, the pure ones are MCP tools | `a6b01a9`, `1779d96` |
| R40 | 9 | More git operations, and `git.branch` in three procedures | S–M | fixed | `4cad9ab` |
| R41 | 9 | More pnpm and docker operations | M | fixed, 12 docker tools | `14d85fe`, `2392f9e`, `c66f0c4` |
| R42 | 9 | `@procedures/gh` | M | fixed | `49de6a8` |
| R43 | 9 | npm registry procedures | S–M | fixed | `2bc7ce5` |
| R44 | 9 | More operations for fs, mongo, sqlite, s3, node and lib | M | fixed, 5 read-only tools | `f23c7ad`, `ffb35f3`, `3aa6495`, `94dd2a0`, `04cfef8`, `4d3ff39`, `5b7b673` |
| R45 | 9 | A SQLite collection storage and an IndexedDB program store | M | fixed | `4ef0d44`, `4ec3898` |
| R46 | 9 | `llm`, `schedule`, `env` and `archive` | M each | fixed, no MCP tools | `53785c6`, `b2175e8`, `808c510`, `c56dce3`, `2a7bd8a` |
| R47 | 9 | Generate `PROCEDURES.md` and `PACKAGES.md` again | S | fixed, and CI keeps them current | `596190d`, `2315ea9` |
| R48 | 9 | Packages from jarvis, wave 1: `ics`, `mail`, `geo`, `weather`, `exif`, `notify` (the jarvis session builds them) | M | fixed by the jarvis session, with an opt-in bundle for MCP | `5e2ba76`, `382b0fd`, `120be4c`, `4055a3d` |
| R49 | 9 | Packages from jarvis, wave 2: `restic.run` and `tailscale.run` (the jarvis session builds them) | S | fixed by the jarvis session, not tools | `5e2ba76` |

## Tier 1: defects and gates

These items correct behavior that loses data, breaks the security model, or hides a failure. Each one is small.

### R1. Retry obeys the effects

**Problem.** The retry middleware sends a call again after a network error or a timeout of one try. It does not read `effects.idempotent`. So a retry can do a write two times: the first try can arrive at the server after the client stopped waiting. The middleware also retries "WebSocket connection closed" while a request is in flight.

**Change.**

- The client knows the effects of a remote procedure from a declaration per path or from the manifest of the server (R17). A call can also set `idempotent` itself.
- Retry sends again only a call that is idempotent, or a call that did not leave the client.
- Each try of one call sends the same idempotency key in the metadata. `ProcedureServer` keeps the result of each key for a short time. A second try with a known key gets the first result, and the handler does not start again.

**Done when** a test shows that a write that fails after it arrives occurs one time, and a read occurs again.

**Result.** A failed try tells its delivery: `not-sent` or `indeterminate`. The option `idempotent` and the function `idempotentIn(registry)` give the effects. `ProcedureServer` keeps the result of a keyed call to a procedure that is not repeatable. A keyed call continues when its caller goes away, so the next try gets its result. The test over HTTP runs a slow write one time after the first try times out.

### R2. `HybridStorage` cannot empty its local copy

**Problem.** `getAll` of the remote storage gives values without their ids. The sync skips each item without a key, and then deletes each local id that the remote list does not have. Without `keyOf`, each sync empties the local copy. After a write-through failure, the local copy has the write, the queue has the operation, and no timer empties the queue. When the queue is full, it drops the oldest operation and tells nobody.

**Change.**

- The remote list gives pairs of id and value. When the storage cannot find an id, the sync stops with an error. It does not delete.
- A write-through failure removes the local write, or it keeps the write and tells the caller that it is pending. It does not queue the same operation two times.
- A full queue refuses the next operation with an error.
- The first sync finishes before the first read.

**Done when** a model-based test with a remote storage that fails shows no loss of data. R28 then makes the modes switchable.

**Result.** Storages have `getEntries()`, and the collections have the procedure `entries`. A remote item without a key stops the sync with `MissingKeysError`. The model-based test of the two modes found one more defect: a write-through reached the remote before an older queued write of the same id. A write-through sends the queue first.

### R3. WebSocket gaps

**Problem.** The handshake has no time limit, so a black-hole address keeps the connection in `CONNECTING`. The server does not send a ping, so it cannot find a client that went silent. The reconnect delay has no jitter, so many clients reconnect at the same time.

**Change.** A connect timer closes the socket. A server heartbeat closes a connection after missed pongs. The reconnect delay gets full jitter, and the reconnect tries get a limit.

**Done when** tests show each behavior with fake timers.

**Result.** The tests use a TCP server that does not answer, a `ws` server that does not answer pings, and a client that sends no pongs. The heartbeat and the backoff are written in the shape of `@mark1russell7/service`. R37 moves them to that package.

### R4. `$never` in the operands

**Problem.** `evaluateOperand` does not examine `$when`. A `$never` operand of `client.conditional`, `client.tryCatch`, `client.parallel` or `client.map` runs. A `fn` of `client.map` or `client.reduce` that is not one call is ignored without an error.

**Change.** `evaluateOperand` obeys `$when`. A `fn` that is not a call gives a validation error.

### R5. The peer HTTP body and the stop

**Problem.** The peer uses a strict `express.json()`. It refuses a bare JSON value, which the core HTTP server accepts (TRN-10). Its default limit of 100 kB replaces `bodyLimit`. `peer.stop()` does not close the HTTP server that it made for the WebSocket, so the port stays bound. `mark --server` uses `process.exit` on `SIGINT` and does not stop the peer.

**Change.** A body parser that accepts each JSON value and uses `bodyLimit`. `stop()` closes each server that the peer made. `mark --server` stops the peer before it exits.

### R6. Prototype keys in `object.*`

**Problem.** `object.set` with the path `__proto__.x` changes the prototype of the result.

**Change.** The object procedures refuse `__proto__`, `constructor` and `prototype` in a path, as the registry does.

### R7. Read-only guards

The three items are open in STATUS since 2026-10-13.

- CAP-1: `db.query` refuses a statement that changes data.
- CAP-2: `mongo.documents.aggregate` refuses `$out` and `$merge`.
- CAP-3: `logs.query` does not make the database file.

### R8. The CI gates of stage 0

- CI starts the `mark` end-to-end tests. A test that needs a build fails when the build is missing. It does not skip.
- `typecheck-tests` examines `client-docker/__tests__`.
- `--passWithNoTests` goes away from each package that has tests.
- The release workflow publishes only a commit that has a green CI run.
- The `sideEffects` rule of `check-packages` agrees with `check-side-effects`.

### R9. The timeout examples

`MIDDLEWARE.md` and a doc comment in `client.ts` show `createTimeoutMiddleware({ overall: 5000 })`. That function reads only `perAttempt`, so the example sets no timeout. The examples change, and the type refuses `overall`.

## Tier 2: one resilience model

These items change the public options of the middleware. They go in one release.

### R10. One deadline model

**Problem.** The client has four timeouts that do not agree. The overall timeout does not send the remaining time to the server, so the server can continue after the client stopped waiting. `createCombinedTimeoutMiddleware` puts the overall timeout and the timeout of each try in one slot, so retry cannot go between them. The server ignores `X-Timeout`.

**Change.**

- The overall timeout writes the remaining time into `procedure-timeout` for each try.
- The limit of each try is the smaller of its own limit and the remaining time.
- `X-Timeout` goes away. `procedure-timeout` is the one word for a deadline on the wire.
- A preset `resilience({ overall, perAttempt, retry, breaker })` puts the middleware in the correct order: overall, cache, retry, breaker, rate limit, each try.
- `createCombinedTimeoutMiddleware` becomes an alias of the preset.

**Done when** a test shows that the server stops a handler when the overall time of the client ends.

**Result.** The deadline of a call is one internal value (`__deadline`). The transport runner writes its remaining time into `procedure-timeout` before each try. The timeout of one try does not change the deadline of the server. A keyed write (R1) continues until the next try can get its result. The test of R1 found this rule.

### R11. Typed durations

The public options that are times take a `Duration` of `@mark1russell7/quantity`: the timeouts, the intervals, the backoff and the heartbeat. A plain number of milliseconds gives a type error. The wire keeps milliseconds. The study of R37 confirms that the package works in a browser and is on npm (0.1.0). The package has no `Duration` type yet, so the client declares an alias and its own constructors.

**Result.** `ms()`, `seconds()`, `minutes()` and `hours()` make a duration. At run time, a number in a time option gives a `TypeError` that names the option. The inputs of procedures and the wire keep milliseconds. A codemod moved the tests. The collections package (`@procedures/collections`) keeps its numbers: it is a general library of data structures.

### R12. Retry and the circuit breaker

- A retry budget for each client limits the retries to a part of the calls.
- Full jitter replaces the jitter of 10 percent.
- Retry obeys `Retry-After`.
- `maxAttempts` counts the tries, as the documents say.
- The circuit breaker counts only `UNAVAILABLE`, `TIMEOUT` and network errors. An abort or a validation error is not a failure.
- The circuit breaker uses a monotonic clock.
- `ApiStorage` uses the retry middleware and not its own loop, so 3 retries times 4 retries cannot make 12 calls.

### R13. The cache

- Two calls with the same key at the same time make one remote call.
- A write to a path removes the cache entries that the write makes old.
- The key contains the principal, so two users do not share an entry.
- The rate limiter for each service keeps a bounded map.

**Result.** The cache also refuses to store a response when an inner layer changed the key metadata during the call. The rate limiter for each service keeps one limiter for each configured service, so its map was bounded already.

### R14. Cancellation scopes and a graceful stop

- The context of a handler has one signal that joins four scopes: the request, the connection, the server and the deadline.
- `ProcedureServer.stop({ grace })` refuses new calls, lets the calls in flight finish until the grace time ends, and then aborts them.
- `exec()` and `execStream()` take a signal.
- `LocalTransport` passes the interceptors, the capability and the deadline, so `mark` in local mode has a deadline and stops on Ctrl+C.
- `server.call` relays the signal and the deadline. A remote leaf of `route()` sends the deadline.

### R15. Unbounded streams

**Problem.** MCP and HTTP without NDJSON read a stream to its end. `docker.logs` with `follow` over MCP ends only at the timeout of 600 seconds.

**Change.** A procedure declares that its stream can be unbounded. A face that collects a stream refuses such a call, or it stops at a declared limit of items or time.

### R16. One trace

The client middleware and the server interceptors make two traces today. The client sends a `traceparent` in the metadata, and the server continues that trace.

## Tier 3: contracts

### R17. One manifest type

**Problem.** Ten systems describe procedures. Three manifest formats have three version schemes and no shared type.

**Change.**

- The core has one function that describes a registry. It gives the path, the description, the effects, the JSON Schemas, the tags and the CLI metadata. It obeys the expose rule.
- `procedure.get` gives the JSON Schemas. A new `procedure.manifest` gives the whole description.
- `manifest.generate`, `_discovery.announce`, `mcp.list-tools` and the `mark` manifest use this function.
- R1 uses the effects of the manifest. The compiler (R20) uses the schemas.

**Result.** The context of a handler has the expose rule of its host (`ctx.expose`), and each introspection procedure obeys it. Before, a handler could not know the rule, so the MCP tools `procedure.list`, `procedure.get` and `procedure.export` listed the procedures that the host hides. `procedure.manifest` is the 63rd tool of the dev tools.

### R18. The server-transport contract

- `ServerTransport` gets a typed handler: a request and a signal give a response.
- `ServerRequest` has a principal.
- `ProcedureServer` examines the token of `HostPolicy`. Today only the peer examines it.
- The HTTP server copies only declared headers into the metadata. It does not copy `Authorization`.
- A conformance suite sends the same calls through each face: Local, HTTP, WebSocket and MCP.

**Result.** The transports take a `RequestHandler`. A request has `credentials` and `principal`, and a request without credentials comes from the process itself. The suite found one more difference: a local call waited for its handler after an abort. `LocalTransport` answers `ABORTED` at once, as the network faces do.

### R19. Health and metrics as procedures

`host.health`, `host.info` and `host.metrics` give what the peer gives today only as an Express route, and the snapshot of `metricsInterceptor`.

## Tier 4: the compiler

### R20. The IR and `program.check`

- A new package `@procedures/compiler`. It works in a browser.
- The IR has these nodes: literal, object, array, reference, call, chain, parallel, conditional, try, and, or, map, reduce and dynamic. Each node keeps a pointer to its source.
- The passes: normalize, scopes, effects, checks.
- The effects pass finds the effects of the program from the bottom up. An undeclared procedure gets all effects, so the check fails closed.
- `program.check` gives the effects and a list of diagnostics with source pointers. A diagnostic is an unknown name, a refused call, a bad input or a `$never` trap.
- The host starts `program.check` before it starts a program. It refuses a program that the capability refuses, before the first write.

**Result.** `@procedures/compiler` has the IR, the passes and `checkProgram()`. The check works from a manifest, a registry or facts, so it works in a browser. It gives the effects that the program can have, the effects that it must have, and diagnostics with RFC 6901 pointers. The procedure `program.check` takes the program raw, so nothing in it runs. The host does not start the check yet: R22 adds it.

### R21. `program.compile`

- The code generation writes a plain `async` function that calls `ctx.client.call` for each call. Each call keeps its validation, admission, deadline and interceptors.
- A dynamic node goes back to the interpreter.
- A fold pass computes the pure parts with literal inputs.
- The output is the code, a source map, the effects, the diagnostics and the hash of the registry.
- Tests: golden outputs, and a property test that runs generated programs both ways and compares the results and the order of the calls.

**Result.** `compileProgram()` gives a closure (no `eval`), the text of an ES module, a source map and the folded calls. The procedure `program.compile` gives the text. Control flow is inlined only when the manifest entry has the hash of the core procedure. Other data-driven procedures stay `dynamic`. Each test run sends approximately 2,200 random programs through the interpreter, the closure and the text. It compares the results, the errors and the order of the calls. An effects property compares the inferred effects with the observed effects.

Open points (for R22):

- The compiled code does not call the control-flow procedures, so their admission, interceptors and trace do not run. The leaf calls keep them.
- The compiled code sends no hydration events.
- The static check does not read the deadline, the clearance, `metadata.calls` or `strictCalls`.
- A manifest has no body of a defined procedure, so a browser gets `effects-unknown` for it.

### R22. One semantics

Three parts read programs today: the interpreter, the analysis of the site and the compiler. The interpreter operates on the IR, and the site uses the passes of the compiler, so the three cannot disagree.

**Progress.** The MCP host checks each program before its first step with `programCheckInterceptor()` (`f5ed492`). The tools `program.check` and `program.compile` are in `bundle-mcp`, and the host has 65 tools.

**A change of the plan.** The interpreter stays the reference of the semantics, and it does not run the IR. The compiled code does not call the control-flow procedures, so their admission, interceptors and trace do not run in it. The equivalence property of R21 makes sure that the interpreter and the compiler agree. The rest of R22:

- Done: `procedure.define` gets the check of its body from the interceptor. A body with an error does not become a procedure. The procedure keeps the effects of its body as `inferredEffects`, and its tool hints come from them.
- Done: the site keeps its own analysis, because the page has no room for the compiler. A test compares the analysis with the passes of the compiler on the examples and on random programs. It found a defect of the analysis: a list of calls in a step of an implicit chain is a chain too.

### R23. Outputs of the compiler

- A Mermaid diagram of a program.
- The MCP tool description of a defined procedure, from its effects and schemas.
- A typed SDK and an OpenRPC document from the manifest (R17).
- `procedure.explain`, which wraps `explainInvocation`.

**Result.** `@procedures/compiler` gives these outputs:

- A Mermaid flowchart of a program: `toMermaid`, `diagramProgram` and the procedure `program.diagram`.
- An explanation of each call under a capability: `explainProgram` and the procedure `program.explain`.
- An OpenRPC 1.3 document: `toOpenRpc` and the procedure `sdk.openrpc`.
- A typed SDK without imports: `toTypeScriptSdk` and the procedure `sdk.typescript`.

 The tool description of a defined procedure tells the effects of its body. The MCP host has 67 tools. The namespace `sdk` is not a tool namespace.

## Tier 5: the bidirectional peer and the wire

### R24. The bidirectional peer

**Problem.** The peer is not bidirectional. The reverse calls are two raw WebSocket functions with their own frame format. They have no streaming, no cancel and no signal, and nothing uses them.

**Change.**

- Each side of a WebSocket connection has a registry. Each side sends calls to the other side with the same frames and through `invokeProcedure`.
- A reverse call gets streaming, credit, cancel, the deadline and the capability.
- The server can send calls to the client, and the client can serve its own registry.
- The event frame works in the two directions, or the review lists it for a decision.
- The two raw functions become wrappers of the new calls.

**Result.** `adapters/websocket/shared/rpc.ts` has the calls of the two directions: `OutgoingCalls`, `IncomingCalls` and the stream credit. The server serves each connection with `IncomingCalls`. `callConnection`, `transportFor` and `callClient` send calls to a client. The client serves its own handler with the `serve` option, and `onServerRequest` is a wrapper. The peer has `connections()` and `clientFor(id)`. The event frame is in the list for a decision.

### R25. Wire protocol v1

- `WIRE-PROTOCOL.md` specifies the HTTP and WebSocket formats.
- A WebSocket connection starts with a hello frame that gives the protocol version. HTTP sends the version in a header.
- One list of error codes for all faces.
- The reason of a `FORBIDDEN` error travels on each face.
- `Method.version` has a meaning, or it goes away.
- Golden frame tests pin the format.

**Result.** `src/protocol.ts` has `PROTOCOL_VERSION` 1, the `Procedures-Protocol` header, `ERROR_CODES` and `httpStatusOf`. A WebSocket connection starts with two hello frames. A server refuses another version with `PROTOCOL_VERSION`. The reason of a `FORBIDDEN` error travels on each face, also in the `_meta` field of MCP. `Method.version` is deprecated. The goldens are in `packages/client/test/wire/`, and `WIRE-PROTOCOL.md` specifies the formats.

### R26. MCP Streamable HTTP

The SSE transport of `client-mcp` only throws today. The current MCP specification uses Streamable HTTP.

**Result.** `McpServerTransport` takes `transport: "http"`. Each client gets a session with an MCP server of its own, so it gets the progress and the `list_changed` notifications. The endpoint listens on loopback by default. It refuses a page of another origin, and with a token it refuses a request without the token. `mark mcp --http <port> --token <token>` serves the dev tools. A test with the client of the MCP SDK and an end-to-end test of `mark` examine it.

### R27. A `MessagePort` transport

The site has two worker protocols of its own. A `MessagePort` transport replaces them.

**Result.** `PortTransport` sends the frames of the WebSocket transport over a worker, a `MessageChannel` or a `worker_threads` port, in the two directions. The site serves `site.run` and `site.journey` from its workers with it. The transport does not import the Durations, because `quantity` brings zod (R37). Alone, the transport is 2.5 kB of gzip.

## Tier 6: the collection mode switch

### R28. The mode switch

- `HybridStorage` has the modes `local-only`, `write-through`, `write-back` and `remote-only`, and `setMode()` changes the mode while it operates.
- A switch empties the queue before it changes the mode. A switch to `remote-only` drops the local copy only after the flush.
- The queue is durable through a store that the application gives, in memory, in a file or in IndexedDB.
- The sync asks for the changes since a version. Each item has a version or an ETag. A conflict uses a policy that the application gives.
- A periodic pull keeps the local copy fresh.
- `ProcedureServer.useStorage` empties the old storage before it changes.
- A consumer uses the switch: the site or MiniMongo.
- A model-based test switches the modes at random times while the remote storage fails.

**Result.** `HybridStorage` has the four modes. `setMode()` waits for the running operations, sends the queue and syncs the local copy. A failed switch keeps the mode and throws `ModeSwitchError`. A `QueueStore` keeps the queue: `MemoryQueueStore`, and `FileQueueStore` in `@procedures/store/file-queue`. Storages get `getChangesSince()`, and the collections get the procedure `changes`. `versionOf` gives the versions for the conflict policy. `pullInterval` pulls. `ProcedureServer.useStorage` drains the old storage with the `drain` option. The synced registry is the consumer: `createSyncedRegistry` takes the mode, and the registry has `setMode()`. The model test with random switches and restarts found that a restart in `remote-only` must send the loaded queue before a read.

Open points:

- The local copy is not durable. A new storage in `local-only` holds only the queue until a switch to a remote mode.
- With the `error` policy, the next push sends the queued write, and it overwrites the remote value.
- A write to an id without a remote version in the storage is not a conflict.
- `MongoStorage` has no `getChangesSince()`, so it uses full syncs.
- The IndexedDB queue store comes with R45. The site and MiniMongo do not use the switch yet.

## Tier 7: the testing program

### R29. Stage 1

- Property tests for the resolver of references, the narrowing of capabilities and the expose rule of all eight control-flow procedures.
- Property tests for the arguments of `mark` and the programs of the site.
- One example test for each core procedure.

**Result.** Property tests with fast-check examine these parts: the resolver of references, the narrowing of capabilities and the expose rule of the eight control-flow procedures. They also examine the command line of `mark` and the programs of the site. Four planted defects each fail a property. A random run found a defect of the model (the order of integer keys), not of the code. The catalog test has 285 examples for the 100 core procedures. It fails when a core procedure has no example. The catalog found four defects, which are fixed. `client.replace` read `$$` and `$&`, and `client.groupBy` failed for a group `constructor`. `client.arrPick` and seven other array procedures read fields of the prototype. The schema of `client.template` described `{name}`.

### R30. Stage 2

- A seeded fault transport: latency, a drop before the first item, a drop in a stream, a hang that ignores the signal, duplicate frames.
- An in-process TCP proxy: black hole, reset and pause.
- Reconnect tests for the WebSocket client.
- A middleware stack test: retry, timeout, breaker, cache, rate limit and the abort points, with fake timers.
- Leak tests: after 1,000 aborted calls, the maps of the servers are empty.
- A snapshot of the tool schemas, the wire goldens of R25, and a snapshot of the public `.d.ts` API.
- Tests of `client/errors`.

**Result.** The test helpers are a seeded fault transport (`FAULT_SEED` replays a run) and an in-process TCP proxy. The tests examine the reconnect of the WebSocket client, the six layers of `resilience()` with fake timers, and 1,000 aborted calls on each transport. The snapshots are the tool schemas (`UPDATE_TOOL_SCHEMAS=1`) and the public API of `@procedures/client` (`UPDATE_API_SNAPSHOT=1`). The tests found four defects, which are fixed:

- The timeout middleware did not stop its wait at an abort of the caller when the transport ignored the signal.
- The WebSocket of Node 22 gives no close event after a failed handshake, so each reconnect waited for the handshake limit.
- `createErrorFromException` gave ABORTED for `AbortSignal.timeout()` and PARSE_ERROR for a circular structure.
- `isAvailabilityFailure` did not count `CONNECTION_CLOSED`.

### R31. Coverage

`@vitest/coverage-v8` at the root, with thresholds that only go up.

**Result.** `scripts/coverage.mjs` runs the tests of each package with coverage and compares them with `coverage-baseline.json`. The floors only go up. The CI job `coverage` uploads the raised floors as an artifact. The first floors come from that artifact, because this computer is shared and does not run the full gate.

### R32. Stage 3

Nightly mutation tests on the resolver, the capabilities, the policy and the middleware. Benchmarks with baselines. A WebSocket soak test. Real Docker and a Mongo service container. A Windows job.

**Result.** `.github/workflows/nightly.yml` has five jobs:

- `mutation`: Stryker on the resolver, the capabilities, the expose rule and the middleware. The report is an artifact. A score below 72 % fails the run.
- `bench`: the benchmarks of the core with the `bench` fixture of vitest 5. The earlier results are the results of the last nightly run.
- `soak`: 10 minutes of calls, streams, aborts, calls of the server and reconnects. The maps of the two sides must be empty, and the heap must stay flat.
- `live`: the `mongo.*` procedures against MongoDB 7, and the `docker.*` procedures against the Docker of the runner.
- `windows`: the build, the type checks, the tests and the end-to-end tests of `mark`.

The input `only` of the workflow runs some of the jobs, for example `mutation,windows`. The first runs found these defects, which are fixed:

- Stryker 10.0.0 rewrote `tsconfig.json` with the JavaScript API of TypeScript, which TypeScript 7 does not have. Stryker runs in place for that reason.
- The vitest runner of Stryker selected the tests of a mutant with the names joined by spaces. Vitest 5 joins them with `>`, so only 4 of 1909 mutants died. A `pnpm patch` accepts both. The score went to 72.6 %.
- On the Windows runner, the fs root refused a path by its short name (`RUNNER~1`). A zip archive kept a link target with `\`. The pnpm procedures did not find pnpm 12.
- On the Windows runner, the scaffold test of `mark` did not compile its new package through a junction from C: to D:.

The weakest files of the first report were `timeout.ts` (48.9 %), `rate-limit.ts` (60.8 %), `deadline.ts` (61.1 %) and `circuit-breaker.ts` (66.5 %). New tests find their mutants (`bb76968`, `31817e2`):

| File | Before | After |
|---|---|---|
| `timeout.ts` | 48.9 % | 75.9 % |
| `rate-limit.ts` | 60.8 % | 96.0 % |
| `deadline.ts` | 61.1 % | 94.4 % |
| `circuit-breaker.ts` | 66.5 % | 92.1 % |
| All ten files | 72.6 % | 79.8 % |

The tests found one defect (`a6be873`). Without `AbortSignal.any`, the timeout middleware made its signal by hand and dropped the reason of the abort of the caller. Each surviving mutant of the four files is equivalent, or it is in code that no call reaches. The items for a decision list that code.

### R33. The thin packages

More tests for `client-git`, `client-splay`, `client-s3` and `client-fs`. `client-fs` gets an optional root that confines each path.

**Result.** Each procedure of the four packages has tests. The tests of `client-git` run real `git` in temporary repositories without the global configuration. The tests of `client-s3` use an S3 fake in memory. `createFsModule({ root })` confines each path of `fs.*`. It refuses `..`, an absolute path, another drive and a symbolic link out of the root. The error is `FORBIDDEN` with the reason `outside-root`. The tests found three defects, which are fixed. `git.commit` failed for an untracked file, `git.init` called `fs.exists` through the client, and a splay child used the global registry.

## Tier 8: systems

### R34. `@procedures/systems` and the timer law

- The core exports its timer settings as data.
- `@procedures/systems` examines them with the timer law of `systems`. Example: the time of one try is less than the request time of the WebSocket. The overall time is more than the sum of the tries and the backoffs.
- The package depends on the client and on the general packages. The general packages do not depend on it.

**Result.** The core exports `TIMER_DEFAULTS`, and its middleware, transports and server read them. `@procedures/systems` binds the settings of an application to the symbols of the law of `@mark1russell7/service`. It examines six rules with the evaluator of that package. The law found two defaults that broke it. The WebSocket client pinged each 30 s, so it found a dead connection after 35 s, after a call on it timed out at 30 s. The server found a dead client after 60 s. The client pings each 20 s at this time, and the server each 15 s.

### R35. State machines as data

The state of the WebSocket connection and of the circuit breaker become machine definitions that a test can replay. An injectable monotonic clock replaces `Date.now` in the timers.

**Result.** The retry, the circuit breaker and the WebSocket client take a `clock`. The `Clock` has the shape of the clock of `@mark1russell7/service`, so its `fakeClock` fits. `WEBSOCKET_CONNECTION_MACHINE` and `CIRCUIT_BREAKER_MACHINE` are documents of `algebra`, with knobs, events and timers. The code reports each transition, and a test replays the reports against the documents. The function `replayTransitions()` moves to `algebra` with R37.

### R36. A harness cell

A driver for a procedures WebSocket pair in the harness of `systems`. A nightly cell calibrates the heartbeat and the reconnect times under real network faults.

### R37. The service abstraction

A study of 2026-10-16 compared `@mark1russell7/service` 0.2.0 with the client. The service package is a declaration of a service as data and three runtimes: `lint` (the timer law), `start` (health) and `run` (the lifecycle). The root entry works in a browser. `./testing` and `./redis` need Node.

| Part of `systems` | Part of the client | Decision |
|---|---|---|
| `@mark1russell7/quantity` | The times in milliseconds | Adopt in R11. The package has no `Duration` type, so the client has an alias until `quantity` adds one. |
| `Clock`, `realClock`, `fakeClock` | 35 uses of `Date.now` and 30 timers in the core | Adopt in R35. `realClock` is 143 bytes. |
| The three outcomes and `Idempotency` | The delivery of a failed try (R1) | The model is adopted. The type comes with R35. |
| The heartbeat watchdog of the Redis client | The heartbeat of the WebSocket (R3) | Move it out of the Redis client into a general function of `service`, then use it in the client. |
| The backoff of the Redis client | `reconnectDelay` (R3) and the retry middleware (R12) | Move it out into a general function of `service`, then use it. |
| The machines as data and `replay` | The WebSocket state and the circuit breaker | Adopt later (R35). `replay` moves into `algebra` with open machine names. |
| `run()`: stages of the stop, a limit for each stage, one exit | `ProcedureServer.stop`, the peer, the `server` bin | Adopt later in the Node packages (R14, R18). The core takes only the shape of the contract. |
| `start()`: health checks and probes | `/health` of the peer | Adopt later (R19). |
| `describe` and `lint` | `checkEffects` | They examine different things. `@procedures/systems` uses `lint` with rules for the client (R34). |
| The harness cells | The fault tests of the client | Adopt last (R36). |

- The order: R11 and R35 in the client, then small changes to `systems` for service 0.3.0 (the heartbeat, the backoff, `replay` in `algebra`, a clock entry without `node:net`, the rule data). Then R3 and R12 use those functions.
- The dependency direction stays: the client depends on the general packages of npm, and `systems` does not know `@procedures`.
- The sizes, compressed: `quantity` 4.2 kB, the root of `service` 17.2 kB, the browser entry of the client 49.6 kB.
- `quantity` 0.1.0 imports zod at its root and makes schemas there, so a bundler cannot remove zod. A bundle that imports the Durations gets approximately 95 kB of gzip. The client depends on zod already, so only a small bundle feels it, for example the port transport (R27). A change for service 0.3.0: a root entry of `quantity` without zod.

**Result.** `quantity` 0.2.0 has a root without zod. Service 0.4.0 and algebra 0.5.0 (systems PR #15) have four small entries without `node:` and without zod:

| Entry | Content | gzip |
|---|---|---|
| `@mark1russell7/service/clock` | `platformClock`, `realClock`, `Clock`, `Cancel` | 228 B |
| `@mark1russell7/service/heartbeat` | `heartbeat`, `detectionTime` | 779 B |
| `@mark1russell7/service/backoff` | `backoffDelay`, `backoffBand`, `backoffProblems` | 648 B |
| `@mark1russell7/algebra/replay` | `replay` with open machine names | 418 B |

- The Redis client of service uses the heartbeat and the backoff. Its tests did not change, and a new workflow runs them against a real Redis 7.4.
- The client uses the four entries: the clock, the heartbeat of the WebSocket client, `reconnectDelay`, the retry middleware and `replayTransitions`. The delays are the same, and a property test of service compares the heartbeat with the old code of the client on 300 schedules.
- The heartbeat of the WebSocket server stays in the client. It has one interval for all its sockets and a count of misses for each socket.
- Not adopted yet: `run()` for the stop of the Node packages, and `start()` for the health checks of the peer.

## Tier 9: new packages and procedures

| ID | Content |
|---|---|
| R38 | `@procedures/http`: request, JSON, NDJSON and SSE, with a host allowlist, the network effect and the deadline. |
| R39 | JSON and YAML: a query, a patch, a diff, YAML to JSON and back, a schema check. All are pure. |
| R40 | git: `show`, `blame`, `tag`, `rev-parse`, `reset`, `restore`, `merge`, `rebase`, `worktree`. `git.branch` becomes three procedures: list, add and delete. |
| R41 | pnpm: `--filter`, `-r`, `exec`, `list`, `why`, `outdated`, `update`, `pack`. docker: compose `ps`, `logs`, `build`, `restart`, and `images`, `inspect`, `volume`, `network`, `tag`, `push`, `prune`. |
| R42 | `@procedures/gh`: pull requests, workflow runs, releases and issues. |
| R43 | npm: `view`, `dist-tags`, `whoami`, `pack`, `deprecate`. |
| R44 | fs: append, JSON write, watch, hash, temporary folders. mongo: `distinct`, bulk writes, `explain`, watch. sqlite: tables, schema, transactions, migrations, backup. s3: head, copy, presigned URLs. `node.logs`. `lib.graph`. |
| R45 | A SQLite collection storage, and an IndexedDB program store for the site. |
| R46 | `llm` (complete, structured), `schedule` (a cron that starts a stored program), `env` and secrets (not MCP tools), `archive`. |
| R47 | Generate `PROCEDURES.md` and `PACKAGES.md` again. They say 157 procedures, and the registry has 158. Result: the CI job on Node 26 makes them from the built registry and fails on a difference. Its artifact has the new files. |
| R48 | Code from jarvis without personal data: `@procedures/ics` (parse, fetch, occurrences), `@procedures/mail` (parse, headers), `@procedures/geo` (geocode, route), `@procedures/weather` (forecast), `@procedures/exif` (read), `@procedures/notify` (send through ntfy). The jarvis session builds them. This session adds them to the bundles and the MCP snapshots. |
| R49 | `restic.run` and `tailscale.run`: one procedure for each CLI tool, on `client-shell`. The jarvis session builds them. |

## Items for a decision

The review found code that is a candidate for removal or a move. These items need a decision of the owner. Nobody deletes them without one.

- The `client-registry` bin and `_discovery.announce` have no consumers (CORE-17).
- `core.catch` does the same as `client.tryCatch`.
- `dag.traverse` is in `client-lib`, and `client-dag` has no procedures.
- `init` is a third scaffolder.
- `packages/cli` has `package add`, which this repository forbids, and `repo rename`, which overlaps `lib.rename`.
- `server.start`, `server.stop` and `server.status` are in the peer package, and they belong to the host.
- The sqlite package uses the general namespace `db.*`.
- `packages/client-snapshot/.github/workflows/ci.yml` is old, and GitHub does not start it.
- The `event` frame of the WebSocket client: the server does not send it, and nothing subscribes. R24 made the calls bidirectional. Events in the two directions need a design of topics and subscriptions, or the frame goes away.
- `client.not`, `client.all`, `client.any` and `client.none` (R29): their schemas say "values or calls". A host does not run a call in their operands, and an object counts as true, so `client.all` of a false call gives true. One fix makes them control flow, as `and` and `or`. This changes the expose rule and the compiler. The other fix changes the schemas to "values". The catalog keeps the five examples as `it.fails`.
- `client.import` gives `success: true` for JSON that is not a procedure reference, for example `42`.
- `client.stringifyJson` and `client.export` fail with `OUTPUT_VALIDATION_ERROR` for a missing value.
- Small inconsistencies of the core: `client.mod` gives `NaN` for zero and `client.divide` refuses zero. `client.unique` compares objects by reference. `client.isObject` gives true for a `Date`. The `match` description of `client.filter` lists 7 of its 11 modes.
- Each new package needs one first npm publish from the computer of the owner. CI publishes the later releases. The new packages are `compiler`, `systems`, `bundle-assistant`, the eight packages of R48 and R49, and the new packages of R38 to R46.
- The tools of the assistant are in the opt-in bundle `@procedures/bundle-assistant`, not in `bundle-mcp`. `ics.fetch`, `mail.headers` and `notify.send` are not tools, because they can carry data out or read private mail.
- The code of a handler error (R30): `WIRE-PROTOCOL.md` says that the server keeps it. `errorResponse` and `LocalTransport` change it to `HANDLER_ERROR` for a value, and keep it for a stream. The HTTP status follows the code.
- `ERROR_REGISTRY` of `client/errors` does not agree with `ERROR_CODES` of R25 (`INTERNAL_ERROR` and `TIMEOUT`). One list goes away, or it comes from the other.
- A duplicate stream frame gives a duplicate item, because the frames have no sequence numbers.
- The description of the sqlite `dbPath` field shows the home folder of the computer to Claude.
- R33: `fs.copy` keeps an existing destination and reports success. `git.isClean` gives true outside a repository. `git.init` with `bare` makes the repository again. `splay.bridge.info` gives the version `1.0.0`.
- `mark procedure new` makes a procedure without `metadata.effects`. A default of "pure" can be false, so the author writes them. A host with a capability refuses a procedure without effects.
- The fs root (R33) is not in `mark` or the MCP host.
- Tier 9 found these points:
  - zod drops an own `__proto__` key of the input of `z.record()` and `z.json()` without an error. `@procedures/json` uses its own check for that reason.
  - The `yaml` package 2.9.1 writes a block scalar wrong when its first line has only spaces. `yaml.stringify` quotes such a text. The bug goes to the authors of `yaml`.
  - `http.ndjson` and `http.sse` take only GET, so the event stream of a POST, as an LLM API sends it, is not possible yet.
  - `json.validate` examines a subset of JSON Schema. Its output names each keyword that it does not examine.
  - `node.logs` has no follow stream, because the process registry of `client-shell` keeps its listeners private.
  - `SqliteStorage` writes the whole database file after each write, because sql.js has no partial writes.
  - A shared contract test suite for `CollectionStorage` does not exist. The storages copy the cases of `InMemoryStorage`.
  - The MCP host has 91 tools. Some procedures can carry data out, change data in bulk, or run without an end. They are not tools: `http.*`, `docker.push`, `docker.prune`, `docker.volume.remove`, `mongo.watch`, `mongo.documents.bulk`, `db.transaction`, `db.migrate` and `db.backup`.
  - R46 adds no MCP tools. `llm.*` costs money and sends data out. `env.*` can show secrets. `fs` is not an MCP namespace, and `archive.list` reads files. It is not a tool for that reason. `schedule.next` has little use without `schedule.add`.
  - `llm` has no event stream, no tool use and no automatic retry. An error has a `retryable` flag. `schedule` has no IANA time zones, and `FileScheduleStore` has no lock for more than one process. `archive` has no file root.
  - The root `.gitignore` ignores `secrets.*`. An agent made `packages/env/src/secrets.ts`, and git did not take it. A negation line keeps that file in git. A merge of an agent branch checks the ignored files of the worktree.
  - Stryker 10.0.0 rewrites `tsconfig.json` in its sandbox with the JavaScript API of TypeScript. TypeScript 7 does not have that API, so the mutation job runs Stryker in place.
  - The mutation tests found code that no call reaches. Nobody deletes it without a decision:
    - `rate-limit.ts`: `QueuedRequest.reject` has no caller.
    - `timeout.ts`: the guards of `composeAbortSignals` for an empty list and for one signal that is aborted. The fallback without `AbortSignal.any` runs only in an old browser, because the package needs Node 22.
    - `timeout.ts`: the checks of `timedOut()` on lines 172 and 181. Since R30, an abort always comes first.
    - `circuit-breaker.ts`: the stop of the reset timer at the close, and the check of a waiting reset timer in `scheduleReset`.
  - The fs root decides by the real path. A link from outside the root that leads into the root is accepted, because it reaches only files in the root. The MCP host has no `fs.*` tools, and a root confines the nested calls of `lib.*` and `cue.*` too.
