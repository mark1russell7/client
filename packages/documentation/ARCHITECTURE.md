# Architecture

This document describes the client ecosystem as it is in the monorepo, after the deep dive of October 2026. The [July 2026 version](./history/ARCHITECTURE-2026-07.md) is history. The roadmap and the open items are in [deep-dive-2026-10/STATUS.md](./deep-dive-2026-10/STATUS.md).

## The idea

The ecosystem is a set of procedures. Each procedure has a path, for example `git.commit` or `fs.read`, an input schema, an output schema and a handler. A package registers its procedures in a registry. A host serves the registry: the `mark` CLI, an HTTP or WebSocket server, the MCP server for Claude, or the Composer of the site.

A program is JSON that names procedures and their inputs. [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md) specifies it.

## The layers

| Layer | Packages | Role |
|---|---|---|
| Core | `client` | Procedures, the registry, `invokeProcedure()`, the program interpreter, `Client`, the transports, the middleware, the event bus and the servers. The core depends on no other package of the repository: its cache has its own LRU map, and it declares the `CollectionStorage` interface itself. |
| Support libraries | `client-collections`, `client-dag` | Data structures and graph algorithms. They register no procedures. |
| Program store | `client-store` | The program store (`procedure.store`, `load`, `sync`): programs of `procedure.define` in memory, in a JSON file or in a collection storage. Also the storage layer that left the core: `ApiStorage`, `HybridStorage`, the synced registry and the dynamic handler loader. |
| Command wrappers | `client-shell`, `client-git`, `client-docker`, `client-pnpm`, `client-node`, `client-vite`, `client-vitest`, `client-cue`, `client-cli` | Each package wraps one tool. All of them start programs through `runCommand()` of `client-shell`. |
| Data and services | `client-fs`, `client-s3`, `client-mongo`, `client-sqlite`, `client-snapshot` | Files, storage and databases as procedures |
| User interface libraries | `client-splay` | Rendering of data with `splay`, and the procedure components (serializable UI descriptors) |
| Workspace tools | `client-lib`, `client-procedure` | `lib.*` (scan, new, audit, rename) and `procedure.new` |
| Bundles | `bundle-dev`, `bundle-mcp` | Sets of packages. `bundle-mcp` also gives the tool list of the MCP server. |
| Hosts | `mark`, `client-server`, `server`, `client-mcp`, `mcp`, `impl-mcp-dev` | The CLI, the peer server and the MCP server |
| Website | `site` | The website, with the Composer |
| Repository tool | `cli` | The template commands of the repository (`pnpm package`, `pnpm template`) |

[PACKAGES.md](./PACKAGES.md) lists each package with its procedures and dependencies. [PROCEDURES.md](./PROCEDURES.md) lists each procedure. A script makes both files from the built packages.

## A procedure

A procedure is an object with these fields (`packages/client/src/procedures/types.ts`):

- `path`: an array of strings, for example `["git", "commit"]`. The registry refuses the segments `__proto__`, `constructor`, `prototype` and empty segments.
- `input` and `output`: schemas with `safeParse()`. Most packages use Zod through `zodAdapter()`. `outputSchema<T>()` accepts any value.
- `handler(input, ctx)`: gives one value, or it is an async generator that yields values (a stream).
- `metadata`: a description, tags and CLI metadata. The tags `runs-refs` and `raw-input` change how a program gives input to the procedure ([PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md), section 9).

A package registers its procedures when it is imported: its `src/register.ts` gives them to `registerProcedures()`, and its root `index.ts` imports `register.js`. The `client.procedures` field of `package.json` tells `mark` which packages to load. The core registers its control-flow procedures and its meta procedures when it is imported. The other 85 core procedures (math, string, array and more) are in `allCoreProcedures`, and a host registers them if it needs them.

