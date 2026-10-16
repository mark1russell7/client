# @procedures/bundle-dev

[![npm](https://img.shields.io/npm/v/@procedures/bundle-dev?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/bundle-dev)

```sh
npm install @procedures/bundle-dev
```

`bundle-dev` registers the procedures of the development workflow with one import. It adds no procedures of its own.

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "@procedures/bundle-dev/register"; // registers the procedures of the packages below

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

const status = await client.exec(["git", "status"], { cwd: "." });
const packages = await client.exec(["lib", "scan"], {});
```

## The packages of the bundle

| Package | Procedures |
|---|---|
| `client-shell` | `shell.run`, `shell.exec`, `shell.stream`, `shell.which` |
| `client-fs` | 11 `fs.*` procedures: `read`, `read.json`, `write`, `exists`, `stat`, `mkdir`, `readdir`, `rm`, `copy`, `move`, `glob` |
| `client-cli` | `cli.run` |
| `client-pnpm` | `pnpm.install`, `pnpm.add`, `pnpm.remove`, `pnpm.link`, `pnpm.run`, `pnpm.store.path` |
| `client-lib` | `lib.scan`, `lib.new`, `lib.audit`, `lib.rename`, `ecosystem.procedures`, `dag.traverse`, `core.catch` |
| `client-git` | 26 `git.*` procedures |
| `client-dag` | none: it gives the graph algorithms that `dag.traverse` uses |
| `client-procedure` | `procedure.new`, `procedure.export` |

The bundle registers 57 procedures, and the core adds its own. [PROCEDURES.md](../documentation/PROCEDURES.md) describes each procedure.

## Where it is used

The bundle has a `client.procedures` field, so the `mark` CLI loads it with the other packages. A procedure that is registered already stays as it is. The site has the bundle as a development dependency, as it has each package that registers procedures.

## Compared with `bundle-mcp`

`bundle-mcp` gives the tools of Claude. It leaves out `shell.*`, `fs.*`, `git.*`, `pnpm.*` and `cli.*`, because Claude Code has its own tools for files, git and the shell. `bundle-dev` has these procedures for programs and scripts.
