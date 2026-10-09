# Architecture review: the `client` ecosystem (2026-10-08)

> The report of the architecture-review agent of the deep dive. The decisions and the status of each item are in [STATUS.md](./STATUS.md). Paths are relative to `packages/`.

## 1. Map of the current architecture

| Layer | Packages | Main abstractions |
|---|---|---|
| Core | `client` | `Procedure` (path, ZodLike input/output, handler, metadata), `ProcedureRegistry` + the `PROCEDURE_REGISTRY` singleton, `invokeProcedure()`, the procedure-as-data format (`$proc`/`$ref`/`$name`/`$when`, `hydrateInput`), the control-flow procedures, `Client`, transports, `ClientMiddleware`, `Server`/`ProcedureServer` |
| Procedure packages | `client-*` | Importing a package registers its procedures |
| Bundles | `bundle-mcp`, `bundle-dev` | Side-effect imports; `bundle-mcp` exports `mcpNamespaces` |
| Hosts | `mark`, `client-server`, `server`, `client-mcp`, `mcp`, `impl-mcp-dev`, `client-playground` | Each builds its own `Client`/`ProcedureServer` from the global registry |
| UI | `site`, `client-splay` + `client/src/components` | The Composer runs JSON programs through `client.exec()` in the browser |

How a call flows:

- **In-process exec:** `Client.exec()` → `prepareRef()` hydrates the input unless the last path segment is a control-flow name → `execInternal` → `invokeProcedure`. No middleware, no expose rule; `exec()` takes no signal or metadata.
- **CLI, local:** `mark` imports every package's `register.js` (about 4 s) → parses the arguments against the registry → `client.stream(Method)` → `LocalTransport` → `invokeProcedure`. No hydration.
- **CLI, warm server:** the same imports first, then the lockfile → `HttpTransport` → `HttpServerTransport` → `Server.handle` (exact `Method` match) → `ProcedureServer` → `invokeProcedure`. That server has no expose rule.
- **HTTP / WebSocket:** the same `Server.handle` path.
- **MCP:** `impl-mcp-dev` → `ProcedureServer({ expose })` + `McpServerTransport` → `Server.handle` → `invokeProcedure`.

## 2. Strengths worth keeping

- `invokeProcedure()`: one place for validation, context and stream detection; each stream item validated; the signal honored; clear error codes.
- Streaming mapped per protocol (HTTP last item or NDJSON, WebSocket cancel, MCP progress, retry up to the first item).
- A small procedure model that hosts reflect (help, flags, MCP tools from the registry).
- The deliberate tool surface (`mcpNamespaces` + the snapshot test that starts the real server).
- Monorepo hygiene (CI order, `workspace:*`, generated references, decision logs, `lib new`/`lib audit`).
- The Composer's plain-JSON program model with block, JSON and TypeScript views and a trace of the real runtime.

## 3. Structural problems, ranked by value/effort

### 3.1 The warm server is an open remote-execution endpoint (S, critical)

`mark --server` defaults to host `0.0.0.0` (`mark/src/cli.ts`) with `cors: true` (`mark/src/server-mode.ts`); `server/src/config.ts` also defaults to `0.0.0.0`. The peer builds `ProcedureServer` with no `expose`, the HTTP server answers `Access-Control-Allow-Origin: *`, there is no authentication, and the registry has `shell.exec`. The WebSocket server checks neither `Origin` nor auth. While `mark --server` runs, any web page or LAN host can POST to `/api/shell/exec`.

Fix: loopback only, no CORS; a random token in the lockfile (user-only permissions), required as `Authorization`; check `Origin` on WebSocket; a policy per principal.

### 3.2 The MCP exposure model has holes (S now, M for the real fix)

- `cli.run` is exposed and runs any `mark` path, including `shell exec` (`client-cli/src/procedures/cli/run.ts`).
- `docker.*` and `pnpm.*` build shell strings for `shell.exec` (`shell: true` by default): injection.
- `mcp.serve` builds a server that exposes everything.
- `procedure.store`, `load`, `sync` and `remote` are stubs that return plausible results; `procedure.register` registers a procedure with no handler.
- `isDataDriven` is a heuristic: any code procedure that runs a path from its input bypasses it.

