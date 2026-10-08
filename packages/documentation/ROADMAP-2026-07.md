# Remediation Roadmap — July 2026

> Companion to [AUDIT-2026-07.md](./AUDIT-2026-07.md) and [BUGS-2026-07.md](./BUGS-2026-07.md).
> Phases are ordered by leverage and dependency: earlier phases unblock or de-risk later ones.
> Bug IDs (e.g. `C1`, `H19`) reference the defect register. Effort is rough: **S** ≤ half a day,
> **M** ≈ 1–3 days, **L** ≈ a week+.

## Progress log — 2026-07-11 (autonomous execution)

Worked top-down through the roadmap. **All 48 repos are clean and pushed to `origin/main`.**
Every change was verified (`tsc` + tests where a harness exists) before commit; each fix is its own
commit. Decisions made without a human are in [DECISIONS-2026-07.md](./DECISIONS-2026-07.md).

**Done (landed + pushed):**
- **Phase 0** — all of it (cache C1, server-mongo dup key H24, MCP stdout M39/Bug5, network defaults
  H19, `lib new` C5, identity fixes M41), plus the ~5-month stranded zodAdapter/outputSchema refactor
  landed across ~22 repos.
- **Phase 1a** — H1 (child-client crash), L1/H16 (WebSocketState value + subpaths), H10 (timeout
  signal), H11 (circuit breaker), M4 (unref timers), M6/M7 (HTTP body-parse + error-status mapping).
- **Phase 1b/1c** — **the hydration/control-flow fix landed** (C2/H2/H3/M35): `exec()` no longer
  pre-executes control-flow operands, so `chain`/`conditional`/`tryCatch`/`parallel` are now correct,
  with a 7-test regression suite. Plus H13, H14/H28, and **H4** (`procedure.define` now registers in
  `PROCEDURE_REGISTRY` so it is callable). Dead-code deleted (~2,232 lines: `middleware-override.ts`,
  `sponge.ts`, `validation/schemas/`).
- **Phase 2 (partial)** — DAG **H27** fixed in both `client-dag` and the `client-lib` vendored copy.
- **Phase 3 (partial)** — real Zod input validation for `client-mongo`/`client-sqlite`; `logger`,
  `client-dag`, and `client` got new regression tests (incl. a Client↔transport round-trip suite);
  a **build-freshness checker** (`scripts/check-build-freshness.mjs`) — all 48 packages currently fresh.
- **Phase 4 (partial)** — **PROCEDURES.md is now generated** from the live registry
  (`scripts/generate-procedures.mjs`, 176 procedures); Node `>=20` engine policy documented;
  PACKAGES.md filled in the 10 missing packages. Fixed a real duplicate-registration bug
  (`procedure.list` in both core and `client-procedure`) found via the generator.
- Also (parallel workflow): **C4** — the `client-git` shell-injection class eliminated (argv
  execution, injection-proof); **client-snapshot** resurrected (C6/C7/H25/M23/M24); `client-fs`
  (M18/M19/M20), `client-s3` (M21 + `s3.listAll`), `mcp` (M39) fixed.

**Also done in the later continuation:** H4 (`procedure.define` callable), ~2,232 lines dead code
deleted, **PROCEDURES.md generated from the registry** + `check-build-freshness.mjs`, Client↔transport
round-trip tests, a `procedure.list` duplicate-registration fix, **DAG de-duplication** (client-lib now
uses `@mark1russell7/client-dag`; vendored copy deleted; 154 tests pass), and **HTTP C3 + bug 16** fixed
(client defaults to POST so payloads are never dropped; server default routes by URL path matching the
client, with round-trip tests; raw HttpServerTransport host now defaults to 127.0.0.1, completing H19).

**Remaining (deferred — risky or needs human design):**
- **Collections consolidation** (Phase 2.1) — **assessed hands-on and deliberately deferred**; see the
  detailed decision + concrete plan in [DECISIONS-2026-07.md](./DECISIONS-2026-07.md). Too risky to
  merge unattended: it touches the core package, needs a network install of a self-peer, zero-test
  standalone, and would cascade to all 48 repos on failure. Best done with a test harness + human present.
- **`client-connection` / `scaffold`** retirement (Phase 2.3/2.4) — deleting whole manifest packages is
  aggressive to do unattended; both are dead but harmless.
- **`@mark1russell7/ecosystem` made real** (Phase 2.6) — multi-package refactor (repoint cli/client-lib/
  cue at the loader).
- **WS transport rewrite H5/H6** (Phase 1.4) — per-request queue + intentional-close flag; needs a WS
  round-trip harness. (HTTP C3 is now done.)
