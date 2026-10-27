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
| Repository tool | `cli` | The command runner of the template. It has no commands: `lib new` makes the packages, and `lib.rename` renames them. |

[PACKAGES.md](./PACKAGES.md) lists each package with its procedures and dependencies. [PROCEDURES.md](./PROCEDURES.md) lists each procedure. A script makes both files from the built packages.

## A procedure

A procedure is an object with these fields (`packages/client/src/procedures/types.ts`):

- `path`: an array of strings, for example `["git", "commit"]`. The registry refuses the segments `__proto__`, `constructor`, `prototype` and empty segments.
- `input` and `output`: Standard Schemas. Most packages give a Zod schema directly. `typed<T>()` accepts any value and gives only the type `T`.
- `handler(input, ctx)`: gives one value, or it is an async generator that yields values (a stream).
- `metadata`: a description, tags and CLI metadata. The tags `runs-refs` and `raw-input` change how a program gives input to the procedure ([PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md), section 9).

An import of a package registers nothing (since 2026-10-13, ARCHITECTURE-PROPOSALS-2026-10 P9). The `./register` entry of a package registers its procedures in the global registry: `import "@procedures/git/register"`. Its `src/register.ts` starts the register function of `src/module.ts`. The `client.procedures` field of `package.json` tells `mark` which packages to load. `@procedures/client/register` registers the control-flow procedures and the meta procedures of the core. The other 85 core procedures (math, string, array and more) are in `allCoreProcedures`, and a host registers them if it needs them.

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

- `call(method, input)` and `stream(method, input)` send a method to a transport. A method is `{ service, operation }`. `pathToMethod()` makes it from a path: the last segment is the operation, and the other segments joined with dots are the service. Each segment encodes `%` as `%25` and `.` as `%2E` before the join, so a segment with a dot stays one segment (roadmap CLI-75). `methodToPath()` gives the path again. `call()` gives the last item of a stream.
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
- `capability`, `readOnly`, `clearanceOrder`, `resources` and `admitItem`: the capability of each call. A capability limits the data that a call can see, its side effects and its time. A nested call gets the same capability or a narrower one. The guide is [CAPABILITIES.md](../client/docs/CAPABILITIES.md).

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

## Invariants

These rules are true for each change of the stack (roadmap CLI-82). Each invariant has a rule, the reason for the rule and its guard. The guard is the CI step or the script that enforces the rule. "Review rule" tells that no check enforces it yet, and the review of the pull request examines it. "Planned" names the roadmap item of the check that comes.

The checks of CLI-83 to CLI-86 link to these headings. Do not change the number or the name of an invariant. Add a new invariant with the next number.

The CI names below are the jobs and the steps of `.github/workflows/ci.yml`.

### I1. One runner and one server

- **Rule.** Each service starts under `run()` of `@mark1russell7/service` (repository `systems`). Each app talks to a `ProcedureServer` of this repository. An app keeps no server and no socket of its own.
- **Reason.** One runner gives each host the same start, health checks and stop. One server gives each app the same rights, limits and wire format.
- **Guard.** Review rule. The CI job "Host lifecycle (SIGTERM in a stream)" tests that the hosts of this repository stop under `run()`. Planned: a check of the app repositories, after GRAPH-7 and OTH-4.

### I2. One way to define procedures and collections

- **Rule.** A package defines its procedures through the module and registry API (`defineModule()`, `createRegistry()`). A collection gets its procedures from `createCollectionProcedures()`. An import of a package registers nothing. Only its `./register` entry registers procedures (P9).
- **Reason.** A host then knows each procedure from data, and two registries in one process stay apart. A bundler can drop each module that a page does not use.
- **Guard.** The step "Check the side effects of the imports" (`scripts/check-side-effects.mjs`). The step "Audit the packages" (`mark lib audit`) compares each package with the template of `lib new`. A procedure without `metadata.effects` is only a warning.

### I3. Paths and topics

- **Rule.** Each segment of a path goes through `encodeSegment()`, and each path goes through `pathToMethod()` or `pathToKey()` (decision D36). Each topic goes through `collectionChangeTopic()` and `collectionTopicPartition()`. Do not join or split a path on "." in your code. Do not match a topic with a regular expression.
- **Reason.** A segment can have a dot or a `%`. Only the codec keeps such a segment as one segment (roadmap CLI-75).
- **Guard.** The unit tests of the codec: `packages/client/src/procedures/segments.test.ts`, `packages/client/src/server/method.test.ts` and `packages/client/src/procedures/collection/topic.test.ts`. The rule "path" of the step "Check the paths, topics and storage writes" (`pnpm check:paths-and-writes`, CLI-84). The step parses the `src/` folder of each package, without the tests, and `scripts/check-paths-and-writes.test.mjs` tests the rules.
  - Outside the files of the codec, a call `join(".")` or `split(".")` fails the step. A `join` in the text of a message does not fail it.
  - A topic made or read by hand fails the step: the prefix `"collections."` with a value, or a regular expression with `collections\.`.
  - Dots of another kind, for example a field path or the `$ref` of a program, are not a path. Put the file in `PATH_FILES` of the script with its reason. For one line, write the comment `path-check: <reason>` on the line or above it.

