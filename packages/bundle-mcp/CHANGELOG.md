# @procedures/bundle-mcp

## 0.3.0

### Minor Changes

- c66f0c4: Twelve new `docker.*` tools of roadmap R41: `compose.build`, `compose.logs`, `compose.ps`, `compose.restart`, `images`, `inspect`, `network.create`, `network.list`, `network.remove`, `tag`, `volume.create` and `volume.list`. The MCP server has 79 tools. `docker.prune`, `docker.push` and `docker.volume.remove` are not tools: the first one deletes in bulk, the second one can carry an image out, and the third one deletes the data of a volume.
- 1779d96: The pure transforms of `@procedures/json` are MCP tools (roadmap R39): `json.query`, `json.patch`, `json.diff`, `json.merge`, `json.validate`, `yaml.parse` and `yaml.stringify`. A program that Claude runs through `client.chain` can use them in its steps. The MCP server has 86 tools. `@procedures/http` is not a tool namespace, because a request can carry data out.
- f5ed492: The check before the run in the hosts (roadmap R22). `programCheckInterceptor()` of `@procedures/compiler` checks the program of each call to a data-driven procedure before the first step. When the check finds an error, no step starts, so a refusal in step 3 comes before the write of step 1. The MCP server of `@procedures/mcp-dev-tools` uses it (`MCP_PROGRAM_CHECK=false` turns it off). `bundle-mcp` and `bundle-dev` have the compiler module, so Claude gets the tools `program.check` and `program.compile` (65 tools), and `mark program check` works.
- 5b7b673: Five new tools of roadmap R44: `db.tables`, `db.schema`, `lib.graph`, `mongo.documents.distinct` and `mongo.documents.explain`. They change nothing. The MCP server has 91 tools. `mongo.watch`, `mongo.documents.bulk`, `db.transaction`, `db.migrate` and `db.backup` are not tools: the first one is a stream without an end, and the others change data in bulk or change the database file.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [29a7b29]
- Updated dependencies [9bc2ddb]
- Updated dependencies [a70d445]
- Updated dependencies [2392f9e]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [a6b01a9]
- Updated dependencies [4d3ff39]
- Updated dependencies [3aa6495]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [f5ed492]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [89d8a4a]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [94dd2a0]
- Updated dependencies [4ef0d44]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/compiler@0.3.0
  - @procedures/docker@0.3.0
  - @procedures/mongo@0.3.0
  - @procedures/json@0.3.0
  - @procedures/lib@0.3.0
  - @procedures/procedure@0.3.0
  - @procedures/sqlite@0.3.0
  - @procedures/cue@0.3.0
  - @procedures/vitest@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/procedure@0.2.3
  - @procedures/lib@0.2.3
  - @procedures/cue@0.2.3
  - @procedures/docker@0.2.3
  - @procedures/mongo@0.2.3
  - @procedures/sqlite@0.2.3
  - @procedures/vitest@0.2.3

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