- **`engines >=20` fleet-wide via cue** (Phase 4.3) — `cue-config generate` clobbers custom `exports`
  (H33), so running it across 48 packages needs H33 fixed first.
- **H15 `sideEffects`** — deferred to a deliberate per-package pass (see DECISIONS).

---

## Guiding principle

The ecosystem's problem is not lack of ambition — it's **too many half-finished things and no feedback loop to catch regressions**. So the roadmap front-loads (a) finishing the one refactor already 80% done, (b) fixing the handful of bugs that silently corrupt data or expose the machine, and (c) establishing the missing feedback loop (tests + CI + doc generation). Only then does it tackle the larger structural consolidation, because consolidation without tests is how the born-broken collections structures happened in the first place.

---

## Phase 0 — Stop the bleeding (P0, ~1 week)

The smallest set of changes that ends active data loss, closes the exposed surface, and makes the fleet build again. Do these first, in this order.

1. **Land or revert the stranded `zodAdapter`/`outputSchema` refactor** (H20, and AUDIT §4.3). **L.**
   ~22 repos have uncommitted trees; ~20 have `dist/` older than `src/`. For each: rebuild (`tsc -b`), verify `tsc --noEmit` passes against the *installed* core, commit `src` + `dist` together, push. Fixes H20/H21 and the `client-logger`/`client-splay`/`client-connection`/`client-server-mongo` build breaks in one sweep. Include the genuine WIP: `client-server`'s new `server.call`/`server.connections` procedures and `cli`'s lockfile/server-mode changes. Decide the fate of `mock-client`/`mock-logger` (their `dist/` deletions are uncommitted) — see Phase 2.

2. **Fix C1 — the cache key generator.** **S.**
   Replace `JSON.stringify(payload, Object.keys(payload).sort())` with a stable stringify that recurses correctly (sort keys at every depth via a replacer *function*, not an array) and guards non-object payloads. This is live in MiniMongo and silently returns wrong data. Add a unit test with two distinct nested payloads.

3. **Security defaults** (H19, H18, and §7). **M.**
   - Default `host` to `127.0.0.1` in `client-server/src/peer/index.ts` and `server.create`; gate `0.0.0.0` behind an explicit `--public` flag **plus** a required bearer token (the WS transport already supports `authenticate`; add the HTTP equivalent). Fix the wildcard-origin + `credentials:true` CORS combo.
   - Decide `bundle-mcp`'s posture: either intentionally include `shell.*` and correct the README, or split "register shell procedures" from "import client-shell as a library" so `client-cli`/`client-docker`/`client-test` stop transitively registering them. Add a snapshot test asserting the exposed MCP tool list.

4. **Fix C5 — `mark lib new` output.** **M.**
   Inject the package name into CUE (e.g. a tagged field `cue eval -t name=…`, or post-write the name in `lib.new`), and add the missing `register.ts`/`client.procedures`/`postinstall`/test scaffolding so generated packages match real ones. Fix the `documentation` and `minimongo` package identities (M41) while here. Add an e2e assertion that the generated `package.json` name is correct (the current e2e only checks file existence). **This unblocks trusting the mandated workflow in `CLAUDE.md`.**

5. **Fix H24 — `server-mongo` duplicate dependency key** (one line) and **fix the MCP stdout hazards** (H-tier / M39): route `client-mcp`'s debug `log()` to stderr, and remove/guard the `console.log` in `lib.rename` and other MCP-reachable handlers (a process-wide `console.log`→`console.error` redirect in `impl-mcp-dev` before loading bundles is a cheap belt-and-suspenders). **S.**

---

## Phase 1 — Core correctness (P1, ~2 weeks)

