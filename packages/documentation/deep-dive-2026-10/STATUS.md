# Deep dive 2026-10: status of each finding

This file records the status of each finding of the deep dive. The reports are in this folder. The status values are:

- **fixed**: the commit corrects the defect, and a test or a repro examines it.
- **partly**: the commit removes the risk or a part of the defect. The note gives the remaining part.
- **open**: no change yet.
- **decision**: the fix needs a decision of the owner. The note gives the recommendation.

Wave 1 (2026-10-08) fixed the findings in seven parallel branches, one for each area. Wave 2 (2026-10-11) merged as `87f6873` (toolchain), `b27377a` (policy), `4924d43` (docs) and `b4412d3` (site pages), with the extras fork before the site. The merge commits are `cd7a3ec` (transports), `b182fc3` (core-A), `bab4156` (core-B), `8c1253b` (data), `264800e` (wrappers), `988bb4b` (cli) and `2c29751` (site). The table gives the commit of each fix on its branch.

## Security and the MCP surface

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| WRP-1 / MCP-2 | critical | fixed | `ee52893` | `docker.*` runs `shell.run` with argv. Values that start with `-` are rejected. |
| MCP-1 / CLI-5 / TRN-2 | critical | fixed | `ee52893` | `cli` is not in `mcpNamespaces`. The tool snapshot test pins the surface. |
| TRN-1 / CLI-1 / CLI-2 / DATA-20 | critical | fixed | `8db86ec`, `43b98ee` | Loopback by default, no CORS, a lockfile token on each warm-server call. `43b98ee` adds browser checks to the core HTTP and WebSocket server transports for every host: the `Host` name on a loopback address, the `Origin`, `Sec-Fetch-Site`, no calls by GET, and JSON bodies only. Before, a cross-site `text/plain` POST ran any procedure on a loopback `server`. |
| CLI-3 | high | fixed | `8db86ec` | Warm mode is used only for the same `cwd`. |
| CLI-4 / CLI-14 | high | fixed | `8db86ec` | The lockfile records the peer id, the workspace and the build. `/health` confirms the server before a call or a signal. |
| CLI-6 | high | fixed | `8db86ec` | The `server` CLI registers its procedures once. |
| CLI-12 | medium | fixed | `8db86ec` | `cli.run` always starts `mark` with argv. The second lockfile copy is deleted. |
| WRP-5 | high | fixed | `e1b5b57` | `pnpm.*` runs `shell.run` with argv. |
| WRP-6 | medium | fixed | `e1b5b57` | `shell.which` uses `execFile`. |
| WRP-8 | medium | fixed | `e1b5b57` | `vite.*` starts the project's vite bin with no shell. |
| DATA-1 / DATA-2 / DATA-3 | critical / high | fixed | `e1b5b57` | Snapshot names are checked. Restore uses `mkdtemp`. The guard checks the archive entry. Exclusions match segments. |
| CORE-7 / DATA-11 | medium | fixed | `e1b5b57` | The dynamic loader takes an allowlist. The storage factory has no default loader. |
| DATA-18 | medium | fixed | `ee52893` | `rootPath` must hold `pnpm-workspace.yaml`. |
| MCP-3 | high | fixed | `2fb8329`, `3e3827f`, `8724c35` | Each code procedure declares its nested calls (`metadata.calls`). The MCP server sets `strictCalls`, so an undeclared caller reaches only exposed procedures. `impl-mcp-dev/reachable.snapshot.txt` pins what the tools can reach: `fs.*`, `shell.run` and `shell.stream`, never `shell.exec` or `cli.run`. |
| MCP-4 / CORE-3 | high | fixed | `8a9e7c7` | `replace` works only over a runtime-defined procedure, and `procedure.delete` unregisters and refuses a code procedure. Decision: the expose rule is not applied to the target path. A defined procedure is data-driven, so it calls only exposed procedures, and a target outside the exposed namespaces is not reachable from MCP. |

