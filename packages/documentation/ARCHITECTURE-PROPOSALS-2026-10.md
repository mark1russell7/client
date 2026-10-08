# Architecture proposals: October 2026

> The design questions that remain after the monorepo move and the October bug work. Each one needs the owner's decision.
> They are written so they can be discussed one at a time: problem, evidence, options, recommendation, effort.
> Status of all known bugs: [BUGS-STATUS-2026-10.md](./BUGS-STATUS-2026-10.md). Decisions already made: [DECISIONS-2026-10.md](./DECISIONS-2026-10.md).

## Where things stand

- **Size:** one repository, 33 packages (down from 41), 162 procedures.
- **Builds:** `dist/` is built from source, CI runs install → build → typecheck → test → lint on every push, and all internal dependencies are `workspace:*`.
- **Tests:** 489 tests in 9 packages. In July, 4 packages had tests, and 154 of those tests checked a mock of an unrunnable layer.
  - Per package: `client` 379, `client-dag` 43, `client-lib` 17, `client-collections` 16, `client-docker` 15, `client-git` 7, `client-shell` 5, `client-splay` 4, `client-s3` 3.
- **Bugs:** of the 116 July bug IDs, 76 are fixed (43 in July, 33 in October) and 17 are obsolete because their code was deleted. 2 latent ones and 9 that need a decision remain. October also found and fixed 7 defects that were not in the register.
- **Generated docs:** `PROCEDURES.md` and `PACKAGES.md` are generated from the live registry.

## P1. One way to call a procedure (the core problem)

**Problem.** The registry holds procedures. Turning a registry procedure into a call happens in five places, each with its own rules:

| Path | Validates input | Context (metadata, signal) | Middleware (retry, cache, timeout) |
|---|---|---|---|
| `client.exec()` | yes | empty metadata | no |
| `client.route()` | yes (since October, H31) | from the call | no |
| `client.call()` through a transport | depends on the transport | from the message | yes |
| `ProcedureServer` (HTTP/WS server) | yes | from the request | server middleware |
| `mark`'s `syncRegistryToTransport` and `client-playground`'s bridge | **no** | from the message | yes |

A bare `LocalTransport` does not see the registry: `client.call()` on it fails until someone copies the registry into it. `mark` and `client-playground` each have their own copy of that bridge.

Consequences:

- A procedure behaves differently depending on how it is called. Validation, defaults, context and signal propagation depend on the path (AUDIT-2026-07 §4.1).
- Every fix has to be repeated in each path. H31 was the `route()` copy of a rule `exec()` already had.
- Streaming (P3) is only half-possible, because each path would need its own generator handling.

**Options.**

1. **A registry transport.** One `RegistryTransport` (or a registry-aware `LocalTransport`) that validates input, builds the context and runs the handler in one place. `exec()` and `route()` then call through it, so middleware applies to local calls too. `mark`, `client-playground` and `ProcedureServer` use it instead of their own bridges.
2. Keep the paths, and extract one shared `invokeProcedure(procedure, input, context)` function that all five call. It is smaller, but the middleware split stays.

**Recommendation:** option 1, in two steps:

1. `invokeProcedure()` as the single place that validates and runs a handler, used by all five paths. Small, and it removes the duplication at once.
2. A registry transport on top of it, so `exec()`/`route()` get middleware. Make that last part opt-in per client, because the cache, retry and timeout behavior of local calls would change.

Effort: step 1 M, step 2 L. Risk: medium. The 379 core tests are the safety net, plus round-trip tests per path. This unblocks P3.

## P2. Explicit tool surfaces (H18 and the bundle imports)

> **Done on 2026-10-08** (`8f8091e`). The owner approved the recommended list: no `shell.*`, add `lib.*`, no `snapshot.*` or `s3.*`. `bundle-mcp` declares `mcpNamespaces`, and the server exposes only those 68 tools. A data-driven procedure calls only exposed procedures, because an allowlist of tools alone does not stop `client.chain` from calling `shell.exec` by path. Every package root registers now (option 1). Option 3 stays a possible later step.

**Problem.** A package registers its procedures as a side effect of being imported, and what a bundle exposes is whatever its imports happen to register.

