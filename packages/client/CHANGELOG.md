# @procedures/client

## 0.31.0

No changes in this release.

## 0.30.0

No changes in this release.

## 0.29.0

No changes in this release.

## 0.28.1

### Patch Changes

- 345c740: Fixes of the low findings of the second code audit (roadmap O57).
  
  - `client.min` and `client.max` use a loop. A spread of a long array as arguments overflowed the stack.
  - The cache middleware: a call that waits for the same call in flight follows its own abort signal. An abort gives `ABORTED` at once.
  - The WebSocket server: a request that ends late does not delete the stream credit of a newer request with the same id.
  - The batch executor removes its listener from the signal of the batch when each call ends. A long-lived signal kept a listener for each call.
- 984c13b: The guard of `$regex` counts the ways of a nested repetition with a fixed count (weekly audit 2026-10-25).
  
  PATCH: a fix of the guard of 0.28.0 (decision D33b). That guard permits a bounded repetition only when it has at most 1000 ways to match. It counted a repetition with a fixed count, for example `{9}`, as one way. Thus `((a|a){9}){9}` passed with 2^9 ways, but it has 2^81 ways, and V8 takes hours on a string of 80 `a` characters.
  
  Now each repetition multiplies the ways of the part inside it. The guard refuses `((a|a){9}){9}` and `((a?){9}){9}`. A pattern with few ways still passes, for example `((?:a|b){3}){3}` and `(\d{1,3}\.){3}\d{1,3}`.
  
  Migration: the site, MiniMongo, Graph and jarvis do not turn `$regex` on, so they need no change.
- 21dc858: Fixes for the security findings of the second code audit (roadmap O55).
  
  PATCH: bug fixes and additive options. Each fix refuses only an input that the documentation does not give. A caller that uses the documented behavior sees no change. A request to a loopback, private or link-local host still works, with a deprecation notice. Version 0.29.0 refuses it (decision D35).
  
  - `procedure.delete` and `procedure.define` of `@procedures/client` obey the expose rule of the host, as `procedure.get` does (R17). `procedure.delete` does not find a hidden procedure, and `procedure.define` refuses to replace one with `NOT_EXPOSED`. A new procedure at a free path stays possible, as before. Before, a caller could remove or replace a hidden procedure that the host defined.
  - The task store of `@procedures/mcp-server` keeps a task without a session (stdio, an SDK transport) apart from the HTTP sessions, both ways. Before, each HTTP session could list, read and cancel such a task.
  - `restic.run` of `@procedures/restic` refuses each input that lets the caller choose a program for restic to start: `--from-password-command`, `--password-command2`, an extended option that sets `sftp.command`, `sftp.args`, `rclone.program` or `rclone.args` (each spelling), an sftp or rclone repository whose host or remote starts with `-`, and a positional argument that starts with `-` after a last flag without a value. Before, only `--password-command` was refused.
  - `@procedures/http` exports `createHostFetch(options)`: a `fetch` for GET requests through the host policy, with the options of `createHttpModule()`. It also exports `httpSettings(options)`. The deprecated option `warnOnRefusal` keeps a refused host working: the process gets one `DeprecationWarning`, and the request goes through the global `fetch`.
  - `weather.forecast` of `@procedures/weather` sends its request through `createHostFetch()` with `warnOnRefusal`. A `baseUrl` on a loopback, private or link-local address still works, with the warning `PROCEDURES_WEATHER_PRIVATE_HOST`. `createWeatherModule({ fetch })` gives another `fetch`, for a server of the host on such an address.
  - `@procedures/geo` and `@procedures/ics` add `createGeoModule({ fetch })` and `createIcsModule({ fetch })`. Their default stays the global `fetch`, because their roots run in a browser. A refusal of the host policy keeps its code and its reason. The refusal of `ics.fetch` does not name the feed address.
  - `@procedures/bundle-assistant` exports `mcpHostModules`: the modules of `geo` and `ics` with `createHostFetch()` and `warnOnRefusal`. A refused host gets the warning `PROCEDURES_GEO_PRIVATE_HOST` or `PROCEDURES_ICS_PRIVATE_HOST`. The bundle keeps the default modules, so `mark` and the site load it next to `geo` and `ics` as before.
  - The dev-tools server of `@procedures/mcp-dev-tools` gives the `mcpHostModules` of each bundle to `createRegistry()` before the bundles. In one call, the first module of a name counts. Thus `geo.geocode`, `geo.route`, `weather.forecast` and `ics.fetch` of the dev-tools server go through the default host policy.
  
  A host that sends `weather.forecast`, or the bundle's `geo` tools, to a server on a private address can remove the warning now. It gives a `fetch` that allows the server: `createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) })`. This `fetch` refuses each other private host now, as 0.29.0 does by default.

## 0.28.0

### Minor Changes

- 06694d7: The guard of `$regex` refuses more patterns that can take an exponential time (roadmap O56, audit finding 11).
  
  MINOR: a break (decision D33b). 0.27.8 gave the notice. A host that turned `$regex` on with a `queryPolicy` can now get `VALIDATION_ERROR` for a pattern that passed before. The default policy does not permit `$regex`, so a host without a `queryPolicy` sees no change.
  
  Before, the guard refused only a repeated group with an unbounded repetition inside, for example `(a+)+`. V8 still took an exponential time for `(a|a)*$`, `(a|aa)+$`, `(a{2,3})+` and `(a{1,50}){1,50}`. Now a group that repeats more than one time is refused when it can match the same text in more than one way:
  
  - It holds a repetition without a bound, for example `(a+)+`, and now also `(a+){9}` and `(\w+\s){2}`. The reason stays "repeats a group that repeats without a bound".
  - It holds a repetition of variable length, for example `(a{2,3})+` or `(a?a?)+`. The reason is "repeats a group with a repetition of variable length".
  - It holds alternatives that can start with the same character, for example `(a|aa)+` or `(\d|\w)+`. With the flag `i`, `a` and `A` are the same character. The reason is "repeats a group with alternatives that can start with the same character".
  
  A bounded repetition with at most 1000 ways to match passes, for example `(\d{1,3}\.){3}`. Alternatives that start with different characters pass, for example `(?:foo|bar)+` and `(?:[a-z]|-)+`.
  
  Migration: the site, MiniMongo, Graph and jarvis do not turn `$regex` on, so they need no change. A host that turns it on and gets the new `VALIDATION_ERROR` writes the pattern without the ambiguity. For example, write `(?:a|b)+` for `(a|ab|b)+`, and write the repetitions out, `\w+\s\w+\s` for `(\w+\s){2}`.

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

## 0.27.7

No changes in this release.

## 0.27.6

### Patch Changes

- d322bef: Fixes for the findings of the first code scan (roadmap O54).
  
  PATCH: bug fixes. A caller that used the documented behavior sees no change.
  
  - The route of `HttpServerTransport` now matches each character of `basePath` only as itself. Before, the route escaped only `/`, so a backslash or another special character of a regular expression in the base path changed the paths that the route took, and a parenthesis made the constructor throw. The test in `route.test.ts` pins this.
  - `betterAuthHandler()` and `createBrowserAuth()` of `@procedures/better-auth` remove the slashes at the end of `basePath` and `baseURL` with a loop, not with a regular expression. A long base path now takes linear time.
  - `@procedures/llm` removes the slashes at the end of `baseUrl` with a loop. `parseAnswer()` removes a code fence around the answer with a small parser, not with a regular expression. The results for each valid answer stay the same, and a long answer now takes linear time.
  - `mark` reads a number and a negative number with regular expressions that have one match for each text. The numbers that `mark` takes stay the same, and a long run of digits now takes linear time.
  - `procedure.new` of `@procedures/procedure` escapes each special character of a variable name in its search for the array of the procedures. It reads the names of an import without a regular expression that takes polynomial time on a long run of spaces.
  - The lockfile now resolves `zod` 4.6.7 and `body-parser` 2.4.0 (through `express`), which fix two published advisories. The dependency ranges do not change.

## 0.27.5

No changes in this release.

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

## 0.27.3

No changes in this release.

## 0.27.2

### Patch Changes

- 7bc4c6d: Fixes from the audit s21.
  
  PATCH: bug fixes. A caller that used the documented behavior sees no change.
  
  - A stream that its reader closes before the first item now ends. An async generator ignores a `return()` before its first `next()`, so no wrapper of the stream ran its end. Thus an HTTP request without `Accept: application/x-ndjson` for a stream without an end (`NOT_ACCEPTABLE`) stayed in flight, so `drain()` and `stop()` waited for their deadline. It also kept its storages in use, so `useStorage(..., { close })` waited for its grace. The subscription of `events.subscribe` kept its listeners on the bus. Now each wrapper on the path of the server (`ProcedureServer`, the invocation, the timeout and the tracing interceptors) gives the `return()` to its source and runs its end. The tests in `unbounded.test.ts`, `use-storage.test.ts` and `interceptors.test.ts` pin this.
  - The idempotency cache of `ProcedureServer` now keeps the results of each principal apart. Before, its key was the procedure and the idempotency key alone. Thus a caller with the idempotency key of another principal got the result of that call, and its own write did not run. A second try of one principal still gets its first result. The test in `idempotency.client.test.ts` pins this.
  - `server.start` of `@procedures/server` now starts only the `mark` CLI: `dist/bin.js` or `dist/cli.js` of `mark`. Before, it took each running script whose name ends in `cli.js`, so a start in `procedure-server` started `procedure-server`. The test in `procedures.test.ts` pins this.

## 0.27.1

### Patch Changes

- 146d38e: The kernel `@mark1russell7/coeval` goes from `^0.5.0` to `^0.6.3` in `@procedures/client` and `@procedures/compiler`.
  
  PATCH: a dependency update with no change that a caller can see.
  
  - Since coeval 0.6.3, the kernel gives a `Failure` of the host its own error value, without a cause. The client now keeps a `Failure` that a procedure throws as the cause of that error value. Thus `client.exec()`, `runProgram()`, `client.tryCatch` and `client.parallel` give the same `Failure` and the same message `<code> <reason>` as with coeval 0.5. The tests in `program.test.ts` pin this.
  - In coeval 0.6.3, an attribute of the standard tree that holds `undefined` no longer reads as `#N/A`. The world of a program has no standard tree, and its names are plain objects. Thus a `$ref` gives the same result as before.
  - In coeval 0.6.0, `mergeMachines` refuses a name that two machines define, unless the later machine names it in `replaces`. The client does not merge machines.
  - The declarations of `PROGRAM_WORLD`, `programMachine()`, `documentAt()` and `ProgramDocument` use the coeval types `World`, `Machine`, `Key` and `Json`. These types have no change. The types that `Machine` reaches get only new optional fields. The public API snapshot has no change.

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

## 0.26.2

No changes in this release.

## 0.26.1

No changes in this release.

## 0.26.0

### Minor Changes

- a16af64: Changed: a program runs on the kernel of coeval (`@mark1russell7/coeval` `^0.5.0`, roadmap item M14, coeval decision D13). The program format and its rules do not change.
  
  - The range `^0.5.0` of `@mark1russell7/coeval` has the kernel fixes of 0.4.1 to 0.4.3 (the narrowing of capabilities in `check()`, the place of a compile throw and of a waiting runner, the step parts after a failed `let`, `#DEPTH!` for an endless recursion, unknown `ops.*`/`ext.*` names in `check()`, `docEquals()` on dates and maps). The types of the client that name coeval types stay the same, with one addition: `Machine`, the type that `programMachine()` gives, has the new optional member `known` (coeval 0.4.3). `World`, `Key`, `Json` and `EvalError` do not change.
  
  - `desugarProgram()` changes the `$proc` form into a run document of coeval, and one run of the kernel runs it (`runProgram()`). `client.exec()`, `client.execStream()`, `hydrateInput()`, `prepareRootCall()`, `executeRef()`, the control-flow procedures and the body of a defined procedure use this run.
  - Each call of a program is an effect. The client does it with `client.call()`, so `invokeProcedure()` stays the authority for the admission, the validation, the interceptors and the exposure rules of each call. A failed call throws the same error as before, with its message and its code.
  - The logic of `client.chain`, `client.parallel`, `client.conditional`, `client.and`, `client.or`, `client.map`, `client.reduce` and `client.tryCatch` is a runner of the kernel. The procedures keep their registrations and their schemas.
  - The envelope form reads its envelopes with the helpers of coeval. Its literal stays `{ "type": "literal", "value": x }`, as in 0.23.0, and `toEnvelopeProgram()` writes this form. The type `"lit"` (the kind of the kernel, coeval D12) is an alias: `{ "type": "lit", "value": x }` is also a literal.
  - New exports: `runProgram`, `runDocument`, `runControl`, `runOperand`, `programMachine`, `PROGRAM_WORLD`, `desugarProgram`, `desugarInput`, `desugarControlValue`, `originOf`, `documentAt`, `namesOfScope`, `scopeOfNames`, `nameKey`, `nameOfKey` and their types.
  - `@procedures/compiler`: the name rules (`unknown-name`, `use-before-definition`) run through `check()` of the static kit of coeval on the run document. New exports `nameDiagnostics()` and `bindScopes()`. `resolveScopes()` gives the same diagnostics, with the same codes and messages, in a different order (see below).
  - PROGRAM-FORMAT.md revision 2: section 13 "Programs on the kernel of coeval".
  
  MINOR (D26): before 1.0.0, a breaking change raises MINOR. These behaviors change:
  
  1. `client.parallel` with `failFast`: the first error comes at once, as before. The other tasks now stop at their next wait, so their later calls do not start. A call that started goes on in its procedure. Before, the other tasks went on in the background to their end.
  2. `HydrateOptions.parallel`: the refs that start at the same time now always operate with failFast. After the first error, the other refs stop at their next wait. Before, they went on in the background (`Promise.all`).
  3. A call or an operand that throws `undefined`: the caller now gets `new Error(<reason>)`, with the reason of the kernel. The error of a task of `client.parallel` and the name `error` of `client.tryCatch` get that reason. Before, the caller got `undefined`, and the error text was `"undefined"`. An `Error`, a text and the other values stay as they are.
  4. `resolveScopes()` of `@procedures/compiler` gives the warnings for the raw input first, and then the diagnostics of the names. Before, the diagnostics came in the order of the program tree.
  5. In the envelope form, the types `["ref"]` and `["lit"]` (arrays of one key) are the kinds `ref` and `lit` of the kernel. Before, they were calls of the procedures with the paths `["ref"]` and `["lit"]`. A ref into the world, `{ "type": "ref", "value": ["world", "ref"] }`, stays a call of the procedure, and `toEnvelopeProgram()` now writes this type for these two procedures.
  
  Migration:
  
  - For 1 and 2: when the later calls of the other tasks must run, wait for those tasks yourself (for example, start them in a separate program and join their results), or do not use `failFast` (for 1) or `parallel` (for 2).
  - For 3: throw an `Error`.
  - For 4: sort the diagnostics by `pointer` when the order matters.
  - For 5: for a call of a procedure with the path `["ref"]` or `["lit"]`, write a ref into the world as the type: `{ "type": { "type": "ref", "value": ["world", "ref"] }, "value": input }`. Or keep the program in the `$proc` form: `{ "$proc": ["ref"], "input": input }` is a call, as before.
  
  Speed: the property tests that run each program three ways (`equivalence.test.ts` of the compiler) are about 1.4 times slower on the CI runners: 29.4 s before and 40.0 s after, the sum of the Node 22, 24 and 26 jobs, the mean of 3 runs of main and 4 runs of this change. The program tests of the client (`src/procedures/`) take about the same time: 8.5 s and 8.8 s.

