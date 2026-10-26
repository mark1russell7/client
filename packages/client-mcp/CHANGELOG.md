# @procedures/mcp-server

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0
  - @procedures/mcp@0.36.0

## 0.35.1

### Patch Changes

- f5c2407: PATCH: a new optional option whose default keeps the old behavior. The error policy of a server (roadmap CLI-80).
  
  - The new option `errors` of `Server` and `ProcedureServer` tells what an error tells the caller. A host gives it with `serverOptions`. `Server.handle()` applies it, so each face sends the same error: HTTP, WebSocket, MCP and a message port.
  - `expose: "all"` is the default. Each error goes to the caller as before.
  - `expose: "coded"` sends an error with a known code as it is. Each other error goes to the caller as `INTERNAL_ERROR` with the message `internal error` and its real retryable flag. It keeps only the metadata keys of the new option `keepMetadata`: by default the trace keys `traceparent` and `tracestate`. The server gives the real error to `onError`, or to `console.error` without `onError`.
  - A known code is a code of `ERROR_CODES` or of `ERROR_REGISTRY`, for example `NOT_FOUND` or `CONFLICT`. The new function `isKnownErrorCode(code)` does this check. `ECONNREFUSED` and a numeric code of MongoDB are not known codes.
  - The option `codes` adds the codes of the application that go out as they are, for example `QUOTA_EXCEEDED`.
  - The codes `OUTPUT_VALIDATION_ERROR` and `NO_OUTPUT` tell of a failure of the server, so `"coded"` hides them, with `INTERNAL_ERROR`, `HANDLER_ERROR` and `UNKNOWN`.
  - The server applies `map(error, { path, transport })` first, with the real error of its own class. Its result goes to the caller as it is, with its `retryAfterMs` and its conflicts. `undefined` gives the error to `expose`.
  - The policy applies to an error before a stream and to the error that ends a stream. A nested call of `ctx.client` keeps the real error.
  - The new optional field `transport` of `ServerRequest` names the face of a request. The HTTP, WebSocket, message port and MCP faces set it.
  - The last-resort catch of each face applies the same policy when `handle()` throws. This is true for the HTTP, WebSocket, message port and MCP faces, and for the tracked call of a host (`@procedures/peer`). The new function `lastResortError(handler, error, request)` and the new optional method `RequestHandler.exposeError()` do this. The logger gets each hidden error one time.
  - The new types are `ServerErrorPolicy`, `ExposedError` and `ErrorCall`. The new exports are `exposeError`, `lastResortError`, `HIDDEN_ERROR_MESSAGE` and `DEFAULT_KEPT_METADATA`.
  - An MCP result for an unknown tool has `_meta` with the code `NOT_FOUND`.
- cc80f74: PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.
  
  - The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
  - The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
  - The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1
  - @procedures/mcp@0.35.1

## 0.35.0

### Patch Changes

- @procedures/client@0.35.0
  - @procedures/mcp@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0
  - @procedures/mcp@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0
  - @procedures/mcp@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0
  - @procedures/mcp@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0
  - @procedures/mcp@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0
  - @procedures/mcp@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0
  - @procedures/mcp@0.29.0

## 0.28.1

### Patch Changes

- 2572f41: The MCP face stays on its listener through the drain (roadmap CLI-74).
  
  PATCH: a fix with no API change (D34).
  
  - Before, the mount of the MCP face stopped at the stage `stop intake`. On the listener of a procedures host, the listener closed, and each request got its plain 503. Thus the answer of an elicitation and a cancel did not reach a call in progress.
  - Now the handler of `mcpFace()` and `McpHost.handleHttp` have `until: "close transports"`, as a `RequestHandler` of `@mark1russell7/service/http`. The procedures host gives the `until` of the handler of each face to its mount.
  - During the drain, the answer of an elicitation, a cancel and a ping reach the session. A new session and a new GET stream get the 503 of the face. A new tool call gets `UNAVAILABLE` from the server.
  - The face ends the SSE stream of a cancelled call. The SDK sends no answer to a cancel, so that stream held the drain of the listener until its deadline.
  - Mount `host.handleHttp` itself, for example `listener.mount(host.handleHttp)`. A function that wraps it loses `until`. The dev-tools server mounts it in this way.
  - A change you can see: during a drain, a listener with the MCP face answers a new connection with 503 and `Retry-After` until the stage `close transports`. Before, the listener closed at the stage `stop intake`.
  - Note on the stop time: the cap of the drain does not change, and a stream of the face does not hold the drain past its deadline. A listener with the MCP face now answers a new connection with 503 until the stage `close transports`, and does not refuse it. The test `mcp-stop.test.ts` of `@procedures/peer` measures each stop on the fake clock.
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
- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1
  - @procedures/mcp@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0
  - @procedures/mcp@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8
  - @procedures/mcp@0.27.8

## 0.27.7

### Patch Changes

