# @mark1russell7/bundle-mcp

[![npm](https://img.shields.io/npm/v/@mark1russell7/bundle-mcp?color=2346c4&label=npm)](https://www.npmjs.com/package/@mark1russell7/bundle-mcp)

```sh
npm install @mark1russell7/bundle-mcp
```

`bundle-mcp` sets the tools that Claude gets from the MCP server (`impl-mcp-dev`). It imports the procedure packages, and it exports two lists that select the tools.

## The tools

`src/register.ts` exports these lists:

- `mcpNamespaces`: the namespaces whose procedures are tools. At this time: `client`, `cue`, `db`, `docker`, `lib`, `logs`, `mongo`, `procedure` and `vitest`.
- `mcpExclude`: procedures of those namespaces that are not tools.
  - `vitest.watch`, `vitest.stop` and `vitest.list` manage processes that live longer than a tool call.
  - `procedure.store`, `procedure.load`, `procedure.sync`, `procedure.remote` and `procedure.register` need a procedure store, and the MCP server has none.

The result is 62 tools (October 2026):

| Namespace | Tools |
|---|---|
| `client` | 15: the control-flow procedures (`chain`, `parallel`, `conditional`, `tryCatch`, `map`, `reduce`, `and`, `or`) and `all`, `any`, `none`, `not`, `identity`, `constant`, `throw` |
| `cue` | 5: `add`, `generate`, `init`, `remove`, `validate` |
| `db` | 2: `execute`, `query` |
| `docker` | 10: `build`, `compose.down`, `compose.up`, `exec`, `logs`, `ps`, `pull`, `rm`, `run`, `stop` |
| `lib` | 4: `audit`, `new`, `rename`, `scan` |
| `logs` | 2: `query`, `store` |
| `mongo` | 16: the `collections`, `database`, `documents` and `indexes` procedures |
| `procedure` | 6: `define`, `delete`, `export`, `get`, `list`, `new` |
| `vitest` | 2: `coverage`, `run` |

`packages/impl-mcp-dev/tools.snapshot.txt` has the exact list. A test of `impl-mcp-dev` starts the real server and compares its tools with the list. The site shows the list too: <https://mark1russell7.github.io/client/claude/>.

## What stays out

- `shell.*` is registered, because `docker.*` and other wrappers start programs through `shell.run`. It is not a tool.
- `cli.run` starts any `mark` command, `shell exec` too. Thus `cli` is not in the list.
- `fs.*`, `git.*` and `pnpm.*` are not tools: Claude Code has its own tools for files, git and the shell.
- `snapshot.*` and `s3.*` are not in the bundle: `snapshot.restore` and `s3.delete` change data.

A data-driven procedure (`client.chain`, `client.eval`, a procedure of `procedure.define`) can use only the exposed procedures. Thus `client.chain` cannot reach `shell.exec`. A procedure of code still uses its dependencies: `docker.run` uses `shell.run`.

## The packages of the bundle

`register.ts` imports `client-lib`, `client-procedure`, `client-cue`, `client-docker`, `client-mongo`, `client-sqlite` and `client-vitest`. Their dependencies register `shell.*`, `fs.*` and the `dag.traverse`, `core.catch` and `ecosystem.procedures` procedures of `client-lib`. These procedures are registered but are not tools.

## Use

The MCP server imports `@mark1russell7/bundle-mcp/register.js`. That import registers the procedures and gives the two lists. The root import `@mark1russell7/bundle-mcp` registers nothing.

```typescript
import { mcpNamespaces, mcpExclude } from "@mark1russell7/bundle-mcp/register.js";

const exposed = (path: string[]): boolean =>
  mcpNamespaces.includes(path[0] ?? "") && !mcpExclude.includes(path.join("."));
```

To change the tools, change the lists and `tools.snapshot.txt` in one commit. The test fails when the two do not agree.

## Related packages

- `impl-mcp-dev`: the MCP server that uses this bundle.
- `client-mcp`: the MCP transport of the procedure server.
- `bundle-dev`: the bundle for development work.
