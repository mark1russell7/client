# @procedures/mark

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

- Updated dependencies [9ea2030]
  - @procedures/server@0.12.0
  - @procedures/peer@0.12.0
  - @procedures/client@0.12.0
  - @procedures/cli-run@0.12.0
  - @procedures/lib@0.12.0
  - @procedures/pnpm@0.12.0
  - @procedures/procedure@0.12.0
  - @procedures/shell@0.12.0
  - @procedures/vitest@0.12.0
  - @procedures/mcp-dev-tools@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/peer@0.11.0
  - @procedures/client@0.11.0
  - @procedures/server@0.11.0
  - @procedures/mcp-dev-tools@0.11.0
  - @procedures/cli-run@0.11.0
  - @procedures/lib@0.11.0
  - @procedures/pnpm@0.11.0
  - @procedures/procedure@0.11.0
  - @procedures/shell@0.11.0
  - @procedures/vitest@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/cli-run@0.10.0
  - @procedures/lib@0.10.0
  - @procedures/pnpm@0.10.0
  - @procedures/procedure@0.10.0
  - @procedures/peer@0.10.0
  - @procedures/shell@0.10.0
  - @procedures/vitest@0.10.0
  - @procedures/mcp-dev-tools@0.10.0
  - @procedures/server@0.10.0

## 0.9.2

### Patch Changes

- @procedures/mcp-dev-tools@0.9.2
  - @procedures/client@0.9.2
  - @procedures/cli-run@0.9.2
  - @procedures/lib@0.9.2
  - @procedures/pnpm@0.9.2
  - @procedures/procedure@0.9.2
  - @procedures/peer@0.9.2
  - @procedures/shell@0.9.2
  - @procedures/vitest@0.9.2
  - @procedures/server@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/peer@0.9.1
  - @procedures/server@0.9.1
  - @procedures/cli-run@0.9.1
  - @procedures/lib@0.9.1
  - @procedures/pnpm@0.9.1
  - @procedures/procedure@0.9.1
  - @procedures/shell@0.9.1
  - @procedures/vitest@0.9.1
  - @procedures/mcp-dev-tools@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/cli-run@0.9.0
  - @procedures/lib@0.9.0
  - @procedures/pnpm@0.9.0
  - @procedures/procedure@0.9.0
  - @procedures/peer@0.9.0
  - @procedures/shell@0.9.0
  - @procedures/vitest@0.9.0
  - @procedures/mcp-dev-tools@0.9.0
  - @procedures/server@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/mcp-dev-tools@0.8.1
  - @procedures/cli-run@0.8.1
  - @procedures/lib@0.8.1
  - @procedures/pnpm@0.8.1
  - @procedures/procedure@0.8.1
  - @procedures/peer@0.8.1
  - @procedures/shell@0.8.1
  - @procedures/vitest@0.8.1
  - @procedures/server@0.8.1

## 0.8.0

### Minor Changes

- 3f376af: The root of the files confines each procedure, not only `fs.*` (roadmap R33). `mark --fs-root`, `procedure-server --fs-root` and `MCP_FS_ROOT` start `confineToRoot()` of `@procedures/fs`. Each procedure keeps its paths in the root, or the host refuses it with `FORBIDDEN` and the reason `outside-root`.
  
  This change is breaking under a root. The hosts refuse procedures that they ran before: `git.*`, `pnpm.*`, `docker.run`, `docker.build`, `docker.compose.*`, a call of `shell.run`, and each procedure that reaches files without `metadata.fsRoot`. `lib.scan` of a workspace outside the root gives `FORBIDDEN`, not a warning. Without a root, nothing changes. The list of the MCP tools does not change.

### Patch Changes

- 808a508: Each argument of a last array positional is one item, also when there is only one. Before, one argument was read as the whole array: `[]` gave no item, and `["a","b"]` gave two. The README rule says "A last array field takes the rest". A property test of the command line found it.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [3f376af]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/peer@0.8.0
  - @procedures/server@0.8.0
  - @procedures/mcp-dev-tools@0.8.0
  - @procedures/shell@0.8.0
  - @procedures/pnpm@0.8.0
  - @procedures/lib@0.8.0
  - @procedures/procedure@0.8.0
  - @procedures/cli-run@0.8.0
  - @procedures/vitest@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/peer@0.7.0
  - @procedures/cli-run@0.7.0
  - @procedures/lib@0.7.0
  - @procedures/pnpm@0.7.0
  - @procedures/procedure@0.7.0
  - @procedures/shell@0.7.0
  - @procedures/vitest@0.7.0
  - @procedures/mcp-dev-tools@0.7.0
  - @procedures/server@0.7.0

## 0.6.0

### Patch Changes

- @procedures/mcp-dev-tools@0.6.0
  - @procedures/client@0.6.0
  - @procedures/cli-run@0.6.0
  - @procedures/lib@0.6.0
  - @procedures/pnpm@0.6.0
  - @procedures/procedure@0.6.0
  - @procedures/peer@0.6.0
  - @procedures/shell@0.6.0
  - @procedures/vitest@0.6.0
  - @procedures/server@0.6.0

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
- a47bee6: The hosts serve the remote events (`documentation/EVENTS.md`).
  
  - `hostPolicy()` takes the option `events`: the topic rule, with an optional bus, `allow` function and buffer. `procedureServerOptions()` gives it to the `ProcedureServer`, which pins `events.subscribe`. `HostPolicy` has the new field `events`.
  - `procedure-server` and `mark serve` have the option `--events <patterns>`. The option is repeatable, and it takes comma-separated patterns: exact names, prefixes (`orders.*`) or `*`. `parseTopicPatterns()` checks them.
  - `mark --server` has the same option `--events`.
  - These hosts always serve `events.subscribe`. Without `--events`, they serve no topic, and each subscription gets `TOPIC_NOT_FOUND`. The bus is the global bus, which is also the `ctx.bus` of their procedures.
  - The MCP server serves no events, because its transport carries only MCP.
  - `mark --port`, `--host`, `--transport` and `--events` without `--server` are an error now, also before `serve` and `mcp`. Before, `mark --port 4000 serve` ignored `--port`.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [a47bee6]
