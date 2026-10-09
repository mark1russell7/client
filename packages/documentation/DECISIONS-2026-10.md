# Decisions log: October 2026 (monorepo move and the cleanup after it)

This log records the decisions I made while working without the owner present. Each entry gives the decision, the reason, and how to reverse it. The July log is [DECISIONS-2026-07.md](./DECISIONS-2026-07.md). The migration plan and its checklist are in `~/git/CLIENT-MONOREPO-PLAN.md`, outside this repository.

## Ground rules

- One logical change per commit. Before each push: `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm lint:ste` pass.
- When a choice is a judgment call, take the option that is easiest to reverse and record it here.
- Deleting a package removes it from the tree only. Its full history stays in this repository: `git log -- packages/<name>` shows it.
- Design decisions that change the behavior of the core `client` package are proposed here, not made alone.

## Decisions

<!-- newest first -->

### The deep dive, wave 1: changes of behavior and judgment calls

The owner asked for the deep dive and the fixes of its findings ("ok letsdo everythig including depedive", 2026-10-08). Seven branches fixed the findings, one for each area. [deep-dive-2026-10/STATUS.md](./deep-dive-2026-10/STATUS.md) gives the status and the commit of each finding. These fixes change behavior that a user can see. The owner can review each one:

- **One interpreter for procedure-as-data** (`8a9e7c7`). The chain's `resolveRefs` and the `resolveInputRefs` of `procedure.define` are gone. `exec()`, chain steps, control-flow operands and defined procedures all use the hydration of `ref.ts`.
  - A control-flow operand that is not a call (a branch of `conditional`, `try`, a task) is hydrated as a program: its nested calls run, and a list of only calls is a chain. Before, `conditional` gave such a branch back raw, with nothing run.
  - Sibling refs run one at a time, in order, by default. `parallel: true` runs them together. Before, they always ran together, so the order of side effects was not defined.
  - An unknown `$ref` name in a scope is an error. Before, it was `undefined` (a misspelled name gave `NaN` with no error).
  - In a `procedure.define` body, a bare `$ref` name does not read an input field. Use `input.x`.
  - `$literal` keeps a value as data.
- **The cache middleware is opt-in for each method** (`06b5172`): `createCacheMiddleware` needs `methods`. Nothing in the repository used it. Before, it cached mutations, and its key ignored the metadata, so one user could get the response of another.
- **A transport timeout is not retryable** (`06b5172`): the server can have run the call already. The per-attempt timeout of the timeout middleware is retryable.
- **`procedure.remote connect` is `NOT_IMPLEMENTED`** (`8d1e7f3`). A storage that a procedure makes at run time would give it network reach.
- **The expose rule is not applied to the target path of `procedure.define`** (MCP-4). A defined procedure is data-driven, so it can call only exposed procedures. `replace` works only over runtime-defined procedures.
- **The `mark` Dockerfile and compose file are retired** (`612e842`). A container cannot serve the local workspace with the lockfile token. Reverse with `git revert 612e842`.
- **Browser checks are on in every server transport** (`43b98ee`). A host that serves a web page from another origin must list it in `allowedOrigins`. A RESTful URL strategy needs `allowGet: true`.
- **`fs.glob` returns "/" paths, sorted** (`31152e5`), also on Windows.
- To reverse one change: revert its commit. Each commit holds one area.

### Streaming end to end, and one invocation path (P1, P3)

The owner approved both on 2026-10-08. The judgment calls:

