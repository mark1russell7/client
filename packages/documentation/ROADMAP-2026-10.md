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
| R36 | 8 | A harness cell for a procedures WebSocket pair | M–L | fixed: 12 cells hold on client 0.3.0 | systems PR #16 (`065d6a2`) |
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
| R50 | 9 | Packages from jarvis, wave 3: `git.status` with paths and untracked files, `git.commit` of paths, `gh.workflow.run`, `gh.run.download`, `gh.api`, and an `env` option of the restic function | M | fixed in 0.4.0, not tools | `0ecc788`, `2c02cf0`, `a5f28e5`, `ae08311`, `50fa92d` |
| R51 | 9 | Wave 3: an iCalendar writer in `ics`, and the distance and the geohash in `geo` | S | fixed in 0.4.0, tools of the assistant bundle | `0f1d06e` |
| R52 | 9 | Wave 3: `@procedures/ios-backup` (an iPhone backup and its messages) and `@procedures/privacy-scan` (private data in text) | M | fixed in 0.4.0, not tools | `a01c5f3`, `ae08311` |
| R53 | 9 | Wave 3: `@procedures/pdf` (HTML to PDF with a browser that is installed) and `@procedures/claude-cli` (a turn of the Claude Code CLI) | M | fixed in 0.4.0, not tools | `a90c473` |
| R54 | 9 | Wave 3: jarvis uses the packages of R50 to R53 in place of its own copies | M | fixed: jarvis PRs #28, #29 and #30 | jarvis `4287d78`, `f54a143`, `5ab80a8` |

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

**Later (CLI-85).** The suite is one function, `describeTransportContract()` of the entry point `@procedures/client/testing`. The faces of `client`, `client-mcp` and `client-server` use it, so the copies of the cases are gone. A face that does not have a feature declares a capability flag.

The suite found three faces without the code `PAYLOAD_TOO_LARGE` for a request above the limit: the HTTP handler, the WebSocket client and an MCP session. Each of the three gives the code after this change. An admission contract test reads the procedures of a collection from the registry, and it fails when a read or an event skips `admission.admit`.

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

**Result.** `PortTransport` sends the frames of the WebSocket transport over a worker, a `MessageChannel` or a `worker_threads` port, in the two directions. The site serves `site.run` and `site.journey` from its workers with it. The transport does not import the Durations, because `quantity` brings zod (R37). Alone, the transport is 2.8 kB of gzip: 2,760 bytes on 2026-10-17, after a bundle and a minify with esbuild.

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

**Later (CLI-86).** Each public package has a report of its public API in `test/api/public-api.txt`. The script `scripts/api-report.mjs` writes the reports from the built `.d.ts` files, and CI fails when a report differs. The script is plain JavaScript and uses no test runner. It replaces the Vitest snapshot test of `@procedures/client`.

### R31. Coverage

`@vitest/coverage-v8` at the root, with thresholds that only go up.

**Result.** `scripts/coverage.mjs` runs the tests of each package with coverage and compares them with `coverage-baseline.json`. The floors only go up. The CI job `coverage` uploads the raised floors as an artifact. The first floors come from that artifact, because this computer is shared and does not run the full gate.

### R32. Stage 3

Nightly mutation tests on the resolver, the capabilities, the policy and the middleware. Benchmarks with baselines. A WebSocket soak test. Real Docker and a Mongo service container. A Windows job.

**Result.** `.github/workflows/nightly.yml` has five jobs:

- `mutation`: Stryker on the resolver, the capabilities, the expose rule and the middleware. The report is an artifact. A score below 79 % fails the run. The floor only goes up, as the floors of the coverage do.
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

