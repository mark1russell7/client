# @procedures/lib

## 0.4.0

### Minor Changes

- 2fd2398: `dag.traverse` moved from `@procedures/lib` to `@procedures/dag`. Its name, input, output and effects stay the same. In this version, `@procedures/dag` has a `./module` entry, a `./register` entry and the `client.procedures` field, and it depends on `@procedures/client` and `zod`. The graph algorithms of its root do not change.
  
  `dag.traverse` gets the packages from `lib.scan` through `ctx.client` (`calls: ["lib.scan"]`). `@procedures/lib` depends on `@procedures/dag`, so the module of `@procedures/dag` does not list the module of `@procedures/lib` as a dependency: a host registers the two modules. `bundle-dev`, `bundle-mcp` and `mark` do. The module of `@procedures/lib` does not register `dag.traverse` any more.
  
  `DagTraverseInputSchema`, `DagTraverseInput`, `DagTraverseOutput` and `TraverseNodeResult` are exports of `@procedures/dag`, not of `@procedures/lib`.
- 3fefa43: `core.catch` is removed. Use `client.tryCatch`.
  
  `core.catch` did the same as `client.tryCatch` of `@procedures/client`. `CoreCatchInputSchema`, `CoreCatchInput`, `CoreCatchOutput` and `CoreCatchOutputSchema` are removed too. `client.tryCatch` gives no context name: a call of its `try` or `catch` operand needs no `$when: "catch"`.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [2fd2398]
- Updated dependencies [3d76cb7]
- Updated dependencies [0ecc788]
- Updated dependencies [4c51727]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/dag@0.4.0
  - @procedures/fs@0.4.0
  - @procedures/git@0.4.0
  - @procedures/shell@0.4.0
  - @procedures/pnpm@0.4.0

## 0.3.0

### Minor Changes

- 4d3ff39: `lib.graph` (roadmap R44) gives the dependency graph of the workspace packages. The nodes are the packages, and the edges are the dependencies with a `workspace:` specifier. The procedure finds the cycles, and gives the build levels of a graph without a cycle. It reads through `fs.readdir` and `fs.read.json`, and changes nothing.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [f23c7ad]
- Updated dependencies [3c40d2d]
- Updated dependencies [bc70357]
- Updated dependencies [4cad9ab]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [6e4de6c]
- Updated dependencies [14d85fe]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [95b660d]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/fs@0.3.0
  - @procedures/git@0.3.0
  - @procedures/pnpm@0.3.0
  - @procedures/shell@0.3.0
  - @procedures/dag@0.3.0

## 0.2.3

### Patch Changes

- 15e48cf: Three fixes of the architecture review (2026-10-16). A `timeoutMs` that is not a finite number of zero or more asks for nothing: before, `NaN` removed the deadline. A procedure of `procedure.define` declares no effects of its own, so a read-only capability runs it and examines each nested call. `mcp.list-tools`, `mcp.serve`, `_discovery.announce`, `manifest.generate`, `server.create`, `procedure.export` and `lib.audit` read the registry of the call, not the global registry. `getProcedureInfos` and `watchProcedures` take a registry.
- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/fs@0.2.3
  - @procedures/git@0.2.3
  - @procedures/pnpm@0.2.3
  - @procedures/shell@0.2.3
  - @procedures/dag@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/fs@0.2.2
  - @procedures/git@0.2.2
  - @procedures/pnpm@0.2.2
  - @procedures/shell@0.2.2
  - @procedures/dag@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/fs@0.2.1
  - @procedures/git@0.2.1
  - @procedures/pnpm@0.2.1
  - @procedures/shell@0.2.1
  - @procedures/dag@0.2.1

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
  - @procedures/git@0.2.0
  - @procedures/fs@0.2.0
  - @procedures/pnpm@0.2.0
  - @procedures/shell@0.2.0
  - @procedures/dag@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