## 0.25.0

### Minor Changes

- 75bff3b: Breaking: an in-band end of a stream before its first item gets the default flag of its code (roadmap CLI-68, decision D25). The release before this one marked the old flag `false` as deprecated (D13).
  
  The new behavior:
  
  - A handler error without a `retryable` flag that ends a stream before its first item gets the flag of its code in `ERROR_CODES`. Thus `UNAVAILABLE`, `CONNECTION_CLOSED` and `RATE_LIMITED` are retryable there. The other codes stay `false`.
  - This applies on each face: the `error` line of NDJSON, the `error` frame of WebSocket and the `_meta.retryable` of the MCP stream result. The HTTP status of an NDJSON stream stays 200.
  - An error before the stream starts already got this default (CLI-48). Thus a streaming handler and a unary handler that throw the same error before their first item now give the same flag.
  - After the first item, an error without a flag still gets `false` (CLI-58). An error with its own flag keeps it, before and after the first item.
  - The retry middleware of the client retries while no item reached the reader. Thus it now retries a stream that fails with `UNAVAILABLE` before its first item. The caller gets the items of the retry, not the error.
  - A keyed call to a procedure that is not idempotent: a retryable end of its stream lets the next try with the same idempotency key run again. Before, the next try got `DUPLICATE`.
  - Without NDJSON (the last item as JSON), a stream error before the first item gets the flag and the HTTP status of its code, for example 503 for `UNAVAILABLE`. After an item, the flag is `false`, thus 500.
  
  What a caller sees:
  
  | Stream error without a `retryable` flag | Before | From this release |
  |---|---|---|
  | Before the first item, code `UNAVAILABLE` | `retryable: false`, no retry | `retryable: true`, the retry middleware sends the call again |
  | Before the first item, a code that is not retryable | `retryable: false` | `retryable: false` |
  | After the first item | `retryable: false` | `retryable: false` |
  | A handler gives `retryable: true` or `false` | that flag | that flag |
  
  The retry costs time and calls: each try waits for the backoff, and the server gets one more call for each try. A handler with an effect before its error does that effect again on each try.
  
  New exports and options:
  
  - `retryableOf(error, items)` of `@procedures/client` gives the flag of an error that ends a call, after `items` items. Each face uses it.
  - The `errorOf` option of `writeNdjsonStream` also gets the count of the item lines before the error. A function with one parameter still works.
  - `IdempotencyCache.forget(key, result)` removes the result of a key.
  
  The opt-out:
  
  - A handler that is not safe to run again gives `retryable: false` in its error. For example, `throw Object.assign(new Error("busy"), { code: "UNAVAILABLE", retryable: false })`.
  - Or the caller does not use the retry middleware for that call. For example, give `shouldRetry` that gives `false` for that method, or set `retry: { maxAttempts: 1 }` in the context of the call.
  
  Migration steps:
  
  - A streaming handler that throws `UNAVAILABLE`, `CONNECTION_CLOSED` or `RATE_LIMITED` without a flag before its first item: is a second run safe? If not, give `retryable: false`.
  - A test that expects `retryable: false` for such an end before the first item: expect the flag of the code.
  - A custom `errorOf` of `writeNdjsonStream`: read its second parameter to give the same rule.
  - The site: no change is necessary. The lab simulates its server with explicit flags. The streams of the journey do not fail.
  - MiniMongo: no change is necessary. Its browser client has the retry middleware, but its procedures throw no `UNAVAILABLE`, `CONNECTION_CLOSED` or `RATE_LIMITED` without a flag.
  - Graph: no change is necessary. Its handlers give `UNAVAILABLE` with an explicit flag, and it serves no stream procedure of its own.
  - jarvis: no change is necessary. The cuts of its host have their own flag, and it uses no retry middleware.

### Patch Changes

- 16562ee: Deprecated: five behaviors of the programs (decision D13). The next MINOR (D26: the programs on the kernel of coeval, roadmap item M14) changes them. This release changes no behavior and no API: it adds the notes "Deprecated behavior (D26)" to the doc comments, and the section "Deprecated behaviors (D26)" of PROGRAM-FORMAT.md. The functions and the options stay, so the notes are not `@deprecated` tags.
  
  - `failFast` of `client.parallel`: at this time, the other tasks go on in the background after the first error. From the next MINOR, they stop at their next wait, and their later calls do not start. When those calls must start, wait for the tasks yourself, or do not use `failFast`.
  - `HydrateOptions.parallel`: at this time, the other refs go on in the background after the first error (`Promise.all`). From the next MINOR, the refs always operate with failFast. When their calls must start, give `parallel: false`.
  - A call that throws `undefined`: at this time, the program fails with `undefined`, and the error text of `client.parallel` and `client.tryCatch` is `"undefined"`. From the next MINOR, the program fails with an `Error` that has the reason of the kernel. Throw an `Error`.
  - `resolveScopes()` of `@procedures/compiler`: at this time, the diagnostics come in the order of the program tree. From the next MINOR, the warnings for the raw input come first, and then the diagnostics of the names. Sort the diagnostics by `pointer` when the order matters.
  - The types `["ref"]` and `["lit"]` of the envelope form (arrays of one key): at this time, they are calls of the procedures with these paths. From the next MINOR, they are the kinds `ref` and `lit` of the kernel. For a call of these procedures, write a ref into the world as the type: `{ "type": { "type": "ref", "value": ["world", "ref"] }, "value": input }`. A ref into the world stays a call, and the `$proc` form does not change.
  
  PATCH: documentation only. No export, no type and no behavior changes.

## 0.24.1

### Patch Changes

- 2735505: Deprecated (D13): the flag `retryable: false` of an in-band end before the first item of a stream, for an error without a flag. The next MINOR of the client group changes it (roadmap CLI-68, decision D25). This release changes no behavior.
  
  - The in-band end is the `error` line of NDJSON, the `error` frame of WebSocket and the `_meta` of the MCP stream result.
  - Now, an error of a handler without a flag gets `retryable: false` there, also when the stream gave no item (CLI-58).
  - After the change, an in-band end without a flag before the first item gets the flag of its code in `ERROR_CODES`, as an error before the start of the stream does. Thus `UNAVAILABLE` is retryable there.
  - Then the retry middleware of the client sends such a stream again. This adds time and calls. A handler with an effect before its error does that effect again.
  - After the first item, the flag stays `false` without a flag. This part of the CLI-58 rule does not change.
  - To keep the flag `false` before the first item, give `retryable: false` in the error of the handler. Or do not use the retry middleware for that call.
  
  `WIRE-PROTOCOL.md` (section "Error codes") and the doc comments of `errorResponse`, `defaultNdjsonError`, `errorStatus` and `streamErrorMeta` have the deprecation notes.
  
  The site, MiniMongo, Graph and jarvis: no change in this release.

## 0.24.0

No changes in this release.

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
- 71091a5: Added: the envelope form of a program (coeval, decisions D6, D9 and D10, roadmap item M7). A call is `{ "type": ["client", "add"], "value": input }`, and a reference is `{ "type": "ref", "value": ["names", "sum"] }`. The `$proc` form does not change.
  
  - `fromEnvelopeProgram()` changes a program in the envelope form into the `$proc` form. `toEnvelopeProgram()` changes a `$proc` program into the envelope form. `isEnvelopeProgram()` tells which form a value has.
  - `client.exec()` and `client.execStream()` accept a program in the envelope form at the root. `client.exec(program, input)` puts the fields of `input` over the input, as for a `$proc` program.
  - The root decides the form. In an envelope program, a `$proc`, `$ref` or `$literal` object is data. In a `$proc` program, an envelope is data, as before.
  - A call with the value `null` has no input. The header `name` gives `$name`. A ref reads only the root `names`, and `["names", "last"]` reads the step before.
  - The envelope form has no `$when`. A program that needs `$when` keeps the `$proc` form.
  - The section "The envelope form" of `PROGRAM-FORMAT.md` gives the mapping and the rules. The section "Open questions and known differences" is now section 12.

## 0.22.1

### Patch Changes

- c931188: The publisher refuses a subscriber of a collection `a.b` with partitions and no storage when its resolver gives no partition and `a` has partitions. Before, that subscriber listened to the plain topic `collections.a.b`. That is also the topic of the partition `b` of `a`. Thus the subscriber got the events of the tenant `b` of `a`, a leak across tenants (roadmap CLI-70, decision D23).
  
  - The refusal is `FORBIDDEN` with the reason `partition-not-allowed`, as for the other refusals of a partition.
  - The publisher does the check at the start of the subscription, at each re-check and before each event. Thus partitions of `a` that come later also end an open subscription, before it gets an event of `a`.
  - The check is in the one route from the topic of a subscriber to the topic of the bus. Thus each subscriber over HTTP, WebSocket or MCP gets it.
  - The registration check of CLI-57 cannot find this pair, because the resolver gives the partition only at the call. The calls of `a.b` without a partition already failed, because `a.b` has no storage.
  - A subscriber of `a.b` whose resolver gives a partition does not change. A subscriber of `a` does not change. A collection `a.b` without the partitions of `a` does not change.
  
  PATCH (decision D23): the change refuses only a subscription that gets the events of another tenant. No correct subscriber can rely on it. Each other subscription behaves as before.
  
  Migration steps:
  
  - Does a subscriber of `a.b` get `FORBIDDEN` with the reason `partition-not-allowed`? Then make the resolver of `a.b` give a partition. Or rename `a.b` to a name without a dot, for example `a_b`.
  - The site: no change is necessary. It serves no collection.
  - MiniMongo: no change is necessary. Its server serves no collection.
  - Graph: no change is necessary. Its one served collection, `examples`, has no dot in its name.
  - jarvis: no change is necessary. Its host serves no collection.

## 0.22.0

No changes in this release.

## 0.21.0

No changes in this release.

## 0.20.0

### Minor Changes

- 5f49860: The root of `@procedures/client` and the entry `@procedures/client/server` do not export the server transports (CLI-6 step 2). Thus the root imports no `http`, no `ws` and no `express`, and its declarations name none of them (CLI-61). This change is a break of the server stack, thus it is its own MINOR (decision D13). The PATCH 0.14.1 marked each removed name as `@deprecated`.
  
  - Removed from the root and from `./server`: `HttpServerTransport`, `HttpServerTransportOptions`, `HttpUrlStrategy`, `WebSocketServerTransport`, `WebSocketServerTransportOptions`, `WebSocketAuthHandler`, `WebSocketConnectionHandler` and `WebSocketMessage`. `@procedures/client/node` exports each of them, as before.
  - Changed: `HttpUrlStrategy` takes a structural request, `UrlStrategyRequest`, not the `Request` of Express. `UrlStrategyRequest` has `method`, `path`, `url` and `headers`, and the optional `query` and `body`. A `Request` of Express agrees with it, and so does the `UrlRequest` of `procedureHandler`. `HttpServerTransport` still gives the strategy the request of Express. `@procedures/client/node` exports `UrlStrategyRequest`.
  - Changed: the headers of `GuardedRequest` (the request of `checkBrowserRequest`) and of `hasAmbientCredentials` have the new structural type `GuardedHeaders`, not `IncomingHttpHeaders` of `node:http`. The headers of an `IncomingMessage` agree with it, so a call with a request of Node does not change.
  - New: the root exports the types `RoutedRequest` and `GuardedHeaders`. `./server` exports `RoutedRequest`.
  - New: the root is a browser entry (`client.browser`). The CI check bundles it for a browser, and a test examines the declarations of each entry other than `./node`. A project that checks the declarations of its libraries (`skipLibCheck: false`) and imports the root needs no `@types/express`.
  
  MINOR: before 1.0.0, a break of the public API raises the MINOR. The removal of exports and the new parameter type of `HttpUrlStrategy` break the API.
  
  Migration:
  
  - Import `HttpServerTransport`, `WebSocketServerTransport` and their types from `@procedures/client/node`.
  - A URL strategy whose parameter has the type `express.Request` does not compile as an `HttpUrlStrategy`. Give the parameter the type `UrlStrategyRequest` of `@procedures/client/node`, or give it no type: `HttpUrlStrategy` gives it the type.
  - A strategy that reads a part of the Express request outside `UrlStrategyRequest`, for example `req.params`, casts the request: `(req as express.Request).params`.
  - Code that reads a header of `GuardedHeaders` without a declared property, for example `accept`, gets `string | string[] | undefined`. Examine the value with `typeof` before use.
  - Before, an import of the root also loaded the types of Node (`@types/node`) into the program. A project that used `process`, `Buffer`, `URL`, `setTimeout` or a `node:` module without `@types/node` in its own configuration compiled only because of that. Such a project fails to compile after this release. Add `@types/node` to its development dependencies and `"types": ["node"]` to its `tsconfig.json`. In this repository, `@procedures/archive`, `@procedures/env`, `@procedures/gh`, `@procedures/http`, `@procedures/llm`, `@procedures/npm` and `@procedures/schedule` got the `node` feature of `cue-config` for this reason. Their APIs do not change.
  
  The migration steps of the known consumers:
  
  - The site: no change. It imports none of these names. It names `HttpServerTransport` and `WebSocketServerTransport` only in the text of its journey.
  - MiniMongo: no change. It imports none of these names, and its host uses `runProcedureHost`. Its `vite.config.ts` maps the root to `@procedures/client/browser`. The map can stay, because the root is also a browser entry.
  - Graph: no change. It imports none of these names.
  - jarvis: no change. It imports none of these names.
  - The procedures image of the harness of `systems` (`packages/harness/image/procedures/server-ws.mjs`) imports `WebSocketServerTransport` from the root. It pins `@procedures/client` 0.7.0. When it moves to this MINOR or a later version, import `WebSocketServerTransport` from `@procedures/client/node`.
  - `headroom` (`packages/daemon/src/gateway.ts`) gives `checkBrowserRequest` of the root a request of `node:http`: no change.

## 0.19.0

### Minor Changes

