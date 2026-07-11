# Audit Report — Observability, Mocks, and UI/Visualization Support

Scope: `logger`, `client-logger`, `mock-client`, `mock-logger`, `mock-fs`, `splay`, `splay-react`, `client-splay`, `client-dag` (~5.6k LOC read in full). All dynamic claims below marked "verified" were confirmed by executing code against the built `dist/` output; everything else is from reading source.

## Package summaries

| Package | Purpose | Key files | Build/test state | Grade | Verdict |
|---|---|---|---|---|---|
| **logger** | Zero-dependency structured logger: `Logger` class, levels (ERROR=0..TRACE=4), transports (console/memory/callback), formatters (simple/timestamped/JSON), default-logger singleton | `logger\src\logger.ts`, `types.ts`, `transports.ts`, `formatters.ts` | dist built; 51/51 tests pass (vitest 3.2.4) | **B** | Alive as code, **vestigial in practice** — nothing in the ecosystem consumes it except client-logger (which itself is unused); `client` core uses raw `console.*` (188 call sites) |
| **client-logger** | Registers `log.debug/info/warn/error/trace/setLevel/getLevel` procedures wrapping a singleton logger with a **console transport — no persistence** | `client-logger\src\register.ts` | dist built (stale); **`tsc --noEmit` fails today** (installed `@mark1russell7/client` has no `outputSchema` export); zero tests | **D** | **Vestigial** — no bundle imports it, `cli/package.json:35` declares it but cli src never imports it, zero `["log", ...]` callers anywhere |
| **mock-client** | Test double for the procedure-calling interface: call/exec tracking, mockResponse/mockImplementation | `mock-client\src\index.ts` | **no dist, no node_modules in repo**; `createMockClient()` **throws at runtime** (verified) | **F** | **Dead** — no test in the workspace imports it (only re-exported by `test/src/mocks/index.ts`, which nothing consumes) |
| **mock-logger** | Test double for Logger with entry capture and `hasLogged` matchers | `mock-logger\src\index.ts` | no dist; same fatal `require("vitest")` pattern; zero tests | **D-** | **Dead** — zero consumers |
| **mock-fs** | Generic in-memory string filesystem (readFile/writeFile/exists/unlink/mkdir/readdir) | `mock-fs\src\index.ts` | dist built; no tests despite README's "tested with Vitest" badge | **C-** | **Vestigial** — mocks an interface no code uses; `client-fs` hard-imports `node:fs/promises` (`client-fs/src/procedures/fs/read.ts:7`) with no injection seam, so this can never be wired in |
| **splay** | **Recursive, type-dispatched data renderer core** (not a splay tree): `inferType` → registry lookup → viewer factory with recursive `ctx.render`; plus grid/list/split layout math, path helpers, async value `resolve` | `splay\src\dispatch.ts`, `infer.ts`, `registry.ts`, `layout.ts` | dist built; 42/42 tests pass | **B+** | **Alive** — consumed by `MiniMongo` (`MiniMongo/src/renderer/types.ts:15`) |
| **splay-react** | React adapter: primitive components emit serializable `ComponentOutput`, hydration map converts to React elements, `<Viewer>` combines both | `splay-react\src\Viewer.tsx`, `hydrate.tsx`, `components.ts` | dist built; typecheck passes; **no tests** | **B-** | **Alive** — consumed by MiniMongo |
| **client-splay** | Bridge: splay-*shaped* registries backed by RPC procedure calls (`components.{ns}.{type}`), framework-agnostic + React hydration of descriptors, stream utilities | `client-splay\src\registry.ts`, `streaming.ts`, `hydrate.ts` | dist built (stale); **`tsc --noEmit` fails today** (same `outputSchema` drift in `register.ts:8`); zero tests | **C** | **Alive but shaky** — MiniMongo uses `createClientRegistry`; two stream utilities are verified-broken; registers only 2 trivial procedures (`splay.bridge.info/health`) |
| **client-dag** | Generic DAG library: Kahn's topological sort with level assignment, level-parallel executor with concurrency limit, ancestor/descendant utilities | `client-dag\src\dag\traversal.ts`, `executor.ts`, `builder.ts` | dist built; 41/41 tests pass | **B-** | **Vestigial as a package, alive as code** — client-lib declares the dep but imports its own **vendored copy** (`client-lib/src/dag/*`); the only import of the actual package is a **no-op side-effect import** in `bundle-dev/src/register.ts:19` (it registers no procedures) |