## Core

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| CORE-1 | high | fixed | `8a9e7c7` | `and`/`or` run their operands in order and stop at the deciding value. |
| CORE-2 | high | fixed | `7c2b662` | A completion queue keeps every result. The H12 test settles all calls in one tick. |
| CORE-4 | high | fixed | `8a9e7c7` | A defined body runs like `exec()`, with `input` in scope. A bare `$ref` name no longer reads an input field: use `input.x`. |
| CORE-5 | high | fixed | `8a9e7c7` | The registered procedure decides whether its input stays raw (`runs-refs`, the new `raw-input` tag). `isControlFlowPath` matches the whole path. |
| CORE-6 | medium | fixed | `e4a90f9`, `92980cb` | The registry rejects `__proto__`, `constructor`, `prototype`, empty segments and key collisions. The route code walks only own keys. |
| CORE-8 / DATA-8 | medium | fixed | `8d1e7f3` | A record with no handler never replaces a handler. Write-back deletes are flushed. |
| CORE-9 / DATA-9 | medium | fixed | `8d1e7f3` | `ApiStorage` and `HybridStorage` work against the core collection procedures, tested through `LocalTransport`. |
| CORE-10 | medium | fixed | `92980cb` | Nested calls keep the caller's metadata and signal. |
| CORE-11 | medium | fixed | `8a9e7c7` | The JSON helpers keep `$when`/`$name`. `$never` keeps its subtree. |
| CORE-12 | medium | fixed | `8a9e7c7` | The depth counts refs only. Non-plain objects stay unchanged. `$literal` works. Sibling refs run in order by default (`parallel: true` runs them together). |
| CORE-13 | medium | fixed | `8a9e7c7` | A raw input carries the caller's scope. An unknown `$ref` name in a scope is an error. |
| CORE-14 | medium | fixed | `92980cb` | The documented override keys map to the middleware keys. Leaves after a validation error come back as `SKIPPED`. |
| CORE-15 | low–medium | fixed | `f40d27c` | The event bus defects are fixed. Each procedure context has a bus (`Client` option `bus`, or the global bus). |
| CORE-16 / DATA-10 | low–medium | fixed | `8d1e7f3`, `6567e2d` | `procedure.store`/`load`/`sync` work on a program store (`client-store`) and fail with `NOT_CONFIGURED` without one. Decision: `procedure.remote connect` stays `NOT_IMPLEMENTED`, because a storage that a procedure makes at run time would give it network reach. |
| CORE-17 | low | fixed | `6b05f8f`, `065436b` | discover follows the exports map. announce locks and writes atomically, also under Windows file contention. |
| Low items | low | fixed | `e2bbe2c`, `8a9e7c7` | `continueOnError`, race cancellation, the stream buffer options, `outputMode: "batch"`, child components through `invokeProcedure`, `isStreamingFactory`, the `unregister` event on override, `Client.exec(ref, input)`. |

## Transports, server and middleware

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| TRN-3 | high | fixed | `6ea7dfa` | HTTP waits for `drain`. WebSocket streams use credit frames and a server high-water mark. |
| TRN-4 | high | fixed | `06b5172` | The breaker records the failure at the error item. `HALF_OPEN` allows a set number of probes. |
| TRN-5 | high | fixed | `06b5172` | The cache key includes the metadata. Caching is opt-in through `methods` (a breaking change, no user in the repo). Streams are never cached. A hit is a copy. |
| TRN-6 | medium-high | fixed | `6ea7dfa` | A heartbeat timeout drops the socket and handles the close at once. |
| TRN-7 | medium | fixed | `06b5172`, `6ea7dfa` | `ABORTED` and `TIMEOUT` codes. A per-attempt timeout is retryable. The HTTP timeout covers the time to the first item. An unknown procedure is 404. Decision: a transport timeout is not retryable, because the server can have run the call. |
| TRN-8 | medium | fixed | `06b5172` | Only network errors (or `shouldRetry`) are retried. The backoff stops on abort. Each attempt gets a new id. |
| TRN-9 | medium | fixed | `6ea7dfa` | The WebSocket client owns its wire ids. The server refuses a duplicate id in flight. |
| TRN-10 | medium | fixed | `6ea7dfa` | Every JSON value travels. A `void` result is 204. |
| TRN-11 | medium | fixed | `6ea7dfa` | Metadata travels in one `X-Metadata` header (8 KiB at most). Internal `__*` keys are removed. |
| TRN-12 | medium | fixed | `06b5172` | A referenced drain timer, abort for queued calls, first in first out. |
| TRN-13 | medium | fixed | `201f920` | `ProcedureServer` reads the live registry for each request. |
| TRN-14 | medium | fixed | `6ea7dfa` | The wait for a connection is event-driven. |
| TRN-15 | low-medium | fixed | `6ea7dfa` | `stop()` aborts the open requests and leaves a caller's server open. |
| TRN-16 | low | fixed | `6ea7dfa` | The close handler does all the cleanup. |
| Lower items | low | fixed | `6ea7dfa` | One CORS origin with `Vary: Origin`. Query values do not replace reserved metadata. Doc examples corrected. |
| Open items | low | fixed | `eff47a0`, `ec24f70` | The middleware writes the context state that its types describe. `mcp.serve` serves a tool surface (`namespaces`/`exclude`, or the lists of `bundle-mcp`), not every procedure. The cache and retry overrides work. |
| CORS defaults | low | fixed | `1c231d3` | `corsOptions` merge over the defaults (before, `origin` alone sent "Allow-Headers: undefined"), and `X-Metadata` passes the preflight. |

