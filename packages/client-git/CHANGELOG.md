# @procedures/git

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/fs@0.15.1
  - @procedures/shell@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/fs@0.15.0
  - @procedures/shell@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
- Updated dependencies [50d5453]
  - @procedures/client@0.14.1
  - @procedures/shell@0.14.1
  - @procedures/fs@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/fs@0.14.0
  - @procedures/shell@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/fs@0.13.2
  - @procedures/shell@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1
  - @procedures/fs@0.13.1
  - @procedures/shell@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/fs@0.13.0
  - @procedures/shell@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2
  - @procedures/fs@0.12.2
  - @procedures/shell@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
  - @procedures/fs@0.12.1
  - @procedures/shell@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0
  - @procedures/fs@0.12.0
  - @procedures/shell@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0
  - @procedures/fs@0.11.0
  - @procedures/shell@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/fs@0.10.0
  - @procedures/shell@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/fs@0.9.2
  - @procedures/shell@0.9.2

## 0.9.1

### Patch Changes

- b5db4d8: Under the root of the files of a host, the `git.*` procedures are confined, not refused (roadmap R33, tracker item O35). Without a root, nothing changes. PATCH: a procedure that the root refused now works in the root.
  
  - The core: `ProcedureContext.fsRoot` is the root of a confined call. `confineToRoot()` of `@procedures/fs` gives it to the handler of each confined procedure and of each program procedure.
  - The working folder `cwd` of each `git.*` procedure must be in the root, and its default is the root. The pathspecs, the `path` of `git.blame` and of the worktree procedures, and the `dest` of `git.clone` must be in the root too.
  - Under a root, git runs with `GIT_CEILING_DIRECTORIES` at the parent of the root, so it finds no repository above the root. The configuration of the system does not apply. The global configuration has only `user.name`, `user.email` and `init.defaultBranch` of the host.
  - The `-c` options turn off the hooks (an empty `core.hooksPath`) and `core.fsmonitor`. Only the transports https, http, ssh and git are permitted. Git does not go into a submodule.
  - Before the first command in a folder, git examines the repository. A repository outside the root (through a `.git` file or an alternate object folder), a repository with submodules, and a configuration key that starts a program are refused: `filter.*`, `diff.external`, `core.sshCommand`, `credential.helper`, `include.path` and the others. The error names each key.
  - `git.clone` and `git.remote.set` refuse a URL with `::` under a root.
  - `@procedures/git` now depends on `@procedures/fs` (for the rules of `@procedures/fs/root`).
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/fs@0.9.1
  - @procedures/shell@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/shell@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/shell@0.8.1

## 0.8.0

### Patch Changes

- 90ea741: The procedures declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33). Without a root, nothing changes. Under the root of a host (`confineToRoot()` of `@procedures/fs`):
  
  - `sqlite.*` and `logs.*` are confined: `dbPath` must be in the root, and a call must give it. `:memory:` is not a path.
  - `lib.scan`, `lib.graph`, `lib.audit`, `lib.rename` and `procedure.new` are confined: their folder must be in the root, and without it the folder is the root.
  - Most `docker.*` procedures run docker in a working folder of the root. `docker.run`, `docker.exec`, `docker.build` and `docker.compose.*` are refused.
  - `git.*`, `pnpm.*`, `lib.new`, `shell.exec` and `shell.which` are refused.
  - `shell.run` and `shell.stream` run only as the nested call of a confined procedure that names them in `metadata.calls`.
  - The help of the global flag `--fs-root` (`@procedures/lib/cli-flags`) tells the new rule.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/shell@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/shell@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/shell@0.6.0

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