- Updated dependencies [64120d9]
- Updated dependencies [64120d9]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/server@0.5.0
  - @procedures/mcp-dev-tools@0.5.0
  - @procedures/peer@0.5.0
  - @procedures/lib@0.5.0
  - @procedures/procedure@0.5.0
  - @procedures/cli-run@0.5.0
  - @procedures/pnpm@0.5.0
  - @procedures/shell@0.5.0
  - @procedures/vitest@0.5.0

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
- Updated dependencies [2fd2398]
- Updated dependencies [3fefa43]
- Updated dependencies [cc3f5f6]
- Updated dependencies [bae25e2]
- Updated dependencies [4c51727]
- Updated dependencies [d42d716]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/lib@0.4.0
  - @procedures/mcp-dev-tools@0.4.0
  - @procedures/procedure@0.4.0
  - @procedures/shell@0.4.0
  - @procedures/server@0.4.0
  - @procedures/peer@0.4.0
  - @procedures/cli-run@0.4.0
  - @procedures/pnpm@0.4.0
  - @procedures/vitest@0.4.0

## 0.3.0

### Minor Changes

- 3d24d5b: MCP over Streamable HTTP (roadmap R26), the HTTP transport of the current MCP specification. `McpServerTransport` takes `transport: "http"` and `httpOptions` (port, host, path, token, allowed origins, or an HTTP server of its own). Each client gets a session with an MCP server of its own, and so gets the progress of a tool call and the `list_changed` notifications. The endpoint listens on loopback by default, refuses a web page of another host or origin, and with a token refuses a request without the token. `mark mcp --http <port> [--host <host>] [--token <token>]` (or `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN`) serves the dev tools over it. Before, the package had only stdio, and its SSE transport only threw.

### Patch Changes

- 381ce3a: Cancellation scopes and a graceful stop (roadmap R14). `ProcedureServer.stop({ grace })` refuses new calls with a retryable `UNAVAILABLE` and lets the calls in flight end until the grace time ends, then aborts them (`peer.stop({ grace })` passes it; `mark --server` and the `server` bin give 5 seconds). The signal of each call joins its request and the server, and `callsInFlight` counts the calls, streams included. `exec()` and `execStream()` take a `signal`. `LocalTransport` takes `interceptors`, `capability` and `clearanceOrder`, and gives a call the deadline that its client sends, so a client timeout ends a local handler too. `mark` aborts a command in its own process on the first Ctrl+C. A remote leaf of `route()` and `server.call` send the deadline of their caller, and `server.call` relays the signal.
- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- aaa7462: The peer accepts a bare JSON value and obeys `bodyLimit` (roadmap R5). Before, its strict JSON parser refused a number, a string or `null` with 400, and its limit of 100 kB replaced `bodyLimit`. The HTTP transport config of the peer takes `bodyLimit`. `peer.stop()` closes the HTTP server that the peer made for its WebSocket transport, so the port is free again. `mark --server` and the `server` bin stop the peer before they exit, with a limit of 10 seconds, and a second signal exits at once.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [29a7b29]
- Updated dependencies [a70d445]
- Updated dependencies [c66f0c4]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [1779d96]
- Updated dependencies [4d3ff39]
- Updated dependencies [3d24d5b]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [aaa7462]
- Updated dependencies [6e4de6c]
- Updated dependencies [14d85fe]
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
  - @procedures/peer@0.3.0
  - @procedures/server@0.3.0
  - @procedures/mcp-dev-tools@0.3.0
  - @procedures/lib@0.3.0
  - @procedures/procedure@0.3.0
  - @procedures/pnpm@0.3.0
  - @procedures/shell@0.3.0
  - @procedures/cli-run@0.3.0
  - @procedures/vitest@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/peer@0.2.3
  - @procedures/procedure@0.2.3
  - @procedures/lib@0.2.3
  - @procedures/cli-run@0.2.3
  - @procedures/pnpm@0.2.3
  - @procedures/shell@0.2.3
  - @procedures/vitest@0.2.3
  - @procedures/mcp-dev-tools@0.2.3
  - @procedures/server@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/cli-run@0.2.2
  - @procedures/lib@0.2.2
  - @procedures/pnpm@0.2.2
  - @procedures/procedure@0.2.2
  - @procedures/peer@0.2.2
  - @procedures/shell@0.2.2
  - @procedures/vitest@0.2.2
  - @procedures/mcp-dev-tools@0.2.2
  - @procedures/server@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/cli-run@0.2.1
  - @procedures/lib@0.2.1
  - @procedures/pnpm@0.2.1
  - @procedures/procedure@0.2.1
  - @procedures/peer@0.2.1
  - @procedures/shell@0.2.1
  - @procedures/vitest@0.2.1
  - @procedures/mcp-dev-tools@0.2.1
  - @procedures/server@0.2.1

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

- 44d3e30: `mark --version` and `client-registry version` show the version of the package. Before, they showed `1.0.0`. The help of `client-registry` links to the site, not to a placeholder repository.
- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/mcp-dev-tools@0.2.0
  - @procedures/cli-run@0.2.0
  - @procedures/lib@0.2.0
  - @procedures/pnpm@0.2.0
  - @procedures/procedure@0.2.0
  - @procedures/peer@0.2.0
  - @procedures/shell@0.2.0
  - @procedures/vitest@0.2.0
  - @procedures/server@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