## Tool wrappers

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| WRP-2 | high | fixed | `e1b5b57` | A `StringDecoder` for each stream. |
| WRP-3 | high | fixed | `ee52893`, `7db75d9` | `client-cue` registers `client-fs`, and file errors are real errors. |
| WRP-4 | high | fixed | `08dcb2e` | A process registry. `vitest.stop` and `vitest.list` are new and are not MCP tools. Processes end when the host ends. |
| WRP-7 | medium | fixed | `35cc954` | `git.diff` and `git.status` read exact paths and report renames. `short` and `oneline` return lines. |
| WRP-9 | low/medium | fixed | `6638311` | `shell.stream` has a bounded queue and pauses the program's output. |
| WRP-10 | low | fixed | `6638311` | Timeouts and signals kill the whole process tree. Old process records are removed. |
| Roadmap 2.2 | | fixed | `6638311`..`7db75d9` | `runCommand`/`streamCommand`/`killTree` in `@mark1russell7/client-shell/command`. git, cue, vite, vitest and node use it. docker and pnpm reach it through `shell.run`. |
| Open items | low | fixed | `b462119`, `3632b3a` | `docker.logs` with `follow` is a stream that ends when the reader stops. `client-snapshot` runs git and pnpm through `runCommand`. |

## Data and library packages

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| DATA-4 | high | fixed | `04676bf` | delete and update need exactly one of `id` or `filter`. An empty filter needs `confirm: true`. |
| DATA-5 | high | fixed | `04676bf` | The procedures connect on the first call. `collection` and `database` are input fields. |
| DATA-6 | high | fixed | `04676bf` | `MongoStorage` gets its collection for each operation. |
| DATA-7 | high | fixed | `31152e5` | `lib.rename` runs. `fs.glob` supports `ignore`, `absolute` and `dot`, with sorted "/" paths. |
| DATA-12 | medium | fixed | `c7f8a16` | merge, debounce and throttle streams end their sources. |
| DATA-13 | medium | fixed | `docker-sqlite` `239baa6`, `5845f2c` | Saves only after a change. Several statements run, or are an error with parameters. One queue per file on Windows. |
| DATA-14 | medium | fixed | `0843ba5` | A download writes a part file and renames it. Byte counts. Sorted parts. |
| DATA-15 | medium | fixed | `04676bf` | An upsert by id targets one exact `_id`. |
| DATA-16 | medium | fixed | `3b0ab59` | `snapshot.list` reads every page, sorts, then cuts. |
| DATA-17 | medium | fixed | `50b79ea` | Git visits in one repository run one at a time (`serialize`). |
| DATA-19 | medium | fixed | `3b0ab59` | Checksums and uploads stream from the file. The memory use has no test. |
| DATA-21 | low | fixed | `50b79ea` | Duplicate dependencies count once. Listener errors are logged. |
| DATA-22 | low | fixed | `50b79ea` | `core.catch` hydrates inside the `try`. |
| Minor | low | fixed | `3b0ab59`, `0843ba5` | Restore with `overwrite` replaces each folder. A failed part keeps its error. |
| Mongo schemas | low | fixed | `8306c1e`, `830af9c` | The mongo tools have real input and output schemas, so the MCP tool list describes `collection`, `filter` and the other fields. |