- 5cb934d: Breaking: a `ProcedureServer` with a token or a request hook (`principalOf`) refuses a request without credentials (CLI-1). The error code is `UNAUTHORIZED`, and the hook does not run for it. Before, such a request skipped the token check and the request hook. Thus a face that set no credentials, for example a custom transport, went around the authentication.
  
  New: the local marker `LOCAL_CREDENTIALS`, with `isLocalCredentials()` and its key `LOCAL_MARKER`. A local face sets it. Only a local request skips the token and the request hook.
  
  The server examines a request in one of three ways:
  
  - A local request skips the token and the request hook.
  - A request without credentials gets `UNAUTHORIZED` when the server has a token or a request hook.
  - A request with credentials goes through the request hook and the token check, as before.
  
  - The local faces are MCP over stdio, an SDK transport of `McpServerTransport` and `PortTransport`. The peer of stdio is the parent process. Only the holder of the other end of a port can send to it.
  - A network face never sets the marker: HTTP, WebSocket and MCP over Streamable HTTP. The key of the marker is a symbol. JSON, structured clone, a header, a cookie and a query cannot carry it.
  - The calls of a WebSocket server to the `serve` handler of its client are not local. Their credentials are empty, so a `serve` server with a token refuses them.
  - `PortTransport` has the new option `credentials`. Give `{}` for a port that a part outside the application can reach, for example a `Window`.
  - The nested calls of a procedure do not go through the token check. They keep the principal of their caller.
  
  Migration:
  
  - A custom transport or face that sends no credentials to a server with a token or a request hook now gets `UNAUTHORIZED`. Set the credentials of its request (`requestCredentials()`), or `LOCAL_CREDENTIALS` for a face in this process.
  - Code that calls `server.handle()` of a server with a token or a request hook gives `credentials: LOCAL_CREDENTIALS`.
  - The site: no change. Its servers have no token and no request hook, and its workers serve over `PortTransport`, which sets the marker.
  - MiniMongo: no change. `scripts/dev.ts` starts a server without a token and without a request hook. Its HTTP and WebSocket faces set the credentials of each request.
  - Graph: no change. The procedure host (`packages/server/graph-host.ts`) has a request hook (`graphPrincipalOf` of `packages/server/graph-procedures.ts`) and no token. All its faces send credentials: HTTP, WebSocket and MCP over Streamable HTTP (`mcpFace`). No code of Graph calls `handle()` directly. The MCP host (`packages/mcp/src/host.ts`) operates over stdio, which is local.
  - jarvis: no change. The loopback server and the remote server of `packages/http/src/procedures.ts` have a request hook (`principalOf`), and the remote server has a token. `makeProcedureHandler` mounts `procedureHandler`, which sends the credentials of each request. A test that calls `handle()` of such a server gives `LOCAL_CREDENTIALS`, or credentials with the token.

## 0.18.1

### Patch Changes

- d69c8cb: A host that serves a plain collection `a.b` and a collection `a` with partitions fails at registration. To correct it, rename the plain collection. Before, the two had the same topic `collections.a.b`. Thus the readers of `a.b` got the events of the tenant `b` of `a`, a leak across tenants (roadmap CLI-57, decision D23).
  
  - The refusal is the new export `CollectionTopicCollisionError`. It names the two collections, the partition and the topic.
  - `useStorage`, `useStorages`, the option `collections` of a host and `usePartitions` do the check. The check finds the pair in each order, also when the registrations come at different times.
  - The check also refuses a deeper name, for example `a.b.c` next to `a` with partitions: `b.c` is a partition of `a`.
  - The check also refuses a storage of `a.b` for the calls without a partition while `a` has partitions, also when `a.b` has partitions. That storage publishes on `collections.a.b`.
  - A name without a dot does not change. A dotted name without a partitioned prefix does not change. Two collections with partitions, for example `a` and `a.b`, do not change, because the partitions of `a.b` encode its name.
  
  PATCH (decision D23): the change refuses only a configuration that leaks events across tenants, so no caller can rely on it. Each correct configuration behaves as before.
  
  Migration steps:
  
  - When a host fails with `CollectionTopicCollisionError`, rename the plain collection, for example `a.b` to `a_b`. A name without a dot has no topic of a partition.
  - The site: no change is necessary. It serves no collection.
  - MiniMongo: no change is necessary. Its server serves no collection.
  - Graph: no change is necessary. Its host gives partitions to each served collection (`examples`), and no collection has a plain storage.
  - jarvis: no change is necessary. Its host serves no collection.
- 0379278: Docs and tests: the rule of the retryable flag of an in-band end (CLI-58). The behavior does not change, thus this change is a PATCH of the client group (decision D13).
  
  - Before the stream starts, an error of a handler without a retryable flag gets the flag of its code in `ERROR_CODES` (CLI-48). Thus `UNAVAILABLE` without a flag is retryable, and the HTTP face answers 503.
  - After the stream starts, an error ends the stream in-band. The in-band end is the `error` line of NDJSON, the `error` frame of WebSocket or the `_meta` of the MCP result.
  - An in-band end without a retryable flag gets `retryable: false`, also when the stream gave no item. The reader can have items, and a retry can send them again.
  - A handler gives `retryable: true` when a retry is safe. Then the in-band end is retryable too.
  - The retry middleware of the client does not retry after an item reached the reader. Thus after the first item, the flag only tells the application.
  - This rule agrees with the rule of a cut (CLI-48): the flag is false when the call can have had its effect.
  - `WIRE-PROTOCOL.md` gives the rule in the section "Error codes". Tests pin it on the wire of HTTP and WebSocket, and on the HTTP, WebSocket and MCP faces of the procedures host.
  
  The site, MiniMongo, Graph and jarvis: no change.

## 0.18.0

### Minor Changes

- 5e68b6a: Each face gives only the error codes of wire v1 (server stack CLI-4). The stray codes fold into `UNAVAILABLE`, `FORBIDDEN` and `INTERNAL_ERROR`. This change is a break of the server stack, thus it is its own MINOR (decision D13).
  
  Before, `procedureHandler` gave the codes of wire v1, but other paths kept their former codes. `HttpServerTransport` answered `SERVER_STOPPED` after `stop()`. The browser checks gave `FORBIDDEN_HOST`, `FORBIDDEN_ORIGIN`, `METHOD_NOT_ALLOWED` (405) and `UNSUPPORTED_MEDIA_TYPE` (415). `Server` and `ServerError` gave the code `"500"`.
  
  The behavior that changes:
  
  | Former code | Former status | Code of wire v1 | Status | Reason |
  |---|---|---|---|---|
  | `SERVER_STOPPED` | 503 | `UNAVAILABLE` | 503 | — |
  | `FORBIDDEN_HOST` | 403 | `FORBIDDEN` | 403 | `host-header-not-allowed` |
  | `FORBIDDEN_ORIGIN` | 403 | `FORBIDDEN` | 403 | `origin-not-allowed` |
  | `METHOD_NOT_ALLOWED` | 405 | `FORBIDDEN` | 403 | `method-not-allowed` |
  | `UNSUPPORTED_MEDIA_TYPE` | 415 | `FORBIDDEN` | 403 | `media-type-not-allowed` |
  | `"500"` | 500 | `INTERNAL_ERROR` | 500 | — |
  
  - `HttpServerTransport` answers a request after `stop()` with `UNAVAILABLE` (503, retryable), as `procedureHandler` does. The message is "The server is stopping".
  - `HttpServerTransport` refuses a browser request with `FORBIDDEN` (403) and the field `reason` in the body, as `procedureHandler` does. A `GET` without `allowGet` and a body that is not JSON get 403, not 405 or 415.
  - `checkBrowserRequest()` gives `{ ok: false, status: 403, code: "FORBIDDEN", reason, message }`. The type `GuardResult` has the new field `reason`. The MCP endpoint of `@procedures/mcp-server` uses it, so its refusal has `data.code` `FORBIDDEN`.
  - `Server` answers an error outside a handler with `INTERNAL_ERROR`. `new ServerError(message)` has the default code `INTERNAL_ERROR`.
  - The message of the refusals of the method and of the body starts with "Forbidden:".
  
  For one release, the client reads the former codes of an older server:
  
  - `HttpTransport` and the WebSocket transports read `SERVER_STOPPED` as `UNAVAILABLE` and `"500"` as `INTERNAL_ERROR`.
  - `HttpTransport` reads `FORBIDDEN_HOST` and `FORBIDDEN_ORIGIN` as `FORBIDDEN`, and sets the metadata key `reason`.
  - `isAvailabilityFailure()` still counts `SERVER_STOPPED`.
  - The client keeps `METHOD_NOT_ALLOWED` and `UNSUPPORTED_MEDIA_TYPE`. They are also the codes of the HTTP statuses 405 and 415 of each server.
  - The next breaking release of the client group removes these aliases.
  
  Migration steps:
  
  - Code that matches `SERVER_STOPPED`: match `UNAVAILABLE`. The flag `retryable` stays true.
  - Code that matches `FORBIDDEN_HOST` or `FORBIDDEN_ORIGIN`: match `FORBIDDEN`, then read `reason` (the body field, or the metadata key `reason`).
  - Code that matches the status 405 or 415 of a procedure server: match the status 403 and the reasons `method-not-allowed` and `media-type-not-allowed`.
  - Code that reads `GuardResult.code` of `checkBrowserRequest()`: read `reason`.
  - Code that matches the code `"500"` or the default code of `ServerError`: match `INTERNAL_ERROR`.
  - The site, MiniMongo, Graph and jarvis: no code of theirs matches a former code, so no change is necessary.
  - MiniMongo: its dev server uses `HttpServerTransport`, and its answers change only as the table says.
  - jarvis: its host uses `procedureHandler`, which gave the codes of wire v1 already.

## 0.17.4

No changes in this release.

## 0.17.3

No changes in this release.

## 0.17.2

### Patch Changes

- 8b7e20c: The Express shim `HttpServerTransport` sends no CORS header to an origin that it does not permit (CLI-59). A request without an origin also gets no CORS header. `procedureHandler` does this since 0.14.1 (CLI-56). A browser refuses such a response before and after the change, so no page can depend on the removed headers. Each response still gets `Vary: Origin` when `corsOptions.origin` is not `"*"`.

## 0.17.1

### Patch Changes

- 1ceb990: The guard of the writes of a collection closes the gap between its read and the write, and `find` with the rule of the rows gets a bound of its scan (roadmap CLI-55).
  
  PATCH: a correction of a race and a new optional option. Without the new options, nothing changes.
  
  - New option `admission.versionOf` of `createCollectionProcedures()`: the version of a stored item, the same function as the option `versionOf` of the storage. With it, each `set`, `delete`, `setBatch` and `patch` that the guard permits expects the version of the item that the guard examined (`expectedVersion`, `expectedVersions`, roadmap CLI-16). An id without an item expects `null`. An expected version of the caller stays.
  - A change for callers: before, a write of another writer between the read of the guard and the write was lost, and the guard did not examine the new item. With `admission.versionOf`, such a write now fails with `VERSION_CONFLICT`, and the storage does not change. A guarded `patch` writes the merged item that the guard examined with `set`, not with `patch()` of the storage. A storage without `versionOf` refuses each guarded write with `PRECONDITION_NOT_SUPPORTED`.
  - `deleteBatch`, `clear` and an item without a version get no precondition, because the storage cannot test one for them.
  - A `VERSION_CONFLICT` of a write through the procedures has no value for a current item that the rule `admit` refuses. Before, the conflict gave that item to the caller.
  - New option `admission.maxScanned`: the largest number of rows that one `find` examines with the rule `admit`. At the bound, `find` gives the admitted rows that it found, and that page can be shorter than the limit. The result has no other mark, because the output of `find` is a list and the protocol has no code for this case.

## 0.17.0

No changes in this release.

## 0.16.0

### Minor Changes

- deada4b: The name of a collection with partitions can have a dot (roadmap CLI-42). In the topic of a partition, the name encodes `%` and `.`, so the name and the partition of each topic stay apart. This change is a break of the server stack, thus it is its own MINOR (decision D13, decision D22). No earlier release marks it as deprecated, because no export moves. Only the topic form of these names changes.
  
  Before, `usePartitions` refused a name with a dot, because the topic `collections.<name>.<partition>` did not show where the name ends.
  
  - In the topic of a partition, the name encodes `%` as `%25` and `.` as `%2E`. The first dot after the name thus ends the name. The partition stays as it is, and it can have each character, also `.`, `/` and `%`.
  - `collectionChangeTopic()` makes each topic, and `collectionTopicPartition()` reads it back to the same name and the same partition.
  - Only the canonical form of a topic counts. The parse gives a collection and a partition only when `collectionChangeTopic()` gives the same topic again. Thus `collections.a%2eb.t1` names no collection.
  - `collectionTopicTarget()`, `collectionTopicReads()` and `EventPublisher` use the same parse. `collectionTopicReads(topic, repository)` takes the repository, as the default read check of the publisher does.
  - New `collectionTopicRule(name)`: the topic rule of a collection for the option `topics` of `EventPublisher`. It gives the plain topic and the pattern of the topics of the partitions, for example `["collections.graph.nodes", "collections.graph%2Enodes.*"]`.
  - The topic of a partition of a name without `%` and `.` does not change. The topic of a collection without a partition does not change.
  
  The behavior that changes:
  
  - A collection with partitions whose name has `%` gets a new topic for each partition. For example, the topic of the partition `t1` of `rate%` changes from `collections.rate%.t1` to `collections.rate%25.t1`.
  - A collection with partitions whose name has `.` is new. Its topics of a partition have the encoded name, for example `collections.graph%2Enodes.acme/space`. A topic or a rule that joins the raw name, for example `collections.graph.nodes.*`, matches none of them.
  - In a deployment with two versions, an old publisher and a new subscriber of such a name do not match. The reverse is also true.
  - `collectionTopicReads()` gives no read for a topic that names no collection, for example `collections.notes.` with an empty partition.
  
  Migration steps:
  
  - For each collection with partitions whose name has `%` or `.`, upgrade the publishers and the subscribers together.
  - Build each topic rule of a collection with `collectionTopicRule()`. Do not join the parts yourself.
  - The site: no change is necessary. It has no collection with partitions.
  - MiniMongo: no change is necessary. It has no collection with partitions.
  - Graph: no change is necessary. Graph has dotted names of collections, but no dotted name has partitions yet. When a dotted name gets partitions, build the rule of `graph-host.ts` with `collectionTopicRule()`, not `collections.${c}.*`.
  - jarvis: no change is necessary. It has no collection with partitions.

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
- d99b2d5: New: an open subscription can get the checks of its admission again (roadmap CLI-44). Before, `EventPublisher` examined the rights of a subscriber only at the start of `events.subscribe`. A subscription of a collection change feed thus continued after the app revoked a right.
  
  `rightsChanged(change)` of `EventPublisher` starts a check of each open subscription that the change touches. The change is the id of a principal, a test of the principal, or no value for each subscription. The new option `recheck` of `EventPublisherOptions` has `maxAge`, a check after a time on the clock of the publisher. It also has `rightsChanges`, a source of the changes of the app.
  
  The check is the same function as at the start: the topic rule, the reads, `allow` and the partition. While it operates, the events of the subscription wait. A refusal ends the subscription with its error, for example `FORBIDDEN`. The events that waited do not reach the subscriber. The new option `clock` of `EventPublisherOptions` is the clock of `maxAge`, and a `ProcedureServer` gives its own clock. Without a call of `rightsChanged()` and without the option `recheck`, nothing changes.
