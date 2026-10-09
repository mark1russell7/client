# Deep dive: the core of `packages/client` (2026-10-08)

> The report of the deep-dive agent for `procedures/**`, `components/**`, `events/**`, `client/client.ts`, `batch-executor.ts`, `route-resolver.ts`, `call-types.ts`, `consumption.ts` and `context.ts`. Each finding was verified against the source, most against `dist/` with repro scripts. The status of each finding is in [STATUS.md](./STATUS.md).

## CORE-1 — high: `client.and` / `client.or` never run their operands

`and`/`or` are control-flow names, so their `values` arrive raw, but `variadicLogic` (`core/logic.ts`) only tests truthiness. A ref is always truthy: `and` returns the last raw ref, `or` the first, and nothing runs. `conditional { condition: and{...} }` always takes `then`. Repro: `and([falsy(), truthy()])` returned the raw ref; no procedure was called. Fix: run each operand in order with `callOperand`, stopping at the first falsy (`and`) or truthy (`or`) value.

## CORE-2 — high: the route `stream` strategy loses every result but the first

`batch-executor.ts`: each in-flight promise removes itself from `inFlight` in its own `.then`, and `Promise.race` yields one winner, so promises that settle in the same tick are never yielded. Affects `route({batch:{strategy:"stream"}})`, `routeStream()` (`results` and `complete`) and `collectStream`. Repro: strategy all gives `[a, b, c, d]`, stream gives `[a]`. The H12 test hides it with staggered timers. Fix: a completion queue.

## CORE-3 — high: `procedure.define` / `procedure.delete` leave the registry inconsistent

`delete` removes only the private `runtimeProcedures` entry; the procedure stays registered and callable, and a new define of the path throws. A failed define leaves an orphan in `runtimeProcedures`. `exists` checks only runtime procedures, so `replace: true` overwrites any code procedure, also unexposed ones such as `shell.exec`. The handler ignores the server's registry. Fix: delete unregisters; register first, then record; `replace` only over runtime-defined procedures; apply the expose rule; use the caller's registry.

## CORE-4 — high: aggregation `$ref` values resolve too early

`define-procedure.ts` `resolveInputRefs` replaces every `$ref` in the aggregation against `{input}` before it runs: `$last`, step names, `item`/`acc`/`index` become `undefined`. When the root is not control flow, nested `$proc` refs never run. Repro: a three-step pipeline gave `[2, NaN, NaN]`. Fix: substitute only `input.*` refs (or bind `input` in the scope), then run the root through the same hydration as `exec()`.

## CORE-5 — high: `exec()` and chain steps hydrate the inputs of data-driven procedures

Hydration is skipped only by `isControlFlowPath` (the last path segment against 8 names). `runs-refs` procedures (`client.eval`, `dag.traverse`, `core.catch`) and `procedure.define` get hydrated input: `exec(procedure.define {aggregation: {$proc…}})` runs the body at definition time and stores the result; `client.eval` gets a result instead of a ref. Matching the last segment also catches any user procedure named `…map` or `…or`. Fix: decide by the procedure (`isDataDriven`), mark `procedure.define` `runs-refs`, match full paths.

## CORE-6 — medium: prototype pollution through route keys and procedure paths

`buildResponse`, `mergeRoutes`, `filterRouteByPattern` and `registry.getTree` walk with `segment in current`; `"__proto__"` descends into `Object.prototype`. Reachable through `route()` and through `procedure.define` with a `__proto__` path. Fix: reject `__proto__`, `constructor`, `prototype` segments; use `Object.hasOwn` and null-prototype containers.

## CORE-7 — medium (security): M11 is not fixed: the default handler loader imports any module a stored record names

`storage/serialization.ts`, `factory.ts`: `createSyncedRegistry` and `createCustomSyncedRegistry` default to `import(ref.module)[ref.export]` with no allowlist; with `api`/`hybrid` storage, the remote side picks the code that runs. Repro: a record naming `node:child_process` `execSync` ran a shell command. Fix: no default loader (stubs only), an explicit allowlist; correct the status document.

## CORE-8 — medium: synced registry push then pull with `"remote"` resolution removes every handler

The stored serializations have no handler, so the next pull replaces every procedure with a stub (`override: true`). `register()` with `pathPrefix` stores and queues under the unprefixed path. Fix: never replace a procedure that has a handler with a stub; use the stored path.

## CORE-9 — medium: `ApiStorage` and `HybridStorage` contradict the core's collection procedures