## The `mark` CLI and the servers

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| CLI-7 | high | fixed | `874f355` | After the command path, a procedure's own flag wins. `lib audit` lists the 18 procedure flags that hide a global flag. |
| CLI-8 | medium | fixed | `874f355` | Exit code 1 for each kind of failure. The `mark` README states the convention. |
| CLI-9 / CLI-10 / CLI-11 | medium | fixed | `874f355` | Values follow the Zod field type. Repeated flags, `k=v` records, `--no-x`, negative numbers, `--`. Extra arguments are errors. |
| CLI-13 | medium | fixed | `55d1a8e` | `procedure new` and `lib new` make code that compiles. A test compiles a new package with tsc. |
| CLI-15 | low | fixed | `3d3a3b6` | The REPL runs one line at a time. |
| CLI-16 | low | fixed | `377f096`, `7db9606` | Invalid ports are errors. `--transport` is read. `server.*` validates its input. |
| CLI-17 | low | fixed | `874f355` | The bin is `dist/bin.js`. An import runs nothing. |
| CLI-18 | low | fixed | `874f355` | `pathToFileURL`. A load failure prints one line. |
| CLI-19 | low | fixed | `82d5924`, `612e842`, `fd64ed7` | The e2e suite tests current commands. Decision: the stale Dockerfile and compose file are retired (revert `612e842` to restore them). CI installs CUE for the scaffold test. |
| CLI-20 | low | fixed | `806add8` | `repo rename` changes only workspace package names, in every text file. |
| Follow-ups | low | fixed | `a0852e2` | `git commit` takes `-m`. `git.status` works in a repository with no commits. |
| Prompts | low | fixed | `978175a` | In a terminal, `mark` asks for a missing required argument (not with `--no-input`, in CI or outside a terminal). |
| cli.run argv | low | fixed | `2069d8f` | `cli.run` sends `--key=value`, `false` booleans and `--` before the positional arguments. |
| Standalone server | medium | fixed | `d0430e4` | `server` needs a token by default (random, printed at start) and takes an `--expose` list. |

## The site, CI and the toolchain

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| SITE-1 | high | fixed | `dd37e64` | No sideways scroll at 375 px. The header is 104 px. |
| SITE-2 | high | fixed | `dd37e64` | The TypeScript tab registers the core procedures. A test runs the code of each example. |
| SITE-3 | high | fixed | `dd37e64` | A stale selection cannot change the program. Undo and redo. Back works. |
| SITE-4 | medium | fixed | `dd37e64`, `edbdb4a` | The site depends on every procedure package. `gen-data` fails loudly. The footer shows the commit. |
| SITE-5 | medium | fixed | `dd37e64` | The Composer follows `hashchange`. A corrupt link says so. |
| SITE-6 | medium | fixed | `dd37e64`, `9a6b270` | Programs run in a Web Worker with an 8 s limit and Stop. An error boundary. Limits on links. `range` has a length limit. |
| SITE-7 | medium | fixed | `dd37e64` | The keyboard reaches every control. axe-core finds no serious issue. |
| SITE-8 | medium | fixed | `dd37e64`, `b693229` | Negative numbers, key renames, the picker, and the implicit-chain hint of the core. |
| SITE-9 | medium | fixed | `dd37e64`, `8a9e7c7` | Results show `NaN`, `Infinity` and `undefined`. Unknown `$ref` names are warnings (and errors of the core). |
| SITE-10 | medium | fixed | `b341068`, `d588b24` | Pages deploys after CI. Node 22, 24 and 26. A type check of the test files, `lib audit` and a browser smoke test. |
| SITE-11 | low-medium | fixed | `dd37e64` | The catalog marks a CLI command only when `mark` loads its package. |
| SITE-12 | low-medium | fixed | `dd37e64` | Dark text on the accent in the dark theme. |
| SITE-13 | low | fixed | `a263785` | The counts and examples come from the data. |
| SITE-14 | low | fixed | `35f7dbc`, `3166de5`, `314c18f` | TypeScript 7, vitest 5, `@types/node` 22 and `node >=22` in every package, also in the `cue` presets. Every package has a `test` script. |
| Ideas 3, 4, 5, 7, 8 | | done | `dd37e64`, `b341068` | Problem list, virtualized trace, put-inside and wrap-in-chain, smoke test, URL filters. |
| Trace consumer edge | | done | `6b660c9`, `e1266fe` | `HydrateOptions.onRef` and `observeHydration()`. The trace shows a hydrated call under the call that gets its result. |
| New pages | | done | `bc0c69e`, `0902eb6`, `a67c021` | The status board (`/status/`, from this file), the middleware lab (`/lab/`) and the program graph in the Composer. |
| SEO | | done | `750d5ce`, `33a50b3`, `72bdef5` | Path routes, 281 prerendered pages with their own titles, Open Graph images and JSON-LD, `sitemap.xml`, `llms.txt`, a web manifest. Each deploy sends its URLs to IndexNow. Google Search Console needs the owner's login. |
| Home page | | done | `750d5ce` | A live program in the hero, numbers measured at build time, an install box. The first script went from 163 to 96 kB gzip. |
| Delight | | done | `b3a3b95`, `d104889`, `5afe861` | The journey of one call through the layers on the Architecture page (four hosts, with a scrubber), a command palette (Ctrl+K), and an example gallery with graph thumbnails. |
| Docs pages | | done | `1d7aed1`, `8b1bb3e`, `8e1bb12` | 41 prerendered pages under `/docs/` from the repository Markdown (guides, the client documents, each package README), with runnable program blocks, a table of contents and palette search. |
| Test-file types | low | fixed | `eca5164`, `6f019a7` | The test files of every package type-check. It found a library type defect: the collection behaviors declared `Middleware<X & Y>`, not `Middleware<X, X & Y>`. |