Fix (S): remove `cli` from `mcpNamespaces` or tag `cli.run` as `runs-refs`; remove the stub tools; `docker`/`pnpm` use argv. Fix (M): procedures declare `effects` and `uses`, and the policy is checked in the invocation path for every nested call, with the principal in the context.

### 3.3 The two path encodings break 3+-segment procedures in warm mode (S)

`{service: p[0], operation: rest.join(".")}` (`mark/src/client-mode.ts`, `mark/src/cli.ts`, `client-cli/.../run.ts`, `client-server/src/procedures/server.call.ts`) against `{service: init.join("."), operation: last}` (`client/src/client/client.ts`, `client/src/server/procedure-server.ts`, `client-mcp/src/transport/mcp-transport.ts`). `Server.findHandler` matches exactly, so `mark docker compose up` gets a 404 from the warm server. `LocalTransport` splits both forms, so local tests pass.

Fix (S): one exported `pathToMethod` and a conformance test with a 3-segment path. Fix (M): `ProcedurePath` is the only identity on the wire.

### 3.4 Procedure-as-data is not part of the one invocation path, and the format has traps (M–L)

- Hydration lives in `Client.prepareRef` and the control-flow `callOperand`, not in `invokeProcedure`, so the same JSON behaves differently per host.
- The implicit chain is not a chain: an all-ref array runs its refs concurrently with `Promise.all`, then `chain` gets results.
- `and`/`or` never run their refs: they are control-flow names (input not hydrated), but `variadicLogic` only iterates the raw values.
- Sibling refs run concurrently (`Promise.all`), so the order of side effects is not defined.
- `$when: "<name>"` depends on position; `$parent` behaves as `$never`.
- Three `$ref` dialects: the hydration scope, the chain's `resolveRefs`, and `procedure.define`'s `resolveInputRefs`, which resolves every `$ref` against `input` first, so `$last`, step names and `item`/`acc` become `undefined`: a program that works in the Composer breaks once saved with `procedure.define`.
- Scopes do not cross nesting; unknown `$ref` names are silent `undefined`; `isOutputRef` matches any object with a string `$ref` (collides with JSON Schema).
- Export/import (`fromJson`, `toJson`, `extractTemplate`, `parseProcedureJson`) drop `$name` and `$when`.

Fix: a normative Program Format v1 and one evaluator in the invocation path: arrays stay arrays, argument refs run left to right, laziness declared per procedure, lexical scope in `ctx` with unknown names an error, `$when` replaced by explicit quoting/functions, `$program: 1`, and `procedure.define` stores the program.

### 3.5 `ProcedureServer` snapshots handlers; the registry is a global singleton (S / L)

`ProcedureServer` registers one handler per path at construction, so a procedure that `procedure.define` makes is listed as a tool but answers 404; with `replace`, a tool call runs the old code. MCP declares no `listChanged`. `procedure.delete` does not unregister. `ProcedureContext` has no registry, so `define`, `lookup`/`eval`, `cli.run`, `server.create` and `mcp.serve` use the global. Registration on import is swallowed by `try/catch`.

Fix (S): one catch-all matcher with a lookup at request time; `procedure.delete` unregisters; MCP `tools/list_changed`. Fix (L): modules without import side effects, explicit registries, `ctx.registry`/`ctx.invoke`.

### 3.6 Warm mode does not avoid the cold start (M)

`run()` imports every package before `tryClientMode`. Fix: a build-time manifest (paths, JSON Schemas, CLI meta) and a thin `mark` fast path that imports handlers only in local mode.

### 3.7 Middleware sits where calls do not go (M)

`ClientMiddleware` wraps only `transport.send`; no package outside `client` uses the client middlewares; MCP and nested calls get no timeout or tracing. Fix: an interceptor chain in `invokeProcedure` (policy, tracing, timeout, metrics), inherited by nested calls; keep retry/auth/circuit-breaker for remote clients.