- `bundle-mcp` exposes `shell.run`, `shell.exec` and `shell.which` to Claude, although its documentation says it should not (H18). They arrive through other packages' imports of `client-shell`.
- `bundle-mcp` also imports `client-lib`, `client-snapshot`, `client-s3` and `client-test`, but those package roots do not register anything. So none of their tools reach the `dev-tools` MCP server (it has 65 tools).
- `bundle-dev` has the same problem with `client-lib` and `client-procedure`.
- `~/git/CLAUDE.md` says bundles import `<package>/register.js`. They import the package roots.

**Options.**

1. Make every package root register (one convention). Give `bundle-mcp` an explicit allowlist of the tool paths it exposes, and add a test that compares the MCP tool list with a committed snapshot.
2. Keep import-time registration as it is. Remove the imports that do nothing, and add a denylist for `shell.*`.
3. Move away from registration on import: each package exports its procedure list, and bundles register exactly the lists they name.

**Recommendation:** option 3 for the long term, because a bundle then states what it exposes. Option 1's allowlist and snapshot test can come first, since they protect the MCP surface right away.

**The decision only the owner can make:** which tools Claude should have.
- Today: `shell.*` (arbitrary commands), `docker.*`, `mongo.*`, `db.*` and `logs.*`, `cue.*`, `vitest.*`, `procedure.*` and `client.*`.
- Candidates that the bundle imports but does not expose: `lib.*` (`lib.rename` changes files), `snapshot.*` (`restore` overwrites folders), `s3.*` (`delete`), `test.*`.

Effort: S for the allowlist and snapshot test, M for option 3.

## P3. Streaming: implement it or remove it (H9, H5, H8, M2)

**Problem.** The types promise streaming, but the runtime does not deliver it:

- generator handlers are never detected (H9);
- the WebSocket transport resolves on the first frame and drops the rest (H5);
- an `out: { type: "stream" }` route config silently behaves as "collect everything" (H8);
- the retry middleware buffers a whole stream before it yields anything (M2).

`client-splay`'s streaming registry and `client.stream()` exist, but no procedure in the ecosystem streams end to end.

**Options.**

1. **Implement it:** detect generator handlers in the single invoke path from P1, add stream frames to the WebSocket protocol, thread `out` through `route()`, and make retry stream until the first item.
2. **Remove it:** delete `GeneratorHandler`, `streaming`, `outputMode`, the `out:` helpers and the stream frames, and document procedures as request/response.

**Recommendation:** do P1 first. Then implement streaming only if there is a consumer for it, for example `splay` live components or log tailing. Otherwise remove it. With P1 done, implementing it is M instead of L, because there is one path to change instead of five.

## P4. Package granularity

The move made package boundaries cheap to change. Some of today's boundaries do not earn their keep:

| Package | Observation | Proposal |
|---|---|---|
| `client-test` | Runs vitest, as `client-vitest` does. Both had the same shell-injection bug. Each has a copy of the vitest-CLI resolver. | Merge into `client-vitest` (`test.run` becomes an alias, or is deleted). |
| `client-logger` | `log.*` writes to the console only. Nothing calls it except `mark`'s dependency list. Its inputs are not validated (L21). The `logger` package (separate) and `client-sqlite`'s `logs.*` overlap with it. | Retire it, and use `logs.*` for persistent logs (ROADMAP 2.5), or wire it to `logger` with validated inputs. |
| `client-playground` | Nothing depends on it. It has its own registry-to-transport bridge (P1). | Keep it as an example, but on top of the P1 transport, or delete it. |
| `client-node`, `client-vite` | Nothing in the workspace depends on them. `mark` discovers them. | Keep. They are tools, discovered at run time. |
| `client-dag` | Generic, and only `client-lib` uses it. | Keep it as a library, or move it into `client-lib`. Low value either way. |
| `mcp` + `client-mcp` + `impl-mcp-dev` | Three layers for one MCP server (685 + 495 lines, plus the binary). | Keep `mcp` (protocol mapping) and `client-mcp` (server). `impl-mcp-dev` could become a `bin` of `bundle-mcp`. |

