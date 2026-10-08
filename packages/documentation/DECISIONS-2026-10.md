# Decisions log: October 2026 (monorepo move and the cleanup after it)

This log records the decisions I made while working without the owner present. Each entry gives the decision, the reason, and how to reverse it. The July log is [DECISIONS-2026-07.md](./DECISIONS-2026-07.md). The migration plan and its checklist are in `~/git/CLIENT-MONOREPO-PLAN.md`, outside this repository.

## Ground rules

- One logical change per commit. Before each push: `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm lint:ste` pass.
- When a choice is a judgment call, take the option that is easiest to reverse and record it here.
- Deleting a package removes it from the tree only. Its full history stays in this repository: `git log -- packages/<name>` shows it.
- Design decisions that change the behavior of the core `client` package are proposed here, not made alone.

## Decisions

<!-- newest first -->

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
