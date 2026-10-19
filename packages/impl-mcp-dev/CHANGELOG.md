# @procedures/mcp-dev-tools

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