- **`call()` gives the last item.** `procedures/types.ts` documented "stream, sponge: the last value" twice, and `call()` took the first item. The documented contract wins. For every request/response transport (one item) nothing changes. For a stream that does not end, use `stream()`.
- **An empty stream is an error** (`NO_OUTPUT`) in the sponge mode, as an empty response was before.
- **HTTP streams only for a client that asks.** A client that sends `Accept: application/x-ndjson` gets NDJSON. Other clients get the last item as JSON, so curl, MiniMongo and older clients see no change. `HttpTransport` asks.
- **The WebSocket request timeout ends at the first frame.** A stream can stay open longer: an overall deadline is the timeout middleware's job (it aborts the signal, and the transport sends `cancel`).
- **MCP results are one message.** A streaming tool reads the whole stream: one text block per item (the last 100), plus a progress notification per item when Claude Code sends a progress token.
- **Retry stops at the first item.** After an item reached the reader, a retry would repeat items, so an error passes through.
- **`route()` streams are lazy.** With `out: { type: "stream" }`, the procedure starts when the reader reads the first item, so the batch's durations do not include it.
- To reverse a part: each step is its own commit (see P3 in the proposals).

### Merge client-test into client-vitest, retire client-logger (P4)

Approved by the owner on 2026-10-08. Commit `8356474`.

- `vitest.run` returns its old counts plus `exitCode`, `stdout` and `stderr` (the last 64 KiB of each), and the coverage percentages when `coverage` is set. `vitest.coverage` replaces `test.coverage`: it runs with coverage and takes a `threshold`. `test.run` has no replacement name: `vitest.run` does what it did.
- `client-logger` and its `log.*` procedures are gone. For persistent logs, use `logs.store` and `logs.query` (`client-sqlite`). The general `logger` package is not affected.
- To reverse: restore the packages from history (`git checkout 8356474^ -- packages/client-test packages/client-logger`) and their `mark` dependencies.

### The MCP tool surface: an explicit list, and a guard for data-driven procedures (H18, P2)

The owner approved the recommended list (2026-10-08): no `shell.*`, add `lib.*`, no `snapshot.*` or `s3.*`. Commit `8f8091e`.

- `bundle-mcp` exports `mcpNamespaces`. `impl-mcp-dev` gives it to `ProcedureServer` as an `expose` rule and to the MCP transport as a tool filter. The server has 68 tools.
- A tool list alone was not enough. `client.chain` is a tool, and it calls any registered procedure by path. `shell.*` must stay registered, because `docker.*` runs through `shell.exec`. So the server applies the rule to calls from data-driven procedures too: the control-flow procedures, the procedures with the `runs-refs` tag (`dag.traverse`, `core.catch`, `client.eval`) and the procedures that `procedure.define` makes. A procedure of code calls its dependencies freely.
- The mark of a `procedure.define` procedure is on its handler, not in its metadata: the caller of `procedure.define` gives the metadata, and the registry stores copies of procedures.
- `snapshot.*`, `s3.*` and `test.*` left the bundle (they were never exposed, because their roots registered nothing).
- To reverse: remove `mcpNamespaces` from `bundle-mcp`. Then the server exposes everything, as before.

**Still open (for the deep dive):** `procedure.*` is exposed. `procedure.define` with `replace` can replace an exposed procedure with an aggregation. The guard limits what that aggregation calls, but replacing a tool is itself a change Claude can make. `procedure.load`/`sync`/`remote` need a review too.

### Every package root registers its procedures (H18, the open question below)

The nine package roots that did not import `register.js` now do: `client-lib`, `-mcp`, `-node`, `-procedure`, `-s3`, `-snapshot`, `-splay`, `-test` and `-vite`. Their `sideEffects` lists `./dist/index.js` now. The rule is the same for all packages: importing a client package registers its procedures. The bundles can keep their root imports. `mark` is not affected (it loads each `register.js` itself).

### The control-flow operands run their nested refs, and map and reduce take fn

Found while building the site's Composer (commit `5ea4d5e`). These are new defects, not July IDs.