### I4. Wire format

- **Rule.** [WIRE-PROTOCOL.md](./WIRE-PROTOCOL.md) is the wire format. The method name and the path in an HTTP body use the same encoding. Each error gets its code from the error registry (`ERROR_REGISTRY`). The option `errors` of the server (`ServerOptions.errors`, CLI-80) is the only policy that tells what an error shows. An MCP error has `_meta: { code, retryable }`.
- **Reason.** Each face (HTTP, WebSocket, MCP, the peer) then gives the same call and the same error. A client can then retry from the code, on each face.
- **Guard.** The transport contract suite (CLI-85): the entry point `@procedures/client/testing` (`packages/client/src/testing/`). Each face sends the same cases through `describeTransportContract()`. A face in another package imports it by the name of the package, as each other import of the client.
  - The faces of the client: the local transport, HTTP, the Express shim, two WebSocket servers and a message port (`packages/client/src/server/conformance.test.ts`).
  - The MCP faces: an in-memory pair and Streamable HTTP (`packages/client-mcp/src/transport/conformance.test.ts`).
  - The HTTP, WebSocket and MCP faces of a procedure host, as a peer serves them (`packages/client-server/src/host/contract.test.ts`).
  - The cases of a call: the result, the code and the flag of an error, the error policy, a validation error and `NOT_FOUND`.
  - The other cases: a segment with "." and "%", a stream, an abort, a subscription, the principal and the size limit.
  - A face that does not have a feature declares a capability flag, and the suite skips the case of that feature.
  - The golden tests of the wire: `packages/client/src/protocol.golden.test.ts` and `packages/client/test/wire/`.

### I5. Storage writes

