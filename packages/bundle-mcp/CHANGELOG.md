# @procedures/bundle-mcp

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/cue@0.2.2
  - @procedures/docker@0.2.2
  - @procedures/lib@0.2.2
  - @procedures/mongo@0.2.2
  - @procedures/procedure@0.2.2
  - @procedures/sqlite@0.2.2
  - @procedures/vitest@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/cue@0.2.1
  - @procedures/docker@0.2.1
  - @procedures/lib@0.2.1
  - @procedures/mongo@0.2.1
  - @procedures/procedure@0.2.1
  - @procedures/sqlite@0.2.1
  - @procedures/vitest@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/cue@0.2.0
  - @procedures/docker@0.2.0
  - @procedures/lib@0.2.0
  - @procedures/mongo@0.2.0
  - @procedures/procedure@0.2.0
  - @procedures/sqlite@0.2.0
  - @procedures/vitest@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

### Changes (from the versions on GitHub)

- Importing the package root registers the procedures of the bundle, as the root of every other client package does. Before, only `@procedures/bundle-mcp/register.js` registered them.