`ApiStorage` reads `response.data`, but the collection procedures return raw values: every read is `undefined`, `find()` throws. `HybridStorage` indexes remote items by `item.id` (procedure records have none), re-queues operations that succeeded, and does not `unref` its interval. `ApiStorage`'s `retry` option is unused, and `timeout` is dropped with `signal`.

## CORE-10 — medium: nested calls hosted by `Client` lose the caller's signal and metadata

`invokeOptions()` builds `ctx.client` from `execInternal`, which starts again with empty metadata and no signal, against the documented contract. Aborting a `route()` does not stop nested work; `__middlewareOverrides` leaks into `ctx.metadata`. Fix: pass metadata and signal through the context client.

## CORE-11 — medium: `$when` and `$name` are lost or reversed

`parseProcedureJson`, `stringifyProcedureJson`, `extractTemplate`, `toJson` and `fromJson` drop `$when`/`$name` (a `$never` ref runs immediately after `client.parseJson`). Named contexts behave by depth: one level down, `hydrateValue` pushes the name before it hydrates the input, so a `$when:"outer"` ref runs. `$never` does not protect its subtree.

## CORE-12 — medium: hydration treats all data as procedure-as-data

`maxDepth` (10) counts plain-data nesting (12-level JSON fails); `Object.fromEntries` rebuilds non-plain objects (`Date` → `{}`, `Uint8Array` → object, `Map` → `{}`); any object with a string `$ref` (JSON Schema) is replaced in chain steps; `HydrateOptions.parallel` is never read (siblings always run concurrently). Fix: count depth through refs only, leave non-plain objects, add a `$literal` escape, implement or delete `parallel`.

## CORE-13 — medium: outer chain names are invisible inside nested control flow

`resolveRefs` does not descend into nested refs; each chain makes a scope with no parent (`RefScope.parent` is never set). A `conditional` branch inside a chain gets the literal `{ $ref }`.

## CORE-14 — medium: `route()` overrides are dead (H7 partly open), and later leaves disappear

The documented override keys (`retry.attempts`, `timeout.ms`, `cache.*`) differ from what the middleware reads (`retry.maxAttempts`, `timeout.overall`/`perAttempt`). After a validation error, `resolve()` breaks: later leaves are missing from the response (no result, no `SKIPPED`).

## CORE-15 — low–medium: event bus defects, and no host sets `ctx.bus`

`once()` on a buffered channel throws in a TDZ and never resolves; a repeated old unsubscribe deletes a newer subscriber's set; `clear()` strands `stream()` readers; an aborted stream waiting on `ctx.bus.stream()` never finishes. No host passes `bus`, so the documented `ctx.bus.stream(...)` pattern throws everywhere.

## CORE-16 — low–medium: `procedure.store`/`load`/`sync`/`remote` report success and do nothing

`store` returns `stored: true` and persists nothing; the others return placeholder text; `procedure.register` with `persist` registers a stub. They are exposed MCP tools.

## CORE-17 — low: `client discover` / `announce`

`scanned.add()` before the read skips transitive packages; generated imports of `pkg/dist/register.js` fail for packages with an `exports` map; `announce` rewrites `.client-registry.json` without a lock and edits the consumer's `package.json`. Nothing in the repo uses them.

## Other low-severity items

- `batch-executor` `continueOnError` branch is dead; `executeRace` never cancels the losers.
- Documented but not implemented: `StreamConfig.bufferSize`/`emitPartial`, `StreamOutputConfig.bufferSize`, `outputMode: "batch"`.
- `components/define.ts` child rendering calls `procedure.handler` directly (no validation, the parent's `ctx.path`).
- `isStreamingFactory` checks `constructor.name`.
- `registry.register` does not validate segments: `["a.b","c"]` and `["a","b.c"]` collide.
- `register` with `override` emits no `unregister` event.
- `Client.exec(ref, input)` ignores `input`.

## Architecture observations

1. Three `$ref` interpreters with three meanings (`hydrateInput`, the chain's `resolveRefs`, `resolveInputRefs`), and three tests for "leave this input raw". CORE-1, -4, -5, -11, -12, -13 come from this. One interpreter, chosen by a flag on the procedure, would remove the class.
2. The procedure-as-data format has no escape: any object with an array `$proc` or a string `$ref` is interpreted, and plain data is walked and rebuilt.
3. P1 is half done: validation is unified, but hydration happens only in `exec()` and control-flow operands, never in `ProcedureServer` or MCP, and the nested context differs by host.
4. The meta-procedures change one mutable global registry, not scoped to the server's registry or its expose rule.
5. Unwired subsystems ship as features (storage sync, event bus, route overrides, discover/announce).
6. Some tests hide races (staggered timers hid CORE-2; direct handler calls hid CORE-1).