- **Rule.** Each write to a storage collection goes through the write path of `MongoDocumentStorage`. The `_seq` comes from the allocation of the storage, and the storage fields are those of `DOCUMENT_STORAGE_FIELDS`. A delete writes a `_tomb` tombstone, and a prune raises the floor of the partition. The change-stream watcher adopts a raw write (decision D39). From 0.37.0, a view writes as the storage does when its target has the storage form (CLI-81, pull request #230).
- **Reason.** `changes(since)` and the change hints are then exact. A client that syncs gets each write one time and in sequence.
- **Guard.** The CI job "MongoDB (the storage contract)", on a single server and on a replica set. The rule "write" of the step "Check the paths, topics and storage writes" (`pnpm check:paths-and-writes`, CLI-84). A call of a write method of the MongoDB driver (`insertOne`, `updateMany`, `bulkWrite`, `findOneAndUpdate` and the others) fails the step, except in the files of `WRITE_FILES` of the script. These files are the storage, the materializer, `MongoStorage`, the procedures `mongo.documents.*` and the storage of SignalDB. Each file has its reason in the script.

### I6. Rights

- **Rule.** One rule, `admission.admit`, examines the reads, the delta of `changes` and the change hints (CLI-78). `admitsAll` is the only fast path. A change of the rights acts through the re-check of CLI-44 and `rightsChanged(change?, scope?)`.
- **Reason.** A read, an event and a hint then cannot show different rows to one caller.
- **Guard.** The admission contract test (CLI-85): `packages/client/src/procedures/collection/admission.contract.test.ts`.
  - The test reads the procedures of a served collection from the registry of the server. A procedure whose effects read `collection:<name>` is a procedure of the collection.
  - Each procedure of the collection must have a row in the tables of the test. A new procedure without a row fails the test.
  - Each read must give its invocation to `admit`, with and without a partition. Each read of a principal must give only the admitted rows.
  - The change events of each write, with and without values, must not show a refused row to a subscriber.
  - Other tests: `packages/client/src/procedures/collection/admission.test.ts`, `packages/client/src/procedures/collection/row-hints.test.ts` and `packages/client/src/events/recheck.test.ts`.

### I7. Public API

- **Rule.** An API snapshot has each exported name and type of a public package.
- **Reason.** A change of the API then fails a test, so each change of the API is a decision.
- **Guard.** The CI step "The reports of the public API are current" (CLI-86). Each public package has its report in `test/api/public-api.txt`.
  - `scripts/api-report.mjs` reads the built `.d.ts` file of each entry of the `exports` field. It writes the exported names and their declarations, without comments and private members.
  - The step starts the script with `--update`. A changed or new report fails the step. The artifact `public-api-reports` has the new reports.
  - To accept a change of the API, start `pnpm build`, then `node scripts/api-report.mjs --update`. Review the diff, and commit the reports.
  - The tests of the reader are in `scripts/api-report.test.mjs`.

### I8. Package shape

- **Rule.** Each public package installs and starts as npm gives it. Each package that an entry imports is a declared dependency. No file names a package of this repository with the old scope `@mark1russell7`. The generated catalogs agree with the built packages.
- **Reason.** A consumer gets the package from npm, not from the monorepo. A strict install (pnpm) finds only the declared packages.
- **Guard.** The CI job "Packages (pack, publint, attw, install)" (`scripts/check-packages.mjs`): it packs each package, examines it with publint `--strict` and attw (the ESM-only profile), installs all the tarballs and starts the bins. The step "Check the declared imports" (`scripts/check-declared-imports.mjs`). The step "Check the package scope" (`scripts/check-scope.mjs`). The step "The generated catalogs are current" ([PROCEDURES.md](./PROCEDURES.md) and [PACKAGES.md](./PACKAGES.md)).

### I9. Import boundaries

- **Rule.** A browser entry imports no Node built-in. A transport does not import the server. An adapter package imports only the public entries of the client, and not the `src/` folder of another package. No package of this repository imports an app.
- **Reason.** A browser page then bundles each browser entry. Each layer can then change without a change of the layers above it.
- **Guard.** For the browser entries: the step "Check the browser entries" (`scripts/check-browser-entries.mjs`, CLI-39). For the other rules: the step "Check the import boundaries" (`pnpm check:boundaries`, CLI-83). The step starts dependency-cruiser on the `src/` folder of each package, without the tests. The shared package `@mark1russell7/boundaries` and `.dependency-cruiser.cjs` give the rules, and `scripts/check-boundaries.test.mjs` tests them. The rules are these:
  - `transport-imports-server` and `transport-reaches-server` (this repository): a transport (`client/src/adapters/` and `client-mcp/src/transport/`) does not import the server, directly or through other modules. The server is `ProcedureServer`, `Server`, the host parts of `client/src/server/`, the `./server` entry of the client, the MCP host and the packages `@procedures/server` and `@procedures/peer`. A transport can import the shared helpers of `client/src/server/`, for example `method.ts` and `types.ts`.
  - `relative-import-out-of-<package>` (shared): a relative import stays in its package.
  - `deep-import-into-<package>` (shared): an import of another package goes to an entry of its `package.json`. Thus no import goes into the `src/` folder of another package.
  - `not-a-declared-export` (shared): an import of a package of this repository resolves through its exports map, with the conditions of an ESM import. The check reads `dist/`, so start it after `pnpm build`.
  - `unknown-procedures-package` (this repository): an import of the scope `@procedures` names a package of this repository.
  - `import-of-the-app-<package>` (shared): no package imports an app. An app is a private package (`"private": true`), for example `site`.

### I10. Bundle size

- **Rule.** Each page of the site stays within its size budget, after gzip.
- **Reason.** A change in the core can pull code into the main bundle of each page. Example: the budget found that the error policy of CLI-80 went into the main bundle.
- **Guard.** The tests "the budgets" in `packages/site/e2e/seo.spec.ts`, in the CI job "Site (browser smoke test)". The budgets are 256 kB for a page, 180 kB for its scripts and 128 kB for the scripts of a Web Worker.

### I11. Versioning

- **Rule.** Each change to a published package has a changeset. Before 1.0.0, a break or a changed default raises the MINOR, and its changeset has a migration section that names the consumers ([decision D13](./SERVER-LAYERS.md#releases-of-the-server-stack)). A feature or a fix raises the PATCH.
- **Reason.** A consumer can then read the version and the migration steps of each release.
- **Guard.** Review rule. Planned: a changeset check in the template. The prose of the documents and the doc comments obeys ASD-STE100: `pnpm lint:ste`, in the CI job "CI".

### I12. Privacy

- **Rule.** No code of a private app goes into this repository. No file has a path of a local computer or the user name of a computer.
- **Reason.** This repository is public.
- **Guard.** Review rule.

## Where to read next

- [ONBOARDING.md](./ONBOARDING.md): how to build, test and add a package or a procedure.
- [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md): the program format.
- [deep-dive-2026-10/architecture-review.md](./deep-dive-2026-10/architecture-review.md): the target architecture and the roadmap.
- [ARCHITECTURE-PROPOSALS-2026-10.md](./ARCHITECTURE-PROPOSALS-2026-10.md): the proposals P1 to P8.