Answer to a scoped focus question: **`logs.store` / `logs.query` do not live in client-logger at all.** They are registered by `client-sqlite` (`client-sqlite/src/register.ts:132,176`) and persist to **SQLite at `~/logs/cli/cli.db`** (`client-sqlite/src/types.ts:15`). client-logger's `log.*` procedures write to a console transport only — nothing persists.

Circular-dependency question: **No cycle.** `client/package.json` depends only on `ws` (+ zod/express peers); `logger` has zero runtime deps. The problem is the opposite of a cycle: total disconnection (see Architecture flaws).

## Bugs

**1. `mergeStreams` silently drops ~half of all stream values — critical, certain (verified by execution)**
`client-splay\src\streaming.ts:309-322`
```ts
while (active.size > 0) {
    const promises = Array.from(active).map(async (iter) => {
      const result = await iter.next();
      ...
    const { iter, result } = await Promise.race(promises);
```
Every loop iteration calls `.next()` on **every** active iterator (advancing all of them), then keeps only the race winner; the losers' already-consumed values are discarded. Verified: merging two 3-element streams yielded `["a0","a1","a2"]` — 3 of 6 values, stream b entirely lost.

**2. `debounceStream` deadlocks (hangs forever) — critical, certain (verified by execution)**
`client-splay\src\streaming.ts:402-420`
```ts
await new Promise<void>((r) => { resolve = r; });
```
For an empty (or already-drained) source stream, the processor finishes without ever calling `resolve`, and the consumer loop awaits a promise nothing will resolve. Verified: consuming `debounceStream(emptyStream, 10)` never completes (2s watchdog fired). Additional races: the final-emit path (line 391) can push to `outputs` while `resolve` is null with the timer already cleared — same permanent hang for non-empty streams whose last value arrives inside the debounce window; the `Promise.race([processor.then(()=>true), Promise.resolve(false)])` check (line 411) always yields `false` unless the processor settled earlier.

**3. `executeDAG` rejects wholesale and loses all results if a processor throws — high, certain (verified)**
`client-dag\src\dag\executor.ts:25-37` and `:82`
```ts
const promise = fn(item).then((result) => {
      results.push(result);
      executing.delete(promise);
    });
```
No `.catch`; `await processor(node)` at line 82 is unwrapped. A processor that throws (instead of returning a failed `NodeResult`) rejects the entire `executeDAG` — the partially-filled `results` map and `failedNodes` reporting are lost, and the rejected promise is never removed from `executing`. Verified: `executeDAG` rejected with `boom`, no partial results. This matters because the package's own README teaches exactly the throwing form (see Doc drift #2), and `onNodeStart`/`onNodeComplete` callbacks throwing hit the same path. Identical bug in the vendored copy at `client-lib\src\dag\executor.ts:48-106`, which is what `lib.install`'s dependency-graph execution actually runs.

