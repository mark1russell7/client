# @procedures/git

## 0.5.0

### Minor Changes

- da56027: Two fixes of roadmap R33:
  
  - `git.isClean` fails outside a repository with the error of git. Before, it gave true.
  - `git.init` gives `created: false` for an existing bare repository, and it does not make the repository again. Before, it looked only for a `.git` folder.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/shell@0.5.0

## 0.4.0

### Minor Changes

- 0ecc788: `git.status` and `git.commit` take `paths`, and the package root exports the git runner and a parser of `git status --porcelain=v1 -z`.
  
  - `git.status` has two new options: `paths` (the pathspecs after `--`) and `untrackedFiles` (`--untracked-files=no|normal|all`). With `"all"`, git gives each file of a new folder. Without the options, the output does not change.
  - `git.commit` has the new option `paths`. The commit then has only those paths, as they are in the working tree (`git commit -m <message> -- <paths>`). The other staged changes stay in the index.
  - With `paths`, a change of a tracked file counts, staged or not. When no tracked file of the paths changed, the output has `skipped: true`. `all` and `paths` together give an error, because git refuses `-a` with paths.
  - `parsePorcelainV1(output)` gives each entry with `xy`, the exact `path`, `status` and `staged`, and `from` for a rename or a copy. `classifyStatus(xy)` gives the status of two status letters.
  - The root also exports `git(args, options)`, the runner of the procedures. It throws a `GitError` when git fails.
  
  The effects of `git.status` and `git.commit` do not change.

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
- Updated dependencies [4c51727]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/shell@0.4.0

## 0.3.0

### Minor Changes

- 4cad9ab: More git procedures (roadmap R40): `git.show`, `git.blame`, `git.tag.list`, `git.tag.add`, `git.tag.delete`, `git.revParse`, `git.reset`, `git.restore`, `git.merge`, `git.merge.abort`, `git.rebase`, `git.rebase.continue`, `git.rebase.abort`, `git.worktree.list`, `git.worktree.add` and `git.worktree.remove`. Each one declares its effects. A merge or a rebase that stops on conflicts gives `conflict: true` and the files, and git never starts an editor.
  
  `git.branch` becomes three procedures: `git.branch.list`, `git.branch.add` and `git.branch.delete`. `git.branch` is deprecated. It stays for one release with the same input and output, and it calls the new code.
  
  The current branch comes from `git symbolic-ref`. Before, `git.branch` and `git.push` used `git rev-parse --abbrev-ref HEAD`, which fails in a repository without commits. `git.branch.list` and `git.branch` work there now.

### Patch Changes

- 95b660d: Three defects that the new tests of roadmap R33 found:
  
  - `git.commit` gives `skipped: true` when nothing is staged. Before, an untracked file or a change that was not staged made `git commit` fail with "nothing added to commit". With `all`, a change of a tracked file is a change to commit, and an untracked file is not.
  - `git.init` looks for `.git` itself. Before, it used `fs.exists` through its context, so it failed in a registry of `gitModule` alone (`createRegistry(gitModule)`).
  - A component of `@procedures/splay` gives its registry to the children that it renders. Before, the child of a child came from the global registry, so a component in a registry of `createRegistry()` rendered an "unknown" grandchild.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/shell@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/shell@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/shell@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/shell@0.2.1

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

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/shell@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
