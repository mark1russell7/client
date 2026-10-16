# @procedures/lib

[![npm](https://img.shields.io/npm/v/@procedures/lib?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/lib)

```sh
npm install @procedures/lib
```

`client-lib` gives the procedures that manage the packages of the monorepo, and two runners of programs.

| Procedure | Function |
|---|---|
| `lib.scan` | Find the packages of the workspace, with their dependencies on other workspace packages |
| `lib.new` | Make a package from the template |
| `lib.audit` | Compare each package with the template |
| `lib.rename` | Rename a package in each file of the workspace |
| `lib.graph` | Give the dependency graph of the workspace packages, with its cycles |
| `ecosystem.procedures` | List the procedures of the packages |
| `dag.traverse` | Start a procedure for each package, in the order of their dependencies |
| `core.catch` | Start a deferred call, and give the error to a handler call |

Until October 2026, `client-lib` also had `lib.install`, `lib.pull` and `lib.refresh`, for one repository per package. The monorepo does not need them, and they are gone ([DECISIONS-2026-10.md](../documentation/DECISIONS-2026-10.md)).

## Use

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "@procedures/lib/register"; // registers its procedures
import "@procedures/fs/register"; // lib.* reads and writes files through fs.*

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

const { packages, warnings } = await client.exec(["lib", "scan"], {});
const audit = await client.exec(["lib", "audit"], {});
```

The root of `client-lib` does not register `client-fs`. Without `fs.*`, `lib.scan` gives no packages and a warning for each, and `lib.new` and `lib.rename` fail. `mark` and the bundles load `client-fs`.

From the command line:

```sh
node packages/mark/dist/cli.js lib scan
node packages/mark/dist/cli.js lib new my-package
node packages/mark/dist/cli.js lib audit
node packages/mark/dist/cli.js lib rename @procedures/old-name @procedures/new-name --dry-run
```

## The workspace root

Each procedure takes an optional `rootPath`. Without it, the root is the pnpm workspace that contains `client-lib`. With it, the folder must contain `pnpm-workspace.yaml`. Before, `lib.new` started a script from any folder that `rootPath` named (deep dive DATA-18).

## `lib.scan`

Input: `rootPath`. The output has `packages`, a record by package name, and `warnings`. Each package gives `name`, `repoPath`, `mark1russell7Deps` (its dependencies in the ecosystem scopes `@procedures/` and `@mark1russell7/`), `currentBranch` and `gitRemote`.

## `lib.new`

Input: `name` (without the scope), `preset` (default `lib`), `rootPath` and `dryRun`.

The procedure makes `packages/<name>`. It starts `cue-config init` and `cue-config generate`, and it writes `src/index.ts`, `src/register.ts` and `src/types.ts`. It also sets the `client.procedures` field and adds a `workspace:*` dependency on `client`. Then start `pnpm install` and `pnpm build`. `cue-config` needs the CUE binary.

The output gives `success`, `packageName`, `packagePath`, `created`, `operations` and `errors`.

## `lib.audit`

Input: `rootPath` and `fix`. For each package, the output gives the files and the folders of the template that are missing, and the problems of its pnpm configuration. With `fix: true`, the procedure makes the missing folders, and the missing files that have a default content.

The output also has `flagNotices`: the procedure flags whose short form is also a global flag of `mark`. After the command path, the flag of the procedure wins (deep dive CLI-7).

## `lib.rename`

Input: `oldName`, `newName`, `rootPath` and `dryRun`. The procedure changes the package name, the dependencies, the imports and the dynamic imports in the workspace. The output lists each change and gives a summary.

## `lib.graph`

Input: `rootPath`. The procedure reads the `package.json` of each folder in `packages/` through `fs.readdir` and `fs.read.json`. It changes nothing.

- `nodes` has one item for each package: `name`, `folder`, `version` and `private`.
- `edges` has one item for each dependency with a `workspace:` specifier: `from`, `to`, `kind` and `spec`. The kinds are `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`.
- `cycles` lists each cycle as the names of its packages. A package that depends on itself is also a cycle. `acyclic` is true when the list is empty.
- `levels` is the build order of a graph without a cycle. The packages of level 0 depend on no workspace package. Each package of a level depends only on packages of lower levels.
- `warnings` lists the folders that the procedure cannot read, and each `workspace:` dependency on a name that is not in the workspace.

```sh
node packages/mark/dist/cli.js lib graph
```

## `ecosystem.procedures`

Input: `rootPath`, `namespace` and `includeMetadata`. The output lists the procedures of the packages that have a `client.procedures` field.

## `dag.traverse`

`dag.traverse` starts the `visit` procedure once for each package, with `cwd` set to the folder of the package. A package starts after the packages that it depends on.

| Field | Default | Function |
|---|---|---|
| `visit` | | A procedure path, or a call with `$when: "$parent"` (or `$never`) |
| `filter` | | Only these package names |
| `root` | | Only this package and the packages that it depends on |
| `rootPath` | the workspace | The workspace root |
| `concurrency` | 4 | The number of visits at the same time |
| `serialize` | `auto` | When the visits in one git repository start one at a time: `auto` (when the visit uses a `git` procedure), `repository` (always) or `none` |
| `continueOnError` | false | Continue after a failed visit |
| `dryRun` | false | Give the plan only |

All packages of the monorepo are in one git repository. Concurrent `git add` commands fail on `index.lock`, so `auto` starts git visits one at a time (deep dive DATA-17).

```typescript
await client.exec(["dag", "traverse"], {
  visit: { $proc: ["pnpm", "run"], input: { script: "build" }, $when: "$parent" },
  root: "@procedures/fs",
});
```

`dag.traverse` has the tag `runs-refs`: it starts the refs of its input. Thus a server with an `expose` rule lets it use only exposed procedures. A call in `visit` with `$when: "dag.traverse"` waits for this runner ([PROGRAM-FORMAT.md](../documentation/PROGRAM-FORMAT.md), section 5).

## `core.catch`

`core.catch` starts the `try` call. When it fails, `core.catch` starts the `handler` call with the error in its input (`success: false`, `error`, `proc`). Give both calls `$when: "catch"`, so that they wait for this runner.

```typescript
await client.exec(["core", "catch"], {
  try: { $proc: ["git", "commit"], input: { message: "auto" }, $when: "catch" },
  handler: { $proc: ["client", "identity"], input: { value: { continue: true } }, $when: "catch" },
});
```

The output gives `success`, `result`, `error` and `continue`. The calls of the `try` input start inside the error handling (deep dive DATA-22).

## Related packages

- `client-dag`: the graph algorithms of `dag.traverse`.
- `client-procedure`: `procedure.new`, the scaffold of a procedure.
- `mark`: the CLI that starts these procedures.