## Collections and the general repositories

| ID | Status | Commit | Note |
|---|---|---|---|
| BUGS-2026-07 L15 | fixed | `b5eead4` | `HashMap` iteration fails fast when the map changes. |
| PriorityQueue sift-down | fixed | `975dad9` | A poll could leave a larger element above a smaller one (found by fast-check). |
| `cue` M27 / M28 | fixed | `cue` `150df3b`, `f2bb602` | The vitest feature has a CUE file and a schema entry. The dead `onlyBuiltDependencies` block is removed. |

## The docs review (2026-10-11)

The documentation fork checked each document against the code and ran each example. It found these defects.

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| DOC-1 | medium | fixed | `d45d8ce`, `73e7278` | An array is an implicit chain only when every call in it runs now. A deferred call is data, also as a chain step. The Composer follows the same rule. |
| DOC-2 | medium | fixed | `d45d8ce` | `client.eval` evaluates its call like `exec()`, in the scope of the caller. |
| DOC-3 | low | fixed | `b09fd6e`, `633e8ad`, `d505824` | Owner decision (2026-10-12): a defined body runs exactly as `exec()` runs the same program. `prepareRootCall()` is the one root path: a list of calls in the root input is a chain, and a root `$when` is ignored. A stored program follows the same rule. |
| DOC-4 | low | fixed | `d45d8ce` | `reduce` runs a call in `initial`. `chain` implements `passThrough` and `initialInput`. |
| DOC-5 | medium | fixed | `50e831f` | `client-lib` registers `client-fs` and `client-git`. The reachability snapshot has the four `lib` to `git` edges. The tool list is unchanged. |
| DOC-6 | low | fixed | `50e831f`, `6cd398f`, `8b6ff5d` | The `bundle-mcp` root registers its packages. One `procedure.list`/`get` in core (`get` gives `{ found: false }`, not `null`). `mark client add --a 2 --b 3` prints 5. |
| DOC-7 | low | fixed | `2069d8f` | `cli.run` sent `--key value` and dropped `false` booleans. |
| DOC-8 | medium | fixed | `d0430e4` | The standalone `server` had no token and no expose rule. |
| DOC-9 | low | fixed | `314c18f` | The `engines` fields disagreed. |
| DOC-10 | low | fixed | `3b4f87a` | `invokeProcedure` keeps the scope through validation. `exec` takes an `onRef` for one program. |

## Release on npm

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| NPM-1 | | done | `8d4c3cd`, `542aca6`, `1e0365f`, `8b6ff5d` | 30 public packages at `0.1.0` with full metadata, a LICENSE and a change log. `scripts/check-packages.mjs` packs, lints (publint, attw), installs and runs every package. Changesets and an OIDC release workflow in the `npm` environment. `packages/documentation/RELEASE.md` gives the bootstrap. |
| NPM-2 | | done | `cue` `fb4b155` | `@mark1russell7/cue` 1.0.0, `splay` 0.1.0 and `docker-sqlite` 0.1.0 are on npm (2026-10-12). The monorepo uses them from npm, so no package has a git dependency, and the package check runs in strict mode. |
| NPM-3 | low | fixed | | Owner decision (2026-10-12): the bins are `client-registry` (was `client`) and `procedure-server` (was `server`), so a global install does not take a generic command name. |
| NPM-4 | low | fixed | | Owner decision (2026-10-12): the three generator scripts of `client-vitest` are deleted (git history keeps them). |
| NPM-5 | | done | `11820e6`, `ef6a327` | Owner decision (2026-10-12): the monorepo packages are `@procedures/*` (the scope `@client` belongs to an npm user). `scripts/check-scope.mjs` refuses an old name. MiniMongo and the `cue` schema use the new names. The 22 `@mark1russell7/*` 0.1.0 versions on npm get a deprecation that names the new package (`npm-bootstrap.mjs --deprecate-old`). The npm organization `procedures` exists (2026-10-12). npm refuses the first publish of the 30 packages with HTTP 429: the account made 25 new packages that day. A support request asks for a higher limit. |