**Result, part 2 (2026-10-17).** The root confines all the procedures of a host, not only `fs.*`. The three hosts start `confineToRoot()` of `@procedures/fs`. Each procedure declares its path inputs in `metadata.fsRoot`, or the reason that a root cannot confine it. A procedure without rules is refused when its effects are not known, name `fs`, or write `process`. `archive.*`, `sqlite.*`, `cue.*`, `lib.*` and most `docker.*` procedures are confined. `git.*`, `pnpm.*`, `docker.run`, `docker.build` and `docker.compose.*` are refused. `@procedures/archive` uses the rules of `@procedures/fs/root`, so the copy is gone. The rules and the table are in [CAPABILITIES-2026-10.md](./CAPABILITIES-2026-10.md#the-root-of-the-files-roadmap-r33).

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

**Result.** Systems PR #16 (harness 0.8.0, algebra 0.6.0) adds these parts:

- A detection by the program. The driver writes a line before each ping and before each drop, and the kernel stamps the two writes. The reference is the first ping without an answer.
- A measurement of each reconnect wait.
- A client and a target that run `@procedures/client` 0.2.3 on Node 24.21.0.
- The catalog `WS` of 10 cells. All 10 cells hold in three CI runs, and no run is void.

| Cell | Prediction | Medians |
|---|---|---|
| Idle, black hole, heartbeat 2 s and 1 s | a drop in [0.998, 1.003] s | 1.0025 to 1.0028 s |
| A call in flight, black hole | the same | 1.0023 to 1.0026 s |
| Idle, the server frozen | the same | 1.0024 to 1.0027 s |
| Idle, a stall of 1 s | silence, and the pong in [1.604, 1.697] s | 1.650 to 1.660 s |
| Idle, the server stops with a FIN, three refused tries | the reconnect waits 0.5, 1 and 2 s | 500.3, 1000.4 and 2001.5 ms |
| Idle, `tcp_retries2` 3, pong timeout 10 s | the kernel first, in [3, 6.416] s | 6.160 to 6.184 s |

The findings:

- A drop left its socket open. The global `WebSocket` has only `close()`, which waits for the answer of a dead peer. The socket stays until the kernel stops it: 924.6 s with the default settings. The option `webSocket` of the client takes the class of the `ws` package, and a drop then calls `terminate()`.
- The server of 0.2.3 has no heartbeat, so only the kernel finds a dead client, and only with a reply in flight. The heartbeat of the server (R3) is on main, and its cell waits for the next release.
- The heartbeat band holds near its top. The timers of Node use almost all of their modelled lateness.
- A reconnect after an error of the kernel comes 2 to 4.5 ms later than after a drop by the heartbeat. Approximately 1.7 ms of that is the `console.error` in `onerror`.

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
| `run()`: stages of the stop, a limit for each stage, one exit | `ProcedureServer.stop`, the peer, the `server` bin | Adopt later in the Node packages (R14, R18). The core takes only the shape of the contract. The server stack does it: CLI-5, CLI-7 and CLI-8. |
| `start()`: health checks and probes | `/health` of the peer | Adopt later (R19). The server stack does it: CLI-9. |
| `describe` and `lint` | `checkEffects` | They examine different things. `@procedures/systems` uses `lint` with rules for the client (R34). |
| The harness cells | The fault tests of the client | Adopt last (R36). The client owns the test subject image of its cells (CLI-33, D16). |

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
- Not adopted yet: `run()` for the stop of the Node packages, and `start()` for the health checks of the peer. The server stack adopts them. Refer to [SERVER-LAYERS.md](./SERVER-LAYERS.md) and to the section "The server stack (R37)".

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
| R50 | A review of jarvis (2026-10-16) found copies that the packages could not take yet. The jarvis vault commits only some paths, the stage runner starts workflows and downloads their artifacts, and the backup gives the restic passwords only to the child process. The procedure input of restic stays without secrets. |
| R51 | jarvis writes `.ics` files by hand, without the fold at 75 octets. The writer escapes the text, folds the lines and reads back with the parser of the package. `geo.distance` and `geo.geohash` give the same numbers as the jarvis code. |
| R52 | Generic code of jarvis without personal data. `ios-backup` reads `Manifest.db` and `sms.db` with `node:sqlite` (Node 22.13 or later). The MCP host gets neither package: a backup holds private messages. |
| R53 | Generic code of jarvis. `pdf` finds Edge, Chrome or Chromium and prints a page. `claude-cli` starts a turn that outlives its host, reads its output file and normalizes the events. |
| R54 | Part 1 used the packages of 0.3.0: `STATUS.yaml` through `parseYaml`, `git log` and `docker ps` through `runCommand`, map tiles through `http.request`. Part 2 (0.4.0) removed the copies of the vault git code, restic, the `.ics` writer, the distances and the geohash, the private-terms scan, the iPhone reader, the PDF print, the chat runner and the gh calls of the stage runner. |

## Open work after 0.7.0

The live tracker shows these items with the items R1 to R54: https://claude.ai/artifact/49vNStauE2K7pScAuxDGWr. Each item is a row of the database of that page. Change this table and the tracker together.

| ID | Area | Item | Size | Status | Needs | Owner | Where |
|---|---|---|---|---|---|---|---|
| O1 | Apps | MiniMongo on `@procedures/*` 0.7.0 | M | done | — | `client` | [MiniMongo 9aec9c1](https://github.com/mark1russell7/MiniMongo/commit/9aec9c1) |
| O2 | Testing | The flaky peer test `body-stop.test.ts` | S | done | — | `client` | [600c497](https://github.com/mark1russell7/client/commit/600c497) |
| O3 | Docs | The size note of the port transport | S | done | — | `client` | [600c497](https://github.com/mark1russell7/client/commit/600c497) |
| O4 | fs root | One copy of the fs root rules | S | done | R33 | `client` | [90ea741](https://github.com/mark1russell7/client/commit/90ea741), [3f376af](https://github.com/mark1russell7/client/commit/3f376af), [d09aed8](https://github.com/mark1russell7/client/commit/d09aed8) |
| O5 | fs root | `--fs-root` confines git, docker, pnpm, cue, sqlite and archive | M–L | done | O4, R33 | `client` | [90ea741](https://github.com/mark1russell7/client/commit/90ea741), [3f376af](https://github.com/mark1russell7/client/commit/3f376af), [d09aed8](https://github.com/mark1russell7/client/commit/d09aed8) |
| O6 | Events | Subscribers of one topic share one wire subscription | M | done | — | `client` | [698e24d](https://github.com/mark1russell7/client/commit/698e24d), [2f490e8](https://github.com/mark1russell7/client/commit/2f490e8) |
| O7 | Events | `bus.clear()` ends the remote subscriptions with notice | S | done | — | `client` | [698e24d](https://github.com/mark1russell7/client/commit/698e24d), [2f490e8](https://github.com/mark1russell7/client/commit/2f490e8) |
| O8 | Events | HTTP resubscribe stops after `maxAttempts` | S | done | — | `client` | [698e24d](https://github.com/mark1russell7/client/commit/698e24d), [2f490e8](https://github.com/mark1russell7/client/commit/2f490e8) |
| O9 | Storage | `ApiStorage.getIds()` | M | done | — | `client` | [aa6e3aa](https://github.com/mark1russell7/client/commit/aa6e3aa), [b495601](https://github.com/mark1russell7/client/commit/b495601) |
| O10 | Storage | A full pull of `HybridStorage` reads only what can conflict | S–M | done | O9 | `client` | [276b93c](https://github.com/mark1russell7/client/commit/276b93c), [b495601](https://github.com/mark1russell7/client/commit/b495601) |
| O11 | Storage | `replaceStorage` waits for the running calls | S | done | — | `client` | [d25805a](https://github.com/mark1russell7/client/commit/d25805a), [b495601](https://github.com/mark1russell7/client/commit/b495601) |
| O12 | LLM | `llm.stream` runs procedures as tools | M | done | — | `client` | [ed71c8b](https://github.com/mark1russell7/client/commit/ed71c8b), [4084b7b](https://github.com/mark1russell7/client/commit/4084b7b) |
| O13 | Testing | Raise the weakest mutation scores, then the floor | M | done | — | `client` | [7c2e7f7](https://github.com/mark1russell7/client/commit/7c2e7f7), [5c0c699](https://github.com/mark1russell7/client/commit/5c0c699), [nightly run 39077254737](https://github.com/mark1russell7/client/actions/runs/39077254737) |
| O14 | Systems | The WebSocket cells on client 0.7.0 | M | done | R36 | `client` (PR to systems) | [systems PR #44](https://github.com/mark1russell7/systems/pull/44), [systems c78662b](https://github.com/mark1russell7/systems/commit/c78662b), [cells run 39073727730](https://github.com/mark1russell7/systems/actions/runs/39073727730) |
| O15 | Systems | Two new WebSocket cells | M | done | O14 | `client` (PR to systems) | [systems PR #44](https://github.com/mark1russell7/systems/pull/44), [systems c78662b](https://github.com/mark1russell7/systems/commit/c78662b), [cells run 39073727730](https://github.com/mark1russell7/systems/actions/runs/39073727730) |
| O16 | Systems | The machine documents cite client 0.7.0 | S | next | O14, O20 | `systems` | [systems PR #44](https://github.com/mark1russell7/systems/pull/44) |
| O17 | Systems | A machine document for HAProxy | M | later | — | `systems` | [systems tracker](https://claude.ai/artifact/UqC7YuMGSjxdnoGwbfHrbY) |
| O18 | Systems | A delayed-ACK term in the T03 bands | S | done | — | `systems` | [systems PR #31](https://github.com/mark1russell7/systems/pull/31), [systems PR #32](https://github.com/mark1russell7/systems/pull/32) |
| O19 | Systems | The void runs of the silent-drop cell | S–M | later | — | `systems` | [systems tracker](https://claude.ai/artifact/UqC7YuMGSjxdnoGwbfHrbY) |
| O20 | Releases | `@mark1russell7/machines` on npm | S | done | — | `release` | [npm](https://www.npmjs.com/package/@mark1russell7/machines), [npm tracker](https://claude.ai/artifact/AhSVkHj8K4497Zd2o6ccjT) |
| O21 | Systems | jarvis on a newer harness | S | done | — | `systems` | [jarvis package.json](https://github.com/mark1russell7/jarvis/blob/main/packages/instance/package.json) |
| O22 | Decisions | The raw `event` frame of old peers | S | done | O42 | `client` | [dc03903](https://github.com/mark1russell7/client/commit/dc03903), [db6adca](https://github.com/mark1russell7/client/commit/db6adca) |
| O23 | Releases | Release 0.8.0 with the work after 0.7.0 | S | done | O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O26, O27, O28, O29, O30, O31, O33, O34, O37, O38, O39, O40 | `release` and Mark | [client PR #7](https://github.com/mark1russell7/client/pull/7), [82e7946](https://github.com/mark1russell7/client/commit/82e7946), [publish run 39096727534](https://github.com/mark1russell7/client/actions/runs/39096727534) |
| O24 | Architecture | Who owns the server, the lifecycle and auth | L | in progress | R37 | `server-stack` | [the layer contract](https://github.com/mark1russell7/client/blob/main/packages/documentation/SERVER-LAYERS.md), [server tracker](https://claude.ai/artifact/WtkE3dtHp57qpcs4UvcaVZ) |
| O25 | Apps | jarvis on client 0.7.0 and later | M | done | — | `jarvis` | [jarvis PR #34](https://github.com/mark1russell7/jarvis/pull/34) |
| O26 | New packages | `shiftMonth` in `@procedures/ics` | S | done | — | `jarvis-client` | [client PR #4](https://github.com/mark1russell7/client/pull/4), [9dbb41b](https://github.com/mark1russell7/client/commit/9dbb41b) |
| O27 | New packages | A `fetch` option of `fetchCalendar` | S | done | — | `jarvis-client` | [client PR #4](https://github.com/mark1russell7/client/pull/4), [9dbb41b](https://github.com/mark1russell7/client/commit/9dbb41b) |
| O28 | Contracts | `callerOf(module)` in the client root | S | done | — | `client` | [4b09a03](https://github.com/mark1russell7/client/commit/4b09a03), [4989f1e](https://github.com/mark1russell7/client/commit/4989f1e) |
| O29 | Events | `bus.once()` settles when `clear()` removes its handler | S | done | O7 | `client` | [4b09a03](https://github.com/mark1russell7/client/commit/4b09a03), [4989f1e](https://github.com/mark1russell7/client/commit/4989f1e) |
| O30 | Events | `debounceChannel` and `throttleChannel` take a `Duration` | S | done | — | `client` | [4b09a03](https://github.com/mark1russell7/client/commit/4b09a03), [4989f1e](https://github.com/mark1russell7/client/commit/4989f1e) |
| O31 | Storage | `replaceStorage` can close a storage that another collection uses | S | done | O11 | `client` | [c4cfa34](https://github.com/mark1russell7/client/commit/c4cfa34) |
| O32 | Docs | The storage sections of the `client-collections` README | S | done | — | `client` | [c4cfa34](https://github.com/mark1russell7/client/commit/c4cfa34) |
| O33 | Testing | The coverage floor of the functions of `http` is flaky | S | done | — | `client` | [0fc2ecb](https://github.com/mark1russell7/client/commit/0fc2ecb) |
| O34 | LLM | The tool loop and a `fallback` block of an answer | S | done | O12 | `client` | [a9f5420](https://github.com/mark1russell7/client/commit/a9f5420), [ac7af4c](https://github.com/mark1russell7/client/commit/ac7af4c), [API docs: Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback) |
| O35 | fs root | Confine git under a root | M | done | O5 | `client` | [dddeea1](https://github.com/mark1russell7/client/commit/dddeea1), [CI 39108361863](https://github.com/mark1russell7/client/actions/runs/39108361863) |
| O36 | fs root | Root rules for the other procedures that reach files | M | done | O5 | `client` | [dddeea1](https://github.com/mark1russell7/client/commit/dddeea1), [CI 39108361863](https://github.com/mark1russell7/client/actions/runs/39108361863) |
| O37 | New packages | `weatherCodeGroup(code)` in `@procedures/weather` | S | done | — | `jarvis-client` | [client PR #5](https://github.com/mark1russell7/client/pull/5), [78f02c1](https://github.com/mark1russell7/client/commit/78f02c1) |
| O38 | New packages | A node-only entry `@procedures/geo/tiles` | S | done | — | `jarvis-client` | [client PR #5](https://github.com/mark1russell7/client/pull/5), [78f02c1](https://github.com/mark1russell7/client/commit/78f02c1) |
| O39 | Testing | One item for each argument of a last array positional of `mark` | S | done | — | `client` | [808a508](https://github.com/mark1russell7/client/commit/808a508), [the failing run](https://github.com/mark1russell7/client/actions/runs/39078345778) |
| O40 | Testing | The flaky copy of the git test template | S | done | — | `client` | [1893d54](https://github.com/mark1russell7/client/commit/1893d54), [the failing run](https://github.com/mark1russell7/client/actions/runs/39079695949) |
| O41 | New packages | `privacy-scan` treats the TLD `.example` as an example domain | S | done | O23 | `jarvis-client` | [client PR #10](https://github.com/mark1russell7/client/pull/10), [92e1c6e](https://github.com/mark1russell7/client/commit/92e1c6e) |
| O42 | Releases | Release 0.8.1: the PATCH pull requests after 0.8.0 | S | done | O23, O41, O44 | `release` | [805ed50](https://github.com/mark1russell7/client/commit/805ed50), [ab1605e](https://github.com/mark1russell7/client/commit/ab1605e) |
| O43 | Releases | Release 0.9.0: O22, #18, #15 and #19 | S | done | O22, O42 | `server-stack`, `release` and Mark | [db6adca](https://github.com/mark1russell7/client/commit/db6adca), [client PR #24](https://github.com/mark1russell7/client/pull/24), [publish run 39105749789](https://github.com/mark1russell7/client/actions/runs/39105749789) |
| O44 | New packages | A failed calendar request of `ics` names the system error code | S | done | — | `jarvis-client` | [client PR #13](https://github.com/mark1russell7/client/pull/13), [a03be76](https://github.com/mark1russell7/client/commit/a03be76) |
| O45 | Testing | `ios-backup` joins a file id from Manifest.db into a path unchecked | S | done | — | `client` | [6cc9da1](https://github.com/mark1russell7/client/commit/6cc9da1), [16ce161](https://github.com/mark1russell7/client/commit/16ce161) |
| O46 | fs root | `snapshot.create` and `snapshot.diff` run git themselves | M | done | O35 | `client` | [d86363e](https://github.com/mark1russell7/client/commit/d86363e), [CI 39127987697](https://github.com/mark1russell7/client/actions/runs/39127987697) |
| O47 | Compiler | coeval integration (client side) | M | done | — | `client` | [client PR #134](https://github.com/mark1russell7/client/pull/134) |
| O48 | Defects and gates | Coverage-job flakes hold releases (P0) | S | done | — | `client` | [client PR #137](https://github.com/mark1russell7/client/pull/137), [client PR #132 (included in #137)](https://github.com/mark1russell7/client/pull/132), [failed run: 0.22.1 held (Coverage, first try)](https://github.com/mark1russell7/client/actions/runs/39391261839), [failed run: 0.23.0 held (Node 26, first try)](https://github.com/mark1russell7/client/actions/runs/40119052681), [failed run: compiler timeout (Node 22 and 26)](https://github.com/mark1russell7/client/actions/runs/39548144570) |
| O49 | Startup | A fresh-bundle launcher helper (from jarvis) | S | done | — | `client` | [jarvis PR #80 (packages/instance/src/fresh-bundle.mjs)](https://github.com/mark1russell7/jarvis/pull/80) |
| O50 | Startup | Startup: lazy imports of ws and yaml | S | done | — | `client` | [client PR #148](https://github.com/mark1russell7/client/pull/148), [jarvis PR #80 (the finding)](https://github.com/mark1russell7/jarvis/pull/80) |
| O51 | Files | File helpers: atomic write, NDJSON tail heal, keyed lock, serialized edit | M | done | — | `client` | [jarvis PR #85 (local copies, TODO(@procedures))](https://github.com/mark1russell7/jarvis/pull/85), [client PR #161](https://github.com/mark1russell7/client/pull/161) |
| O52 | Files | File helpers: feedback from jarvis (maxLineBytes throw, sync variants, temp name) | S | done | O51 | `client` | [jarvis PR #86 (adoption)](https://github.com/mark1russell7/jarvis/pull/86), [client PR #161 (O51)](https://github.com/mark1russell7/client/pull/161) |
| O53 | Site | Composer: an object key " is lost in the editor format round trip | S | done | — | `client` | — |
| O54 | Security | Security: triage the 22 high alerts of the first code scan | M | done | — | `client` | [security scan run 40169505572](https://github.com/mark1russell7/client/actions/runs/40169505572), [code scanning alerts](https://github.com/mark1russell7/client/security/code-scanning) |
| O55 | Security | Audit pass 2: the security findings (mail, tailscale, notify, weather, expose, MCP tasks, restic, ics) | M | done | — | `client` | [#181 PATCH](https://github.com/mark1russell7/client/pull/181), [#182](https://github.com/mark1russell7/client/pull/182), [#183](https://github.com/mark1russell7/client/pull/183), [#184](https://github.com/mark1russell7/client/pull/184), [#185](https://github.com/mark1russell7/client/pull/185), [#195 shim (merged)](https://github.com/mark1russell7/client/pull/195), [#198 host fetch policy (0.29.0)](https://github.com/mark1russell7/client/pull/198) |
| O56 | Correctness | Audit pass 2: the medium correctness findings | M | done | — | `client` | — |
| O57 | Correctness | Audit pass 2: the low findings | M | done | — | `client` | — |
| O58 | Duplication | Procedure boilerplate: zodAdapter codemod, generator fix, typed<T>(), definePackage | S | done | — | `client` | [#205](https://github.com/mark1russell7/client/pull/205) |
| O59 | Duplication | Use writeFileAtomic in the 7 hand-written temp-then-rename copies | S | done | — | `client` | [#206](https://github.com/mark1russell7/client/pull/206) |
| O60 | Duplication | defineCliTool and fakeShell in @procedures/shell | M | done | — | `client` | [#212](https://github.com/mark1russell7/client/pull/212) |
| O61 | Duplication | A schema-driven CLI library from mark (createProcedureCli) | L | done | — | `client` | [#216](https://github.com/mark1russell7/client/pull/216) |
| O62 | CI | Move CI and release onto the template's reusable workflows | M | done | — | `client` (ci.yml), the strategist (release.yml) | [template reusable workflows (~/git/template/.github/workflows)](https://github.com/mark1russell7/template/tree/main/.github/workflows), [#215](https://github.com/mark1russell7/client/pull/215), [client #231](https://github.com/mark1russell7/client/pull/231) |
| O63 | Tests | Flake: a view change right after start() was lost (streams open before reads) | S | done | — | `client` | [main CI run 40308869395](https://github.com/mark1russell7/client/actions/runs/40308869395), [client #233](https://github.com/mark1russell7/client/pull/233) |
| O64 | Duplication | O60/O61 follow-ups: pnpm.store.path on shell.run, tailscale on shell.run, drop @clack/prompts from mark | S | done | — | `client` | [#212 (O60)](https://github.com/mark1russell7/client/pull/212), [#216 (O61)](https://github.com/mark1russell7/client/pull/216), [#219](https://github.com/mark1russell7/client/pull/219) |
| O65 | Duplication | O58/O59 follow-ups: definePackage for the module/register pairs, json and ics schemas, mongo described() | M | done | — | `client` | [#205 (O58)](https://github.com/mark1russell7/client/pull/205), [#206 (O59)](https://github.com/mark1russell7/client/pull/206), [#222 (O65)](https://github.com/mark1russell7/client/pull/222) |
| O66 | Storage | Gap hints reach each partition: a floor document at the first write | S | done | — | `client` | [client #221](https://github.com/mark1russell7/client/pull/221), [client #226](https://github.com/mark1russell7/client/pull/226) |
| O67 | Storage | A queued write that the remote refuses leaves the queue | S | done | — | `client` | [client #245](https://github.com/mark1russell7/client/pull/245) |
| O68 | Storage | TIMEOUT counts as unavailable by default in HybridStorage | XS | done | O67 | `client` | [client #245](https://github.com/mark1russell7/client/pull/245), [client #254](https://github.com/mark1russell7/client/pull/254) |
| O69 | Storage | Drop a queued write on the echo of its own send | S | later | O68 | `client` | [client #254](https://github.com/mark1russell7/client/pull/254) |
| O70 | Guardrails | Invariants audit (s38): fix 5 medium breaks, add the missing checks | M | next | O68 | `client` | — |
| O71 | Guardrails | Replace the hand-made boundary rules with @mark1russell7/boundaries | S | next | O68 | `client` | — |

### The server stack (R37)

The server stack does the rest of R37. Each Node host starts under `run()` and `start()` of `service`, and the apps get one procedures server. [SERVER-LAYERS.md](./SERVER-LAYERS.md) is the contract: the layers, their owners, the rules and the decisions D1 to D18.

- The cross-repo tracker https://claude.ai/artifact/WtkE3dtHp57qpcs4UvcaVZ shows these items with the items of `systems`, jarvis and Graph. The IDs are the same.
- The `server-stack` session makes the table below from the data of that tracker, with a script. Do not edit the table manually: tell the `server-stack` session about a change.
- In the client tracker, O24 links to the cross-repo tracker.
- An ID in the column "Needs" that starts with `SYS-`, `REL-1` or `D` is in the cross-repo tracker. There is no CLI-29.

<!-- server-stack-table:begin (generated from the server-stack tracker; do not edit by hand) -->

| ID | Area | Item | Size | Status | Needs | Owner | Where |
|---|---|---|---|---|---|---|---|
| CI-2 | CI | client CI: host lifecycle e2e and entry purity checks | M | done | — | client | [client #58](https://github.com/mark1russell7/client/pull/58), [client ce4beb0a](https://github.com/mark1russell7/client/commit/ce4beb0a) |
| CLI-1 | Auth | ProcedureServer refuses a missing credential when a token is configured | M | done | D13 | client | [client #65](https://github.com/mark1russell7/client/pull/65), [client 4a801bcc](https://github.com/mark1russell7/client/commit/4a801bcc), [npm 0.19.0](https://www.npmjs.com/package/@procedures/client/v/0.19.0), in 0.19.0 |
| CLI-2a | Auth | A request hook: credentials, principal and narrowing from any part of the request | M | done | — | server-stack | [client #8](https://github.com/mark1russell7/client/pull/8), [client ee909d54](https://github.com/mark1russell7/client/commit/ee909d54), in 0.8.1 |
| CLI-2b | Auth | Remove the peer's second token, host and origin checks | M | done | CLI-1, CLI-2a, D13 | client | [client 0.25.0](https://www.npmjs.com/package/@procedures/client/v/0.25.0), [client 1f162dac](https://github.com/mark1russell7/client/commit/1f162dac999e5175a39e23b440614b296c3315ff), [client 0.27.0](https://www.npmjs.com/package/@procedures/client/v/0.27.0), in 0.27.0 |
| CLI-3 | HTTP host | Framework-free procedureHandler() and upgradeHandler() in @procedures/client/node | M | done | REL-0 | server-stack | [client #8](https://github.com/mark1russell7/client/pull/8), [client ee909d54](https://github.com/mark1russell7/client/commit/ee909d54), in 0.8.1 |
| CLI-4 | HTTP host | Fold stray error codes into wire v1 | S | done | CLI-3 | client | [client #64](https://github.com/mark1russell7/client/pull/64), [client a49678de](https://github.com/mark1russell7/client/commit/a49678de), [npm 0.18.0](https://www.npmjs.com/package/@procedures/client/v/0.18.0), in 0.18.0 |
| CLI-5 | Runner | Split ProcedureServer.stop into service-shaped parts | M | done | SYS-4 | client | [client #20](https://github.com/mark1russell7/client/pull/20), [client e031b6b3](https://github.com/mark1russell7/client/commit/e031b6b3), [npm 0.10.0](https://www.npmjs.com/package/@procedures/client/v/0.10.0), in 0.10.0 |
| CLI-6 | HTTP host | The root of @procedures/client becomes node-free, and the server faces move to ./node | S | done | CLI-3 | client | [client #57 (step 1)](https://github.com/mark1russell7/client/pull/57), [client 3194363d (step 2)](https://github.com/mark1russell7/client/commit/3194363d), [npm 0.20.0](https://www.npmjs.com/package/@procedures/client/v/0.20.0), in 0.20.0 |
| CLI-7 | HTTP host | createProcedureHost(): one host factory that returns service parts | L | done | CLI-2a, CLI-3, CLI-5, SYS-1, SYS-5, SYS-6, SYS-8, SYS-15, REL-1, D2, D3 | client | [client #25](https://github.com/mark1russell7/client/pull/25), [client 0a5505c0](https://github.com/mark1russell7/client/commit/0a5505c0), [npm 0.11.0](https://www.npmjs.com/package/@procedures/client/v/0.11.0), in 0.11.0 |
| CLI-8 | Runner | runProcedureHost(): one runner entry on service run() for procedure-server, mark serve and mark --server | M | done | CLI-7, SYS-9, SYS-10, CI-2, D6, D7, D17 | client | [client #28](https://github.com/mark1russell7/client/pull/28), [client 8787674e](https://github.com/mark1russell7/client/commit/8787674e), [npm 0.12.0](https://www.npmjs.com/package/@procedures/client/v/0.12.0), in 0.12.0 |
| CLI-9 | Health | The probes come from service start(), and the lockfile check uses host.info | S | done | CLI-8, SYS-2, D5 | client | [client 06906d8f](https://github.com/mark1russell7/client/commit/06906d8f), [client #106 (step 2)](https://github.com/mark1russell7/client/pull/106), [client ac620390 (step 2)](https://github.com/mark1russell7/client/commit/ac620390), in 0.21.0 |
| CLI-10 | MCP | Export createMcpHost(), and impl-mcp-dev and mcp.serve use it | S | done | REL-0 | client | [client #9](https://github.com/mark1russell7/client/pull/9), [client 07a942de](https://github.com/mark1russell7/client/commit/07a942de), in 0.8.1 |
| CLI-11 | MCP | MCP hosts under service run(): stdio with the stdin trigger, Streamable HTTP mounted at /mcp | M | done | CLI-7, CLI-10, SYS-7 | client | [client cf1997a8 (step 1)](https://github.com/mark1russell7/client/commit/cf1997a8), [client f354b7dc (step 2)](https://github.com/mark1russell7/client/commit/f354b7dc), [npm 0.17.0](https://www.npmjs.com/package/@procedures/client/v/0.17.0), in 0.17.0 |
| CLI-12 | MCP | MCP elicitation in McpServerTransport | M | done | — | client | [client #9](https://github.com/mark1russell7/client/pull/9), [client 07a942de](https://github.com/mark1russell7/client/commit/07a942de), in 0.8.1 |
| CLI-13 | Sync | HybridStorage and ApiStorage on the service clock and backoff | S | done | — | client | [client #11](https://github.com/mark1russell7/client/pull/11), [client fafcf836](https://github.com/mark1russell7/client/commit/fafcf836), in 0.8.1 |
| CLI-14 | Sync | collections.<name>.find with a JSON selector, and patch(id, fields) | M | done | D9 | client | [client #11](https://github.com/mark1russell7/client/pull/11), [client fafcf836](https://github.com/mark1russell7/client/commit/fafcf836), in 0.8.1 |
| CLI-15 | Sync | Collection change events and a push change feed | M | done | CLI-14, D9 | client | [client #12](https://github.com/mark1russell7/client/pull/12), [client 805ed50d](https://github.com/mark1russell7/client/commit/805ed50d), in 0.8.1 |
| CLI-16 | Sync | Optional expectedVersion on collections set, setBatch and delete | S | done | D11 | client | [client #68](https://github.com/mark1russell7/client/pull/68), [client 8f8b9506](https://github.com/mark1russell7/client/commit/8f8b9506), [npm 0.15.0](https://www.npmjs.com/package/@procedures/client/v/0.15.0), in 0.15.0 |
| CLI-17 | Sync | Collection partition resolver (tenant and scope from the principal) | M | done | CLI-2a, D9 | graph | [client f56ac490](https://github.com/mark1russell7/client/commit/f56ac490), [client #23](https://github.com/mark1russell7/client/pull/23), [client de1389d3](https://github.com/mark1russell7/client/commit/de1389d3), in 0.9.0 |
| CLI-18 | Sync | HttpTransport fetch credentials option | S | done | — | server-stack | [client #8](https://github.com/mark1russell7/client/pull/8), [client ee909d54](https://github.com/mark1russell7/client/commit/ee909d54), in 0.8.1 |
| CLI-19 | Sync | Browser-safe entry of @procedures/store | S | done | — | client | [client #54](https://github.com/mark1russell7/client/pull/54), in 0.14.1 |
| CLI-20 | Sync | CollectionStorage: optional observe() and query(), with contract tests | M | done | D9, REL-0 | client | [client #11](https://github.com/mark1russell7/client/pull/11), [client fafcf836](https://github.com/mark1russell7/client/commit/fafcf836), in 0.8.1 |
| CLI-21 | Sync | HybridStorage: capture app writes, observe, persisted sync state, push feed | L | done | CLI-20, D9, REL-0 | server-stack | [client #12](https://github.com/mark1russell7/client/pull/12), [client 805ed50d](https://github.com/mark1russell7/client/commit/805ed50d), in 0.8.1 |
| CLI-22 | Sync | IndexedDbStorage: a plain browser document storage | M | done | CLI-20 | client | [client #105](https://github.com/mark1russell7/client/pull/105), [client 5743c3bd](https://github.com/mark1russell7/client/commit/5743c3bd), in 0.17.3 |
| CLI-23 | Sync | @procedures/signaldb: SignalDbStorage, a local-copy strategy over a SignalDB Collection | M | done | CLI-20, CLI-21 | client | [client #112](https://github.com/mark1russell7/client/pull/112), [client c7a7487c](https://github.com/mark1russell7/client/commit/c7a7487c), in 0.24.1 |
| CLI-24 | Sync | MongoStorage: change log, server-assigned versions, query push-down, partitions | L | done | CLI-20, CLI-16, CLI-17 | graph | [client cecfbe0a](https://github.com/mark1russell7/client/commit/cecfbe0a), [client #31](https://github.com/mark1russell7/client/pull/31), [client ccf4c8f8](https://github.com/mark1russell7/client/commit/ccf4c8f8), in 0.9.1 |
| CLI-25 | Sync | TabCoordinator: one leader tab runs sync, the others replicate | M | done | CLI-21 | client | [client #108](https://github.com/mark1russell7/client/pull/108), [client 1c7d0c44](https://github.com/mark1russell7/client/commit/1c7d0c44), in 0.17.4 |
| CLI-26 | Runner | Cold mode of the mark CLI runs the same host in-process under run() | M | done | CLI-8, SYS-16, SYS-7, D24 | client | [client #125](https://github.com/mark1russell7/client/pull/125), [client #126 (deprecation PATCH)](https://github.com/mark1russell7/client/pull/126), [client 9cde8a29 (deprecations)](https://github.com/mark1russell7/client/commit/9cde8a29), in 0.24.0 |
| CLI-27 | Runner | Optional auto-warm: start the background host after a cold command | M | later | CLI-26 | — | — |
| CLI-28 | HTTP host | Procedure paths of any length on every face | M | done | — | server-stack | [client #30](https://github.com/mark1russell7/client/pull/30), [client 50c8ab8d](https://github.com/mark1russell7/client/commit/50c8ab8d), in 0.9.1 |
| CLI-30 | Auth | A narrowing key on the wire: a call asks for less capability | S | done | CLI-2a | server-stack | [client #21](https://github.com/mark1russell7/client/pull/21), [client 381456b4](https://github.com/mark1russell7/client/commit/381456b4), in 0.9.1 |
| CLI-31 | HTTP host | An addressing hook: (request, body) to method and payload | S | done | CLI-3 | server-stack | [client #21](https://github.com/mark1russell7/client/pull/21), in 0.9.1 |
| CLI-32 | Streams | Batch calls as one stream of tagged results | M | later | — | — | — |
| CLI-33 | CI | The client owns its procedures test subject for the harness | M | done | SYS-17 | client | [harness run 39384124471](https://github.com/mark1russell7/client/actions/runs/39384124471), [client #122](https://github.com/mark1russell7/client/pull/122), [client 2408cea4](https://github.com/mark1russell7/client/commit/2408cea4) |
| CLI-34 | Sync | One selector evaluator for the core and collections | S | done | CLI-20 | client | [client #11](https://github.com/mark1russell7/client/pull/11), [client fafcf836](https://github.com/mark1russell7/client/commit/fafcf836), in 0.8.1 |
| CLI-35 | MCP | The shared MCP host: MCP tasks, and a guarded Streamable HTTP face | M | done | CLI-10 | server-stack | [client #59](https://github.com/mark1russell7/client/pull/59), [client 814325ad](https://github.com/mark1russell7/client/commit/814325ad), in 0.14.1 |
| CLI-36 | Releases | The client accepts service 0.5, so an app keeps one copy | S | done | REL-4 | server-stack | [client #18](https://github.com/mark1russell7/client/pull/18), [client b9c4352b](https://github.com/mark1russell7/client/commit/b9c4352b), [npm 0.9.0](https://www.npmjs.com/package/@procedures/client/v/0.9.0), in 0.9.0 |
| CLI-37 | Sync | The view materializer filters deletes by partition | S | done | GRAPH-15 | graph | [client #29](https://github.com/mark1russell7/client/pull/29), [client f55ac4a2](https://github.com/mark1russell7/client/commit/f55ac4a2), in 0.9.2 |
| CLI-38 | Sync | Collection procedures over a view read only its current generation | S | done | GRAPH-15 | server-stack | [client #78](https://github.com/mark1russell7/client/pull/78), [client e736441b](https://github.com/mark1russell7/client/commit/e736441b), in 0.15.1 |
| CLI-39 | Packaging | A package for the browser does not pull a Node built-in | S | done | — | server-stack | [client #67](https://github.com/mark1russell7/client/pull/67), [client abe876a6](https://github.com/mark1russell7/client/commit/abe876a6), in 0.14.1 |
| CLI-40 | Auth | The procedures server limits calls per principal, tenant or route | M | done | SYS-28 | server-stack | [client #81](https://github.com/mark1russell7/client/pull/81), [client 7a9768a2](https://github.com/mark1russell7/client/commit/7a9768a2), in 0.15.1 |
| CLI-41 | Auth | Collection procedures admit each row and guard each write | M | done | GRAPH-13 | server-stack | [client #71](https://github.com/mark1russell7/client/pull/71), [client 99a3d9a1](https://github.com/mark1russell7/client/commit/99a3d9a1), in 0.14.1 |
| CLI-42 | Sync | Partition topics encode the partition, so any name is unambiguous | S | done | CLI-17, D22 | server-stack | [client 170e3a6c](https://github.com/mark1russell7/client/commit/170e3a6c), [version PR #88](https://github.com/mark1russell7/client/pull/88), [npm 0.16.0](https://www.npmjs.com/package/@procedures/client/v/0.16.0), in 0.16.0 |
| CLI-43 | MCP | mcpFace takes a narrowing for every call | S | done | CLI-7, CLI-30 | server-stack | [client #61](https://github.com/mark1russell7/client/pull/61), [client aaeede13](https://github.com/mark1russell7/client/commit/aaeede13), in 0.14.1 |
| CLI-44 | Auth | A subscription re-checks its admission when rights change | M | done | CLI-21 | server-stack | [client #74](https://github.com/mark1russell7/client/pull/74), [client 7cb6a2e2](https://github.com/mark1russell7/client/commit/7cb6a2e2), in 0.15.1 |
| CLI-45 | Runner | createProcedureHost takes the requirements of its controller | S | done | CLI-7 | jarvis-client | [client #40](https://github.com/mark1russell7/client/pull/40), [client a5b9d807](https://github.com/mark1russell7/client/commit/a5b9d807), in 0.12.1 |
| CLI-46 | Sync | Collection procedures with an input schema accept a partition | S | done | CLI-17 | graph | [client #41](https://github.com/mark1russell7/client/pull/41), [client 58a5434e](https://github.com/mark1russell7/client/commit/58a5434e), in 0.12.1 |
| CLI-47 | Auth | The expose rule covers every served procedure, and host.* and events.subscribe are always on | S | done | CLI-7 | server-stack | [client #46](https://github.com/mark1russell7/client/pull/46), [client 77273a1e](https://github.com/mark1russell7/client/commit/77273a1e), [npm 0.13.0](https://www.npmjs.com/package/@procedures/client/v/0.13.0), in 0.13.0 |
| CLI-48 | Runner | A stream cut by the shutdown ends with UNAVAILABLE, not INTERNAL_ERROR | S | done | CLI-7, D21 | server-stack | [client #69](https://github.com/mark1russell7/client/pull/69), [client cbe343f5](https://github.com/mark1russell7/client/commit/cbe343f5), [npm 0.14.0](https://www.npmjs.com/package/@procedures/client/v/0.14.0), in 0.14.0 |
| CLI-49 | Auth | The better-auth handler serves credentialed CORS from the host's trusted origins | S | done | GRAPH-16 | server-stack | [client #70](https://github.com/mark1russell7/client/pull/70), [client ddb1c1b1](https://github.com/mark1russell7/client/commit/ddb1c1b1), in 0.14.1 |
| CLI-50 | Runner | The tree-kill of @procedures/shell waits for the drain | S | done | CI-2 | client | [client #63](https://github.com/mark1russell7/client/pull/63), in 0.14.1 |
| CLI-51 | MCP | The MCP HTTP face bounds its sessions by default | S | done | CLI-35 | server-stack | [client #113](https://github.com/mark1russell7/client/pull/113), [client 53d4cec3](https://github.com/mark1russell7/client/commit/53d4cec3), in 0.22.0 |
| CLI-52 | Packaging | splay.bridge.info reads its version without a Node built-in | S | done | CLI-39 | server-stack | [client #96](https://github.com/mark1russell7/client/pull/96), [client 8865da8d](https://github.com/mark1russell7/client/commit/8865da8d), in 0.17.1 |
| CLI-53 | Sync | The Mongo storage test uses the injected clock, not real sleeps | S | done | — | graph | [client #72](https://github.com/mark1russell7/client/pull/72), [client 3da273e0](https://github.com/mark1russell7/client/commit/3da273e0) |
| CLI-54 | Auth | The auth routes go through the host's request tracking and drain | S | done | CLI-49 | server-stack | [client #75](https://github.com/mark1russell7/client/pull/75), [client b96c29ff](https://github.com/mark1russell7/client/commit/b96c29ff), in 0.14.1 |
| CLI-55 | Auth | The write guard of a collection passes the version it read | S | done | CLI-41, CLI-16 | client | [client #95](https://github.com/mark1russell7/client/pull/95), in 0.17.1 |
| CLI-56 | HTTP host | procedureHandler sends no CORS header to an untrusted origin | S | done | CLI-49 | server-stack | [client #73](https://github.com/mark1russell7/client/pull/73), [client 8bf0de2a](https://github.com/mark1russell7/client/commit/8bf0de2a), in 0.14.1 |
| CLI-57 | Sync | A plain collection and a partition of another do not share a topic | S | done | CLI-42, D23 | server-stack | [client #116](https://github.com/mark1russell7/client/pull/116), [client b6be377e](https://github.com/mark1russell7/client/commit/b6be377e), in 0.18.1 |
| CLI-58 | Streams | The in-band ends keep retryable false unless the handler says otherwise, and the rule is written | S | done | CLI-48 | server-stack | [client #111](https://github.com/mark1russell7/client/pull/111), [client 2613f4ea](https://github.com/mark1russell7/client/commit/2613f4ea), in 0.18.1 |
| CLI-59 | HTTP host | The Express shim sends no CORS header to an untrusted origin | S | done | CLI-56 | client | [client #102](https://github.com/mark1russell7/client/pull/102), [client fd52c577](https://github.com/mark1russell7/client/commit/fd52c577), in 0.17.2 |
| CLI-60 | Auth | The core bearerOf reads the auth scheme in any case | S | done | — | server-stack | [client #83](https://github.com/mark1russell7/client/pull/83), [client 15f9cf1d](https://github.com/mark1russell7/client/commit/15f9cf1d), in 0.15.1 |
| CLI-61 | Packaging | A consumer with strict library checks needs no express or ws types | S | done | CLI-6 | client | [client #84 (ws types)](https://github.com/mark1russell7/client/pull/84), [client f1c267cb](https://github.com/mark1russell7/client/commit/f1c267cb), in 0.20.0 |
| CLI-62 | Runner | runProcedureHost declares the extra parts and dependencies of an app | S | done | CLI-8 | server-stack | [client #93](https://github.com/mark1russell7/client/pull/93), [client 93036df6](https://github.com/mark1russell7/client/commit/93036df6), in 0.17.1 |
| CLI-63 | Packaging | Each package declares every package that its built code imports | S | done | — | server-stack | [client c6b730d9](https://github.com/mark1russell7/client/commit/c6b730d9), [jarvis 734ce74 (workaround)](https://github.com/mark1russell7/jarvis/commit/734ce74), [jarvis 98829b9](https://github.com/mark1russell7/jarvis/commit/98829b9), in 0.17.2 |
| CLI-64 | Sync | One tab coordinator serves several collections | S | done | CLI-25 | client | [client #131](https://github.com/mark1russell7/client/pull/131), in 0.24.1 |
| CLI-65 | Sync | The leader tab broadcasts its sync status | S | done | CLI-25 | client | [client #115](https://github.com/mark1russell7/client/pull/115), [client d9e86e63](https://github.com/mark1russell7/client/commit/d9e86e63), in 0.18.1 |
| CLI-66 | Sync | A new tab gets a snapshot in tab mode | S | done | CLI-25 | client | [client #131](https://github.com/mark1russell7/client/pull/131), in 0.24.1 |
| CLI-67 | Sync | A tab whose leader setup failed asks for the lock again | S | done | CLI-25 | client | [client #115](https://github.com/mark1russell7/client/pull/115), [client d9e86e63](https://github.com/mark1russell7/client/commit/d9e86e63), in 0.18.1 |
| CLI-68 | Streams | An in-band end before the first item takes the code's default flag | S | done | CLI-58, D25 | client | [client #128 (deprecation PATCH)](https://github.com/mark1russell7/client/pull/128), [client #130 (MINOR)](https://github.com/mark1russell7/client/pull/130), [client 0.25.0](https://www.npmjs.com/package/@procedures/client/v/0.25.0), in 0.25.0 |
| CLI-69 | MCP | The MCP task store gives each session a fair share | S | done | CLI-51 | server-stack | [client #124](https://github.com/mark1russell7/client/pull/124), [client 7566e4e5](https://github.com/mark1russell7/client/commit/7566e4e5), in 0.23.0 |
| CLI-70 | Sync | A partitioned-only collection whose resolver gives no partition cannot hear another collection's tenant | S | done | CLI-57 | server-stack | [client #123](https://github.com/mark1russell7/client/pull/123), [client e3db83d1](https://github.com/mark1russell7/client/commit/e3db83d1), in 0.22.1 |
| CLI-71 | Auth | The request hook sees the connection of a network request | S | done | CLI-2b | server-stack | [client #163](https://github.com/mark1russell7/client/pull/163) |
| CLI-75 | Wire | A path segment with a dot or a `%` comes back the same over the wire, and the plain topic of a dotted collection encodes its name | M | done | CLI-42, D36 | server-stack | [client #211](https://github.com/mark1russell7/client/pull/211) |
| DOC-1 | Docs | Replace HOST-OWNERSHIP-BRIEF with a server layer contract | M | done | D14, REL-0 | server-stack | [client #6](https://github.com/mark1russell7/client/pull/6), [client 94407186](https://github.com/mark1russell7/client/commit/94407186) |
| DOC-2 | Docs | Fix stale client storage docs and record R37 follow-ups in the client roadmap | S | done | — | server-stack | [client #6](https://github.com/mark1russell7/client/pull/6), [client 94407186](https://github.com/mark1russell7/client/commit/94407186) |
| DOC-3 | Docs | Link the cross-repo server tracker from each repo's CLAUDE.md and roadmap | S | done | DOC-1 | server-stack | [client #85](https://github.com/mark1russell7/client/pull/85), [Graph 49ab4590](https://github.com/mark1russell7/Graph/commit/49ab4590), [Graph b0f2f27f](https://github.com/mark1russell7/Graph/commit/b0f2f27f) |
| DOC-4 | Docs | Migration notes in each MINOR, and deprecation notices one release ahead | S | done | D13 | server-stack | [client #6](https://github.com/mark1russell7/client/pull/6), [client 94407186](https://github.com/mark1russell7/client/commit/94407186) |
| DOC-6 | Docs | WIRE-PROTOCOL.md: the framework-free handler and the FORBIDDEN reasons | S | done | CLI-3 | client | [client #21](https://github.com/mark1russell7/client/pull/21), in 0.9.1 |
| GRAPH-13 | Auth | Split P1: Graph's rights engine becomes @procedures/access | M | done | CLI-2a, CLI-15 | graph | [client #17](https://github.com/mark1russell7/client/pull/17), [client 6ab6ebff](https://github.com/mark1russell7/client/commit/6ab6ebff), in 0.12.1 |
| GRAPH-14 | Sync | Split P2: the overlay merge moves to @procedures/collections | M | done | CLI-20, CLI-14 | graph | [client 6207e516](https://github.com/mark1russell7/client/commit/6207e516), [Graph c39516a9](https://github.com/mark1russell7/Graph/commit/c39516a9), [Graph 54a90721](https://github.com/mark1russell7/Graph/commit/54a90721), in 0.13.2 |
| GRAPH-15 | Sync | Split P3 and P4: the Mongo guards and the materialized views move to @procedures/mongo | L | done | CLI-20, CLI-14, CLI-15 | graph | [client 3dca4f4a](https://github.com/mark1russell7/client/commit/3dca4f4a), [client 066f445b](https://github.com/mark1russell7/client/commit/066f445b), [npm 0.9.2](https://www.npmjs.com/package/@procedures/client/v/0.9.2), in 0.9.2 |
| GRAPH-16 | Auth | Split P5: Better Auth sessions become a principal source in the client | M | done | CLI-2a | graph | [client 9423a973](https://github.com/mark1russell7/client/commit/9423a973), [Graph b60b436d](https://github.com/mark1russell7/Graph/commit/b60b436d), [Graph 4b945f29](https://github.com/mark1russell7/Graph/commit/4b945f29), in 0.13.1 |
| REL-0 | Releases | Client 0.8.0 publish: tell the release session "go" | S | done | — | Mark | — |
| REL-2 | Releases | Release the additive server-stack client pieces as a PATCH | S | done | CLI-2a, CLI-3, CLI-10, D13 | client | [npm 0.8.1](https://www.npmjs.com/package/@procedures/client/v/0.8.1), in 0.8.1 |
| REL-5 | Releases | Client 0.9.1: the partition follow-ups, Mongo storage, the pipeline guard and the narrowing key | S | done | CLI-24, GRAPH-15, CLI-30, CLI-31 | server-stack | [npm 0.9.1](https://www.npmjs.com/package/@procedures/client/v/0.9.1), in 0.9.1 |
| REL-6 | Releases | Client 0.12.1: the first publish of better-auth and access | S | done | GRAPH-16, GRAPH-13 | release | [npm 0.12.1](https://www.npmjs.com/package/@procedures/client/v/0.12.1), in 0.12.1 |
| REL-7 | Releases | The apps move to client ^0.14.0 | S | done | CLI-48 | graph | [Graph 2c4e0d2d](https://github.com/mark1russell7/Graph/commit/2c4e0d2d), [Graph 0cb97047](https://github.com/mark1russell7/Graph/commit/0cb97047), [jarvis bffebce](https://github.com/mark1russell7/jarvis/commit/bffebce) |

- These items break the API: CLI-1, CLI-2b, CLI-4, CLI-5, CLI-6, CLI-7, CLI-8, CLI-9, CLI-11, CLI-16, CLI-26, CLI-42, CLI-47, CLI-48, CLI-51, CLI-68, CLI-69. Each one is its own MINOR of the client group (D13).
- CLI-28 breaks the API only if the version leaves the URL.
- The other items are additive. Each one ships as a PATCH of the client group.

<!-- server-stack-table:end -->
- Refer to the section "Releases of the server stack" of [SERVER-LAYERS.md](./SERVER-LAYERS.md) for the deprecation and the migration notes.

## Items for a decision

The review found code that is a candidate for removal or a move. These items need a decision of the owner. Nobody deletes them without one.

### Decided on 2026-10-16

The owner decided these items. The changes are on `main`, and they go out in 0.4.0.

- Removed: the `client-registry` command with `discover`, `announce` and the scaffolder `init`. `_discovery.announce` stays, because a server connection calls it.
- Removed: `core.catch`, the repository tool `packages/cli` with its commands `package add` and `repo rename`, and the old workflow file of `client-snapshot`.
- Removed: the lines that the mutation tests found unreachable, `QueuedRequest.reject` and two checks of `timedOut()`. The defensive guards stay.
- Moved: `dag.traverse` to `@procedures/dag`, and `server.start`, `server.stop` and `server.status` to `@procedures/server`.
- Renamed: `db.*` is `sqlite.*`. The `db.*` names stay for one release as deprecated aliases. The MCP tools have the new names.
- Fixed: `client.import`, `client.stringifyJson`, `client.export`, `client.mod`, `client.unique`, `client.isObject` and the `match` text of `client.filter`.
- Fixed: the schemas of `client.not`, `client.all`, `client.any` and `client.none` say "values".
- Fixed: one list of error codes, the code of a handler error, the `dbPath` text, `fs.copy` and the version of `splay.bridge.info`. `fs.copy` refuses an existing destination without `overwrite`.
- Fixed: `git.isClean` fails outside a repository, and `git.init` finds an existing bare repository.
- Changed: `TIMEOUT` follows the list of the wire protocol. Its HTTP status is 504, and the retry middleware does not retry it.
- Built: `@procedures/client/node` with the `ws` class, the contract suite of `CollectionStorage`, POST streams of `http.ndjson` and `http.sse`, and the follow stream of `node.logs`.
- Fixed: `procedure new` puts a procedure into the list that `defineModule` gets. When it cannot find the list, it fails before it writes.
- The `event` frame of the WebSocket client: the owner decided to complete it. The design is `EVENTS.md`, and the work is in progress.
- Reported upstream by others: the `yaml` bug is issue #692 of `yaml`. The bug of the vitest runner of Stryker is issue #6210 of `stryker-js`. The `yaml` project accepts no issue text from an LLM.
- Published: each new package is on npm. The git tags and the GitHub releases of 0.3.0 come from `scripts/release-tags.mjs`.

### Decided on 2026-10-17

The owner decided these items. The changes are on `main`, and they go out in 0.5.0.

- Deleted: the repository tool `packages/cli`, which had no commands after the removals.
- Fixed: the four differences between the storages. A stored `null` reads back as `null`, and each read gives a copy. A delta follows the last change of each id, and each operation rejects after `close()`.
  - `InMemoryStorage` has the option `copies: false` for a hot path, because a copy costs approximately 4 µs for each item.
  - `collections.<name>.get` takes `found: true` and then gives `{ found, value }`.
- Fixed: `dag.traverse` gives an entry with `skipped: true` for each package that did not run after a failure.
- Built: `lib audit` reports each procedure without `metadata.effects`. It found none.
- Built: the remote events (`EVENTS.md`). A subscription is the streaming call `events.subscribe`, with credit, cancel, resubscribe and a rule for the topics.
- Built: `procedure-server`, `mark serve` and `mark --server` take `--events <patterns>`. Without it, a subscription gives `TOPIC_NOT_FOUND`.
- Built: `mark --fs-root <folder>` and `MCP_FS_ROOT` confine the `fs.*` procedures and their nested calls.
- Built: each stream frame has `seq`. A receiver drops a duplicate or a late frame, and a gap marks the next item with `stream-gap`.
- Built: `llm.stream`, tools, procedures as tools with the admission of the host, and an automatic retry with `retry-after`.
- Built: IANA time zones in `schedule` with the rules of Vixie cron, a lock of `FileScheduleStore` across processes, and a root for `archive`.
- Built: `SqliteStorage` on `node:sqlite` when the platform has it, and on sql.js otherwise. 1,000 writes to a file take 141 ms, against 1,246 ms on sql.js.
- Built: `HybridStorage` reads the local ids without copies, so a full pull takes 30 % less time.
- Built: one-click releases. The release workflow opens the pull request "Version the packages".
- Built in systems: the WebSocket cells behind a router and a proxy (PR #27, harness 0.10.0). All nine cells with a band hold in two runs.
- Removed in 0.6.0: the deprecated `db.*` aliases of the sqlite procedures (`72a8c65`). jarvis called none of them.
- Fixed: the tests of `http` do not depend on the time of an abort, so its floor of the functions holds in each run.

### Open

The open work has an ID in the section "Open work after 0.7.0". These items are limits and notes that stay.

- Under a root, `git.*` and `pnpm.*` are refused. A later change can confine git with `GIT_CEILING_DIRECTORIES` and a check of the configuration of the repository. The procedures that reach files without `metadata.fsRoot` are refused too, for example `s3.download`, `snapshot.*` and `schedule.*`. `gh.*` fails at its nested `shell.run`.
- `llm.complete` with procedures as tools uses a forced `toolChoice` only for the first request. A `tool_result` keeps at most 200,000 characters.
- zod drops an own `__proto__` key of the input of `z.record()` and `z.json()` without an error. `@procedures/json` uses its own check for that reason.
- `json.validate` examines a subset of JSON Schema. Its output names each keyword that it does not examine.
- The MCP host has 91 tools. Some procedures can carry data out, change data in bulk, or run without an end. They are not tools: `http.*`, `docker.push`, `docker.prune`, `docker.volume.remove`, `mongo.watch`, `mongo.documents.bulk`, `db.transaction`, `db.migrate` and `db.backup`.
- R46 adds no MCP tools. `llm.*` costs money and sends data out. `env.*` can show secrets. `fs` is not an MCP namespace, and `archive.list` reads files. It is not a tool for that reason. `schedule.next` has little use without `schedule.add`.
- The root `.gitignore` ignores `secrets.*`. An agent made `packages/env/src/secrets.ts`, and git did not take it. A negation line keeps that file in git. A merge of an agent branch checks the ignored files of the worktree.
- Stryker 10.0.0 rewrites `tsconfig.json` in its sandbox with the JavaScript API of TypeScript. TypeScript 7 does not have that API, so the mutation job runs Stryker in place.
- The fs root decides by the real path. A link from outside the root that leads into the root is accepted, because it reaches only files in the root. The MCP host has no `fs.*` tools, and a root confines the nested calls of `lib.*` and `cue.*` too.