**4. `createMockClient()`/`createMockLogger()` throw on every call — high, certain (verified)**
`mock-client\src\index.ts:71`, `mock-logger\src\index.ts:68`
```ts
const { vi } = require("vitest") as typeof import("vitest");
```
Bare `require()` of vitest inside an ESM (`"type": "module"`) package. Verified against the installed copy in `client/node_modules`: `Error: Vitest cannot be imported in a CommonJS module using require()` (vitest ≥3 has no CJS entry; under stricter loaders it's a `ReferenceError` instead). The mocks' core factory functions cannot work at all with the declared peer range.

**5. Async transport failures become unhandled rejections (process-crash risk) — high, certain (verified)**
`logger\src\logger.ts:56-58`
```ts
for (const transport of this.transports) {
      transport.write(entry);
    }
```
`Transport.write` may return `Promise<void>` (types.ts:76) and `CallbackTransport.write` does; the returned promise is discarded. A rejecting async callback (the README's own webhook example, `logger/README.md:573-579`) produces an unhandled rejection — verified — which terminates a default-configured Node process.

**6. failFast never skips within a level; the "Skipped" branch is dead code — medium, certain (verified)**
`client-dag\src\dag\executor.ts:70-79` vs `:89-97`. `shouldStop` is only set in the result-collection loop *after* `executeWithConcurrency` resolves for the whole level, so the `if (shouldStop)` guard inside the per-node fn can never be true. Verified: with `failFast: true` and an immediate failure, the slow same-level sibling still ran to completion and zero "Skipped due to earlier failure" results were ever produced. Behavior (stop scheduling *subsequent levels*) is defensible, but the code and result vocabulary promise per-node skipping that cannot happen.

**7. `log.*` procedures perform zero input validation — medium, certain**
`client-logger\src\register.ts:72-76` uses `outputSchema<LogInput>()` for **inputs**; `outputSchema` is an explicit pass-through (`client\src\procedures\core\schemas.ts:99-105`: `parse: (data) => data as T`). Calling `log.info` with `{}` or garbage sails through to `logger.info(undefined)`. Same pattern in `client-splay\src\register.ts:29-31` (harmless there — void inputs) and, notably, across many other `client-*` register files, undermining the ecosystem's "procedures with Zod schemas" premise.

**8. client-logger and client-splay no longer compile against their installed `client` dependency — high (build health), certain (verified)**
`client-logger\src\register.ts:8` and `client-splay\src\register.ts:8` import `outputSchema` from `@mark1russell7/client`, but the GitHub-installed client dist in their `node_modules` (built 2026-01-19) predates that export — `tsc --noEmit` errors TS2305 in both packages today. The committed `dist/` folders were built against an older/local state, masking the break.

**9. `Logger.child()` aliases the parent's transports array — medium, certain (verified)**
`logger\src\logger.ts:106-113` passes `transports: this.transports` by reference; `addTransport`/`removeTransport` on a child mutates the parent (and vice versa). Verified: a transport added to a child received the parent's writes. Sharing for *writes* is tested and intended; sharing the mutable array is almost certainly not.

**10. `LoggerOptions.formatter` is accepted and never used — low, certain**
`logger\src\logger.ts:29` stores `this.formatter`; no code path reads it. `types.ts:109-110` documents it as "Default formatter for transports that don't have one" — each transport constructs its own `SimpleFormatter` regardless. The README's "Multiple Transports" example (`logger/README.md:581-584`) passes a `JsonFormatter` that silently does nothing. (Same for `ConsoleTransportOptions.colors`, at least admitted as "Future use".)

**11. Calling the exported `registerLogProcedures()` always throws — low/medium, likely**
`client-logger\src\register.ts:166-179` auto-registers at import **and** exports the function; `ProcedureRegistry.register` throws `RegistryError` on duplicates without `override` (`client/src/procedures/registry.ts:98-103`). Any consumer following the README's exported-function API gets "Procedure already registered". Same pattern in `client-splay\src\register.ts:73-78` (`registerBridge`).

**12. mock-fs fidelity deviations from real fs — low, certain (verified)**
`mock-fs\src\index.ts:75-87` `readdir()` on a nonexistent dir returns `[]` (real fs: ENOENT — verified); `:37-41` `initialFiles` don't create parent directory entries, so `exists("a")` is `false` while `readdir("a")` lists children (verified); `:70-74` non-recursive `mkdir` succeeds with missing parents; `:65-69` `unlink` deletes directories (real fs errors) leaving orphaned children still listable.

**13. `pathDepth` ignores array-index nesting — low, certain**
`splay\src\path.ts:9-11` counts `.`-segments only, while `arrayPath` (`:1-3`) appends `[i]`; array children therefore get the same `depth` as their parent in `dispatch` (`splay/src/dispatch.ts:28`). Any depth-limited or depth-styled rendering miscounts inside arrays. (client-splay's own bridge avoids this by tracking `depth + 1` explicitly — `client-splay/src/registry.ts:220-226`.)

**14. Streaming "buffer" discards all but the newest output — low, possible-by-design**
`client-splay\src\streaming.ts:100-122`: with `bufferSize > 1`, N-1 of every N outputs are dropped ("Yield the most recent output (discard older ones)"). Reasonable for latest-wins progressive rendering, but the `bufferSize` name/docs suggest batching, not decimation.

## Architecture flaws

1. **The observability stack is fully disconnected.** No logger↔client cycle exists — but only because nothing is wired: `client` core does not depend on `logger` and contains 188 raw `console.*` call sites; `client-logger` is registered by no bundle (`bundle-dev/src/register.ts` omits it), imported by nothing (cli declares-but-never-imports it), and called by nothing. Meanwhile actual log persistence (`logs.store`/`logs.query`) lives in `client-sqlite` with its own level strings and schema, sharing nothing with `logger`'s `LogLevel`/transport model. Three logging systems (logger transports, `log.*` console procedures, `logs.*` SQLite procedures), zero integration.
2. **client-dag is duplicated wholesale inside client-lib.** `client-lib/src/dag/{traversal,executor,builder}.ts` is a monomorphized copy of client-dag (diff confirms identical logic); `client-lib/package.json:35` declares the client-dag dependency but `client-lib/src/procedures/lib/install.ts:33` imports `../../dag/index.js`. Bug #3 exists in both copies and must be fixed twice. Additionally client-dag violates the workspace's own `client-*` naming convention (CLAUDE.md: "client-* packages define and register procedures") — it has no procedures, no client dependency, and `bundle-dev/src/register.ts:19`'s side-effect import of it is a documented-but-false no-op.
3. **client-splay's `splay` dependency is unused, and the descriptor type system exists in triplicate.** No client-splay source file imports `@mark1russell7/splay` (package.json declares it); it hand-duplicates splay-compatible `Registry`/`RenderContext` interfaces in `client-splay/src/types.ts` and sources `ComponentOutput`/`Size` from `@mark1russell7/client/components` — so the same descriptor shape is independently defined in `splay/src/types.ts:41-50`, `client/src/components/types.ts:37+`, and consumed via structural compatibility maintained by hand. `createClientRegistry.has()` also always returns `true` (`registry.ts:121-125`), meaning splay's fallback path can never trigger when this registry is plugged into `splay.dispatch`; unknown types fail later as RPC errors.
4. **The entire mock tier is stale and orphaned.** No test file in the workspace imports `createMockClient`/`createMockLogger`/`createMockFs` (only the `test` package re-exports them, and its mock entry point has no consumers). mock-client mocks the `ProcedureClient` mini-interface (`call(path, input)` — `client/src/procedures/types.ts:157-165`), not the real `Client.call(Method, payload, options)` (`client/src/client/client.ts:292`), which is fine for handler tests but unstated; mock-logger's `MockLogger` omits `errorWithException`, `addTransport`, `removeTransport`, `flush`, `close`, so it is not substitutable where a real `Logger` is typed, and its `child()` captures into a separate entries array (real child loggers share the parent's transports); mock-fs mocks an API `client-fs` cannot accept (direct `node:fs/promises` imports, no seam). Peer ranges pin vitest `^3.0.0` while the ecosystem's core has moved to vitest `^4.0.16`.
5. **GitHub-`#main` dependency installs ship stale committed `dist/`,** producing the class of break in Bug #8: workspace `client/src` exports `outputSchema`, the installed client dist doesn't, and downstream packages' committed dists paper over it until the next real build.
6. **splay subsystem layering is sound but thin**: splay (core, zero deps) ← splay-react (React adapter) is clean and alive via MiniMongo; client-splay bolts an RPC registry onto client's *own* components module rather than splay's, making "bridge between splay and client" true only in spirit. No browser-API hazards found: client-splay accesses `console`/`setTimeout` via `globalThis` shims (`hydrate.ts:16-22`, `streaming.ts:16-22`) and runs fine under Node (verified); splay-react requires React, as expected for bindings.

## Doc drift

1. **client-logger README documents an inverted log-level enum** (`client-logger/README.md:272-279`: claims `TRACE=0 … ERROR=4`; actual `types.ts`: `ERROR=0 … TRACE=4`), repeats the error for `log.setLevel` ("0=TRACE"), claims `LOG_LEVEL_NAMES` is an array (it's a `Record`), documents `parseLogLevel(string | number): LogLevel` (actual: string-only, returns `LogLevel | null`), documents `ConsoleTransportOptions {console?: Console}` (actual `{formatter?, colors?}`), `CallbackTransportOptions callback:(entry)=>void` (actual `(entry, formatted)`), and a `LogEntry.levelName` field that doesn't exist.
2. **client-dag README documents a nonexistent API**: `buildDAG`, `getRoots(dag)`, `getLeaves(dag)` (`client-dag/README.md:286-289` and throughout) — actual exports are `buildLeveledDAG` and `dag.roots`/`dag.leaves` properties. Worse, all "Use Cases" examples pass raw `async (pkg) => {...}` functions as the processor (`README.md:388-426`), which per Bug #3 rejects the whole run at the first throw and otherwise produces `NodeResult`-shaped garbage. A second stale README (`README_NEW.md`) sits beside it.
3. **logger README**: MIT badge/license section vs `package.json` `"license": "ISC"`; "Integration with Ecosystem" section (`README.md:647-701`) showing `client-*` packages and procedures using `getDefaultLogger()` is aspirational — no such usage exists anywhere.
4. **client-splay README** badges "Node.js >= 20" while `package.json` engines require `>=25`; the register.ts blurb implies a meaningful procedure surface, but only `splay.bridge.info` and `splay.bridge.health` exist.
5. **bundle-dev** (`src/register.ts` header comment + `src/index.ts:13`) claims importing `client-dag` registers dependency-graph procedures; client-dag registers nothing.
6. **mock-fs README** carries a "tested with Vitest" badge (no tests exist); **mock-client README** promises a "fully-featured, Vitest-compatible" mock whose factory throws on first call (Bug #4) and documents `peerDependencies vitest ^3.0.0` as the supported range — the range in which it's broken.
7. Minor: `sideEffects: false` in `client-logger`/`client-splay` package.json contradicts their side-effectful `register.js` (a bundler honoring the flag would tree-shake registration away); splay README's "181 lines" is now ~202.

## Roadmap candidates (prioritized)

1. **Decide the fate of the mock tier (1–2 h to delete, ~1 day to fix).** Nothing consumes mock-client/mock-logger/mock-fs and two of three are runtime-broken. Either delete all three plus `test/src/mocks`, or fix properly: replace `require("vitest")` with `await import("vitest")` (make factories async) or accept `vi` as an injected parameter; build & commit dists; bump vitest peer to `>=3 <5`; align `MockLogger` with the real `Logger` surface.
2. **Fix `executeDAG` error handling in both copies, then de-duplicate.** Wrap the processor call in try/catch converting throws into failed `NodeResult`s (mirroring `createProcessor`); make `executeWithConcurrency` rejection-safe (`finally` for the `executing.delete`); either implement real in-level skipping (set `shouldStop` as each result lands) or delete the dead skip branch and document level-granularity failFast. Then delete `client-lib/src/dag/*` and import `@mark1russell7/client-dag`, or fold the DAG code into client-lib and retire the package.
3. **Fix or delete `mergeStreams`/`debounceStream` in client-splay.** `mergeStreams` needs the standard pending-promise-per-iterator pattern (only re-`next()` the winner); `debounceStream` needs a rewrite around a queue + explicit completion signal. Both are exported, both are verified-broken, neither is currently consumed — deleting is also defensible.
4. **Unify the logging story.** Pick one: (a) retire client-logger and standardize on client-sqlite's `logs.*`, or (b) wire client-logger into a bundle and give `logger` a transport that forwards to `logs.store`. Independently: route `client` core's 188 `console.*` sites through `logger` (this is the README's stated design), or explicitly abandon that claim.
5. **Rebuild and push `client`'s dist (outputSchema) and re-run typecheck across dependents** — client-logger and client-splay currently fail TS2305; then replace `outputSchema`-as-input-schema with real Zod schemas in register files (the validation layer exists — `execInternal` calls `safeParse` — it's just fed no-op schemas).
6. **Logger core hardening (small, high leverage):** `Promise.allSettled` (or `.catch` + optional `onTransportError` hook) around transport writes; copy the transports array in `child()`; apply `LoggerOptions.formatter` to transports lacking one or delete the option; fix the license mismatch.
7. **Collapse the descriptor-type triplication**: make `@mark1russell7/client/components` the single source of `ComponentOutput`/`Size` and have splay re-export (or vice versa); drop client-splay's unused `splay` dependency or actually use it.
8. **Docs pass**: regenerate client-logger and client-dag READMEs from source (they describe different libraries), delete `README_NEW.md`, remove the client-dag import + claim from bundle-dev, fix `sideEffects` flags, and correct Node-version badges.
9. **mock-fs long-term**: if fs mocking is wanted, add an injection seam to client-fs (fs-adapter parameter or context-provided fs) and reshape mock-fs to the `fs.*` procedure surface (`read/write/exists/mkdir/rm/readdir/stat/copy/move/glob`); otherwise delete.
10. **splay depth fix (tiny)**: make `pathDepth` count `[i]` segments, or have `dispatch` thread `depth + 1` explicitly like client-splay already does.