- `chain`, `parallel`, `conditional` and `tryCatch` called each operand with its raw input. Only the top-level `exec()` ran nested refs, so `multiply { a: add {...} }` inside a chain got an object for `a`. Now each operand's `$ref`s resolve, its nested refs run, and then it runs. A control-flow operand keeps its raw input, so it stays lazy.
- `map` and `reduce` were in the "raw operands" list, but their handlers expected their refs to have run already. `map` returned the raw items and `reduce` returned `initial`. Both now take an optional `fn` ref that reads `{ $ref: "item" }`, `{ $ref: "index" }` and (for `reduce`) `{ $ref: "acc" }`. Without `fn`, the old results stay.
- **Open (a design question):** hydration turns an array whose elements are all refs into a `chain`. So `sum { values: [ref, ref] }` gets a chain result, not a list. The Composer shows a hint. Removing the implicit chain would change the procedure-as-data format, so it waits for the architecture review.

### A browser entry point, and every core procedure exported

`@mark1russell7/client/browser` exports everything except `HttpServerTransport` and `WebSocketServerTransport` (they use `http`, `express` and `ws`). The root re-exports it plus those two, so nothing changes for Node. `allCoreProcedures` is now exported, but not registered by default, so the MCP tool list did not change. Commit `1b158b1`.

### The site (packages/site)

A Vite and React app, made with the `cue-config` `app` preset, published by `.github/workflows/pages.yml` at <https://mark1russell7.github.io/client/>. Commit `1857144`.

- `lib new` makes procedure libraries, so the site is not made with it. The package files come from `cue-config init --preset app` and `generate`, and the package-owned fields (name, scripts, dependencies) are edited as the generator allows.
- The data is generated at build time from the workspace (`scripts/gen-data.mjs`) and is not committed. The generated `tsconfig.json` does not include `.json` files, so the generator writes `.js` modules with `.d.ts` declarations.
- The design tokens are the shared file of the Vex and lag sites.

### sideEffects describes what each package really does (BUGS-2026-07 H15), and an open question about the bundles

July deferred H15 because `cue-config generate` overwrote `sideEffects` (H33). H33 is fixed, so each package now declares the modules that have effects when they load:

- `["./dist/index.js", "./dist/register.js"]`: packages whose index re-exports `register.js`. Importing the root registers the procedures, so a bundler must keep both. These are `bundle-dev`, `client-cli`, `-cue`, `-docker`, `-fs`, `-git`, `-logger`, `-mongo`, `-pnpm`, `-server`, `-shell`, `-sqlite` and `-vitest`.
- `["./dist/register.js"]`: packages whose index does not reach `register.js`. These are `bundle-mcp`, `client-lib`, `-node`, `-procedure`, `-s3`, `-snapshot`, `-splay`, `-test` and `-vite`.
- `client`: `["./dist/index.js", "./dist/procedures/index.js"]`, because the core `client.*`/storage/meta procedures register in `procedures/index.ts`.
- Packages that register nothing keep `false`.

In Node this changes nothing (Node ignores the field). It matters for bundlers: before, a bundler could drop every registration.

**Open question for the owner (answered 2026-10-08: see "Every package root registers its procedures"):** the bundles import package roots (`import "@mark1russell7/client-s3"`). For the 9 packages in the second group, that import registers nothing.

