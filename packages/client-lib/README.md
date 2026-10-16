# @procedures/lib

[![npm](https://img.shields.io/npm/v/@procedures/lib?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/lib)

```sh
npm install @procedures/lib
```

`client-lib` gives the procedures that manage the packages of the monorepo.

| Procedure | Function |
|---|---|
| `lib.scan` | Find the packages of the workspace, with their dependencies on other workspace packages |
| `lib.new` | Make a package from the template |
| `lib.audit` | Compare each package with the template |
| `lib.rename` | Rename a package in each file of the workspace |
| `lib.graph` | Give the dependency graph of the workspace packages, with its cycles |
| `ecosystem.procedures` | List the procedures of the packages |

Until October 2026, `client-lib` also had `lib.install`, `lib.pull` and `lib.refresh`, for one repository per package. The monorepo does not need them, and they are gone ([DECISIONS-2026-10.md](../documentation/DECISIONS-2026-10.md)).

In version 0.3.0 and before, `client-lib` also had two runners of programs:

- `dag.traverse` moved to [`client-dag`](../client-dag) (`@procedures/dag`), with the same name. It gets the packages from `lib.scan` of this package. Thus a host registers the two modules.
- `core.catch` is removed. It did the same as `client.tryCatch` of `@procedures/client`. Use `client.tryCatch`.

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

## Related packages

- `client-dag`: the graph algorithms of `lib.graph`, and the procedure `dag.traverse`, which uses `lib.scan`.
- `client-procedure`: `procedure.new`, the scaffold of a procedure.
- `mark`: the CLI that starts these procedures.