The `client` package is the foundation; these bugs make its advertised composition model unreliable. Decide the hydration semantics **first** (it's a design decision, not just a fix) because C2/H2/H3 and several others all flow from it.

1. **Resolve the hydration/control-flow mismatch** (C2, H2, H3, and AUDIT §4.2). **L.**
   Make `chain`/`conditional`/`tryCatch`/`and`/`or`/`parallel` actually defer their operand refs — either by defaulting known control-flow inputs to `$when:"$parent"`, or by executing refs lazily inside the handlers. Remove (or restrict to the top-level `exec` argument) the implicit-chain array hijacking that crashes C2. Preserve `$when`/`$name` through all JSON conversions. **Add end-to-end `exec()` tests** — today's 344 tests call handlers directly and would not catch any of this.

2. **Unify the two execution paths** (AUDIT §4.1). **L.**
   Route `exec()`/`route()` through the middleware chain (e.g. an in-process transport that consults the registry), fold `runtimeProcedures` into `PROCEDURE_REGISTRY` with a `source:"runtime"` tag (fixes H4), and propagate `CallOptions`/context/signal/bus into `ProcedureContext`. Fix H1 (`createChild` field init) as part of this — it's a one-liner but currently crashes every child client's `exec`.

3. **HTTP transport round-trip** (C3 + M6/M7). **M.**
   Make the client encode payloads for GET (or default to POST-only), align the server's URL strategy with the client's (`defaultUrlPattern.parse` already exists and is unused), and map errors via the `ERROR_REGISTRY` `httpStatus` metadata instead of `parseInt`. Add a round-trip test against the Express adapter — it would have caught C3/M6/M7 immediately.

4. **WebSocket transport response-path rewrite** (H5, H6, M5, L29). **M.**
   Per-request queue/AsyncGenerator instead of a one-shot promise; an intentional-close flag; a separate request-timeout option; reject pending requests on close; remove payload/token logging (M10).

5. **Middleware correctness** (H10, H11, M2, M3, M4). **M.**
   Restore `context.message.signal` in a `finally` (H10); make the circuit breaker observe `status.type==="error"` items (H11); stop re-instantiating stateful middleware per call; `unref()`/clear the leaking timers.

6. **Wire or delete the dead core subsystems** (H7, H8, H9, M8; AUDIT §4). **M.**
   `middleware-override.ts`, `consumption.ts`/`sponge.ts` (threading `outputConfig` through would also give generator handlers an execution path, fixing H9), `validation/schemas/`, and the wildcard `collections.*` procedures. For each: wire it end-to-end with a test, or delete it. Deletion is a legitimate and often better answer.

7. **Packaging hygiene** (H15, H16, L1). **S.**
   Drop `sideEffects:false` (or set `["./dist/register.js"]`) fleet-wide; add the `./middleware`/`./server` export subpaths; export `WebSocketState` as a value.

---

## Phase 2 — Consolidation (P1–P2, ~2–3 weeks)

Collapse the duplication. Each item removes a whole class of "fix-it-twice" and shrinks the surface.

1. **Collections** (AUDIT §6; C8–C12, L10–L17). **L.**
   Declare `@mark1russell7/client-collections` canonical and **delete `client/src/collections/`**. Break the client↔client-collections dependency cycle by keeping `CollectionStorage`+`InMemoryStorage` (client-free) in the package and moving `ApiStorage`/`HybridStorage` (which need `Client`) into `client`. Then **cut scope to the load-bearing ~15%** (`HashMap`, `ArrayList`, `LRUCache`/`TTLCache`, `compose`, effects, storage interface); quarantine or delete the never-run modules rather than fixing 5 critical bugs in code with zero consumers. If any structure is kept, property tests are non-negotiable.

2. **DAG** (H27; AUDIT §5.1). **M.**
   Fix `executeDAG` error handling (try/catch → failed `NodeResult`; rejection-safe cleanup), then **de-duplicate**: make `client-lib` import `@mark1russell7/client-dag` (it's generic and diff-identical) and delete `client-lib/src/dag/`. Give `client-dag` the real `dag.execute` procedure the aggregation layer expects (Phase 3), or fold it into `client-lib` and retire the package — but stop the no-op import in `bundle-dev`.

3. **Servers & Mongo tier** (H22, H23, H24). **M.**
   Delete or wire `client-connection` (reimplement `connection.*` as a thin facade over core's WS tracked-connection API). Retire the Mongo-server tier: `server.mongo.start` is functionally `server --procedures @mark1russell7/client-mongo/register`, so delete `server-mongo`/`client-server-mongo` — or fix them (call `register()`, fix the dup key) if the lifecycle procedures are wanted.

4. **Codegen** (AUDIT §2.3). **M.**
   Retire `scaffold` (archive it, or extract only its type-enforced schema-registry idea). Decide the aggregation layer's fate (Phase 3). This leaves `cue` + `client-lib` imperative as the single codegen path.

5. **Logging** (H30, M40, L21). **M.**
   Pick one story: retire `client-logger` and standardize on `client-sqlite`'s `logs.*`, **or** wire `client-logger` into a bundle and give `logger` a transport that forwards to `logs.store`. Independently, decide whether core's 188 `console.*` calls route through `logger` (the docs' stated design) or whether that claim is dropped. Harden `logger` (allSettled around writes, copy the transports array in `child()`).

6. **Make `@mark1russell7/ecosystem` real** (AUDIT §5). **S–M.**
   Move manifest loading + `~` expansion into the package and consume it from `cli`/`client-lib`/`client-cue`/`cue` (5+ copies today). Wire an "unlisted packages on disk" check into `lib.audit` (would have caught `otel-ts`). Make the package installable (track `dist` or add a `prepare` hook).

---

## Phase 3 — Validation & testing (P2, ongoing)

The missing feedback loop. Without this, everything above regresses.

1. **CI + build-freshness gate.** **M.** A pre-push (or CI) check that `dist/` is not older than `src/` and that `tsc --noEmit` passes against installed deps — the two failure modes that let the stranded refactor and stale builds persist for 5 months.
2. **Real input validation** (M12, M13, C-tier §4.6). **M.** Give `client-mongo`/`client-sqlite`/`client-server` genuine Zod input schemas (page/limit bounds, integer LIMIT/OFFSET, confirm flags). Ensure every transport path — including direct-handler registration like MiniMongo's `dev.ts` — runs `safeParse`.
3. **Tests where the risk is** (AUDIT §4.7). **L.** Priority order: `client-shell` (foundation), the transports (round-trip), `client-fs`/`client-git`, the mcp/server handshake, and `client-mongo`/storage (via `mongodb-memory-server`). A snapshot test of the live MCP tool list guards §7.1.
4. **Fix or finish the aggregation layer** (H17). **M.** Register the missing `*.single`/`dag.execute` procedures (or repoint the refs), and rewrite the parity tests to run the *real* executor via `procedure.define` instead of a mock that returns `{}` for any path (which is why the breakage is invisible today). Or delete the agg layer and its misleading `@deprecated` notices.

---

## Phase 4 — Documentation regeneration (P2, ~3–4 days)

The existing docs mislead; several teach commands that error. Prefer generation over hand-editing where possible.

1. **Generate `PROCEDURES.md` from the registry.** **M.** It's the wrongest doc (phantom `fs.*`/`git.*`/`pnpm.*`/`docker.*`/`s3.*`/`dag.*` procedures; ~150 real procedures omitted, including the entire `client.*` combinator family). The registry is introspectable (`PROCEDURE_REGISTRY.list()`, `ecosystem.procedures`, `mark --help`) — a doc-gen script ends this drift class permanently.
2. **Correct the load-bearing errors by hand:** the bundle-dev "includes everything" claim (README, ARCHITECTURE, PACKAGES); the `procedure new` signature (ONBOARDING, PACKAGES); `CLAUDE.md`'s `client-dev`→`bundle-dev`. **S.**
3. **Reconcile the Node engine policy** (>=20 vs >=25 vs unset across the fleet) and apply it via `cue` to all 48 `engines` fields; add a `packageManager` field; update README badges. **S.**
4. **Refresh `PACKAGES.md`** (add the 10 missing packages, fix counts, 47→48) and mark `SYSTEM_ARCHITECTURE.md` as a dated snapshot or update its Appendix A (+11 packages, the entire MCP layer) and Appendix E (presets). **S.**
5. **Adopt this audit's `AUDIT-2026-07.md` reality map** as the architecture reference until `ARCHITECTURE.md` is corrected. **—**

---

## Decisions the audit can't make for you

These are genuine forks in the road where the "right" answer depends on intent, not correctness. Flagged so they don't stall the mechanical work:

- **Is the ecosystem meant to be externally consumable, or single-user?** This sets the bar for security (§7), packaging (`sideEffects`, `prepare`, published versions), and the `github:#main` moving-target dependency model. Most Phase 0 security items are "must" for the former and "nice" for the latter.
- **Keep `dist/` committed, or move to a build step?** Committing `dist/` is the current install mechanism but is the direct cause of stale-build skew. A `prepare` hook + gitignored `dist/` is the standard alternative but requires every consumer to build on install.
- **Collections: shrink-and-keep, or delete outright?** Only ~15% is used, and that 15% could be ~150 lines of bespoke LRU/TTL + an interface. Keeping the Java-collections clone is a maintenance commitment with no current consumer.
- **Aggregation/declarative codegen: finish or abandon?** It's an appealing idea (procedure-as-data workflows) but currently unrunnable and its tests hide that. Finishing it depends on Phase 1's hydration decision landing first.

---

## Sequencing at a glance

```
Phase 0  ██████  hygiene + live bugs + security defaults   ← do first, unblocks builds
Phase 1      ████████  core correctness (hydration decision gates the rest)
Phase 2          ████████  consolidation (needs Phase 3 tests to be safe)
Phase 3      ██████████████  tests + CI + validation  ← start early, run alongside 1–2
Phase 4                  ████  docs (generate after Phase 1–2 stabilize the surface)
```

Phase 3 is drawn spanning 1–2 deliberately: write the test for each core/consolidation fix *as* you make it, not after. That is the single habit whose absence produced most of this register.