### 3.8 Two schema systems, mostly empty (M)

`outputSchema<T>()` validates nothing; about 267 outputs use it. All 100 core procedures take `anySchema`. The MCP schema converter is hand-written for zod 3. A second validation layer (`client/validation`) has no consumer. Fix: Standard Schema with zod 4 and native JSON Schema; real schemas required for exposed procedures; a program JSON Schema on the control-flow tools.

### 3.9 The CLI-wrapper pattern is three patterns (M)

Shell strings (`docker`, `pnpm`), synchronous child processes that block the event loop and ignore `ctx.signal` (`git`, `cue`, `snapshot`), and argv (`cli.run`, `lib.new`). Fix: one `commandProcedure()` helper in `client-shell` (argv, `spawn` with `shell: false`, async, streams, signal, timeout, output cap).

### 3.10 Dead weight in core, and the collections coupling (S–M)

The storage/synced registry (with `import(ref.module)`, a code-loading primitive), components and events, and `route()`/batch executor have no consumers outside core. `client` depends at run time on `client-collections` only for the cache middleware and storage interfaces. Fix: move components/events to `client-splay`; replace the synced registry with a program store; move the cache middleware and storage interfaces out of core.

### 3.11 Package granularity (M)

The host layer spans 8 packages; two MCP entry points with different policies; two server bins that default to `0.0.0.0`. Fix: one `host` package (principals and policy, manifest, one server with HTTP/WebSocket/MCP faces, lockfile and token); `mark` as the only bin (`mark`, `mark serve`, `mark mcp`).

### 3.12 Testing is concentrated away from the risk (S–M)

`mark` has no test script; its e2e suite targets deleted commands. `client-server`, `client-mcp`, `mcp` and `server` have no tests. Fix: a host conformance suite (every face; 2- and 3-segment paths, streams, aborts, invalid input, throwing handlers, falsy output, nested calls to hidden paths) and a golden corpus of programs.

### 3.13 Documents and STE (S, ongoing)

STE checks only the root files and `packages/cli`. `~/git/CLAUDE.md` describes a wrapper mechanism the code does not have. Fix: a normative `PROGRAM-FORMAT.md`; one living `ARCHITECTURE.md` with generated tables; dated logs to `documentation/history/`.

## 4. Target architecture

```
 mark (thin) ─┐   browser Composer ─┐   Claude Code ─┐
              ▼                     ▼                ▼
 ┌──────── host process (one, long-running, loopback + token) ───────┐
 │ faces: CLI-RPC/NDJSON · WebSocket · MCP (stdio | Streamable HTTP)  │
 │ principal → policy (effects, uses, expose) · manifest (JSON Schema)│
 └───────────────────────────────┬────────────────────────────────────┘
               invoke(path, input, ctx) ── interceptors: policy, trace, timeout
                                 │
          Registry (composed from modules) ── Program evaluator (spec v1)
                                 │
   modules: core · shell(commandProcedure) · git · docker · mongo · … · programs (persisted JSON)
```

## 5. Roadmap

**Phase 0, safety and correctness (each S):** 0.1 lock down the warm server; 0.2 MCP surface (remove `cli.run` and the stubs; docker/pnpm argv); 0.3 one `pathToMethod` + a first conformance test; 0.4 `ProcedureServer` looks paths up at request time, `procedure.delete` unregisters, MCP `list_changed`.

**Phase 1, one semantics:** 1.1 Program Format v1 and one evaluator (M–L); 1.2 interceptors in `invokeProcedure` (M); 1.3 build-time manifest and a thin `mark` client path (M).

**Phase 2, contracts:** 2.1 Standard Schema with zod 4, real schemas for exposed procedures (M); 2.2 `commandProcedure()` and the wrapper migration (M); 2.3 the `host` package, `mark serve`/`mark mcp` (M).

**Phase 3, structure:** 3.1 modules without side effects, explicit registries (L); 3.2 a program store (M); 3.3 the collections rebuild (P8) and core without the collections dependency (L); 3.4 a slimmer core (M).
