# Documentation & Repo Health Audit — mark1russell7 procedure ecosystem

Audited 2026-07-10 against `ecosystem/ecosystem.manifest.json` (**48 packages**, not 47 as several docs claim). Read-only; no files modified.

## Doc drift findings

Severity: **HIGH** = documented command/procedure fails or misleads a user or AI agent into a broken call; **MED** = materially wrong facts/counts/coverage; **LOW** = cosmetic/stale metadata.

### PROCEDURES.md
Verified by grepping `.path([...])` registrations in every client-* package's `src/`.

1. **HIGH** — L58 `fs.append`, L59 `fs.delete`, L63 `fs.list`, L67 `fs.write.json`, L69 `fs.watch`: none exist. Actual procedures are `fs.rm` and `fs.readdir` (undocumented). client-fs registers 11 procedures, not the 15 claimed at L638.
2. **HIGH** — L118 `git.merge`, L121 `git.tag`: do not exist. L120 `git.stash` is actually 7 procedures (`git.stash.push/pop/apply/drop/list/export/import`). Undocumented: `git.fetch`, `git.init`, `git.isClean`, `git.hasChanges`, `git.hasLocalCommits`, `git.hasStagedChanges`, `git.hasUnstagedChanges`, `git.hasUntrackedFiles`. Actual count: 26, not 14 (L639).
3. **HIGH** — L193-196 `pnpm.exec`, `pnpm.list`, `pnpm.outdated`, `pnpm.update`: do not exist. Actual: `pnpm.install/add/remove/run/link/store.path` (6, not 8 per L641). `pnpm.link` and `pnpm.store.path` undocumented.
4. **HIGH** — L232 `docker.push`, L238 `docker.images`: do not exist. Actual count 10, not 12 (L642).
5. **HIGH** — L382-384 `s3.copy`, `s3.exists`, `s3.getUrl`: do not exist. Undocumented: `s3.multipart.init/upload/complete/abort`. Actual 8, not 7 (L645).
6. **HIGH** — L578-586 DAG section: `dag.build` and `dag.visualize` exist nowhere. client-dag registers **zero** procedures (it's a data-structure library); `dag.traverse` is registered by **client-lib**, not client-dag. L653 count "client-dag: 3" → actual 0.
7. **MED** — L465-479 procedure.* attributed entirely to client-procedure. Reality: client-procedure registers only `procedure.new`, `procedure.list`, `procedure.get`, `procedure.export` (4). `procedure.define/delete/register/store/load/sync/remote` live in **client core** (`client/src/procedures/define-procedure.ts`, `client/src/procedures/storage/procedures.ts`). `procedure.remote` and `procedure.export` are undocumented. L648 count 9 is wrong for either attribution.
8. **MED** — L571-574 snapshot table omits `snapshot.diff` (exists); L652 count 4 → actual 5.
9. **MED** — L601-609 agg section lists only `agg.lib.install`. client-lib's `register-aggregations.ts` registers **16**: `agg.git.commitAndPush/initWorkflow/pull`, `agg.pnpm.installAndBuild/install`, `agg.cleanup.force`, `agg.fs.ensureDir`, `agg.lib.new/scaffold/refresh(.single)/install(.single,.cloneMissing)/pull(.single)`.
10. **MED** — Whole registered namespaces missing from the catalog: `client.*` (~108 combinator/core procedures in `client/src/procedures/core/` — array 26, math 15, string 14, object 11, type 11, comparison 8, meta 7, core 16), `server.*` (10 incl. `server.call`, `server.connections`, `manifest.generate`, `_discovery.announce`), `connection.*` (7), `log.*` (7, client-logger), `node.*` (4), `vite.*` (4), `server.mongo.*` (4), `splay.bridge.*` (2), `core.catch` + `ecosystem.procedures` (client-lib). L654 "Total ~100+" materially understates ~250+.
11. **LOW** — L646 client-lib count "8": actual 10 direct + 16 aggregations. mongo (16) and sqlite (4) counts are correct.

### PACKAGES.md
12. **HIGH** — L342 bundle-dev "Includes everything: fs, git, shell, pnpm, docker, mongo, sqlite, lib, etc." — **false**. `bundle-dev/src/register.ts` imports only shell, fs, cli, pnpm, lib, git, dag, procedure. No docker/mongo/sqlite/s3/vitest/test/snapshot.
13. **HIGH** — L119 `mark procedure new pkg fs.x` — wrong signature. `procedure.new` takes one positional `name` (regex `^[a-z][a-z0-9]*(\.[a-z]...)*$`) plus `--path` for the project dir; a package positional is rejected.
14. **MED** — Procedure counts wrong: L134 client-fs 15→11, L146 client-git 14→26, L172 client-pnpm 8→6, L185 client-docker 12→10, L224 client-s3 7→8, L237 client-lib 8→10(+16 agg), L263 client-procedure 9→4, L325 client-snapshot 4→5.
15. **MED** — L568-581 stats: "Total 47" vs 48 in manifest; "Other 5" never itemized. Ten manifest packages have **no entry anywhere in the file**: client-logger, client-collections, client-node, client-vite, client-server-mongo, server-mongo, minimongo, client-playground, scaffold, documentation.
16. **LOW** — L64 `cue-config add typescript vitest` — no `typescript` feature; valid features are `git,npm,ts,react,node,node-cjs,vite,vite-react,cue,vitest` (cue/features.json). Should be `ts`.

### README.md
17. **HIGH** — L211-216: example claims importing `@mark1russell7/bundle-dev/register.js` makes `docker.ps` available — false (bundle-dev has no docker). L89 "Full development bundle with all procedures" and L149 "(100+ procedures)" overstate it similarly.
18. **MED** — L5 badge "Node.js >= 20" conflicts with `engines` in cue, splay, client-splay (`node >=25.0.0, npm >=11.0.0`).
19. **LOW** — L25 "40+ packages" (48). L104-114 quick-install verified working (`node cli/dist/index.js` executes because `cli.ts` self-runs at import — legitimate but fragile design).

### ONBOARDING.md
20. **HIGH** — L271, L295, L438: `mark procedure new my-package fs.custom` / `procedure new PACKAGE fs.myproc` — fails: first positional binds to `name`, whose regex rejects hyphens, and the second positional is unmapped. Correct usage is `mark procedure new fs.custom --path <project-dir>` (matches CLAUDE.md L27-28).
21. **MED** — L22-23 prerequisites "Node.js >= 20" — installing cue/splay/client-splay under Node 20-24 violates their declared `engines` (>=25). Docs and engines fields need reconciliation in one direction or the other.
22. **LOW** — L94/L110 "40+ packages" (48). Everything else spot-checked OK: cli build scripts exist, `impl-mcp-dev/dist/server.js` exists, `MCP_BUNDLES`/`MCP_DEBUG` env vars verified in `impl-mcp-dev/src/config.ts`, `lib install/scan/refresh --all` procedures exist.

### ARCHITECTURE.md
23. **HIGH** — L57-62 (mermaid), L100-102 (ASCII), L535-543, and the L563-586 bundle comparison table all show bundle-dev containing docker/mongo/sqlite/testing — false (see #12). The comparison table's bundle-dev column is wrong in 3 of 5 rows.
24. **MED** — L211 dependency matrix "client │ logger, ws": client depends only on `ws`; `@mark1russell7/logger` is **not** a dependency of client (also wrong at L76/L187 `Client --> Logger`).
25. **LOW** — L230 "client-sqlite │ client, sql.js": sql.js actually arrives via the `docker-sqlite` dependency. L236 "mcp │ client, zod": actual deps are `zod-to-json-schema` + peer `client: *`.

### SYSTEM_ARCHITECTURE.md
26. **MED** — L90/L270 "37+ packages" and Appendix A (L2189-2227, 37 rows) predate 11 packages: client-collections, client-node, client-vite, client-server-mongo, server-mongo, server, mcp, client-mcp, impl-mcp-dev, bundle-mcp, documentation. Dated "December 2024"; the entire MCP layer is absent from the doc.
27. **MED** — Appendix E presets (L2286-2289) don't match `cue/features.json`: actual `lib=[ts,cue,vitest]`, `react-lib=[react,cue,vitest]`, `app=[vite-react,cue,vitest]` (doc says lib=git,npm,ts,node etc.). Feature deps: `node-cjs→ts` (doc says node), `cue→npm` (doc says none).
28. **LOW** — L2198 client-git "(27 procedures)" → 26. (L2202 client-fs "(11)" is correct — this doc is more accurate than PROCEDURES.md.)

### ecosystem/README.md
29. **HIGH** — L60-67 `npm install @mark1russell7/ecosystem` (or github ref) produces a **broken package**: `main` points to `dist/index.js`, but `dist/` is gitignored (`ecosystem/.gitignore`) and there is no `prepare`/`postinstall` build hook. All import examples (L227-398) fail for an external consumer. (Locally moot: `cli/src/ecosystem.ts:80` reads `~/git/ecosystem/ecosystem.manifest.json` directly off disk and never imports the package.)
30. **MED** — L72-73 "Node.js >= 25.0.0, npm >= 11.0.0" — ecosystem/package.json declares **no** engines field, and this contradicts ONBOARDING's ">= 20".
31. **LOW** — L3 npm version badge (package not published to npm; all distribution is github refs). L577-579 "npm test" is `echo 'No tests for ecosystem package'`. API functions (`manifest`, `getPackageNames`, `getPackage`, `getRootPath`, `getPackagePath`) verified to exist; `cue-config validate-manifest`/`validate-structure` verified to exist in `cue/src/cli.ts`.

### CLAUDE.md
32. **MED** — L72 architecture diagram: "Bundle Packages (client-dev, client-git, etc.)" — `client-dev` doesn't exist (it's `bundle-dev`), and client-git is a CLI-wrapper package, not a bundle (contradicts its own naming conventions at L133-134). Command examples (L10, L22, L27-28) verified correct.

### DOCUMENTATION_AUDIT.md
33. **LOW** — L6/L19 "47" packages / "47/47 READMEs" — 48 packages, all 48 have READMEs. Tier assessments are subjective and were not falsified.

### IDEAS.md
34. **LOW** — Stale backlog: several items are now built but not checked off — "Procedures in Database" (procedure.store/load/sync/remote exist in client core), "MiniMongo client-server bridge" (server-mongo + client-server-mongo now exist), `lib pull` exists. Section 7's "ACTION" items are unverifiable as done/not-done.

## Repo health table

Sweep: `git status --porcelain` count, commits ahead of upstream, dist mtime vs src mtime, `*.test.ts|*.spec.ts` count, README presence. All 48 repos are on `main` with an upstream; **0 unpushed commits anywhere**; all have READMEs.

| Package | Dirty files | Unpushed | Dist state | Test files | README |
|---|---|---|---|---|---|
| cue | 0 | 0 | fresh | 0 | yes |
| client | 0 | 0 | fresh | 10 | yes |
| client-cli | 1 | 0 | **STALE** | 0 | yes |
| client-logger | 1 | 0 | **STALE** | 0 | yes |
| client-mongo | 1 | 0 | **STALE** | 0 | yes |
| client-server | 10 | 0 | **STALE** | 0 | yes |
| client-sqlite | 1 | 0 | **STALE** | 0 | yes |
| client-splay | 1 | 0 | **STALE** | 0 | yes |
| cli | 8 | 0 | fresh | 4 (e2e/) | yes |
| docker/mongo | 0 | 0 | fresh | 0 | yes |
| docker/sqlite | 0 | 0 | fresh | 0 | yes |
| ecosystem | 0 | 0 | fresh (untracked in git, no prepare) | 0 | yes |
| logger | 0 | 0 | fresh | 3 | yes |
| splay | 0 | 0 | fresh | 5 | yes |
| splay-react | 0 | 0 | fresh | 0 | yes |
| MiniMongo | 0 | 0 | fresh | 0 | yes |
| client-fs | 1 | 0 | **STALE** | 0 | yes |
| client-git | 1 | 0 | fresh | 0 | yes |
| client-connection | 1 | 0 | **STALE** | 0 | yes |
| client-cue | 1 | 0 | **STALE** | 0 | yes |
| test | 0 | 0 | fresh | 0 | yes |
| client-dag | 0 | 0 | fresh | 3 | yes |
| client-shell | 16 | 0 | fresh | 0 | yes |
| client-test | 1 | 0 | **STALE** | 0 | yes |
| client-lib | 1 | 0 | **STALE** | 6 | yes |
| mock-client | 5 (deletions) | 0 | **MISSING** | 0 | yes |
| mock-logger | 5 (deletions) | 0 | **MISSING** | 0 | yes |
| mock-fs | 0 | 0 | fresh | 0 | yes |
| client-vitest | 1 | 0 | **STALE** | 0 | yes |
| scaffold | 0 | 0 | fresh | 0 | yes |
| client-pnpm | 1 | 0 | **STALE** | 0 | yes |
| client-procedure | 1 | 0 | **STALE** | 0 | yes |
| bundle-dev | 0 | 0 | fresh | 0 | yes |
| client-docker | 1 | 0 | **STALE** | 0 | yes |
| client-playground | 0 | 0 | fresh | 0 | yes |
| client-s3 | 1 | 0 | **STALE** | 0 | yes |
| client-snapshot | 1 | 0 | **STALE** | 0 | yes |
| client-collections | 0 | 0 | fresh | 0 | yes |
| client-node | 1 | 0 | **STALE** | 0 | yes |
| client-vite | 1 | 0 | **STALE** | 0 | yes |
| client-server-mongo | 1 | 0 | **STALE** | 0 | yes |
| server-mongo | 0 | 0 | fresh | 0 | yes |
| server | 0 | 0 | fresh | 0 | yes |
| mcp | 0 | 0 | fresh | 0 | yes |
| client-mcp | 0 | 0 | fresh | 0 | yes |
| impl-mcp-dev | 0 | 0 | fresh | 0 | yes |
| bundle-mcp | 0 | 0 | fresh | 0 | yes |
| documentation | 0 | 0 | fresh | 0 | yes |

Key observations:
- **A half-landed refactor is stranded uncommitted across ~22 repos** (working trees dirty since ~Feb 2026, ~5 months): the local `zodAdapter`/`outputSchema` helpers were deleted from each package's `src/register.ts` in favor of importing them from `@mark1russell7/client` (which does export them — committed and pushed). In ~18 of those repos the edit was **never rebuilt** (dist older than src) and never committed. client-shell and client-git were rebuilt but not committed.
- **client-server has real WIP beyond the refactor**: two untracked new procedures (`src/procedures/server.call.ts`, `src/procedures/server.connections.ts`) plus 8 modified files — uncommitted.
- **cli has uncommitted src+dist changes** (`lockfile.ts`, `server-mode.ts`).
- **mock-client and mock-logger have deleted `dist/` and `pnpm-lock.yaml` (deletions uncommitted)** — since dist is the committed distribution artifact ecosystem-wide, these repos are locally broken and one `git add -A && commit` away from breaking consumers (`client` devDeps and `test` depend on them).
- Dist staleness matters here because **47/48 packages commit `dist/` to git** as the install artifact for `github:` refs, and most have no `prepare` script (only cue, client, client-mongo, client-server, cli, docker/*, client-cue do). A "commit without rebuild" ships stale code.
- **42 of 48 packages have zero test files.** Only client (10), client-lib (6), splay (5), cli (4 e2e), logger (3), client-dag (3) have any.

## Dependency/version analysis

- **Linking model**: every internal reference uses `github:mark1russell7/<repo>#main` — uniformly. No `file:`, `link:`, or `workspace:` protocols anywhere; no pnpm workspace. Coherent, but it means (a) semver `version` fields are dead metadata, and (b) every consumer pins a moving branch, so reproducibility rests entirely on committed `dist/` + lockfiles.
- **BUG — server-mongo/package.json L34-35**: duplicate JSON key —
  `"@mark1russell7/client-mongo": "github:mark1russell7/client-mongo#main",`
  `"@mark1russell7/client-mongo": "github:mark1russell7/client#main"` — the second (wrong) entry wins on parse, so `@mark1russell7/client-mongo` resolves to the **client** repo. Line 35 was almost certainly meant to be `"@mark1russell7/client": ...`. As-is, server-mongo installs the wrong package under client-mongo's name and lacks a direct `client` dep.
- **Version field drift** (harmless but incoherent): `1.0.0` ×24, `0.0.0` ×14, `0.0.1` ×8 (the newer server/mcp generation), `0.1.0` ×2 (docker/*). splay is `0.0.0` while splay-react is `1.0.0`.
- **Peer-dependency pattern inconsistency**: client-collections, mcp, client-mcp declare `"@mark1russell7/client": "*"` as a peerDependency (+ dev github ref), while every other client-* package puts client in `dependencies`. Two conventions coexist undocumented.
- **Identity mismatches vs manifest**: manifest key `@mark1russell7/minimongo` but `MiniMongo/package.json` name is **`minimongo`** (unscoped); manifest key `@mark1russell7/documentation` but `documentation/package.json` name is **`"unnamed"`** (version 0.0.0 — its git history even says "Refreshed package unnamed"). Both break name-based resolution/tooling that trusts the manifest.
- **Engines drift**: `node >=25 + npm >=11` (cue, splay, client-splay) vs `node >=20` (client, docker/*, MiniMongo, client-mongo, client-server, server-mongo) vs **no engines at all** (the other 38). No `packageManager` field anywhere, despite pnpm-lock.yaml files and docs prescribing pnpm >= 8.

## Config consistency

- **tsconfig**: fully centralized via cue — every package is a one-line `extends`. Effective compiler options are identical everywhere (base.json: `strict: true` + max-strictness flags, `target: esnext`, module `nodenext` via esm.json, `composite: true`). The only cosmetic split: 22 packages extend `.../node.json` and 22 extend `.../ts.json` — semantically identical since `node.json` just re-extends `ts.json`. True outliers: splay-react and MiniMongo (react.json; MiniMongo disables declaration/composite), ecosystem (adds redundant `outDir`), cue (local relative path — necessarily).
- **dependencies.json** (cue feature manifests): present and schema-referenced in all 48 (ecosystem lacks the `$schema` key; cue self-references a local path). But they've drifted from reality in both directions:
  - **cli** declares feature `node-cjs`, yet its tsconfig extends `node.json` (ESM) and package.json is `type: module` — the declared feature no longer matches generated config.
  - The **17 packages declaring the `vitest` feature have no vitest devDependency, no test script, and no tests**, while the 5 packages that actually run vitest (client, logger, splay, client-dag, client-lib) do **not** declare the feature and hand-maintain vitest ^3/^4 devDeps. The feature system and reality are inverted.
- **package.json scripts**: uniform core (`build: tsc -b`, `typecheck`, `clean`) — good. `prepare` present in only 8 packages; ~24 rely on `postinstall: client announce` (a discovery hook, not a build). ecosystem is the only package whose committed state can't be consumed as a dependency (dist gitignored + no prepare).
- **documentation/package.json**: `name: "unnamed"` — scaffolding bug worth fixing (see identity mismatches above).

## Roadmap candidates (prioritized)

1. **Fix server-mongo/package.json duplicate `client-mongo` key** (line 35 → should be `@mark1russell7/client`). One-line correctness bug affecting installs.
2. **Land or revert the stranded zodAdapter refactor** across the ~22 dirty repos: for each, rebuild (`tsc -b`), commit src+dist together, push — or `git checkout` to abandon. Highest-leverage hygiene item; the ecosystem has been half-migrated for ~5 months. Include: finish/commit client-server's new `server.call`/`server.connections` procedures, cli's lockfile/server-mode changes, and commit (or restore) mock-client/mock-logger dist deletions — decide whether dist stays tracked there, since consumers install from github.
3. **Rewrite PROCEDURES.md, ideally generated** — it is the wrongest doc (5 fs, 2 git, 4 pnpm, 2 docker, 3 s3, 2 dag phantom procedures; 8+ namespaces missing entirely). The registry is introspectable (`PROCEDURE_REGISTRY.list()` / `ecosystem.procedures` procedure / `mark --help`), so a doc-gen script would end this class of drift permanently.
4. **Correct the bundle-dev story everywhere** (README.md L89/L149/L211-216, ARCHITECTURE.md L57-62/L100-102/L563-586, PACKAGES.md L342): either update docs to say bundle-dev = shell/fs/cli/pnpm/lib/git/dag/procedure, or actually add docker/mongo/etc. to bundle-dev if that was the intent.
5. **Fix the `procedure new` signature in ONBOARDING.md (L271, L295, L438) and PACKAGES.md (L119)** — currently teaches a command that errors. Align with CLAUDE.md's correct one-positional form.
6. **Reconcile Node engine policy**: pick >=20 or >=25, apply via cue to all 48 `engines` fields, and update README badges, ONBOARDING prerequisites, and ecosystem/README. Add a `packageManager` field while at it.
7. **Fix package identities**: `documentation` name `"unnamed"` → `@mark1russell7/documentation`; decide `minimongo` vs `@mark1russell7/minimongo` and align manifest or package.json. Make ecosystem installable (track dist or add `prepare`) or drop its npm-install instructions from its README.
8. **Refresh PACKAGES.md**: add the 10 missing packages (client-logger, client-collections, client-node, client-vite, client-server-mongo, server-mongo, minimongo, client-playground, scaffold, documentation), fix counts, fix the 47→48 stats table.
9. **Update SYSTEM_ARCHITECTURE.md Appendix A** (+11 packages, entire MCP layer) and Appendix E (presets now `[ts|react|vite-react, cue, vitest]`), or mark the doc as a dated snapshot.
10. **Re-sync dependencies.json with reality** (the vitest-feature inversion, cli's node-cjs): either make `cue-config generate` enforce features → package.json, or run it across the fleet and commit. Then fix CLAUDE.md L72 (`client-dev` → `bundle-dev`; client-git isn't a bundle).
11. **Test coverage breadth**: 42/48 packages have zero tests — client-shell (the foundation of every CLI wrapper), client-fs, client-git, and the mcp/server packages are the riskiest gaps given everything routes through them.
