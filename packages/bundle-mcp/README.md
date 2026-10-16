# @procedures/bundle-mcp

[![npm](https://img.shields.io/npm/v/@procedures/bundle-mcp?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/bundle-mcp)

```sh
npm install @procedures/bundle-mcp
```

`bundle-mcp` sets the tools that Claude gets from the MCP server (`impl-mcp-dev`). It imports the procedure packages, and it exports two lists that select the tools.

## The tools

`src/register.ts` exports these lists:

- `mcpNamespaces`: the namespaces whose procedures are tools. At this time: `client`, `cue`, `db`, `docker`, `lib`, `logs`, `mongo`, `procedure`, `program` and `vitest`.
- `mcpExclude`: procedures of those namespaces that are not tools.
  - `vitest.watch`, `vitest.stop` and `vitest.list` manage processes that live longer than a tool call.
  - `docker.prune` deletes in bulk, and `docker.volume.remove` deletes the data of a volume. `docker.push` can carry an image out to any registry.
  - `procedure.store`, `procedure.load`, `procedure.sync`, `procedure.remote` and `procedure.register` need a procedure store, and the MCP server has none.

The result is 79 tools (October 2026):

| Namespace | Tools |
|---|---|
| `client` | 15: the control-flow procedures (`chain`, `parallel`, `conditional`, `tryCatch`, `map`, `reduce`, `and`, `or`) and `all`, `any`, `none`, `not`, `identity`, `constant`, `throw` |
| `cue` | 5: `add`, `generate`, `init`, `remove`, `validate` |
| `db` | 2: `execute`, `query` |
| `docker` | 22: `build`, `compose.build`, `compose.down`, `compose.logs`, `compose.ps`, `compose.restart`, `compose.up`, `exec`, `images`, `inspect`, `logs`, `network.create`, `network.list`, `network.remove`, `ps`, `pull`, `rm`, `run`, `stop`, `tag`, `volume.create`, `volume.list` |
| `lib` | 4: `audit`, `new`, `rename`, `scan` |
| `logs` | 2: `query`, `store` |
| `mongo` | 16: the `collections`, `database`, `documents` and `indexes` procedures |
| `procedure` | 7: `define`, `delete`, `export`, `get`, `list`, `manifest`, `new` |
| `program` | 4: `check`, `compile`, `diagram`, `explain`. They examine a program before it starts. The program stays data. |
| `vitest` | 2: `coverage`, `run` |

`packages/impl-mcp-dev/tools.snapshot.txt` has the exact list. A test of `impl-mcp-dev` starts the real server and compares its tools with the list. The site shows the list too: <https://mark1russell7.github.io/client/claude/>.

## What stays out

- `shell.*` is registered, because `docker.*` and other wrappers start programs through `shell.run`. It is not a tool.
- `cli.run` starts any `mark` command, `shell exec` too. Thus `cli` is not in the list.
- `fs.*`, `git.*` and `pnpm.*` are not tools: Claude Code has its own tools for files, git and the shell.
- `snapshot.*` and `s3.*` are not in the bundle: `snapshot.restore` and `s3.delete` change data.
- `sdk.openrpc` and `sdk.typescript` of the compiler module are registered, but `sdk` is not a tool namespace. They write an OpenRPC document and a TypeScript SDK, and `mark sdk openrpc` gives them.

A data-driven procedure (`client.chain`, `client.eval`, a procedure of `procedure.define`) can use only the exposed procedures. Thus `client.chain` cannot reach `shell.exec`. A procedure of code still uses its dependencies: `docker.run` uses `shell.run`.

## The packages of the bundle

`register.ts` imports `client-lib`, `client-procedure`, `compiler`, `client-cue`, `client-docker`, `client-mongo`, `client-sqlite` and `client-vitest`. Their dependencies register `shell.*`, `fs.*` and the `dag.traverse`, `core.catch` and `ecosystem.procedures` procedures of `client-lib`. These procedures are registered but are not tools.

## Use

The MCP server imports `@procedures/bundle-mcp/register.js`. That import registers the procedures and gives the two lists. The root import `@procedures/bundle-mcp` registers nothing.

```typescript
import { mcpNamespaces, mcpExclude } from "@procedures/bundle-mcp/register.js";

const exposed = (path: string[]): boolean =>
  mcpNamespaces.includes(path[0] ?? "") && !mcpExclude.includes(path.join("."));
```

To change the tools, change the lists and `tools.snapshot.txt` in one commit. The test fails when the two do not agree.

## Related packages

- `impl-mcp-dev`: the MCP server that uses this bundle.
- `client-mcp`: the MCP transport of the procedure server.
- `bundle-dev`: the bundle for development work.
