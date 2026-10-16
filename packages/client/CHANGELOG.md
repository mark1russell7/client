# @procedures/client

## 0.2.1

### Patch Changes

- a9dc8c8: `admitItem`, the output filter of a capability, can give a promise: a filter that looks up the clearance of a record waits for it. The type is `AdmitItem`.

## 0.2.0

### Minor Changes

- 0cf4bea: **Invocation capabilities** (packages/documentation/CAPABILITIES-2026-10.md, the guide is client/docs/CAPABILITIES.md). Each call operates with a capability: a clearance, permitted effects and a deadline. A nested call gets the same capability or a narrower one.
  
  - Procedures declare `metadata.effects` (`reads`, `writes`, `destructive`, `idempotent`). Each procedure of these packages declares them.
  - `hostPolicy({ capability, readOnly, clearanceOrder, resources, admitItem })`, and `new Client({ capability })`. A refused call gives `FORBIDDEN` (HTTP 403) with a reason.
  - `ctx.capability` and `ctx.resources` are new required fields of `ProcedureContext`. A test that makes a context by hand adds `capability: {}` and `resources: {}`.
  - An application gives its clearance and resource types by augmenting `Register`.
  - The timeout interceptor sets the deadline of the capability, and a remote call sends the remaining time.
  - The MCP tools have hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) from the effects. `mark mcp --read-only` (or `MCP_READ_ONLY=1`) serves only the tools that change nothing.
  - **Breaking:** `git.remote` only reads the URL. `git.remote.set` sets it (before: `git.remote` with `url`).
- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- 44d3e30: `mark --version` and `client-registry version` show the version of the package. Before, they showed `1.0.0`. The help of `client-registry` links to the site, not to a placeholder repository.

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

### Breaking changes (from the versions on GitHub)

- `procedure.get` gives `{ found: false }` for a path that has no procedure. Before, it gave `null`. For a procedure, it gives `found: true` with the description.
- `procedure.list` lists the registry of the caller. It takes `namespace` and `includeMetadata`, and it marks the procedures of `procedure.define` with `runtime: true`.
- The core depends on no other package of the repository (roadmap 3.3, 3.2, 3.4):
  - The storage layer moved to `@procedures/store`: `ApiStorage`, `HybridStorage`, the synced registry (`createSyncedRegistry`, `SyncedProcedureRegistry`), the serialization, `createDynamicHandlerLoader` and the procedures `procedure.store`, `load`, `sync`, `remote` and `register`. The core no longer registers them.
  - The entry point `@procedures/client/collections` is gone. Import the data structures from `@procedures/collections`, and `ApiStorage`/`HybridStorage` from `@procedures/store`.
  - The procedure components moved to `@procedures/splay`. The entry point `@procedures/client/components` and the component exports of the root are gone.
  - The core declares `CollectionStorage` and `StorageMetadata` itself, with the shape of the interface of `client-collections`.
- New: `runtimeProgramOf(procedure)` gives the program of a procedure that `procedure.define` made. `isAsyncIterable` is exported.