## Capabilities (2026-10-13)

The effect declarations of phase D (CAPABILITIES-2026-10) read each handler. These items are what the reading found. A read-only session refuses each procedure of CAP-1 to CAP-3, which is correct for the code as it is.

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| CAP-1 | medium | open | | `db.query` starts any SQL statement and saves the file: it is not read only. A check that refuses statements that change data makes it read only. |
| CAP-2 | medium | open | | `mongo.documents.aggregate` permits `$out` and `$merge`, which write. A refusal of those two stages makes it read only. |
| CAP-3 | low | open | | `logs.query` starts the migrations, so the first query makes the database file and its table. |
| CAP-4 | low | accepted | | The git procedures that start hooks (`commit`, `push`, `pull`, `checkout`) write `process`. A `reference-transaction` hook starts also on `branch`, `fetch` and `stash`: those do not declare `process`. |
| CAP-5 | low | fixed | | `git.remote` read and wrote: with `url`, it set the URL. So `lib.scan`, which only reads the URL, had to declare that it writes. It is two procedures now: `git.remote` reads, `git.remote.set` writes. |

## Architecture roadmap

| Item | Status | Commit | Note |
|---|---|---|---|
| 0.1 Lock down the warm server | done | `8db86ec`, `43b98ee` | |
| 0.2 The MCP surface | done | `ee52893`, `e1b5b57` | |
| 0.3 One `pathToMethod` and a conformance test | done | `201f920` | `pathToMethod`/`methodToPath` in `client`. The test covers Local, HTTP, WebSocket and `Server.handle`. |
| 0.4 Live registry lookup, `procedure.delete` unregisters, MCP `list_changed` | done | `201f920`, `8a9e7c7` | |
| 1.1 Program Format v1 and one evaluator | done | `8a9e7c7`, `88edf02` | One interpreter, and `documentation/PROGRAM-FORMAT.md`. Its section 11 lists the open points. |
| 1.2 Interceptors in `invokeProcedure` | done | `9e20de8` | Timeout, tracing and metrics interceptors. Nested calls inherit the chain. The MCP server limits each tool call. |
| 1.3 A build-time manifest and a thin `mark` path | done | `978175a` | `mark --help` went from 1127 ms to 164 ms, and a warm-server call from 1170 ms to 352 ms. |
| 2.1 Standard Schema, real schemas for exposed procedures | done | `580a72a`, `8306c1e`, `830af9c`, `b223979`, `448141d` | zod 4 everywhere. The core takes any Standard Schema validator. `jsonSchemaOf()` serves MCP, `mark` and the site. Every tool has a real input schema. Every procedure has a real output schema (`448141d` for the 100 core procedures and the 20 core tools), and the MCP server sends structured output for each tool with an object result. |
| 2.2 `commandProcedure()` and the wrapper migration | done | `6638311` | As `runCommand`. |
| 2.3 One `host` package | done | `115d438`, `78758c1`, `9c3875a` | One host policy (`hostPolicy()`: expose rule, `strictCalls`, token, browser checks, interceptors) for the three hosts. `mark serve` and `mark mcp` make `mark` the one bin. The `server` and `mcp-dev-tools` bins stay as aliases, and `impl-mcp-dev/dist/server.js` serves the same 62 tools. |
| 3.1 Modules without side effects | done | `b38edf1`, `0bc8c08`, `76d0d64` | Each package has a side-effect-free `./module` entry, and `createRegistry(...modules)` builds a registry. The hosts build their own registries. Since 2026-10-13 (owner decision, P9 option C) an import of a package root registers nothing either: the `./register` entry registers, and `scripts/check-side-effects.mjs` pins it. |
| 3.2 A program store | done | `0fe2fbc`, `6567e2d` | The new package `client-store`: `ProgramStore` (memory, JSON file, collection storage). `procedure.store`/`load`/`sync` store programs, and a loaded program is data-driven again. |
| 3.3 The collections rebuild (P8) | done | `52a5f68`, `0fe2fbc` | The contract tests and the defects are done. The core no longer depends on `client-collections`: it depends only on `ws` and `zod`. |
| 3.4 A slimmer core | done | `0fe2fbc`, `1303677` | Storage moved to `client-store`, components to `client-splay`. The `dist` of `client` is 12% smaller, and the browser entry has 157 exports, not 193. |
