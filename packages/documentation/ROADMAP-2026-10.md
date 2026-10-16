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
| R20 | 4 | `@procedures/compiler`: the IR and `program.check` | M | open | |
| R21 | 4 | `program.compile` and the equivalence tests | M | open | |
| R22 | 4 | The interpreter and the site use the IR of the compiler | M | open | |
| R23 | 4 | Outputs of the compiler: diagrams, tool descriptions, typed SDK, `procedure.explain` | M | open | |
| R24 | 5 | The bidirectional peer | M–L | fixed | `b2a3e3a` |
| R25 | 5 | Wire protocol v1 | M | fixed | `21f7743` |
| R26 | 5 | MCP Streamable HTTP | M | fixed | `3d24d5b`, `b42f3c8` |
| R27 | 5 | A `MessagePort` transport for workers | S–M | fixed | `d81d0ed` |
| R28 | 6 | The collection mode switch | L | fixed | `7873940` |
| R29 | 7 | Testing stage 1: property tests and a catalog test of the core procedures | M | open | |
| R30 | 7 | Testing stage 2: faults, contracts and leaks | L | open | |
| R31 | 7 | Coverage with a ratchet | S | open | |
| R32 | 7 | Testing stage 3: mutation, benchmarks, soak, real services, Windows | M | open | |
| R33 | 7 | Tests of the thin packages, and path confinement in `client-fs` | M | open | |
| R34 | 8 | `@procedures/systems` and the timer law | M | open | |
| R35 | 8 | State machines as data and an injectable monotonic clock | M | open | |
| R36 | 8 | A harness cell for a procedures WebSocket pair | M–L | open | |
| R37 | 8 | The service abstraction of `systems` in the client | M–L | open | |
| R38 | 9 | `@procedures/http` | S–M | open | |
| R39 | 9 | JSON and YAML transforms | S | open | |
| R40 | 9 | More git operations, and `git.branch` in three procedures | S–M | open | |
| R41 | 9 | More pnpm and docker operations | M | open | |
| R42 | 9 | `@procedures/gh` | M | open | |
| R43 | 9 | npm registry procedures | S–M | open | |
| R44 | 9 | More operations for fs, mongo, sqlite, s3, node and lib | M | open | |
| R45 | 9 | A SQLite collection storage and an IndexedDB program store | M | open | |
| R46 | 9 | `llm`, `schedule`, `env` and `archive` | M each | open | |
| R47 | 9 | Generate `PROCEDURES.md` and `PACKAGES.md` again | S | open | |

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

### R21. `program.compile`

- The code generation writes a plain `async` function that calls `ctx.client.call` for each call. Each call keeps its validation, admission, deadline and interceptors.
- A dynamic node goes back to the interpreter.
- A fold pass computes the pure parts with literal inputs.
- The output is the code, a source map, the effects, the diagnostics and the hash of the registry.
- Tests: golden outputs, and a property test that runs generated programs both ways and compares the results and the order of the calls.

### R22. One semantics

Three parts read programs today: the interpreter, the analysis of the site and the compiler. The interpreter operates on the IR, and the site uses the passes of the compiler, so the three cannot disagree.

### R23. Outputs of the compiler

- A Mermaid diagram of a program.
- The MCP tool description of a defined procedure, from its effects and schemas.
- A typed SDK and an OpenRPC document from the manifest (R17).
- `procedure.explain`, which wraps `explainInvocation`.

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

### R30. Stage 2

- A seeded fault transport: latency, a drop before the first item, a drop in a stream, a hang that ignores the signal, duplicate frames.
- An in-process TCP proxy: black hole, reset and pause.
- Reconnect tests for the WebSocket client.
- A middleware stack test: retry, timeout, breaker, cache, rate limit and the abort points, with fake timers.
- Leak tests: after 1,000 aborted calls, the maps of the servers are empty.
- A snapshot of the tool schemas, the wire goldens of R25, and a snapshot of the public `.d.ts` API.
- Tests of `client/errors`.

### R31. Coverage

`@vitest/coverage-v8` at the root, with thresholds that only go up.

### R32. Stage 3

Nightly mutation tests on the resolver, the capabilities, the policy and the middleware. Benchmarks with baselines. A WebSocket soak test. Real Docker and a Mongo service container. A Windows job.

### R33. The thin packages

More tests for `client-git`, `client-splay`, `client-s3` and `client-fs`. `client-fs` gets an optional root that confines each path.

## Tier 8: systems

### R34. `@procedures/systems` and the timer law

- The core exports its timer settings as data.
- `@procedures/systems` examines them with the timer law of `systems`. Example: the time of one try is less than the request time of the WebSocket. The overall time is more than the sum of the tries and the backoffs.
- The package depends on the client and on the general packages. The general packages do not depend on it.

### R35. State machines as data

The state of the WebSocket connection and of the circuit breaker become machine definitions that a test can replay. An injectable monotonic clock replaces `Date.now` in the timers.

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
| R47 | Generate `PROCEDURES.md` and `PACKAGES.md` again. They say 157 procedures, and the registry has 158. |

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