- `bundle-mcp` "includes" `client-lib`, `client-snapshot`, `client-s3` and `client-test`, but the `dev-tools` MCP server has none of their tools. The 65 tools have no `lib.*`, `snapshot.*`, `s3.*` or `test.*`.
- `bundle-dev` gets no `lib.*` or `procedure.new` from its imports. (The `mark` CLI is not affected: it loads every package's `register.js` itself.)

Making the imports register would add `s3.delete`, `snapshot.restore` (which overwrites folders), `lib.rename` and others to the tools Claude can call on this machine. That is a decision about the tool surface, so it is listed in the proposals instead of done here. The two options:

1. Make each root import register (the convention the bundles assume), and keep the MCP surface deliberate by having `bundle-mcp` list what it exposes.
2. Remove the imports that do nothing from the bundles.

### Delete the batching middlewares and the wildcard collection procedures (BUGS-2026-07 M3, M8)

July's roadmap (Phase 1.6) says for dead core subsystems: "wire it end-to-end with a test, or delete it. Deletion is a legitimate and often better answer." Both of these are exported from `client`, broken, and unused anywhere in the ecosystem, so I deleted them.

- `createBatchingMiddleware` and `createAdaptiveBatchingMiddleware` (M3) made a new queue for each request, so they never batched anything and only added their wait time to every call. The base `processBatch` sent the requests one at a time anyway: there is no batch wire format to batch into. Their `BatchingContext` type went too.
- The generic `collections.*.get/set/delete` procedures (M8) were registered at literal `"*"` paths, but the registry, `LocalTransport` and the server match paths exactly, so nothing could ever call them. `createCollectionProcedures()`, the working per-collection factory, stays.

Reverse with `git revert`. A real batching feature needs a batch request format on the transports first.

### MCP tools now have real input schemas (side effect of a zodAdapter fix)

`zodAdapter()` now keeps the wrapped Zod schema's `_def` and `shape` visible (commit `f2d870c`), to fix `mark`'s help and flag parsing. The MCP layer recognizes Zod schemas by `_def`, so the `dev-tools` tools exposed to Claude Code now carry their real JSON Schemas instead of `{type: "object", additionalProperties: true}`. The tool names are unchanged (65). This is intended: Claude gets the parameter names, types and required fields. If a tool's generated schema ever causes trouble, the converter falls back to the permissive schema on a conversion error.

### Collections, step 2: keep only what the ecosystem uses (plan Phase 5.4, DECISIONS-2026-07 step 5)

July listed "Collections: shrink-and-keep, or delete outright?" as an open decision. Both options start by removing the parts nobody uses, and only that part is done here. The used part stays as the package, and its tests now exist.

How I found the used part:

- A script (`~/git/_migration/scripts/collections-usage.mjs`) listed every import of a collection symbol outside the collections code. The only users are `client`'s cache middleware (`compose`, `lruMap`, `ttlMap`, `hashMap`, `MapLike`), `client`'s storage code (`CollectionStorage`, `InMemoryStorage`) and `client-mongo` (`CollectionStorage`, `StorageMetadata`).
- The transitive closure of those symbols is 12 modules (approximately 3,300 lines, without the storage files that moved to `client`).

The other 26 modules (approximately 10,400 lines, no consumer anywhere) are deleted:

- lists, sets, queues and trees;
- the bounded, evented, readonly, safe and synchronized behaviors;
- the async queue and channels;
- `fx` iterators and collectors;
- effects, events and policies.

This includes all five "born-broken" structures of the July register: `ArrayDeque` (C8), `PriorityQueue` (C9), `LinkedHashMap` (C10), `AsyncQueue` (C11) and the collectors (C12). They are obsolete, not fixed.

The package now has 10 tests for what it keeps (`hashMap`, `lruMap`, `ttlMap`, their composition, `InMemoryStorage`). Before this it had none. Reverse with `git revert`, or restore single modules from history.

**Reversed on 2026-10-08.** The owner wants these modules kept: they are part of the intended framework, not dead code. The 25 modules, the full `index.ts` exports and the README are restored from `c24d357^`. The later fixes to `lru`, `ttl` and the composite methods stay. The known defects of the restored modules (C8–C12, L10–L12, L14, L16, L17) are open again. Their rebuild is ARCHITECTURE-PROPOSALS P8.

### Collections, step 1: one copy, no dependency cycle (plan Phase 5.4, DECISIONS-2026-07 steps 2–4)

The July session deferred this because it touched the core package across repositories, with no safety net. In the monorepo it is one atomic commit, checked by the full test suite and CI. What changed:

- `client/src/collections/` (the embedded copy) is deleted. `client` now depends on `@mark1russell7/client-collections`. The cache middleware imports `compose`, `lruMap`, `ttlMap` and `hashMap` from the package. `client`'s 369 tests, which include the cache tests, pass unchanged.
- `ApiStorage` and `HybridStorage` moved into `client/src/procedures/storage/`, next to the storage factory that uses them, with `git mv` so their history follows. They need a `Client`, so in the package they made a cycle: `client-collections` had `client` as a peer and dev dependency. That dependency is gone. July's plan, step 2.
- `client`'s root barrel no longer re-exports the approximately 200 collection symbols. Its own comment admitted a name conflict with the client middleware. A new subpath export, `@mark1russell7/client/collections`, re-exports the package plus `ApiStorage` and `HybridStorage`.
  - Before this change, nothing in the ecosystem imported collection symbols through the `client` root. I checked every import of `@mark1russell7/client` and `@mark1russell7/client-collections`. The only users are `client-mongo` (`CollectionStorage`, `StorageMetadata`, from the package) and `client` itself.
  - MiniMongo installs the archived `client-legacy`, so it is not affected.
- Verified: the procedure catalog lost exactly the procedures of the packages deleted earlier (176 → 162), and the MCP tool list is unchanged (65).

Step 2 (delete the modules nothing uses) is a separate commit. Reverse with `git revert`.

### Delete ecosystem (plan Phase 5.1)

The manifest (`ecosystem.manifest.json`) listed one repository per package. The workspace (`pnpm-workspace.yaml`) is that list now. All readers of the manifest in this repository moved to the workspace:

- `mark` discovery;
- `generate-procedures.mjs`;
- `lib.scan`, `lib.new` and `lib.audit`.

The `ecosystem` package's own loader API had no consumers (AUDIT §3). Outside this repository, `cue`'s `validate structure` command still looks for `~/git/ecosystem/ecosystem.manifest.json`, and falls back to its defaults when the file is missing. Reverse with `git revert`.

### Retarget lib.scan, lib.new, lib.audit and lib.rename at the workspace (plan Phases 5.2 and 5.3)

These procedures stay useful in one repository, so they now work on the pnpm workspace instead of `~/git` and the manifest. Their default root is the workspace that contains `client-lib`, and `rootPath` overrides it. A new helper module, `client-lib/src/workspace.ts`, finds the root.

- `lib.scan` lists `packages/*`. It reads the branch and the remote once, because all packages share one repository. Its dependency edges include `workspace:*` links, so `dag.traverse` and `ecosystem.procedures` keep working.
- `lib.new` creates `packages/<name>`. It no longer runs `git init` or `gh repo create --private --push`, and no longer edits the manifest. It now also writes `src/register.ts`, the `./register` export, `client.procedures` and the `workspace:*` dependency on `client`. This fixes the second half of C5: generated packages lacked `register.ts` and `client.procedures`.
  - It runs `cue-config` from the workspace's own `node_modules` through `shell.run` with an argument list. Before, it ran `npx` through `shell.exec` with the preset interpolated into a command string. A new folder has no `node_modules`, so `npx` could download an unrelated `cue-config` from the registry, and the interpolation was the injection pattern of the July audit.
  - The `--preset` value is now validated (lowercase letters, digits and hyphens).
  - Verified for real: a scaffolded package installs, builds, and its `register.js` loads.
- `lib.audit` uses a built-in template instead of the manifest. `dist/` is no longer required, because it does not exist before a build. It skips `packages/cli` (the template's repository tool).
  - Its pnpm checks now look for problems that are real in a workspace: per-package lockfiles, per-package `pnpm` fields (pnpm ignores them), and `github:` references to packages of the workspace (they must be `workspace:*`).
  - The old `onlyBuiltDependencies` check is gone. All 33 client packages pass.
- `lib.rename` defaulted to `process.env.HOME + "/git"`. On Windows without `HOME` that was `"undefined/git"`.
- The `skipGit` and `skipManifest` inputs of `lib.new` are gone. Zod strips unknown keys, so old callers do not fail.
- New tests: 17, against temporary workspaces, with a fake client that serves `fs.*` from disk.

### Retire lib.install, lib.pull, lib.refresh and the aggregation layer (plan Phase 5.2)

These procedures exist only because each package was its own git repository:

- `lib.install` cloned every manifest repository into `~/git`.
- `lib.pull` ran `git pull` in each repository.
- `lib.refresh` ran `rm -rf node_modules dist`, then install, build, `git add -A`, commit and push, in each package folder.

In the monorepo they are wrong and dangerous:

- `lib.refresh` on a package folder would commit and push the whole repository.
- `lib.install` would clone 41 archived repositories back into `~/git`.

`git pull`, `pnpm install` and `pnpm build` now do these jobs.

The aggregation layer (`register-aggregations.ts`, `*-aggregation.ts`, `procedures/lib/aggregations/`) was a declarative mirror of the same procedures. The July audit found it unrunnable (H17): it calls procedures that were never registered. Its parity tests ran against a mock executor that returns `{}` for any path, so they could not see that. Its 6 test files (154 tests) tested only that layer and went with it. `client-lib` has no tests until the next change adds workspace-scan tests, so its `test` script uses `--passWithNoTests`.

The idea of "procedure-as-data workflows" is not abandoned. It lives in the core `client` combinators (`client.chain`, `client.conditional` and the others), which are tested.

Kept, and retargeted at the workspace in the next change: `lib.scan`, `lib.new`, `lib.audit`, `lib.rename`, `ecosystem.procedures`, `dag.traverse`, `core.catch`. Reverse with `git revert`. The deleted code is in history.

### Delete test, mock-client, mock-fs and mock-logger (plan Phase 5.1)

The plan said: delete `mock-client` and `mock-logger`, and delete `test` and `mock-fs` "if nothing imports them". One thing used `test`: the `vitest.config.ts` of `client-dag` imported `sharedConfig`. That config is mostly vitest defaults. The values that matter (`environment: "node"`, 10-second timeouts) are now written directly in `client-dag`'s config. After that, nothing used the four packages:

- `client`, `client-dag` and `mark` listed `test` or `mock-client` as devDependencies but never imported them.
- `test` re-exported the three mocks, and nothing imported `test` except that config.
- The July audit graded them F (`mock-client`: `createMockClient()` throws), D- (`mock-logger`), C- (`mock-fs`: it mocks an interface that `client-fs` cannot accept) and "not procedures, name collides with client-test" (`test`).

The removal also cleared the only `pnpm peers check` problem (`mock-client` wanted vitest 3). The general repositories `logger` and `splay` still list `github:mark1russell7/test#main` as an unused devDependency. The archived repository stays installable, so they are not affected. Reverse with `git revert`.

### Delete scaffold, client-connection and client-server-mongo (plan Phase 5.1)

The July audit marked all three as dead, and the migration plan scheduled their deletion. Nothing in the workspace depends on any of them.

- `scaffold`: an abandoned third code generator (AUDIT §2.3). Nothing used it.
- `client-connection`: 100% dead. `addConnection()` is never called, and it reimplements the core WebSocket transport (AUDIT §3). Its `connection.*` procedures leave the `mark` listing.
- `client-server-mongo`: its `stop` and `status` procedures never worked (`register()` is never called). The roadmap (2.3) retires the Mongo server tier. MiniMongo still installs the archived repository, so MiniMongo is not affected.

Reverse with `git revert` of the deletion commit.

### Archive the 41 old repositories before GitHub finished counting contributions

The plan said to archive only after the new repository's contributions appeared on the profile. I archived `client-playground` first as a canary. Its contributions stayed counted after archiving (3 in 2025, plus 1 for the notice commit), so archiving does not remove contributions. Archiving the old repositories also cannot change how GitHub counts the new repository. So I archived the rest without waiting. Reverse with `gh repo unarchive mark1russell7/<repo>`.