**Recommendation:** merge `client-test` into `client-vitest`, and decide `client-logger`. The rest is optional.

## P5. Toolchain alignment

The template root uses TypeScript 7, vitest 5 and pnpm 12. The packages mix TypeScript 5.7–5.9, vitest 3 and 4, and `@types/node` 22. They declare `node >=20`/`>=22`, while CI runs Node 26.

**Proposal:** one change that moves all packages to the template's versions, run through `pnpm -r up`. Then set the engines policy in `cue` (now safe, because `generate` keeps package-owned fields). Effort: M (TypeScript 7 may surface new type errors). Risk: low, with CI.

## P6. Prose and the STE rule

The template's rule says all prose follows ASD-STE100, checked by `ste-lint`. At the moment only the root README, CLAUDE.md and `packages/cli` are checked. The imported READMEs and doc comments would fail by the hundreds.

**Proposal:** extend the `ste.config.json` scope one package at a time as its prose is rewritten. Start with the packages that are kept long term: `client`, `client-shell` and `mark`.

## P7. Smaller decisions

- **MiniMongo** installs the archived `client-legacy` and its archived `client-*` dependencies. To pick up the fixes:
  - `link:` dependencies to `~/git/client/packages/*` for local development;
  - or publish the packages (GitHub Packages);
  - or keep the frozen versions.
  
  Recommendation: `link:` while MiniMongo is local-only.
- **`cue` generator** (M27, M28):
  - it still writes a per-package `pnpm.onlyBuiltDependencies`, which pnpm ignores in a workspace;
  - the `vitest` feature has no CUE file.
  
  Recommendation: remove the block, and either add the feature file or drop the feature.
- **Collections latent bugs** (L13, L15): implement the composite map methods through the intercepted primitives, and add a modification count to `HashMap`. Effort S each, when a consumer needs them.
- **Old documents:** `ARCHITECTURE.md` and `ONBOARDING.md` are marked as history. Rewrite them for the monorepo after P1 and P2, because those change what they would describe.

## P8. Rebuild the collections framework

The collections modules (lists, sets, queues, trees, behaviors, async queue and channels, `fx` iterators and collectors, effects, events, policies) are restored. The owner wants them as part of the framework. Eleven known defects are in them:

- C8: `ArrayDeque` loses all elements when it grows.
- C9: `PriorityQueue` is broken from construction.
- C10: `LinkedHashMap` corrupts on the first collision or resize.
- C11: `AsyncQueue` drops elements and leaves takers waiting.
- C12: the stream collectors always return their seed.
- L10: the `TreeMap` delete does not rebalance.
- L11: `synchronized()` runs the operation before it locks, and `readWriteLock` counts readers twice.
- L12: `safeDeque.poll()` removes two elements.
- L14: `readonly` does not block `setIfAbsent`.
- L16: `summarizingNumber` treats a minimum or maximum of 0 as missing.
- L17: "unbuffered" channels have a capacity of 1.

Proposal:

1. Write a contract test suite for each interface (`List`, `Set`, `Queue`, `Deque`, `Map`, `SortedMap`). Every implementation runs the same suite, with property-based tests against a plain array or `Map` model.
2. Fix or rewrite each implementation until its suite passes. Rewrite when the fix is larger than the structure (`TreeMap`, `LinkedHashMap`).
3. Decide the role of the behaviors (`bounded`, `evented`, `safe`, `synchronized`, `readonly`): wrappers of the interfaces, or middleware through `compose`, as the cache uses now.
4. Then decide where the async parts (`AsyncQueue`, channels) belong. Streaming (P3) can use them for back-pressure.

Effort: L. Status: waiting. The site and streaming are first.

## Suggested order

1. P2's allowlist and MCP snapshot test (S). It protects the tool surface before anything else changes.
2. P1 step 1, the single `invokeProcedure()` (M).
3. P4's `client-test` merge and the `client-logger` decision (S each).
4. P5 toolchain alignment (M).
5. P1 step 2, the registry transport (L), then P3 (implement or remove streaming).
6. P6 and the document rewrites, alongside the other steps.
