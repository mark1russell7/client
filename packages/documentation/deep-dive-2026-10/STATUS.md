# Deep dive 2026-10: status of each finding

This file records the status of each finding of the deep dive. The reports are in this folder. The status values are:

- **fixed**: the commit corrects the defect, and a test or a repro examines it.
- **partly**: the commit removes the risk or a part of the defect. The note gives the remaining part.
- **open**: no change yet.
- **decision**: the fix needs a decision of the owner. The note gives the recommendation.

Wave 1 (2026-10-08) fixed the findings in seven parallel branches, one for each area. The merge commits are `cd7a3ec` (transports), `b182fc3` (core-A), `bab4156` (core-B), `8c1253b` (data), `264800e` (wrappers), `988bb4b` (cli) and `2c29751` (site). The table gives the commit of each fix on its branch.

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
| MCP-3 | high | open | | The guard examines only the immediate caller. The target design is `metadata.calls` on each code procedure, checked for each nested call (wave 2). |
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
| CORE-16 / DATA-10 | low–medium | partly | `8d1e7f3` | The procedures work on the store of the caller's registry and fail with `NOT_CONFIGURED` without one. `procedure.remote connect` is `NOT_IMPLEMENTED`: a storage made at run time would give a procedure network reach. |
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
| Open | low | open | | The `CacheContext`, `CircuitBreakerContext`, `RateLimitContext` and `PaginationContext` types are never set. `mcp.serve` exposes every procedure. The cache middleware ignores the `cache.ttl`/`bypass`/`refresh` overrides, and retry ignores `delay`/`backoffMultiplier`/`maxDelay`. |

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
| Open | low | open | | `docker.logs` with `follow` and no `timeout` runs until it is cancelled. `client-snapshot` still uses `execSync` for git and pnpm. |

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
| Open | low | open | | The mongo input schemas are pass-through, so the MCP tool list does not describe `collection` or `filter` (roadmap 2.1). |

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
| Open | low | open | | `CLIMeta.interactive` and `prompts.ts` are not used (flagged). |

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
| SITE-14 | low | open | | The P5 toolchain alignment (wave 2). |
| Ideas 3, 4, 5, 7, 8 | | done | `dd37e64`, `b341068` | Problem list, virtualized trace, put-inside and wrap-in-chain, smoke test, URL filters. |
| Trace consumer edge | | decision | | It needs a hook in core hydration, for example `onRef(path, consumer)`. |
| Test-file types | low | open | | The test files of `client` (335 errors), `client-collections` (11), `client-dag` (10) and `client-git` (4) do not type-check. CI reports them as known failures. |

## Collections and the general repositories

| ID | Status | Commit | Note |
|---|---|---|---|
| BUGS-2026-07 L15 | fixed | `b5eead4` | `HashMap` iteration fails fast when the map changes. |
| PriorityQueue sift-down | fixed | `975dad9` | A poll could leave a larger element above a smaller one (found by fast-check). |
| `cue` M27 / M28 | fixed | `cue` `150df3b`, `f2bb602` | The vitest feature has a CUE file and a schema entry. The dead `onlyBuiltDependencies` block is removed. |

## Architecture roadmap

| Item | Status | Commit | Note |
|---|---|---|---|
| 0.1 Lock down the warm server | done | `8db86ec`, `43b98ee` | |
| 0.2 The MCP surface | done | `ee52893`, `e1b5b57` | |
| 0.3 One `pathToMethod` and a conformance test | done | `201f920` | `pathToMethod`/`methodToPath` in `client`. The test covers Local, HTTP, WebSocket and `Server.handle`. |
| 0.4 Live registry lookup, `procedure.delete` unregisters, MCP `list_changed` | done | `201f920`, `8a9e7c7` | |
| 1.1 Program Format v1 and one evaluator | partly | `8a9e7c7` | One interpreter for procedure-as-data. The normative format document is open. |
| 1.2 Interceptors in `invokeProcedure` | open | | |
| 1.3 A build-time manifest and a thin `mark` path | open | | |
| 2.1 Standard Schema, real schemas for exposed procedures | open | | |
| 2.2 `commandProcedure()` and the wrapper migration | done | `6638311` | As `runCommand`. |
| 2.3 One `host` package | open | | |
| 3.1 Modules without side effects | open | | |
| 3.2 A program store | open | | |
| 3.3 The collections rebuild (P8) | partly | `52a5f68` | The contract tests and the defects are done. Core still depends on `client-collections`. |
| 3.4 A slimmer core | open | | |