- 534e4ea: Fixed: `bearerOf` also reads the scheme of an `Authorization` header in another case (CLI-60). RFC 7235 makes the scheme case-insensitive, with one or more spaces (`1*SP`) before the token. Before, `bearerOf` read only a header that starts with `Bearer ` and one space, so a correct `bearer <token>` got 401.
  
  Each header that `bearerOf` read before gives the same token. A correct header in another case passes too, also with more spaces before the token.
  
  - A header that starts with `Bearer ` gives the rest of the header, as before.
  - A header with the scheme in another case, for example `bearer` or `BEARER`, gives the token after one or more spaces. Spaces or tabs can come after the token. The token has no whitespace (`token68`).
  - A tab between the scheme and the token is not `1*SP`, so it gives no token.
  - `Basic x`, `Bearer` with no space and an empty header give no token, as before.
  - The token comparison (`tokenMatches`) does not change.
  
  Each user of `bearerOf` gets the change. These users are `credentialsOf`, `requestCredentials`, `procedureHandler` and the WebSocket server. The WebSocket admission of `createProcedureHost()`, `guardMcpRequest` and the credentials of the MCP face also get it.
- 44fdd60: `@types/ws` is a dependency of `@procedures/client`, not a development dependency (CLI-61). The published declarations of the WebSocket transports name the types of `ws`, which is a dependency. Before, a project that checks the declarations of its libraries (`skipLibCheck: false`) and had no `@types/ws` failed to compile. Now each install gets the types with `ws`.
  
  The types of `express` stay an optional part, as `express` is an optional peer dependency. A project that checks library declarations and imports the root of the client needs `@types/express` until the next breaking release of the server stack (CLI-6 step 2), which takes the Express types out of the root.
  
  PATCH: a dependency of the package changes, and no API changes.

## 0.15.0

### Minor Changes

- c7198ca: Breaking (roadmap CLI-16, decision D11): the collection writes take an optional expected version. This is its own MINOR of the client group (D13).
  
  New:
  
  - `collections.<name>.set` and `delete` take `expectedVersion`, and each item of `setBatch` takes `expectedVersion`. The value is the version of the current item that the write expects. `null` expects no item.
  - A conflict changes nothing. The call fails with the new protocol code `VERSION_CONFLICT` (HTTP 409, not retryable). The metadata key `conflicts` (and the field `conflicts` of the HTTP body) has the current item and its version for each id.
  - `StorageItemWriteOptions.expectedVersion` (`set`, `delete`) and `StorageBatchWriteOptions.expectedVersions` (`setBatch`) in both copies of `CollectionStorage`. `VersionConflictError`, `versionConflictsOf()` and the other helpers come from `@procedures/client/query`, `@procedures/client` and `@procedures/collections`.
  - The option `versionOf` of `InMemoryStorage`, `SqliteStorage` and `MongoDocumentStorage` gives the version of an item. The test and the write are one step: synchronous in memory, one transaction in SQLite, the transaction or a compare-and-set on `_seq` in MongoDB. `MongoStorage` refuses a precondition.
  - `ApiStorage` sends the expected versions to the collection procedures, and gives a `VERSION_CONFLICT` back as a `VersionConflictError`.
  - `HybridStorage` sends the base version of each queued write as its expected version. A conflict of the remote goes to `conflictResolution`, as a conflict of a pull. The new option `sendBaseVersions: false` stops it.
  - `ClientError.metadata` gives the metadata of the error response.
  - The contract suite `@procedures/collections/testing` has the cases of the preconditions, and the option `createWithVersions`.
  
  The changes of behavior:
  
  - A storage must test a precondition, or refuse the write. A storage without `versionOf` refuses a write with an expected version with a `TypeError` whose code is `PRECONDITION_NOT_SUPPORTED`. The contract suite tests it for each storage.
  - A `HybridStorage` with `versionOf` now sends the base version of each queued write. A queued write over a change of another writer got through before. Now the remote refuses it with `VERSION_CONFLICT`, and `conflictResolution` decides: `remote` drops the queued write, `merge` sends the merged item, `local` sends the write again over the current version, and `error` throws `ConflictError` and keeps the queue. The remote must test the precondition: a server storage without `versionOf` refuses each push.
  - `ApiStorage`: a write without an expected version writes as before, and gets no `VERSION_CONFLICT`. Only a caller that gives an expected version, or a `HybridStorage` with `versionOf` over it, can get one.
  - `HybridStorage` with `versionOf`: a queued write that won before can now get the conflict path. The opt-out is `new HybridStorage(remote, { versionOf, sendBaseVersions: false })`: the push sends no expected version, and the last write wins, as before. The default is the new behavior.
  - A write without an expected version writes as before: the last write wins.
  
  Migration:
  
  - **Site.** No change. The site does not write collections.
  - **MiniMongo.** No change for a storage or a `HybridStorage` without `versionOf`. A `HybridStorage` with `versionOf` over `ApiStorage` needs a server storage with the same `versionOf` (for example `new InMemoryStorage({ versionOf })`), or the option `sendBaseVersions: false`.
  - **Graph.** Graph keeps last-write-wins first (D11): it gives no expected version, so nothing changes. `GraphDocsStorage` must refuse a write with an expected version until it tests one. Add the guard to its `set`, `delete` and `setBatch`, and run the contract suite: its first case tests the refusal. To adopt the version later, stamp a version field on the server, give the storage a `versionOf` that tests it in the write, and give the same `versionOf` to the `HybridStorage` of the client. Then add `createWithVersions` to the contract run.
  - **jarvis.** No change: jarvis gives no expected version. A storage of jarvis that implements `CollectionStorage` must refuse a write with an expected version, as for Graph.
  - **Other storages.** Each class that implements `CollectionStorage` reads the new options of `set`, `delete` and `setBatch`. It tests them in the write, or it rejects the write with `preconditionNotSupported()`. It never ignores them.

## 0.14.1

### Patch Changes

- 85999c1: MCP tasks and the guards of the HTTP face (CLI-35).
  
  - A procedure with `metadata.taskSupport` (`"optional"` or `"required"`) can run as an MCP task. `@procedures/mcp` gives it in the tool definition as `execution.taskSupport`, and exports `taskSupportOf`.
  - `createMcpHost` and `McpServerTransport` take the option `tasks`: a store (`McpTaskStore`), or the options of a new store (`maxRunning`, `ttl`). The host shares one store with each face, and `host.tasks` gives it. A task holds its place in the limit until its procedure returns, also after a cancel. A task above the limit starts and then fails at once with the reason, and the store keeps it for 1 minute. The time to keep a task starts when the task ends, and each session keeps at most 100 tasks. A cancel aborts `ctx.signal` of the procedure. The close of a session and the stop of the host cancel their tasks. Without the option `tasks`, the tools do not change.
  - The checks of a request to the Streamable HTTP face are in one function, `guardMcpRequest`, with the browser checks and `tokenMatches` of the core. A 401 now has a `WWW-Authenticate` header. The package also exports `assertLoopbackBind`, for the owner of a listener.
  - The HTTP face takes `allowedHosts`, `maxSessions` and `maxBodyBytes`. `createMcpHost` and `mcpFace` give the face `browser.allowedHosts` of the policy, so a host of that list can reach the endpoint. Before, the face refused it. Thus a policy with `allowedHosts: "*"` now also turns off the DNS-rebinding check of the face, as it does for the other faces.
  - `maxSessions` has no default: the sessions have no limit, as before. With it, a new session above the limit closes the session that was idle longest (no task in progress and no open response), and when each session is busy, the new session gets 503 with `Retry-After`.
  - `maxBodyBytes` (4 MiB by default, the limit of the SDK) applies to each request of the face.
  - The state of an HTTP face (`getState()`, and `host.state().faces`) gives `sessions`, the count of its open sessions.
  - `@procedures/client/node` exports `readJsonBody` and `BodyError`: the procedure handler and the MCP face read a JSON body with this one function.
  
  One default of the Streamable HTTP face changes: only an `initialize` request starts a session. Before, a POST without a session id made a new MCP server, and then the SDK refused the request with 400 ("Server not initialized"). Now the face refuses it with 400 before it makes a server, so a stray request uses no memory. This agrees with the MCP specification, and a caller sees the same status. When the SDK refuses an `initialize` (for example 406), the face now closes the server of that request.
- fc968f6: Fixed: `@procedures/geo`, `@procedures/ics` and `@procedures/splay` import `@procedures/client/browser`, not the root of `@procedures/client` (CLI-39). The root also exports `HttpServerTransport`, which imports `http`. Thus a browser build with Vite found `http` and gave a warning. The exports of the packages do not change.
  
  New: each package that operates in a browser names its browser entries in the field `client.browser` of its `package.json`. A CI check bundles each of these entries for a browser with esbuild. The check fails when an import reaches a Node built-in, with or without the prefix `node:`. The root of `@procedures/client` joins the check after CLI-6. `@procedures/splay` joins it when `splay.bridge.info` reads its version without `node:fs/promises`.
- dc7a462: New: the rules of the rows of a served collection (roadmap CLI-41). Before, the collection procedures checked only the partition of a call. A right that depends on the document, for example a `when` condition of an access list, had no place in a read or a write. The new option `admission` of `createCollectionProcedures()` gives two rules. `admit` examines each row `{ id, value }` of each read, and it has the shape of `AdmitItem`. `guard` examines each write `{ op, id, doc, prev }` before the storage changes, and a refused write gets `FORBIDDEN` with the reason `write-not-allowed`. The procedures apply the two rules in one place, the view of the storage of each call (`admittedStorage()`). A refused row is absent from `get`, `has`, `getAll`, `entries`, `ids`, `size`, `getBatch`, `find` and `changes`, and a delta of `changes` puts its id in `deleted`. The change events with values apply `admit` for each subscriber. The context of a call has its invocation (`ctx.invocation`). `@procedures/access` gets `accessWriteGuard()`, and `accessAdmitItem()` gets the option `docOf`. Without the option `admission`, nothing changes.
- e091108: New: credentialed CORS for the auth routes, from the trusted origins of the host (CLI-49). The handler of Better Auth sends no CORS headers, so a page on another origin got no session and failed POST requests. `betterAuthHandler(auth, { allowedOrigins })` gives the Node handler of the auth routes with credentialed CORS. `betterAuthFace(auth)` gives it as a face of a procedures host, with `browser.allowedOrigins` of the host policy. Thus one list of trusted origins drives `procedureHandler` and the auth routes. A response for a trusted origin names that one origin, with `Access-Control-Allow-Credentials: true` and `Vary: Origin`. The handler answers each preflight. An origin that is not trusted gets no CORS header. The CORS is `credentialedCors()` of `@procedures/client/node`, on the CORS code of `procedureHandler`. It refuses `"*"` (CSRF). The new option `crossSiteCookies` of the configuration (`AUTH_CROSS_SITE_COOKIES=1`) gives the cookies `SameSite=None` and `Secure` for a page on another site. Without the new functions and options, nothing changes.
- 073e4c3: Changed: `procedureHandler` sends no CORS header to an origin that its `cors` option does not permit (CLI-56). Before, the response for such an origin had no `Access-Control-Allow-Origin`, but it had `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Credentials` and `Access-Control-Expose-Headers`, and a preflight also had `Access-Control-Max-Age`. A browser ignores these headers without `Access-Control-Allow-Origin`, so no client uses them. Now the response for that origin, and for a request without an `Origin` header, has none of them. With a list or a function of origins, each response still has `Vary: Origin`, so a shared cache keeps one answer for each origin. A permitted origin and the origin `"*"` get the same headers as before. A preflight still gets 204. `HttpServerTransport` does not change.
- 6969637: The server transports are in the Node entry (CLI-6 step 1). `@procedures/client/node` now exports `HttpServerTransport`, `HttpServerTransportOptions` and `HttpUrlStrategy`. It already exported `WebSocketServerTransport` and its types.
  
  The root `@procedures/client` and the entry `@procedures/client/server` still export these names, but each export is now a deprecated alias with the tag `@deprecated`. The deprecated names are `HttpServerTransport`, `HttpServerTransportOptions`, `HttpUrlStrategy`, `WebSocketServerTransport`, `WebSocketServerTransportOptions`, `WebSocketAuthHandler`, `WebSocketConnectionHandler` and `WebSocketMessage`. Each alias is the same class or type as the export of `./node`, so `new`, `instanceof` and `extends` work as before.
  
  The next MINOR removes them from the root (CLI-6 step 2). It also removes them from `./server`. Then the root imports no `http` and no `ws`. Migration: import them from `@procedures/client/node`.
  
  The migration steps of the known consumers:
  
  - The site: no change. It imports none of these names.
  - MiniMongo: no change. It imports none of these names. The server stub in `vite.config.ts` names `HttpServerTransport` and `WebSocketServerTransport`, and it can stay.
  - Graph: no change. It imports none of these names.
  - jarvis: no change. It imports none of these names.
  - The procedures image of the harness of `systems` (`packages/harness/image/procedures/server-ws.mjs`) imports `WebSocketServerTransport` from the root. It pins `@procedures/client` 0.7.0. When it moves to a version after the next MINOR, import `WebSocketServerTransport` from `@procedures/client/node`.

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

## 0.13.2

### Patch Changes