Each package also has a `./module` entry ([`packages/client/src/procedures/module.ts`](../client/src/procedures/module.ts)). The entry gives the procedures as data, and an import of it registers nothing. A module names the modules that its procedures use (its `requires` list): the list of `client-lib` has the modules of `client-fs` and `client-git`. `createRegistry(...modules)` makes a new registry with the core procedures, the modules and the modules of their lists. Two registries in one process stay apart: a nested call and `procedure.define` use the registry of their invocation.

## One invocation path

Every host starts a procedure with `invokeProcedure()` in [`packages/client/src/procedures/invoke.ts`](../client/src/procedures/invoke.ts). The function does these steps:

1. It refuses a procedure without a handler (`NO_HANDLER`) and an aborted signal (`ABORTED`).
2. It validates the input with the input schema (`VALIDATION_ERROR`).
3. It makes the context: `ctx.client` for nested calls, `ctx.registry`, `ctx.metadata`, `ctx.signal` and `ctx.bus`.
4. It starts the handler.
5. When the handler gives a value, it validates the value (`OUTPUT_VALIDATION_ERROR`). When the handler gives an async iterable, the result is a stream. The function validates each item when the reader takes it.

`invokePath()` finds a procedure in a registry first (`NOT_FOUND`). `outputValue()` gives one value: the value, or the last item of a stream. `outputItems()` gives each item.

Each nested call of `ctx.client` goes through `invokePath()` with the same options: the same registry, metadata, signal and `expose` rule. A data-driven procedure can use only the exposed procedures (`NOT_EXPOSED`). The section "Security" explains this rule.

## The client

`Client` ([`packages/client/src/client/client.ts`](../client/src/client/client.ts)) has two ways to start a procedure:

- `call(method, input)` and `stream(method, input)` send a method to a transport. A method is `{ service, operation }`. `pathToMethod()` makes it from a path: the last segment is the operation, and the other segments joined with dots are the service. `call()` gives the last item of a stream.
- `exec(program)` and `execStream(program)` start a program in this process. They hydrate the input first ([PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md)). A path that the local registry does not have goes to the transport.

`route()` and `routeStream()` start a tree of calls in one request, with a batch strategy. The client middlewares wrap the transport: `auth`, `cache` (opt-in for each method), `circuit-breaker`, `pagination`, `rate-limit`, `retry`, `timeout` and `tracing` (`packages/client/src/client/middleware/`). They apply to `call()` and `stream()`, not to procedures in the same process.

The transports are `LocalTransport` (a registry in this process), `HttpTransport` and `WebSocketTransport`. The server side has `HttpServerTransport` and `WebSocketServerTransport`. `ProcedureServer` connects a registry to the server transports. It looks up the live registry for each request, so a procedure that is registered later is served.

## The hosts

| Host | Command | Package | How it starts procedures |
|---|---|---|---|
| `mark`, local mode | `mark <command>` | `mark` | It makes a registry from the module of each package with `client.procedures`. It parses the command line against the procedure's schema and starts the procedure with `LocalTransport`. |
| `mark`, warm mode | `mark --server` | `mark`, `client-server` | It starts a peer server on `127.0.0.1` with the same registry, and writes a lockfile in `~/.mark/servers/`. A later `mark` command in the same folder, from the same build, goes to that server over HTTP. |
| The procedure server | `mark serve`, or `procedure-server` | `server`, `client-server` | An HTTP and WebSocket server for the procedure packages of `--procedures`. Its registry has the modules of those packages and the `server.*` procedures. |
| The MCP server | `mark mcp`, or `node packages/impl-mcp-dev/dist/server.js` | `impl-mcp-dev`, `client-mcp`, `bundle-mcp` | Claude Code starts it over stdio. Its registry has the modules of its bundles. `McpServerTransport` gives the tools of that registry. |
| The Composer | | `site` | It starts programs in a Web Worker of the browser, with `LocalTransport` and the core procedures. |

`mark` is the one command that a user needs. The `procedure-server` and `mcp-dev-tools` commands start the same hosts.