- 72718d7: The stop of the intake of `mcpFace()` and of the HTTP face of `createMcpHost()` ends the idle GET streams of the MCP sessions (roadmap CLI-72).
  
  PATCH: a fix with no API change.
  
  - This fix applies to both Streamable HTTP faces: `mcpFace()` on a procedures host, and `faces.http` of `createMcpHost()` under `declare(svc)`.
  - Before, each session kept its GET stream open until the close of the face. The drain of the listener counted each open stream as work in progress. Thus a host with connected MCP clients waited for the full cap of the drain at each stop, also with no call in progress. On the fleet site, six idle clients made each stop wait for its 4 s cap.
  - With this fix, the stop of the intake ends the GET stream of each session without a task in progress. The SDK ends the response in its protocol, so a client of the MCP SDK connects again, to the next server. Thus the drain waits only for the calls and the tasks.
  - A session with a task in progress keeps its GET stream, because the progress and the end of the task go on it. The stream ends with the work of the task.
  - After the stop of the intake, a new session and a new GET stream get 503 with `UNAVAILABLE` and `Retry-After`, as on the other faces. A POST or a DELETE of a session goes on, so a call in progress completes with its answer stream.
  - The test `mcp-stop.test.ts` of `@procedures/peer` measures the stop of `mcpFace()` on the fake clock of the host. The test `runner.test.ts` of this package measures the stop of `createMcpHost()` on the fake clock of its service.
- @procedures/client@0.27.7
  - @procedures/mcp@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6
  - @procedures/mcp@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5
  - @procedures/mcp@0.27.5

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
  - @procedures/mcp@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3
  - @procedures/mcp@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2
  - @procedures/mcp@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1
  - @procedures/mcp@0.27.1

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
  - @procedures/mcp@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2
  - @procedures/mcp@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1
  - @procedures/mcp@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/mcp@0.26.0

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

- 1d66fae: Deprecated (D13): the token options of the MCP face, and the token check of `guardMcpRequest`. The next MINOR of the client group changes them (roadmap CLI-2b). This release changes no behavior.
  
  - After the change, the server of the face checks the credentials of each request one time. The face has no token check of its own.
  - `HttpTransportOptions.token`: give the token to the server, for example `policy.token` of `createMcpHost()`. In `faces.http` of `createMcpHost()`, the token then becomes the token of the policy. A different token in the policy throws an error.
  - `httpOptions.token` of `McpServerTransport`: give the token to the server, `new ProcedureServer({ token })`. After the change, `start()` throws an error for a token in `httpOptions`.
  - `McpFaceOptions.token`: give the token only in `hostPolicy({ token })`. After the change, `mcpFace()` throws an error for a token that is not the token of the policy.
  - `McpRequestGuardOptions.token`: give the token to the server. After the change, the option is removed, and a `token` option throws an error.
  - The token check of `guardMcpRequest`: after the change, the function does only the browser checks. The owner of a listener then admits each request with `admission()` of the server.
  - A token refusal of the server stays 401 with `UNAUTHORIZED` and the `WWW-Authenticate` header.
  
  The doc comments of these options, of `guardMcpRequest` and of `McpHostFaces.http` have the deprecation notes. The README of the package has the section "Deprecated token options".
  
  `mark mcp --http --token` and `@procedures/mcp-dev-tools`: no change for a client. The site, MiniMongo, Graph and jarvis: no change in this release.
- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0
  - @procedures/mcp@0.25.0

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
- Updated dependencies [2735505]
  - @procedures/client@0.24.1
  - @procedures/mcp@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0
  - @procedures/mcp@0.24.0

## 0.23.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0
  - @procedures/mcp@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/mcp@0.22.1

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

- @procedures/client@0.22.0
  - @procedures/mcp@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0
  - @procedures/mcp@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/mcp@0.20.0

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

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/mcp@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1
  - @procedures/mcp@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/mcp@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4
  - @procedures/mcp@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3
  - @procedures/mcp@0.17.3

## 0.17.2

### Patch Changes

- 571dad1: Fixed: `zod` is a dependency of `@procedures/mcp-server`, not a development dependency (CLI-63). The procedures `mcp.serve` and `mcp.listTools` import `zod` for their input schemas. Before, a strict consumer (pnpm) could not start the package. Node stopped with `ERR_MODULE_NOT_FOUND` for `zod`. Thus each MCP server on `createMcpHost()` failed at the start. npm and the tests of the monorepo hoist the packages. Thus they did not show the error.
  
  - A strict consumer (pnpm) can start `@procedures/mcp-server`. Nothing changes for other consumers.
  - The range is `^4.6.5`, the same range as the `zod` dependency of `@procedures/client`. Thus a consumer gets one copy of `zod`.
  - The new script `scripts/check-declared-imports.mjs` examines each published package, and CI starts it. It fails when an entry of a package reaches an import of a package that the package does not declare.
  
  PATCH: a dependency of the package changes, and no API changes.
- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2
  - @procedures/mcp@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1
  - @procedures/mcp@0.17.1

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

- @procedures/client@0.17.0
  - @procedures/mcp@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/mcp@0.16.0

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
  - @procedures/mcp@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/mcp@0.15.0

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
- 5efe2d2: New: the option `narrowing` of `mcpFace()` (CLI-43). The option gives each call of the face a narrower capability, as a `CapabilityRequest` or a list of them. The face adds it as one more source of the narrowing key (`procedure-narrowing`, CLI-30), so the server applies the meet of all the sources. A narrowing can only narrow: a part that asks for more than the policy of the host gives has no effect. The face lists only the tools that the narrowed capability permits. Thus `mcpFace({ narrowing: { effects: { writes: [] } } })` is a read-only MCP face on the port of the host, as `mark mcp --read-only` is over stdio. A narrowing that is not valid stops the factory with an error. Without the option, the face does not change.
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
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/mcp@0.14.1
  - @procedures/client@0.14.1

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
