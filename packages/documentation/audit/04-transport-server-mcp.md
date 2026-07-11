# Audit Report: Remote-Execution & MCP Stack

Scope: `client-connection`, `client-server`, `server`, `server-mongo`, `client-server-mongo`, `mcp`, `client-mcp`, `impl-mcp-dev`, `bundle-mcp`, `bundle-dev`, plus core `client/src/server` and `client/src/adapters/{http,websocket}`. Read-only. No tests exist anywhere in scope (`grep` for `*.test.ts`/`*.spec.ts` and `scripts.test`: zero). Typecheck run per package with `tsc --noEmit --pretty false`.

## Package summaries

**`mcp`** — Purpose: framework-agnostic MCP core (Zod→JSON Schema, procedure→tool mapping, path encoding, MCP context types). Key files: `schema/zod-to-json-schema.ts`, `mapping/procedure-to-tool.ts`, `mapping/path-encoder.ts`. Build: **typecheck clean (0 errors)**. No SDK dependency (pure). **Alive** — consumed by client-mcp. Grade **A-**. Only wart: half the `path-encoder` exports (`isValidPath`, `sanitizePath`, …) are never called by the pipeline (dead exports).

**`client-mcp`** — Purpose: `McpServerTransport` (ServerTransport impl bridging `PROCEDURE_REGISTRY`→MCP tools over stdio) + `mcp.serve` / `mcp.list-tools` procedures. Key files: `transport/mcp-transport.ts`, `procedures/mcp/serve.ts`. Build: **clean**. Correctly declares `sideEffects: ["./dist/register.js", …]`. **Alive** (its transport class is the live server's engine), but its two *procedures* (`mcp.serve`, `mcp.list-tools`) are **vestigial** — nothing registers them in the live path (impl-mcp-dev imports the package root, not `/register`), confirmed by their absence from the live tool list. Grade **B+**. SSE transport is a stub that throws.

**`impl-mcp-dev`** — Purpose: the actual binary Claude Code runs as `dev-tools`. `bin/mcp-server.js` → `dist/server.js`; loads `MCP_BUNDLES` (default `@mark1russell7/bundle-mcp`) via dynamic `import(`${bundle}/register.js`)`, wires `McpServerTransport` on stdio. Build: **clean**. Logging correctly uses `console.error` (stderr). **Alive** — the real deliverable. Grade **A-**.

**`bundle-mcp`** — Purpose: curated procedure set for Claude. Key file: `src/register.ts` (11 bare side-effect imports). Build: **clean**. Deps match imports exactly (no missing/extra). **Alive**. Grade **B-** — its central design claim ("excludes shell.*") is false (Bug 3). `sideEffects:false` is a latent tree-shaking trap (Bug 15).

**`bundle-dev`** — Purpose: dev-workflow aggregation (shell/fs/cli/pnpm/lib/git/dag/procedure). Build: **clean**; deps match imports. **Alive but has no in-scope consumer** (loaded only via `MCP_BUNDLES` override or CLI). Grade **B**.

**`client-server`** — Purpose: transport-agnostic "peer" wrapper (`createPeer`) + `server.*` procedures (create/connect/call/connections/disconnect/start/stop/status), `_discovery.announce`, `manifest.generate`. Key files: `peer/index.ts`, `connection/index.ts`, `procedures/*`. Build: **BROKEN — 21 type errors** (pass-through `schema<T>()` helpers yield `Procedure<unknown,…>` not assignable to `Procedure<SpecificInput,…>`); emitted `dist` runs fine, and its installed core exports all needed symbols. **Alive & load-bearing** (used by `cli`, `server`, `client-server-mongo`, `MiniMongo`). Grade **C+**. Schema generation is a TODO (see Doc drift).

**`server`** — Purpose: thin CLI (`bin: server`) that dogfoods `client-server`'s `server.create` over a `LocalTransport`. Build: **clean**. **Alive**. Grade **B** — `syncRegistryToTransport` builds a full handler registry + `registry.on("register")` listener but only ever issues one `server.create` call (over-engineered, harmless).

**`client-server-mongo`** — Purpose: `server.mongo.{start,stop,status,connect}` lifecycle procedures; `server.mongo.start` dogfoods `server.create`. Build: **BROKEN — 6 type errors** incl. missing `zodAdapter`/`outputSchema` core exports (Bug 2). **Semi-alive/broken**: `stop`/`status` are non-functional because `mongoServerManager.register()` is never called (Bug 9). Grade **D+**.

**`server-mongo`** — Purpose: deprecated standalone Mongo server binary wrapping `client-server-mongo`. Self-declared `@deprecated`. **Dead** — `package.json` has a duplicate-key bug breaking its `client-mongo` dep (Bug 1) and it depends on the broken `client-server-mongo`. Grade **F**.

**`client-connection`** — Purpose: `connection.{list,get,call,broadcast,subscribe,unsubscribe,publish}` + a `connectionManager` singleton for server→client RPC and pub/sub. Build: **BROKEN — 9 type errors** (missing `zodAdapter`/`outputSchema`, Bug 2). **Dead/vestigial**: no package depends on it, nothing imports it, and `connectionManager.addConnection()` is never called by any code — so every procedure is a no-op/always-fails. It's a parallel, unwired re-implementation of the core `WebSocketServerTransport`'s tracked-connection/`callClient` machinery. Grade **D** (well-written, 100% dead).

## Bugs

**Bug 1 — `server-mongo/package.json` duplicate JSON key breaks `client-mongo` dependency** — Severity: high, Confidence: certain.
`server-mongo/package.json` dependencies:
```json
"@mark1russell7/client-mongo": "github:mark1russell7/client-mongo#main",
"@mark1russell7/client-mongo": "github:mark1russell7/client#main"
```
The key `@mark1russell7/client-mongo` appears twice; JSON last-wins, so `client-mongo` resolves to the **`client`** repo, not `client-mongo`. Verified: `require('./package.json').dependencies` prints `"@mark1russell7/client-mongo": "github:mark1russell7/client#main"`. The real `client-mongo` never installs. (Package is deprecated, limiting impact.)

**Bug 2 — `client-connection` & `client-server-mongo` import core exports that no longer exist** — Severity: high, Confidence: certain.
`client-connection/src/register.ts:8` and `client-server-mongo/src/register.ts:5`:
```ts
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
```
The installed pinned `@mark1russell7/client` (`dist/index.js`) exports **neither** `zodAdapter` nor `outputSchema` (grep count 0; it exports `createProcedure`/`defineProcedure`/`defineStub` instead). `tsc` fails (`TS2305: has no exported member 'zodAdapter'`). Worse, the committed `dist/register.js` still contains `import { zodAdapter, outputSchema }`, so under native ESM it throws `does not provide an export named 'zodAdapter'` at load time against the installed core. This makes `client-server-mongo` (and therefore `server-mongo`) fail to load; `client-connection` is dead so its runtime impact is nil. Root cause: core removed/renamed these adapters and left these two packages behind (local working-copy core still has them, so the drift is invisible locally).

**Bug 3 — `bundle-mcp` exposes `shell.run`/`shell.exec`/`shell.which` despite claiming to exclude them** — Severity: medium, Confidence: certain.
`bundle-mcp/src/register.ts` header: *"Skips low-level fs/git/shell/pnpm since Claude already has shell access"*, and it deliberately omits `client-shell` from deps. But three of its members pull `client-shell` in as a bare side-effect import:
- `client-cli/src/register.ts:8` → `import "@mark1russell7/client-shell";`
- `client-docker/src/register.ts:9` → same
- `client-test/src/register.ts:6` → same

`client-shell/register.ts` auto-registers `shell.run/exec/which`, so they become MCP tools. **Confirmed empirically**: the live `dev-tools` server exposes `mcp__dev-tools__shell_run`, `shell_exec`, `shell_which`. The bundle's core security/design premise is silently violated; `shell.run` = arbitrary command execution exposed to the model.

**Bug 4 — MCP debug logging writes to stdout, corrupting the stdio JSON-RPC stream** — Severity: medium, Confidence: certain.
`client-mcp/src/transport/mcp-transport.ts:219`:
```ts
private log(message: string): void {
  if (this.options.debug) { console.log(`[${this.name}] ${message}`); }
}
```
The stdio transport uses **stdout** for protocol framing. `console.log` → stdout. Enabling debug (`MCP_DEBUG=true`, which `impl-mcp-dev` forwards as `debug`) interleaves `[mcp] …` lines into the JSON-RPC stream and breaks the session. Everywhere else (`impl-mcp-dev/src/server.ts`) correctly uses `console.error`. Fix: route `log()` to stderr.

**Bug 5 — Procedure handlers that `console.log` corrupt the MCP stdio stream** — Severity: medium, Confidence: certain.
`client-lib/src/procedures/lib/rename.ts:278–331` calls `console.log(...)` repeatedly inside the handler (`[lib.rename] …` progress lines). `client-lib` is in `bundle-mcp` (`lib.*` tools are live). Invoking `lib.rename` through the stdio server emits those lines to stdout mid-protocol, corrupting JSON-RPC framing. General class: any handler reachable via MCP must never touch stdout. (Core client transports share the smell: `adapters/websocket/client/transport.ts:117`, `adapters/http/server/transport.ts:278,289` all `console.log` unconditionally.)

**Bug 6 — `server` / `client-server` expose the entire registry on 0.0.0.0 with no auth and wildcard CORS** — Severity: high (blast radius), Confidence: certain.
`client-server/src/peer/index.ts`: HTTP transport defaults `host = "0.0.0.0"` (line 134) and passes `cors: config.cors ?? true` (line 172); the core HTTP transport's default CORS is `origin: "*"` (`adapters/http/server/transport.ts:79`). No authentication middleware exists anywhere in the server path (WebSocket transport supports `authenticate`, but `client-server` never sets it). `server.create` defaults to `[{ type: "http", port: 3000 }]` (`procedures/server.create.ts:32`) with `autoRegister: true`. So `server --procedures @mark1russell7/bundle-dev/register` (or any `server.mongo.start`) binds `0.0.0.0:3000` and serves the whole `PROCEDURE_REGISTRY` — including `shell.run` and `fs.write` — to any host on the network, unauthenticated. Mitigation: personal dev machine, must be explicitly launched; the live Claude integration is stdio (not networked). Still the dominant blast-radius item.

**Bug 7 — CORS `origin: "*"` combined with `credentials: true`** — Severity: low, Confidence: certain.
`adapters/http/server/transport.ts:79–104` default corsOptions set `origin: "*"` **and** `Access-Control-Allow-Credentials: true`. Browsers reject wildcard-origin-with-credentials, and it is maximally permissive. Cosmetic given no auth exists anyway.

**Bug 8 — `server.mongo.stop` / `server.mongo.status` are permanently non-functional** — Severity: high (feature dead), Confidence: certain.
`client-server-mongo/src/server-manager.ts:18` defines `register()`, but it is **never called**: `server.mongo.start` (`procedures/server/start.ts`) dogfoods `server.create` and returns the result without ever calling `mongoServerManager.register(...)`. Grep confirms only `.stop()`/`.getStatus()`/`.get()` are used. Consequently `server.mongo.status` always returns `{ servers: [] }` and `server.mongo.stop` always returns `{ success: false }` — started Mongo peers can never be listed or stopped through these procedures.

**Bug 9 — `client-connection` is entirely unwired dead code** — Severity: medium (dead code / duplication), Confidence: certain.
`connectionManager.addConnection()` (`client-connection/src/manager.ts:54`) is never invoked anywhere (verified grep across the workspace). No package depends on `client-connection`. Therefore `connection.list` always returns `[]`, and `connection.call`/`broadcast`/`subscribe`/`publish` always throw `Connection not found`. The real server→client RPC + tracked-connection implementation lives in core `adapters/websocket/server/transport.ts` (`trackedConnections`, `callClient`, `onConnect/onDisconnect`); `client-connection` is a parallel copy that was never connected to a transport.

**Bug 10 — MCP tool-name mapping has no sanitization or collision handling; the functions that would provide it are dead** — Severity: low-medium, Confidence: certain.
`mcp/src/mapping/procedure-to-tool.ts:40,47` builds tool names with raw `encodePath(path)` (dot-join) and never validates. `isValidPath`/`sanitizePath`/`isValidPathSegment`/`sanitizePathSegment` (`mapping/path-encoder.ts`) are exported but **never called** by the pipeline (grep: only re-export sites). Two paths that encode to the same dotted string (e.g. `["a","b","c"]` vs a segment containing a literal `.`) silently overwrite in `createToolMap`/`refreshTools` `Map.set` (last-wins) — no warning, no dedupe.

**Bug 11 — MCP tool names contain `.`, which violates the common tool-name charset** — Severity: low, Confidence: possible.
`encodePath` joins with `.` → tool names like `shell.run`. The typical MCP/Claude tool-name constraint is `^[a-zA-Z0-9_-]{1,64}$` (no dots). It works with Claude Code (which surfaces them as `client_identity`, etc. — dots aliased to underscores), but stricter MCP clients may reject them. The unused `sanitizePath` (Bug 10) is exactly the intended fix, left disconnected.

**Bug 12 — JSON-Schema cache keyed by path, not schema; never invalidated** — Severity: low, Confidence: likely.
`mcp/src/schema/zod-to-json-schema.ts:82` caches by `cacheKey` = `procedure.path.join(".")` (`procedure-to-tool.ts:41`). If a procedure at a given path is unregistered and a different schema registered at the same path, `cachedZodToJsonSchema` returns the stale schema. `clearSchemaCache` exists but is never called by `mcp-transport.refreshTools()` on `register`/`unregister`. Minor (paths rarely reused with new schemas).

**Bug 13 — Pending server→client requests are not rejected on socket close** — Severity: low, Confidence: certain.
Core `adapters/websocket/server/transport.ts:187–201`: the `close` handler deletes the tracked connection but does not reject `pendingRequests` belonging to it, so a `callClient` to a client that disconnects hangs until the 30 s timeout (`callClient` at :399). Same pattern in the dead `client-connection/src/manager.ts:61` (`removeConnection`). Bounded leak.

**Bug 14 — `mcp.serve` leaks registry listeners and can fight over stdio** — Severity: low, Confidence: certain.
`McpServerTransport` attaches `register`/`unregister` listeners to the global `PROCEDURE_REGISTRY` in its constructor and only removes them in `stop()`. `mcp.serve` (`procedures/mcp/serve.ts`) creates a transport and calls `start()` but never `stop()`, so each call leaks listeners; and if invoked *through* an already-running stdio server it opens a second `StdioServerTransport` contending for stdin/stdout. `mcp.serve` is vestigial (not in the live registry), limiting real impact. Its `transport: "sse"` option always throws (`transport/sse.ts:21`).

**Bug 15 — `sideEffects: false` on packages whose `register.js` is side-effectful** — Severity: low (latent), Confidence: certain.
`client-cli`, `client-shell`, `client-connection`, `client-server`, `client-server-mongo`, `bundle-mcp`, `bundle-dev` all declare `"sideEffects": false`, yet their registration depends entirely on side-effect imports of `register.js`. Under any tree-shaking bundler, `import "@mark1russell7/client-cli";` would be eliminated and procedures would silently fail to register. Works today only because the live path is Node ESM (no bundler), which ignores `sideEffects`. `client-mcp` does it correctly (`sideEffects: ["./dist/register.js", …]`).

## Architecture flaws

**"Three server implementations" is really one real impl + two thin wrappers (layered, not triplicated).**
- `client/src/server` (core) is the genuine implementation: `Server` (protocol-agnostic router + middleware), `ProcedureServer` (registry→handler binding, Zod in/out validation, inter-procedure `ctx.client.call`), and the transports `HttpServerTransport` / `WebSocketServerTransport`. Everything ultimately runs on this.
- `client-server` is a *procedure-layer* wrapper: `createPeer` composes core transports, and `server.*` procedures expose create/connect/call + daemon lifecycle (lockfiles under `~/.mark/servers`) + discovery + manifest. Legitimately additive, not a duplicate.
- `server` is a ~180-line CLI that dogfoods `server.create` once over a `LocalTransport`.

The real duplication is **`client-connection` vs core `WebSocketServerTransport`**: two implementations of tracked connections, server→client `callClient`, and pub/sub. Only the core one is wired; `client-connection` is dead (Bug 9). Recommend deleting `client-connection` or refactoring `connection.*` to delegate to the WS transport's tracked-connection API.

**Mongo trio overlap.** `client-mongo` (the actual `mongo.*` procedures — alive, in bundle-mcp) vs `client-server-mongo` (Mongo-server *lifecycle* procedures — build-broken + `stop`/`status` non-functional) vs `server-mongo` (deprecated binary — dup-key-broken). `server.mongo.start` dogfoods `server.create`, i.e. it is functionally identical to the generic `server --procedures @mark1russell7/client-mongo/register`. The entire Mongo-server tier is superseded by the general `server` package; `server-mongo` is dead and `client-server-mongo` adds a broken lifecycle layer over what `client-server` already does.

**Layering / registration model.** Auto-registration on module import into a global `PROCEDURE_REGISTRY` singleton is the backbone, and it's clean for Node ESM — but it makes exposure implicit and transitive (Bug 3: you can't tell what a bundle exposes without tracing every member's side-effect imports) and fragile under bundling (Bug 15). A bundle's tool surface should be computed/asserted, not implied.

**Security posture (summary).** The **live** attack surface (stdio `impl-mcp-dev`) is not networked — its risk is that it exposes more than advertised (shell execution, Bug 3) to the model. The **networked** surface (`server` / `client-server` peers, `server.mongo.start`) is wide open by construction: `0.0.0.0`, no auth, wildcard CORS, full registry incl. `shell.run`/`fs.write` (Bug 6). Acceptable only under the "single-user localhost" assumption, which nothing in code enforces (no `127.0.0.1` default, no token). At minimum, default `host` to `127.0.0.1` and require an opt-in flag + shared-secret to bind publicly.

## Doc drift

- **`bundle-mcp` README + `register.ts` header**: "Excludes low-level tools (`fs.*`, `git.*`, `shell.*`, `pnpm.*`) — Claude can use these via shell." **False for `shell.*`** — transitively registered and live (Bug 3). (`fs`/`git`/`pnpm` are genuinely absent — confirmed: no `fs_*`/`git_*`/`pnpm_*` in the live tool list.)
- **`client-server` README**: touts "Automatic Discovery: peers exchange procedure manifests" and TS/JSON "manifest generation." Both `_discovery.announce` (`discovery/index.ts:70`) and `manifest.generate` (`manifest.generate.ts:52`) carry `// TODO: Generate JSON schema` — `ProcedureInfo.inputSchema`/`outputSchema` are always `undefined`. Discovery ships paths+descriptions only; the "typed manifest" story is unimplemented.
- **`client-mcp` / `impl-mcp-dev` READMEs**: reference SSE transport and "Claude Desktop SSE" setup, but SSE is a stub that throws (`transport/sse.ts`); `mcp.serve`'s `sse`/`port`/`path` inputs (`serve.ts:14–22`) all lead to a thrown error.
- **`client-server-mongo` README**: examples use `client.exec([...])`; the actual API used throughout is `client.call(...)`.
- **`impl-mcp-dev` README** ("Available Tools"): describes the curated set, but the real set silently includes `shell.*` (Bug 3) and excludes `mcp.serve`/`mcp.list-tools` (registered nowhere in the live path).

## Roadmap candidates (prioritized)

1. **Lock down network exposure** (Bug 6/7): default `host` to `127.0.0.1` in `peer/index.ts` and `server.create`; gate `0.0.0.0` behind an explicit `--public` flag plus a required bearer token / `authenticate` hook (the WS transport already supports one — add the HTTP equivalent). Fix wildcard+credentials CORS.
2. **Fix the core-export drift** (Bug 2): update `client-connection` and `client-server-mongo` to the current core builder API (`createProcedure().input(zod…)` instead of `zodAdapter`/`outputSchema`), or restore the exports. Then rebuild `dist`. Until then both are load-broken.
3. **Make the MCP stdio channel stdout-safe** (Bugs 4, 5): route `McpServerTransport.log` to stderr; add a lint/guard forbidding `console.log` in any MCP-exposed handler (start with `lib.rename`); consider redirecting `console.log`→`console.error` process-wide inside `impl-mcp-dev/server.ts` before loading bundles.
4. **Reconcile `bundle-mcp` with reality** (Bug 3): either intentionally include `shell.*` (and update the README) or break the transitive `client-shell` side-effect imports in `client-cli`/`client-docker`/`client-test` (split "register shell" from "use shell as a library"). Add an assertion test that snapshots the exposed tool list.
5. **Repair or retire the Mongo-server tier** (Bugs 1, 8): fix the `server-mongo` dup key; make `server.mongo.start` call `mongoServerManager.register(...)` so `stop`/`status` work — or delete `client-server-mongo`/`server-mongo` in favor of `server --procedures @mark1russell7/client-mongo/register`.
6. **Delete or wire `client-connection`** (Bug 9): remove the package, or reimplement `connection.*` as a thin facade over the core `WebSocketServerTransport` tracked-connection API so it stops being a dead duplicate.
7. **Fix MCP name safety** (Bugs 10, 11): apply `sanitizePath` in `procedureToMcpTool`, detect/warn on tool-name collisions in `createToolMap`, and decide on `.` vs `_` for portability.
8. **`sideEffects` correctness** (Bug 15): set `sideEffects: ["./dist/register.js"]` (or `false` + explicit re-export) on every package whose registration relies on import side effects.
9. **Fix the 21 `client-server` type errors** (pass-through `schema<T>()` helpers): give `outputSchema`/pass-through schemas a properly-typed generic so `tsc -b` passes; the package is load-bearing and currently builds only by virtue of a stale committed `dist`.
10. **Add smoke tests** (zero exist): a handshake test for `impl-mcp-dev` (list-tools returns the expected curated set, and does *not* leak fs/git; a CallTool round-trip validates error mapping) would have caught Bugs 3, 4, 8 immediately.

Load-bearing file references: `client/src/server/procedure-server.ts` (validation + `ctx.client.call`), `client/src/adapters/http/server/transport.ts` (CORS/bind defaults), `client-server/src/peer/index.ts:134,172,191` (0.0.0.0 + CORS), `client-mcp/src/transport/mcp-transport.ts:106-176` (CallTool mapping) & `:219` (stdout bug), `mcp/src/mapping/procedure-to-tool.ts:40,47` (unsanitized names), `client-server-mongo/src/server-manager.ts:18` (unused register), `client-connection/src/manager.ts:54` (unused addConnection), `server-mongo/package.json` (dup key).