The warm mode removes the start time of Node for a command. `mark` reads a manifest that its build writes (`dist/manifest.json`). Thus the help and a command for a warm server load no procedures.

### The policy of a host

`hostPolicy()` ([`packages/client/src/server/host-policy.ts`](../client/src/server/host-policy.ts)) makes the policy of each host from one set of options:

- `expose`: the procedures that callers can use. It takes patterns (`git.status`, `git.*`, `*`), a tool surface (namespaces less some keys) or a function.
- `strictCalls`: a procedure of code without `metadata.calls` can use only exposed procedures.
- `timeoutMs`: the time limit of each call from a caller.
- `token` and `browser`: the checks of the network transports.

`procedureServerOptions()` gives the policy to a `ProcedureServer`, and `createPeer({ policy })` gives it to a peer. The MCP server uses the tool surface of its bundles, `strictCalls` and a time limit. The procedure server uses its token and its `--expose` list. The warm server uses its token.

## Streaming

A procedure whose handler is an async generator is a stream. Each host gives the items as they come:

- `Client.stream()` and `execStream()` yield each item. `call()` and `exec()` give the last item.
- Over HTTP, a client that sends `Accept: application/x-ndjson` gets one JSON line for each item. A different client gets the last item as JSON. The server waits for `drain`, so a slow reader slows the procedure.
- Over WebSocket, the server sends one frame for each item. The client gives credit for 64 items at a time, and a `cancel` message stops the stream.
- Over MCP, a tool result holds the items, and each item sends a progress notification when Claude Code asks for progress.
- When the reader stops or the signal aborts, the generator gets `return()`.

## Security

A registry often has `shell.*`, which starts any program. These rules protect it:

- **The tool list of Claude.** `bundle-mcp` exports `mcpNamespaces` and `mcpExclude`. The MCP server exposes only those procedures as tools: 62 tools in October 2026, pinned by `packages/impl-mcp-dev/tools.snapshot.txt`. `shell.*` and `cli.*` are not tools.
- **Data-driven procedures.** A procedure that starts procedures from data is data-driven: the control-flow procedures, the `runs-refs` procedures and the procedures of `procedure.define`. With an `expose` rule, such a procedure can use only exposed procedures. Thus `client.chain` cannot reach `shell.exec`. A procedure of code still uses its dependencies: `docker.run` uses `shell.run`.
- **No shell strings.** The command wrappers give an argument list to `runCommand()` or `shell.run`. They refuse values that start with `-` where the tool reads them as options.
- **Browser checks.** `HttpServerTransport` and `WebSocketServerTransport` examine each request ([`server/browser-guard.ts`](../client/src/server/browser-guard.ts)). On a loopback address, the `Host` name must be a loopback name. An `Origin` must be the origin of the server or a permitted origin (`allowedOrigins`). A call by GET needs `allowGet`, and a body must be JSON.
- **The warm-server token.** `mark --server` makes a random token and writes it in its lockfile, which only the user can read. Each request must send it. `mark` uses a server only when its health endpoint gives the peer id of the lockfile.
- **The procedure server.** `mark serve` and `procedure-server` bind to `127.0.0.1` by default and have the browser checks. Each request must send a token: `--token`, `SERVER_TOKEN`, or a random token that the server prints at its start. `--expose` limits the procedures. Use `--no-token` only on a computer that you trust.

## The program interpreter

`hydrateInput()` in `ref.ts` is the one interpreter of programs. `exec()`, the control-flow procedures and `procedure.define` use it. [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md) gives its rules, its examples and its open questions.

## Where to read next

- [ONBOARDING.md](./ONBOARDING.md): how to build, test and add a package or a procedure.
- [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md): the program format.
- [deep-dive-2026-10/architecture-review.md](./deep-dive-2026-10/architecture-review.md): the target architecture and the roadmap.
- [ARCHITECTURE-PROPOSALS-2026-10.md](./ARCHITECTURE-PROPOSALS-2026-10.md): the proposals P1 to P8.