- 3a235b9: New: the patch operations `$remove` and `$insert` (Graph's split, wave 2, W5). `$remove` takes an element out of an array, and the next elements move down by one, as the operation `remove` of JSON Patch (RFC 6902). For a field of an object, it is the same as `$unset`. `$insert` adds an element to an array at an index, as the operation `add` of JSON Patch. Each index of one patch refers to the item before the patch. A patch that removes and inserts elements of the same array is refused, and so is an `$insert` past the end of an array. `$unset` keeps the rule of MongoDB: an element of an array becomes `null`. The storage contract has a case for the two operations, so each storage gets them through `applyPatch`.

## 0.13.1

No changes in this release.

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

## 0.12.2

No changes in this release.

## 0.12.1

### Patch Changes

- b89e3fe: The field `partition` reaches each collection procedure again (CLI-46). `withPartition()` gave the whole input to the schema of the operation, and the schemas of `find`, `patch` and `changes` check each field, so they refused `partition`. Thus `find` could not run on a collection with partitions. The schema of the operation now gets the input without the field, and the parsed input gets it back.

## 0.12.0

No changes in this release.

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

## 0.10.0

### Minor Changes

- 254ee7b: `ProcedureServer` has stop parts in the shape of the runner of `@mark1russell7/service`, and its storages are dependency handles (server stack CLI-5, decision D2). This change is a break of the server stack, thus it is its own MINOR (decision D13).
  
  - New methods of `ProcedureServer`: `stopIntake()`, `drain(deadline, signal)`, `inFlight()` and `close()`. The server is a `TransportImpl` of the runner by its shape, and the types are structural: the root and `./browser` import no code of the runner.
  - `stopIntake()` refuses each new call with a retryable `UNAVAILABLE`, and ends each subscription of `events.subscribe`. The calls in flight continue.
  - `drain(deadline, signal)` waits until no call is in flight, or until the deadline on the clock of the server. When the signal aborts, each call that still runs gets the abort. The drain uses only the clock of the server, with no timer of its own.
  - `close()` aborts each call that still runs and stops the transports of the server. The intake stays stopped until the next `start()`, and a second close gives the same promise. `close()` does not close the storages.
  - New `storageHandles()`: one `StorageHandle` for each storage, also for a storage of two collections. A handle is a `DependencyHandle` of the runner by its shape: `connect` does nothing, and `close` closes the storage and removes its collections. The runner closes the handles after the transports close.
  - `start()` opens the intake again after `close()`, and the next calls get a new signal.
  - `stop({ grace })` is the parts in the sequence of the stages: `stopIntake()`, `drain()` for the grace, `close()`, and then `closeStorages()`. The server can start again, as before.
  - New exported types: `StopParts` and `StorageHandle`, from the root, `./browser` and `./server`.
  - `callsInFlight` is deprecated. Use `inFlight()`, which gives the same count.
  
  The behavior that changes:
  
  - The grace of `stop({ grace })` waits on the option `clock` of the server. Before, it waited on `setTimeout`. A test that gives a fake clock and stops with a grace must advance the clock.
  - During `stop()`, the intake stays stopped until the storages close. Before, a call that came while the transports stopped could start, and then find a closed storage.
  
  Migration steps:
  
  - The site, MiniMongo and the MCP host of Graph: no change is necessary. `stop({ grace })` keeps its result. Change `server.callsInFlight` to `server.inFlight()`.
  - jarvis and Graph under `run()`: declare the parts in the service of the process. Do not call `stop()`. Declare `svc.server("procedures", {}, server)`, and declare each handle of `server.storageHandles()` with `svc.dependency(handle.name, spec, handle)`. Give the server and `run()` the same clock, with the option `clock` of each.
  - A test with a fake clock that calls `stop({ grace })` with calls in flight: advance the clock by the grace, or stop without a grace.

## 0.9.2

No changes in this release.

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
- d0c9856: The partitions of a collection (roadmap CLI-17), two follow-ups of the review. A collection without partitions can have a dot in its name, and its topic `collections.<name>` stays a plain topic. `usePartitions` refuses a name with a dot, because the topic names the partition after the first dot. The documentation of `PartitionResolver` gives its contract: a partition of the caller or `null`, and not the partition of another tenant. One rule, `collectionTopicTarget(topic, repository)`, gives the collection of a topic to the read check and to the listener of the publisher. So a reader of `a` does not hear the collection `a.b`.
- b5db4d8: Under the root of the files of a host, the `git.*` procedures are confined, not refused (roadmap R33, tracker item O35). Without a root, nothing changes. PATCH: a procedure that the root refused now works in the root.
  
  - The core: `ProcedureContext.fsRoot` is the root of a confined call. `confineToRoot()` of `@procedures/fs` gives it to the handler of each confined procedure and of each program procedure.
  - The working folder `cwd` of each `git.*` procedure must be in the root, and its default is the root. The pathspecs, the `path` of `git.blame` and of the worktree procedures, and the `dest` of `git.clone` must be in the root too.
  - Under a root, git runs with `GIT_CEILING_DIRECTORIES` at the parent of the root, so it finds no repository above the root. The configuration of the system does not apply. The global configuration has only `user.name`, `user.email` and `init.defaultBranch` of the host.
  - The `-c` options turn off the hooks (an empty `core.hooksPath`) and `core.fsmonitor`. Only the transports https, http, ssh and git are permitted. Git does not go into a submodule.
  - Before the first command in a folder, git examines the repository. A repository outside the root (through a `.git` file or an alternate object folder), a repository with submodules, and a configuration key that starts a program are refused: `filter.*`, `diff.external`, `core.sshCommand`, `credential.helper`, `include.path` and the others. The error names each key.
  - `git.clone` and `git.remote.set` refuse a URL with `::` under a root.
  - `@procedures/git` now depends on `@procedures/fs` (for the rules of `@procedures/fs/root`).

## 0.9.0

### Minor Changes

- dc03903: The WebSocket client ignores a raw frame of the type `event`, as a frame of an unknown type. Before, it gave such a frame to `onEvent`, for a server outside this repository. No side of wire protocol v1 sends that frame (the type is reserved). `onEvent` now gets only the events of the subscriptions of the transport (`events.subscribe`). MINOR: a breaking change of behavior (the API is before 1.0.0).
  
  Migration: a server that sends raw `event` frames sends its events through `events.subscribe` instead (EVENTS.md). The client then gets them in `onEvent`, with the id of the subscription.

### Patch Changes

- 8bb469c: The partitions of a collection (roadmap CLI-17). One `collections.<name>.*` surface serves several partitions, for example one for each tenant. `ProcedureServer.usePartitions(name, { storageOf, resolve })` registers the storage of each partition and the resolver. The resolver gives the partition of each call from its context, so the tenant comes from `ctx.principal`. The input can ask for a partition, and the resolver can refuse the call (`FORBIDDEN`, reason `partition-not-allowed`).
  
  `RepositoryProvider` has the new optional methods `getPartitionStorage`, `hasPartitions` and `resolvePartition`. A repository without them refuses a partition. The events of a partition go to `collections.<name>.<partition>`.
  
  A subscriber of `EventPublisher` names the partition that it asks for, and the publisher resolves it with the same resolver. So a subscriber cannot name the topic of another tenant. A change of behavior for safety: a topic `collections.<name>.<partition>` of a collection without partitions is refused. Before, each subscriber with the read of the collection got it. New exports: `PARTITION_PATTERN`, `collectionTopicPartition`, `CollectionPartitions`, `PartitionInput` and `PartitionResolver`.
- dca28c1: The packages accept `@mark1russell7/service` 0.5.1 and later 0.5 versions, and `@procedures/client` accepts `@mark1russell7/algebra` 0.7.1. Before, the range `^0.4.1` stopped below 0.5. An application on service 0.5 then got a second copy of service inside the client.
  
  - The client uses only the `/backoff`, `/heartbeat` and `/testing` entries of service. The code of `/backoff`, `/heartbeat` and the clock is the same in 0.4.1 and 0.5.1. `/testing` only gets new exports.
  - The public API of the client does not change.

## 0.8.1

### Patch Changes

- 2d3f235: The procedure faces of Node without a framework, a request hook for credentials, and the credentials mode of `fetch`. Each change is additive: the old behavior stays.
  
  - `@procedures/client/node`: new `procedureHandler(server, options)` gives a request handler of `node:http`, `(req, res) => boolean`. It takes each request under `basePath` (default `/api`) and gives `false` for each other request, so the routes of the application share the listener. It speaks the wire of `HttpServerTransport` with the error codes of wire v1, and has CORS, `secretHeaders`, `secretQuery`, a Connect middleware and the stop parts `start`, `stopIntake`, `drain`, `inFlight` and `close`.
  - `@procedures/client/node`: new `upgradeHandler(server, options)` gives an upgrade handler for the "no server" mode of `ws`. Two endpoints of different paths share one listener. The entry also exports `WebSocketServerTransport`, `defaultServerUrlStrategy` and `rpcServerUrlStrategy`.
  - `HttpServerTransport` is a thin Express shim over `procedureHandler`, and keeps its former codes. `WebSocketServerTransport` takes only the upgrades of its path: two transports on one server now both work, and the option `server` is optional.
  - New option `principalOf` of `ProcedureServer` and `hostPolicy`: a request hook that reads the cookies, the headers and the query of a network request. It gives a bearer token for the token check, a principal and a narrowing of the capability. The procedure reads the principal as `ctx.principal`. New `requestCredentials` and `cookiesOf`.
  - A `Cookie` or `Proxy-Authorization` header no longer goes into the root of the metadata of an HTTP request. The secret headers stay in the credentials only.
  - CSRF: ambient credentials (cookies) are trusted only from a named origin. With `principalOf`, a face accepts a browser request only from its own origin or a named origin. On `procedureHandler` and `upgradeHandler`, a request with a `Cookie` header gets the same check: `"*"` does not permit another origin for it. `principalOf` with the origin `"*"` and no named `allowedOrigins` is refused at construction. `HttpServerTransport` and `WebSocketServerTransport` keep their former checks for a server that reads no cookies. With an `authenticate` function, a request with a cookie needs a named origin. The new server option `ambientCredentials` (and `ProcedureServer.ambientCredentials`) tells the faces how the server reads cookies. New `hasAmbientCredentials(headers)`, and `checkBrowserRequest` takes an optional `ambient` flag. A server whose `authenticate` reads no cookie keeps the former check with `ambientCredentials: false`.
  - `HttpTransport`: new options `credentials` (for example `"include"` for a cookie session on another origin), `requestInit` and `fetch`.
- 1aa9ef7: The collection storages get a JSON query language with a query policy, change batches and patches in one step, and the sync of `@procedures/store` runs on the service clock and backoff (server stack CLI-20, CLI-14, CLI-13, CLI-34).
  
  - The query language is in the core, in the new entry `@procedures/client/query`, which imports nothing else. It is the one copy (CLI-34). `@procedures/collections` now depends on `@procedures/client` for it, and exports the same names again.
  - The selector is JSON: a subset of the query selectors of MongoDB. `queryEntries()` is the reference, and `selectorProblems()`, `queryOptionsProblems()`, `compileSelector()`, `matchesSelector()` and `compareStorageValues()` are exported.
  - A query policy (`StorageQueryPolicy`) limits the operators, the length and the flags of a `$regex`, the clauses and the depth of a selector, the lists of `$in`, `$nin` and `$all`, and the limit. The default policy does not permit `$regex`. A pattern that repeats a repetition, for example `(a+)+`, is always an error.
  - `CollectionStorage` of `@procedures/collections` has the optional `query(selector, { sort, skip, limit }, policy)`, `observe(observer)` and `patch(id, fields)`. A caller tests for each one. A storage without them still follows the contract.
  - `observe()` gives one batch of `set`, `delete` and `clear` changes for each write that changes the storage, before the write resolves. The write methods take `{ origin }`, and each change has it.
  - `patch()` takes a JSON Merge Patch (RFC 7386), or the operations `{ $set, $unset }`, which can set `null` and nested field paths. A patch that mixes the two forms is an error. `applyPatch()`, `mergePatch()` and `patchProblems()` are exported.
  - `InMemoryStorage` has the three methods, and the options `queryPolicy` and `onObserverError`. `StorageListeners` is the set of listeners that the storages share.
  - The contract suite of `@procedures/collections/testing` tests the selectors against `queryEntries()`, with fixed and random selectors, the refusal of `$regex` by default, and, with `createWithQueryPolicy`, the opt-in of `$regex` and each limit of a policy. It also tests the two forms of a patch, the patches at the same time, and the batches with their origins.
  - The core collection procedures have `collections.<name>.find` (it reads) and `collections.<name>.patch` (it reads and writes, idempotent). `find` refuses a selector or a limit that the policy does not permit with `VALIDATION_ERROR` and the reason, and a `find` without a limit gets at most `DEFAULT_FIND_LIMIT` (1000) items. It gives the selector and the policy to `query()` of the storage, or runs it on the entries. `patch` uses `patch()` of the storage, or a read and a write, one patch of an id at a time.
  - `createCollectionProcedures(name, { queryPolicy })` and `ProcedureServer.registerCollectionProcedures(name, { queryPolicy })` take the policy of the host.
  - The `CollectionStorage` of the core has the same optional methods and the write options. Its new types are exported from the root, `./browser` and `./procedures`.
  - `ApiStorage` has `query()` (the procedure `find`, or the entries of an older server) and `patch()` (the procedure `patch`). Its option `queryPolicy` adds limits of the client.
  - `ApiStorage` waits `backoffDelay` of `@mark1russell7/service/backoff` between its tries, with full jitter, on the option `clock`. The timeout uses the clock too. The new options are `retryFactor`, `maxRetryDelay`, `retryJitter`, `clock` and `random`. An error with `retryAfterMs` gets at least that wait.
  - `HybridStorage` has `query()` and the option `queryPolicy`. Its timers run on the option `clock`, and the delay after a failure grows with the option `backoff`. `getStatus()` and `onStatus()` give the state of the sync and its failures. The storage writes nothing to the console.
  - `SyncedProcedureRegistry` takes the option `clock` for its auto-sync. Its status has the failures of the auto-sync and of the write-through writes, and `onStatus()` sends them.
  - `SqliteStorage` has `query()`, `patch()` and the option `queryPolicy`. A patch runs in one transaction.
  - `@procedures/store` depends on `@mark1russell7/service`, and `@procedures/collections` depends on `@procedures/client`.
- 2523b1b: One MCP host factory, `createMcpHost()`, and the questions of a procedure to the person at the caller (CLI-10, CLI-12). PATCH: new exports and new optional options before 1.0.0. The old exports and their behavior stay.
  
  - `@procedures/mcp-server`: `createMcpHost(options)` builds the registry (or the modules), the tool surface, the read-only narrowing, the host policy, the `ProcedureServer` and one `McpServerTransport` for each face (stdio, Streamable HTTP, SDK transports). The stdio face stops the host when its input ends, and `host.closed` resolves. `mcp.serve` and the dev-tools server use the factory. Thus `mcp.serve` gets its options from `hostPolicy()`, and it takes `readOnly` and `instructions`.
  - `@procedures/client`: `ctx.elicit` asks the person at the caller for input or a confirmation. The helpers `elicitInput()` and `elicitConfirmation()` give the action `unavailable` with a reason when no one can answer. `elicitWithPolicy()` adds the consents of the operator (`operatorConsent`), and `ask: false` turns the questions off. The operator answers only when the face cannot ask. A failed question of a face that can ask (a timeout, a lost connection) gives `unavailable`, and an abort gives `cancel`. `ServerRequest` and `InvokeOptions` get `elicit` and `progress`.
  - `@procedures/client`: `ctx.progress` tells the caller the progress of the call of the host. `metadata.untrusted` declares the output fields with text from outside the host, and `metadata.title` gives the title of a tool. `metadata.toolHints` can make a tool look more dangerous than its effects (`readOnlyHint: false`, `idempotentHint: false`, `destructiveHint: true`, `openWorldHint: true`). The registry refuses each other value, and `toolHintsOf()` gives the hints with the override.
  - `@procedures/mcp-server`: `McpServerTransport` answers `ctx.elicit` with MCP elicitation (form and URL), over stdio and Streamable HTTP. It sends `ctx.progress` as `notifications/progress`, and it gives the instructions of the server. An untrusted field goes in envelopes with a random id, and its text cannot close its envelope. The option `content` can give other text blocks for a result. The option `json: "compact"` gives the JSON of the default blocks on one line. The option `toolName` gives the name of each tool, so a server that moves to the host keeps its tool names. A call finds its procedure by the tool, not by the decoded name. Each tool call over Streamable HTTP carries the credentials of its HTTP request, so the request hook `principalOf` and the token check of the server apply to it. A server that reads cookies gets the CSRF rule on this face too.
  - `@procedures/mcp`: a tool gets `title` from `metadata.title`. In the output schema, each untrusted field is a string.
  - `@procedures/mcp-dev-tools`: `createDevToolsHost()` gives the MCP host as `mcp`. `dist/server.js` ends its process when the client closes the input of stdio. The tool list stays the same.
- c559b00: `HybridStorage` captures the writes of the application to its local copy, keeps its sync state after a reload and takes a push feed of the remote changes. Each write of the core collection procedures publishes a change event (server stack CLI-21, CLI-15, decision D9).
  
  - `HybridStorage.observe(observer)` gives one batch of changes for each change of the storage. A write of the storage gives its batch with the origin of its options. A pull and a delta of the feed give their changes with the origin of the option `syncOrigin` (`"sync"` by default). In `remote-only` mode, the batches tell the writes of the storage to the remote.
  - The option `origin` of `HybridStorage` is the tag of the storage (a random `hybrid-…` tag by default). Each write of the storage to the local copy and to the remote has it. The write methods of `HybridStorage` and `ApiStorage` take `{ origin }`.
  - `capture: "observe"`: the storage observes the local copy and queues each change with another origin. Thus an application can write to the local copy directly, for example with the synchronous writes of a SignalDB collection. In `write-through` and `remote-only` mode, the storage sends a captured change at once.
  - The option `syncState` takes a `SyncStateStore`: `MemorySyncStateStore`, or `IndexedDbSyncStateStore` of `@procedures/store/indexeddb`. The store keeps the cursor and the base versions. A new storage with the same store and a durable local copy asks only for the changes since the cursor, and it finds the conflicts of the base versions. A failure of the store goes to the status (`operation: "store"`, `SyncStateError`), and the storage goes on.
  - The option `feed` takes a `RemoteChangeFeed`. A delta whose `since` is the cursor applies without a read of the remote. A gap, a lost event, a new subscription or another delta makes one pull. A delta that comes during a pull applies after the pull, so the pull does not erase it (the LiveLog rule of Graph).
  - In `write-through` mode, a pull or a delta does not write over an own write that waits for the remote, a set or a delete. The storage keeps the remote value of the id, and after the write it reads the id again: then the rules of a pull decide. A read of a missing id does not bring back an item whose own delete waits.
  - With `versionOf`, the storage keeps the versions of its own writes until their echoes come (option `echoWindow`, 30 seconds by default). The echo of an older own write does not write over a newer local write (the EchoLedger rule of Graph).
  - `EventsChangeFeed` of `@procedures/store` is the feed of the change events. Its source is a `Client`, a `WebSocketTransport` or another transport. It treats the events as hints: a gap of the numbers, a lost event, a hint and each confirmation of the subscription call `onGap()`.
  - The core collection procedures publish `CollectionChangeEvent` `{ since, version, changed, deleted, origin }` on `ctx.bus`, under the topic `collections.<name>` (`collectionChangeTopic()`), while a subscriber listens. The changes come from `getChangesSince()` of the storage, and the events of one storage make a chain of versions. The option `changeEvents` of `createCollectionProcedures()` turns them off, or gives the topic of each call: the partition of CLI-17 goes there.
  - A value reaches a subscriber only through the checks of a read. By default, an event has the ids and the versions only, and `EventsChangeFeed` gives it to `onHint()`: `HybridStorage` reads the values with `changes`, and a hint with only deletes applies without a read. With `changeEvents: { values: true }`, an event also has `values`: each row `{ id, value }` passes the output filter of the host (`admitItem`) for each subscriber, and a refused id goes in `withheld`, so the storage pulls it.
  - `EventPublisher` refuses a topic whose reads the capability of the call does not permit (`FORBIDDEN`, `effects-exceeded`). Its new option `reads` gives the reads of a topic. The default, `collectionTopicReads()`, gives `collection:<name>` for `collections.<name>` and `collections.<name>.<partition>`. `ctx.admit` gives a procedure the output filter of its host for the data that it sends later.
  - The syncs of one `HybridStorage` run one at a time: the deltas and the hints of the feed, the pulls, the pushes, the reads after an own write and the mode switches. A remote delta and a full sync never run at the same time (Graph R18).
  - The write inputs of the collection procedures take an optional `origin` (1 to 256 characters). The procedure gives it to the storage and to the event. A server before this change ignores the field.
  - `Client.subscribe()` and `Client.events()` subscribe to the topics of the bus of the server through the middleware and the context of the client. A subscription has no deadline: the timeouts of the client do not apply to it, and only `metadata: { timeout }` in its options gives one.
  - New exports: `collectionChangeTopic`, `CollectionChangeEvent` and `CollectionChangeEventsOptions` from `@procedures/client`, `./browser` and `./procedures`. `EventsChangeFeed`, `MemorySyncStateStore`, `SyncStateError` and the types `RemoteChangeFeed`, `RemoteChangeListener`, `RemoteChanges`, `EventSubscriber`, `ChangeEventSource`, `EventsChangeFeedOptions`, `SyncState`, `SyncStateChange` and `SyncStateStore` from `@procedures/store`. `IndexedDbSyncStateStore` and `MemorySyncStateStore` from `@procedures/store/indexeddb`.

## 0.8.0

### Minor Changes

- 4b09a03: `debounceChannel()` and `throttleChannel()` take a `Duration`, as every other time of the client does since 0.3.0. A plain number of milliseconds throws a `TypeError`. A new option `clock` gives the clock of their timers, for example a fake clock in a test. MINOR: a breaking change of a signature (the API is before 1.0.0).
  
  Migration: `debounceChannel(bus, "in", "out", 300)` becomes `debounceChannel(bus, "in", "out", ms(300))`.
- 698e24d: Three gaps of the remote events (`documentation/EVENTS.md`) are closed. The option `backoff` of a subscription changes, so this release is breaking for a caller that gives it.
  
  - **Shared subscriptions.** The subscribers of the same topics with the same options on one transport share one call: one `request` on the wire, with a count of its subscribers. Only the last unsubscribe sends the `cancel`. Before, each `subscribeRemote()`, `remoteEvents()` or `transport.subscribe()` made its own call. Each subscriber keeps its own id, its own `ready` and its own queue of at most 1024 events. A late subscriber gets no replay: its `ready` resolves at once, and its `seq` starts at 1. An error or an end of the shared call goes to each subscriber. `WebSocketServerTransport` shares the subscriptions of one connection.
  - **The end at `clear()`.** `clear()` and `clearAll()` of the bus of the publisher end each subscription of a cleared topic. The subscriber first gets the events of the queue, then the error `TOPIC_CLEARED` (new protocol code, HTTP 410, not retryable) through `onError`, `ready` or the iterator. Before, the listeners went, and the subscriber saw no end. The new option `onClear` of `EventBus.on(channel, handler, { onClear })` (type `EventListenOptions`) gives the same notice to a local handler.
  - **The limit of the resubscribe.** The new option `maxAttempts` (default 10) is the number of resubscribe tries without a confirmation. When the tries run out, the subscription ends with a `SubscriptionError` that has the code of the last failure. Before, a subscription over HTTP resubscribed forever. The WebSocket transport uses `reconnect.maxAttempts` (default `Infinity`), so its behavior stays. The new option `clock` is the clock of the backoff, for a fake clock in a test. `SubscriptionHooks` has the new fields `maxAttempts` and `clock`.
  
  Migration: the option `backoff` is an object of durations (type `ResubscribeBackoff`), with the names of the `reconnect` options of `WebSocketTransport`: `initialDelay` (default `ms(250)`), `maxDelay` (default `seconds(30)`), `backoffMultiplier` (default 2) and `jitter` (default 1). Before, it was a function of milliseconds. A function or a plain number throws a `TypeError` at the call. For the old behavior over HTTP, give `maxAttempts: Infinity`.
  
  ```ts
  // Before
  subscribeRemote(transport, "orders.created", handler, { backoff: (attempt) => Math.min(30_000, 500 * 2 ** (attempt - 1)) });
  // Now
  subscribeRemote(transport, "orders.created", handler, { backoff: { initialDelay: ms(500), maxDelay: seconds(30), jitter: 0 }, maxAttempts: Infinity });
  ```
- d25805a: `ProcedureServer.useStorage` with `close` waits for the calls on the old storage before it closes it. Before, it closed the old storage at once, and a call that started on it could fail as closed.
  
  MINOR: the call of `useStorage` with `close` can now take up to 30 seconds to resolve. That is a change of behaviour that a caller can see. Give `grace: ms(0)` for the old behaviour.
  
  - The new calls use the new storage at once. The server waits only for the calls that took the old storage. A stream holds its storage until its end.
  - The new option `grace` of `UseStorageOptions` is the longest wait, a `Duration`. A plain number throws a `TypeError`. The default is 30 seconds, `TIMER_DEFAULTS.server.storageGraceMs`. 0 closes at once.
  - When the time ends, the server closes the old storage. A call that still uses it then fails with the error of a closed storage.
  - The new option `clock` of `ProcedureServerOptions` is the clock of this wait. A test gives a fake clock.

### Patch Changes

- 4b09a03: New `callerOf(...modules)` in the root and the browser entry. It gives a function that runs the procedures of the modules and gives one value. It makes the registry of the modules at the first call and does not use the global registry. An app wrote the three steps itself before: `createRegistry`, `invokePath` and `outputValue`. PATCH: a new export (the API is before 1.0.0).
- aa6e3aa: `ApiStorage` has `getIds()`. A full pull through it does not read each entry for the ids.
  
  - The collections have the procedure `collections.<name>.ids`. It gives the ids in the order of the entries, without the values. Its effects read the collection and write nothing. A storage without `getIds()` gives the ids of its entries.
  - The `CollectionStorage` of the core has the optional method `getIds()`, as the `CollectionStorage` of `@procedures/collections` has.
  - `ApiStorage.getIds()` uses the procedure `ids`. An older server without it answers `NOT_FOUND`. Then the storage reads the ids from the entries, and it does not ask for `ids` again.
  - `ApiStorageOptions.operations` takes `ids`, the name of the operation. The default is `ids`.
- 4b09a03: `bus.once()` rejects with an `AbortError` when `clear()` or `clearAll()` removes its channel. Before, its promise never settled.
- 600c497: A server on port 0 tells its real port.
  
  - New `HttpServerTransport.port()` returns the port that the server listens on. With the option `port` 0, the system gives a free port, and the function returns that port.
  - `peer.getEndpoints()` gives the real port of each HTTP and WebSocket endpoint. Before, a peer on port 0 gave the address `:0`.
  - The tests of the body and the stop of the peer listen on port 0. Before, a helper found a free port and closed it before the peer took it, so one CI run failed with `EADDRINUSE`.
- 7c2e7f7: The `onAfterRetry` hook of `createRetryMiddleware` hears of a failure when the reader stops at the error item. A `Client` with `throwOnError` (the default) stops there. Before, the hook ran after the yield of that item, so it ran only for a success. Now it runs when the call ends: after the last item, or when the reader stops. A thrown error and an abort still do not call it. PATCH: a bug fix.
- 90ea741: A procedure can declare its rules under a root of the files in `metadata.fsRoot` (the new type `FsRootRules`): the inputs that name a path, or the reason that a root cannot confine it. A handler gets `ctx.caller`, the procedure whose handler made the nested call. The framework sets it from the invocation, so an input cannot change it (roadmap R33).
- c4cfa34: `ProcedureServer.useStorage` with `close` keeps an old storage open while another collection still uses it. The server closes it when the last collection leaves it. Before, the close broke the calls of the other collection.

## 0.7.0

### Minor Changes

- 841d083: An NDJSON stream over HTTP gets keep-alive lines. Before, a proxy or a client with an idle timeout (for example 300 s) closed a long procedure that was quiet for that time.
  
  - `HttpServerTransport` writes a keep-alive line, a blank line, after each quiet time of the new option `keepAlive` (default `seconds(15)`, `TIMER_DEFAULTS.httpServer.keepAliveMs`). Each line starts the time again. No keep-alive line comes after the `done` line, an `error` line, an abort or a closed connection. `keepAlive: false` turns it off.
  - The new option `clock` of `HttpServerTransport` is the clock of the keep-alive timers. A test gives the `fakeClock` of `@mark1russell7/service/testing`.
  - A keep-alive line has no `seq`, so the sequence check of the reader sees no gap. `WIRE-PROTOCOL.md` specifies the line: it is an additive change of protocol v1, because each reader skipped a blank line before.
  - New `writeNdjsonStream(res, items, options?)` in `@procedures/client/node`. It writes the NDJSON stream response of protocol v1 for a `ServerResponse` of `node:http`, without Express. It writes the headers, the `item`, `done` and `error` lines with `seq`, and the keep-alive lines. It waits for `drain` when the buffer is full, and it stops when the connection closes or `signal` aborts. Its options are `signal`, `keepAlive`, `errorOf` and `clock`. `HttpServerTransport` uses it, so the two write the same bytes.
  - `HttpTransport` gives each item of an NDJSON stream the metadata key `stream` with the value `true` (the new constant `STREAM_ITEM_METADATA_KEY`). The error item that ends the stream has it too. The key does not cross the wire, and the client removes a key `stream` that the peer sent.
  - When the client goes away while the handler is quiet, the writer of the stream stops at once. Before, it waited for the next item of a handler that ignores its signal.

### Patch Changes

- 389b054: A token check no longer tells the length of the token through its time. The peer compares the SHA-256 digests of the two tokens with `timingSafeEqual`. The `tokenMatches` of the client, which runs in a browser too, compares each character of the expected token for each presented token. Before, a token of another length returned at once. The re-audit of jarvis found it.

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- 09e5566: Remote events (`documentation/EVENTS.md`): a peer subscribes to the topics of the event bus of another peer. A subscription is a streaming call of the procedure `events.subscribe`, so it uses the frames of each call: credit is the backpressure, and a cancel is the unsubscribe. It works over WebSocket in the two directions, HTTP with NDJSON, a message port and the local transport. The protocol stays v1.
  
  - `WebSocketTransport.subscribe(topics, handler)` gives the unsubscribe function, with the `ready` promise of the first confirmation. `WebSocketTransport.events(topics)` gives an async iterator. After a drop, the transport resubscribes on the new connection.
  - `subscribeRemote()` and `remoteEvents()` do the same over each transport. After a failure that a retry can repair, they resubscribe with a backoff.
  - `ProcedureServer` has the option `events`: a bus, a topic rule (`topics`), an `allow` function and a `buffer`. The server pins `events.subscribe` outside its registry, so it is not an MCP tool. `ProcedureServer.publish()` emits on the bus. `stop()` ends each subscription with `UNAVAILABLE`.
  - `WebSocketServerTransport.subscribe(connectionId, topics, handler)` and `events(connectionId, topics)` subscribe to the bus of a client. `LocalTransport` takes an `EventPublisher` with its option `events`.
  - The delivery is at most once, in the order of `emit()`. When the queue of a slow subscriber is full, the publisher drops the oldest event, and the next event tells the loss (`dropped`).
  - The new error code `TOPIC_NOT_FOUND` (404) is for a topic outside the topic rule. A topic that `allow` refuses gives `FORBIDDEN` with the reason `topic-not-allowed`.
  - The `onEvent` option of `WebSocketTransport` is now a wrapper: it gets each event of each subscription of the transport. A raw `event` frame still goes to it.
  - The WebSocket client does not warn about a `stream` frame of a call that it cancelled. The WebSocket server ignores a late `stream`, `response` or `error` frame of a call that it stopped. Before, it answered such a frame with an `error` frame.
- ab77f75: Sequence numbers of the stream frames (`documentation/WIRE-PROTOCOL.md`). Before, a duplicate `stream` frame gave a duplicate item. The change is additive, and the protocol stays v1.
  
  - Each `stream` frame has the field `seq`: 1 in the first frame of a call, and one more in each next frame. The end frame has a number too. Each NDJSON line `item` or `done` has the same field.
  - The receiver drops a frame whose `seq` is not above the last one. Thus a duplicate frame or a late frame gives no item.
  - A gap does not end the stream, because the delivery is at most once. The next item has the number of lost frames in the metadata key `stream-gap` (`STREAM_GAP_METADATA_KEY`), and the console gets a warning. The receiver gives back the credit of the lost frames.
  - A frame without `seq` comes from an older peer. The receiver takes it as before.
  - The rules apply to WebSocket in the two directions, the message port and HTTP with NDJSON. The local transport has no frames.
  - `WebSocketMessage` has the optional field `seq`.
- a47bee6: The hosts serve the remote events (`documentation/EVENTS.md`).
  
  - `hostPolicy()` takes the option `events`: the topic rule, with an optional bus, `allow` function and buffer. `procedureServerOptions()` gives it to the `ProcedureServer`, which pins `events.subscribe`. `HostPolicy` has the new field `events`.
  - `procedure-server` and `mark serve` have the option `--events <patterns>`. The option is repeatable, and it takes comma-separated patterns: exact names, prefixes (`orders.*`) or `*`. `parseTopicPatterns()` checks them.
  - `mark --server` has the same option `--events`.
  - These hosts always serve `events.subscribe`. Without `--events`, they serve no topic, and each subscription gets `TOPIC_NOT_FOUND`. The bus is the global bus, which is also the `ctx.bus` of their procedures.
  - The MCP server serves no events, because its transport carries only MCP.
  - `mark --port`, `--host`, `--transport` and `--events` without `--server` are an error now, also before `serve` and `mcp`. Before, `mark --port 4000 serve` ignored `--port`.
- bc74091: Two changes for the contract of `CollectionStorage`:
  
  - The collection procedure `collections.<name>.get` takes the input `found: true`. Then its output is `{ found, value }`, so a stored `null` and a missing id give different outputs in one call. Without `found`, the output is the item, as before.
  - `ProcedureServer.stop()` and `closeStorages()` close each storage one time, also a storage of two collections, and remove the storages from the server. Before, a server that started again used the closed storages.

### Patch Changes

- 0f75644: The dependencies go to `@mark1russell7/algebra` `^0.7.0` and `@mark1russell7/service` `^0.4.1`. A host that uses algebra 0.7.0 gets one copy of it. Algebra 0.7.0 only adds to 0.6.0.

## 0.4.0

### Minor Changes

- d919678: `ERROR_REGISTRY` agrees with `ERROR_CODES` of the wire protocol. `ERROR_CODES` is the source: the registry has an entry for each code of the protocol, and that entry takes its HTTP status and its retry flag from `ERROR_CODES`. Changes that a caller sees:
  
  - `TIMEOUT` has the status 504 and is not retryable (before: 408, retryable).
  - `INTERNAL_ERROR` is not retryable (before: retryable).
  - `ABORTED` has the status 499 (before: none).
  - The codes of the protocol that the registry did not have (`HANDLER_ERROR`, `VALIDATION_ERROR`, `UNAVAILABLE` and the others) have entries, with the meaning of the protocol as their texts.
  - `errorCodeToHTTPStatus` gives the status of `ERROR_CODES` for a code of the protocol, for example 504 for `TIMEOUT`.
- b2a1a1e: A handler error keeps its own code on each face, as `WIRE-PROTOCOL.md` says. `errorResponse` (the server, and through it HTTP, WebSocket and MCP) and `LocalTransport` give the code of the thrown error when it is a string. Before, they changed it to `HANDLER_ERROR` for a value, and `LocalTransport` also for a stream. An error without a code is still `HANDLER_ERROR`.
  
  The HTTP status follows the code: a code of `ERROR_CODES` gets its status, another code of `ERROR_REGISTRY` gets the status of the registry, and each other code gets 500. For example, a handler error with the code `UNAVAILABLE` now gives 503.
- 057d69a: `client.import` gives `success: true` only for a procedure reference: an object whose `$proc` is a list of texts. Other JSON, for example `42`, an object without `$proc` or a list of calls, gives `success: false` and an error. Before, each JSON value gave `success: true`.
- 057d69a: `client.isObject` gives true only for a plain object: an object literal, or an object without a prototype. A `Date`, a `Map` or another class instance gives false. Before, each object that is not an array gave true.
- 057d69a: `client.stringifyJson` and `client.export` refuse a missing value (undefined) with `VALIDATION_ERROR`, because undefined has no JSON text. Before, the call failed with `OUTPUT_VALIDATION_ERROR`. The `value` field of `client.stringifyJson` and the `procedure` field of `client.export` are now required. A value without JSON text, for example a function, gives an error from `client.stringifyJson` and an error result from `client.export`.
- 057d69a: `client.mod` refuses `b = 0` with the error `Division by zero`, as `client.divide` does. Before, it gave `NaN`.
- afd6a19: The `client-registry` command is removed. `mark` finds the packages, and the `/register` entries register them.
- 057d69a: `client.unique` compares the items by value: two equal JSON values are duplicates. An array compares by its items in order, and a plain object by its fields in any order. With `key`, the values of the field compare by value too. The result keeps the first item of each value, in the order of the input. Before, objects and arrays compared by reference, so two equal objects both stayed.
- 4e751da: The new entry `@procedures/client/node` exports a `WebSocketTransport` whose sockets are of the `WebSocket` class of the `ws` package. A Node application gets `terminate()` without the option `webSocket`: a drop by the heartbeat or by the time limit of the handshake ends the socket at once. The option `webSocket` still gives another class. The other entries keep the global `WebSocket`, and the browser entry does not import `ws`.
  
  A socket of the `ws` package that closes during its handshake emits an error. Before, the transport removed its error handler first, so a handshake timeout or a `close()` during the handshake ended the process with an uncaught error. The transport now keeps a handler that ignores that error.

### Patch Changes

- 057d69a: The description of the `match` field of `client.filter` lists all 11 modes. Before, it did not name `gt`, `gte`, `lt` and `lte`.
- 057d69a: The input schemas of `client.not`, `client.all`, `client.any` and `client.none` say "values", not "values or calls". These procedures do not run a call in their operands: a call is an object, thus truthy. In a program, the calls of their input run first, as for each procedure that is not control flow. `client.and` and `client.or` run calls. The behavior does not change.

## 0.3.0

### Minor Changes

- b2a3e3a: The bidirectional peer (roadmap R24). The calls over one WebSocket go in the two directions with the same frames: a request, then a response, an error or a stream with credit, and a cancel. The client serves the calls of the server with the new `serve` option of `WebSocketTransport` (for example a `ProcedureServer` with its registry), so a call gets validation, the expose rule, the capability, streaming, cancel, the signal and the deadline. The server sends them with `callConnection()`, or with a `Client` over `transportFor(connectionId)`, and a peer has `connections()` and `clientFor(connectionId)`. `callClient()` and `onServerRequest` stay as wrappers of the new calls, and the old `server-request` frames are no longer sent. The shared code of the two sides (`OutgoingCalls`, `IncomingCalls`) serves the calls of the client too.
- a8c47f1: The cache (roadmap R13). Two calls with the same key at the same time make one request: the second one waits for the first and gets a copy. With the new option `effects` (for example `effectsIn(registry)`), a write that succeeds deletes the cached entries of the methods that read one of its resources. `invalidateCache(middleware, matches?)` deletes entries by method. A response whose key changed during the call is not stored, so an auth layer inside the cache cannot give the response of one user to another. The idempotency key and the remaining time of a call are not part of the key.
- 381ce3a: Cancellation scopes and a graceful stop (roadmap R14). `ProcedureServer.stop({ grace })` refuses new calls with a retryable `UNAVAILABLE` and lets the calls in flight end until the grace time ends, then aborts them (`peer.stop({ grace })` passes it; `mark --server` and the `server` bin give 5 seconds). The signal of each call joins its request and the server, and `callsInFlight` counts the calls, streams included. `exec()` and `execStream()` take a `signal`. `LocalTransport` takes `interceptors`, `capability` and `clearanceOrder`, and gives a call the deadline that its client sends, so a client timeout ends a local handler too. `mark` aborts a command in its own process on the first Ctrl+C. A remote leaf of `route()` and `server.call` send the deadline of their caller, and `server.call` relays the signal.
- ae7f05f: The clock of the timers, and the state machines as data (roadmap R35). The retry, the circuit breaker and the WebSocket client take a `clock` option: a `Clock` gives the monotonic time and starts the timers, and `realClock` is the default. The shape is the `Clock` of `@mark1russell7/service`, so its `fakeClock` fits, and a test gets exact times. `WEBSOCKET_CONNECTION_MACHINE` and `CIRCUIT_BREAKER_MACHINE` are `mark1russell7.machine/1` documents with their knobs, events and timers. The WebSocket client and the circuit breaker report each change of their state to `onTransition`, and `replayTransitions()` replays the reports against a document. The heartbeat of the WebSocket client uses one timer for each interval in place of `setInterval`.
- 7873940: The collection mode switch (roadmap R28). `HybridStorage` has four modes: `local-only` (no remote call, each write waits in the queue), `write-through`, `write-back` and `remote-only` (no local copy). The option `mode` gives the first mode, and `writeStrategy` stays as a deprecated name of it. `setMode()` changes the mode while the storage operates. The switch waits for the operations that run, sends the queue to the remote first, and syncs the local copy when it leaves `local-only` or `remote-only`. A switch to `remote-only` drops the local copy only after the flush. When the remote fails, the mode stays and `setMode()` throws `ModeSwitchError`. A switch to `local-only` makes no remote call.
  
  The queue is durable: the option `queueStore` takes a `QueueStore` (`load`, `append`, `replace`, `clear`). `MemoryQueueStore` is the default, and `FileQueueStore` of the new entry `@procedures/store/file-queue` keeps the queue in a JSON Lines file. A write ends only after the store kept it (`QueueStoreError` when it cannot). A new storage with the same store loads the queue, shows its writes and sends them. The modes `write-back` and `local-only` always use the queue: before, `write-back` with `offlineQueue: false` never sent a write.
  
  A sync asks for the changes since the version of the last sync. Storages get the optional `getChangesSince(version)` (`InMemoryStorage` keeps a change log with tombstones, `ApiStorage` calls the new collection procedure `collections.<name>.changes`), and a remote without it gives all its entries. The option `versionOf` gives the version of an item: with versions, a conflict is a queued local write of an id whose remote version changed, and `conflictResolution` decides (`error` throws `ConflictError`). The option `pullInterval` starts a periodic pull. Storages get the optional `flush()`, and `ProcedureServer.useStorage(name, storage, { drain, close })` flushes the old storage before the change. `createSyncedRegistry({ type: "hybrid", mode })` takes the mode, and the synced registry has `setMode()` and `getMode()`.
- a70d445: `procedure.define` keeps the effects of its body (roadmap R22). `programCheckInterceptor()` checks the body of each definition, refuses a body with an error, and gives its effects to `procedure.define` in the internal metadata key `__inferredEffects`. Each transport removes `__` keys from a request, so a remote caller cannot claim effects. The defined procedure keeps them as `metadata.inferredEffects`, and `toolHints()` uses them: before, a defined procedure had no hints. The admission still examines each nested call. New exports: `INFERRED_EFFECTS_METADATA_KEY`, `inferredEffectsOf()`, `effectsValue()`.
- bc70357: The file procedures can have a root (roadmap R33). `createFsModule({ root })` gives the procedures of `fsModule`, and each path of each input must be in the root folder. A relative path starts at the root. Without a root, the procedures operate as before.
  
  The procedures refuse a path that goes up with `..`, an absolute path outside the root and another drive. They also refuse a symlink or a junction that goes out of the root. The error has the code `FORBIDDEN` and the new reason `outside-root` (the type `ForbiddenReason` of `@procedures/client`). For a path that does not exist, the check uses the real path of the nearest existing folder. `registerFsProcedures(registry, { root })` takes the root too.
- 07cc998: The procedures of a host (roadmap R19). `hostProcedures(source)` gives `host.health` (the state, the uptime, the procedures and the calls in flight), `host.info` (the id, the start time, the endpoints and the runtime) and `host.metrics` (the counts of `metricsInterceptor` for each procedure). A peer pins them on its server, so the registry of its caller does not change, and counts its calls (option `metrics`, default true). `ProcedureServer.stopping` tells when a graceful stop runs.
- a6b01a9: The new package `@procedures/http` (roadmap R38) has four procedures: `http.request` (each method, a body of text, JSON or base64, and a response as text, JSON or base64), `http.json` (a GET or a POST of JSON), `http.ndjson` (a stream of the JSON values of the lines) and `http.sse` (a stream of server-sent events). `http.request` and `http.json` declare `reads: ["network"]` and `writes: ["network"]`. The two streams send only a GET, so they declare `writes: []`, and they declare `stream: { unbounded: true }`.
  
  The default module reaches each public host and refuses loopback, private, link-local, shared, multicast and reserved addresses. `createHttpModule({ allow, publicHosts, maxRequestBytes, maxResponseBytes, resolve })` gives the procedures with more hosts: host names, wildcards, IP addresses and CIDR ranges, each with an optional port. The check resolves the host name, and the connection uses only the addresses that passed the check. Each redirect gets the same check. A refusal has the code `FORBIDDEN` and the new reason `host-not-allowed` (the type `ForbiddenReason` of `@procedures/client`).
  
  A call stops at the earliest of its deadline, the abort of the caller and `timeoutMs`. A stream also stops after `idleTimeoutMs` without data. The body of a response has a limit of 10 MiB by default, and the limit counts the decoded bytes of a compressed body.
- c799cdd: `HybridStorage` cannot lose data (roadmap R2). A sync gets the ids of the remote items from the new `getEntries()` of a storage (the collection procedure `collections.<name>.entries`), or else from `keyOf`. A remote item without a key stops the sync with `MissingKeysError` before any change: before, such a list emptied the local cache. A write-through that the remote cannot take waits in the queue and throws `PendingWriteError`, and a timer sends the queue. A write that the remote refuses is undone in the local cache. A full queue refuses a write with `QueueFullError`: before, it dropped the oldest operation. A second try of a write replaces its queued operation. A write-through sends the older queued operations first. The reads wait for the first sync.
- 5b9264e: One deadline model (roadmap R10, REV-6). The overall timeout and the remaining time that a caller gives (`procedure-timeout`) set the deadline of a call, and each try sends its remaining time as `procedure-timeout`. So the server stops the handler when the client stops waiting: before, the timeouts of the client middleware did not reach the server. The timeout of one try is at most the remaining time. The client no longer sends `X-Timeout`, which the server ignored. The new preset `resilience({ overall, perAttempt, retry, breaker, cache, rateLimit })` puts the layers in the correct order, and `createCombinedTimeoutMiddleware` is now that preset (deprecated).
- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- ff62281: One trace from the client to the handler (roadmap R16). The tracing middleware makes W3C ids by default and sends a W3C `traceparent` in the metadata (and as the HTTP header `traceparent`). The tracing interceptor of a server continues that trace: the span of a call of the host has the trace of the client and the span of the client as its parent (`remoteParent: true`). The nested calls of a handler carry its span, also to a remote server. The spans of the interceptor have W3C ids. Before, the client and the server made two traces that nothing joined.
- d81d0ed: The transport over a message port (roadmap R27). `PortTransport` sends calls over a Web Worker, a `MessageChannel` or a `worker_threads` port, in the two directions, with the frames of the WebSocket transport: streams with credit, cancel and errors. Its `serve` option takes a `RequestHandler`, for example a `ProcedureServer`. The site uses it for its two workers in place of two protocols of its own.
- 061fa22: The timers of the client come from `@mark1russell7/service` 0.4.0 and `@mark1russell7/algebra` 0.5.0 (roadmap R37). The two packages are dependencies of the client now.
  
  - The clock is `platformClock()` of `@mark1russell7/service/clock`. The types `Clock` and `Cancel` come from there too, and `Cancel.unref` is read-only.
  - The heartbeat of the WebSocket client is `heartbeat` of `@mark1russell7/service/heartbeat`. A ping whose send throws is a miss. Before, the error left the timer.
  - `reconnectDelay` and the retry middleware use `backoffDelay` of `@mark1russell7/service/backoff`. The delays are the same.
  - `replayTransitions` uses `replay` of `@mark1russell7/algebra/replay`. A jump message says "the runtime left", not "the code left".
  
  The four entries import nothing else, and together they have 1.3 kB of gzip.
- cfb9d69: Retry obeys the effects (roadmap R1). After a try with an indeterminate outcome (a reset, a closed WebSocket, the timeout of one try), the retry middleware sends the call again only when it is idempotent: the `idempotent` option (`true`, or a function such as `idempotentIn(registry)`), or `retry: { idempotent: true }` in the context of the call. A refused connection and a retryable error of the server still go again. Each try of one call sends the same `idempotency-key`, and `ProcedureServer` runs a keyed call to a procedure that is not idempotent one time (option `idempotency`). The error items of the transports tell the delivery of a failed try (`deliveryOf`).
- 43f7de5: Retry and the circuit breaker (roadmap R12). The retry middleware has a retry budget (`budget`, default: 0.2 of the calls and at least 10 retries a second), so a failing service gets a fraction more requests and not `maxRetries` times more. The delay has full jitter by default (`jitter: 1`: a random time from 0 to the backoff, before ±10 percent). A server that asks for a wait gets it: `retryAfterMs` of a thrown error becomes the `Retry-After` header and the `retry-after` metadata, and the retry waits at least that long. `maxAttempts` in a context counts the tries, as its name says (before, it counted the retries). The circuit breaker counts only the failures of availability (`isAvailabilityFailure`: UNAVAILABLE, TIMEOUT, a stopped server, a gateway error, network errors): an abort or a validation error no longer opens it. Its windows use a monotonic clock. `ApiStorage` asks a retry middleware of its client for one try, so the two loops cannot multiply.
- b07bb50: The server-transport contract (roadmap R18). `RequestHandler` (`handle(request)`) is the contract of a server transport, and the HTTP and WebSocket transports take one. A `ServerRequest` has `credentials` (the bearer token of `Authorization`, or of the `token` query of a WebSocket) and `principal`. `ProcedureServer` takes `token` (a host policy gives its token) and examines it for each network request, and `authenticate` gives the principal. Before, only the Express middleware of the peer examined the token. The secret headers (`Authorization`, `Cookie`, `Proxy-Authorization`, `X-Api-Key`) no longer go into the metadata of a request, so a handler and a nested call do not see them. `LocalTransport` answers `ABORTED` at once when its caller aborts, as HTTP and WebSocket do. A conformance suite runs the same calls through Local, `handle()`, HTTP, WebSocket and MCP.
- 4a3bfa1: The timer law of systems for the client (roadmap R34). The new package `@procedures/systems` binds the times of the middleware, the transports and the server to the symbols of the law of `@mark1russell7/service`, and examines six rules of the client: `lintTimers()`, `bindingOf()`, `CLIENT_RULES` and the procedure `systems.timers`. The core exports its default times as data: `TIMER_DEFAULTS`. The middleware, the transports and the server read them. The law found two defaults that broke it, and they change: the WebSocket client pings each 20 s, not 30 s, so it finds a dead connection before a call on it times out. The WebSocket server pings each 15 s, not 30 s, so it finds a dead client before its call to the client times out.
- fb30718: Typed durations (roadmap R11). This change breaks the API. Each public option that is a time takes a `Duration` of `@mark1russell7/quantity`, made with `ms()`, `seconds()`, `minutes()` or `hours()` of `@procedures/client`. A plain number is a type error, and at run time the option throws a `TypeError` that names it. This covers the timeouts and `resilience()`, the retry delays, the cache, the circuit breaker, the rate limit, the HTTP, WebSocket and mock transports, the WebSocket server heartbeat, `timeoutInterceptor({ limit })` (was `ms`), `hostPolicy({ timeout })` (was `timeoutMs`), the idempotency cache (`ttl`, was `ttlMs`), `ApiStorage`, `HybridStorage`, the synced registry and `connect()` of the peer. The per-call overrides in a context (`timeout`, `retry.delay`, `cache.ttl`) and the `route()` overrides (`timeout.overall`, was `timeout.ms`) take durations too. The wire and the inputs of procedures keep milliseconds.
  
  Migration: `createOverallTimeoutMiddleware({ overall: 5000 })` becomes `createOverallTimeoutMiddleware({ overall: seconds(5) })`.
- c5528e4: Streams that can run without an end (roadmap R15). A procedure declares `stream: { unbounded: true }` in its metadata (`docker.logs`, for `follow`, and `shell.stream` do). `ProcedureServer` marks its stream response, and the faces that collect a stream obey the mark: HTTP without NDJSON answers 406 `NOT_ACCEPTABLE` at once (before, the request waited until a timeout), and the MCP transport stops the stream at its `streamLimits` (default 100 items or 30 seconds) and says so in the result (before, `docker.logs` with `follow` ended only at the time limit of 10 minutes).
- fee5d9c: WebSocket time limits (roadmap R3). The handshake of the client has a time limit (`connectionTimeout`): an address that never answers no longer keeps the socket in `CONNECTING`. The reconnect delay has full jitter by default (`reconnect.jitter`), so the clients of a server that restarted do not come back at the same moments. The client drops a connection after `heartbeat.misses` pings without a pong (default 1, as before). The server pings each connection and closes one that misses 2 pongs (`WebSocketServerTransport` option `heartbeat`), so it finds a client that went silent.
- 21f7743: Wire protocol v1 (roadmap R25). `WIRE-PROTOCOL.md` specifies the HTTP and WebSocket formats. A WebSocket connection starts with a `hello` frame of each side (`getServerProtocol()` on the client), and HTTP sends the header `Procedures-Protocol: 1` on each request and response. A side refuses a newer version with `PROTOCOL_VERSION`. `ERROR_CODES` is the one list of error codes and HTTP statuses of all faces. The reason of a `FORBIDDEN` error travels on each face: in the HTTP error body, in the item metadata of the HTTP and local transports, and in the `_meta` of an MCP error result. `Method.version` is deprecated: the server ignores it. Golden tests in `packages/client/test/wire/` pin the frames.
- 31a0b46: The WebSocket client has the option `webSocket`: the class of its sockets. In Node, give the `WebSocket` of the `ws` package. A drop by the heartbeat or by the time limit of the handshake then ends the socket at once with `terminate()`.
  
  The global `WebSocket` has only `close()`, which waits for the answer of the peer. The harness cells of roadmap R36 showed that a socket to a dead peer then stays open until the kernel stops it: 924.6 seconds with the default settings of Linux.

### Patch Changes

- ddea529: The array procedures read only the own fields of an item (roadmap R29, as R6 for the object procedures). Before, a key such as `toString` read the function of the prototype: `client.count` counted each item, and `client.pluck` gave functions. This applies to `sort`, `unique`, `groupBy`, `filter`, `where`, `pluck`, `partition` and `count`.
- 0c627f8: The catalog test of the core procedures found four defects (roadmap R29). `client.replace` gives the replacement as text: before, the replacement of the first match changed `$$` to `$` and `$&` to the match. `client.groupBy` accepts a group with the name of a field of `Object.prototype`: before, a group `constructor` or `toString` failed. `client.arrPick` picks only own fields, as `client.pick` does: before, `toString` picked a function of the prototype. The input schema of `client.template` describes its `{{name}}` placeholders: before, it described `{name}`.
- 540f8d9: A `$never` operand of a control-flow procedure is data (roadmap R4). Before, only a step of `client.chain` obeyed `$never`: a `$never` branch of `client.conditional`, a try of `client.tryCatch`, a task of `client.parallel` and the `fn` of `client.map` started. A `fn` of `client.map` or `client.reduce` that is not one call is an error: before, it was ignored.
- b6daaec: The object procedures do not reach a prototype (roadmap R6). `client.set`, `client.get` and `client.has` refuse a path segment `__proto__`, `constructor` or `prototype`: before, `client.set` with the path `__proto__.x` changed the prototype of its result. `client.get`, `client.has` and `client.pick` read only own fields: before, `toString` gave a function of the prototype. `client.merge` and `client.omit` set own data properties.
- aa67cc7: The client uses `@mark1russell7/quantity` 0.2.0. Its root entry does not import zod. The entries of the client that use zod for their schemas still have it, but a bundle that takes only the Durations no longer gets zod.
- bd0b626: Four fixes that the tests of roadmap R30 found.
  
  - An abort of the caller ends the wait of the timeout middlewares at once, also when the transport ignores the signal. The caller gets `ABORTED`. Before, the caller waited for the timeout and got `TIMEOUT`, and the circuit breaker counted a failure.
  - `WebSocketTransport` starts its reconnects at once when a handshake fails on Node 22. The WebSocket of Node 22 gives an error event and no close event, so before, each try waited for `connectionTimeout`.
  - `createErrorFromException` gives `TIMEOUT` for the reason of `AbortSignal.timeout()`, and `SERIALIZE_ERROR` for a circular structure. Before, it gave `ABORTED` and `PARSE_ERROR`.
  - `isAvailabilityFailure` is true for `CONNECTION_CLOSED`, so the circuit breaker counts a closed connection.
- a6be873: The timeout middleware keeps the reason of an abort when the platform has no `AbortSignal.any`. Its own composition of the signals now gives the transport the reason of the signal that aborted, as `AbortSignal.any` does. Before, the transport got a new `AbortError` in place of the reason of the caller.

## 0.2.3

### Patch Changes

- 15e48cf: Three fixes of the architecture review (2026-10-16). A `timeoutMs` that is not a finite number of zero or more asks for nothing: before, `NaN` removed the deadline. A procedure of `procedure.define` declares no effects of its own, so a read-only capability runs it and examines each nested call. `mcp.list-tools`, `mcp.serve`, `_discovery.announce`, `manifest.generate`, `server.create`, `procedure.export` and `lib.audit` read the registry of the call, not the global registry. `getProcedureInfos` and `watchProcedures` take a registry.

## 0.2.2

### Patch Changes

- 370b51a: A validation message gives the messages inside an issue: the message of a record key schema, of a map or set element, and of each branch of a union. Before, `Invalid key in record` hid the message of the key schema. Now: `portions.cups: Invalid key in record (write cup, not cups)`.

## 0.2.1

### Patch Changes

- a9dc8c8: `admitItem`, the output filter of a capability, can give a promise: a filter that looks up the clearance of a record waits for it. The type is `AdmitItem`.

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
- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- 44d3e30: `mark --version` and `client-registry version` show the version of the package. Before, they showed `1.0.0`. The help of `client-registry` links to the site, not to a placeholder repository.

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

### Breaking changes (from the versions on GitHub)

- `procedure.get` gives `{ found: false }` for a path that has no procedure. Before, it gave `null`. For a procedure, it gives `found: true` with the description.
- `procedure.list` lists the registry of the caller. It takes `namespace` and `includeMetadata`, and it marks the procedures of `procedure.define` with `runtime: true`.
- The core depends on no other package of the repository (roadmap 3.3, 3.2, 3.4):
  - The storage layer moved to `@procedures/store`: `ApiStorage`, `HybridStorage`, the synced registry (`createSyncedRegistry`, `SyncedProcedureRegistry`), the serialization, `createDynamicHandlerLoader` and the procedures `procedure.store`, `load`, `sync`, `remote` and `register`. The core no longer registers them.
  - The entry point `@procedures/client/collections` is gone. Import the data structures from `@procedures/collections`, and `ApiStorage`/`HybridStorage` from `@procedures/store`.
  - The procedure components moved to `@procedures/splay`. The entry point `@procedures/client/components` and the component exports of the root are gone.
  - The core declares `CollectionStorage` and `StorageMetadata` itself, with the shape of the interface of `client-collections`.
- New: `runtimeProgramOf(procedure)` gives the program of a procedure that `procedure.define` made. `isAsyncIterable` is exported.
