# @procedures/mcp-dev-tools

[![npm](https://img.shields.io/npm/v/@procedures/mcp-dev-tools?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/mcp-dev-tools)

`mcp-dev-tools` is the MCP server that gives procedures to Claude as tools. Its folder in the monorepo is `packages/impl-mcp-dev`. Claude Code (or Claude Desktop) starts it over stdio. By default it loads `bundle-mcp`, which selects 103 tools.

## Set up Claude Code

Add the server to the MCP configuration of Claude Code. `npx` gets the package from npm:

```json
{
  "mcpServers": {
    "dev-tools": { "command": "npx", "args": ["-y", "@procedures/mcp-dev-tools"] }
  }
}
```

From a clone of the monorepo, build it first (`pnpm install`, then `pnpm build`). Then give the path of the server file:

```json
{
  "mcpServers": {
    "dev-tools": {
      "command": "node",
      "args": ["/path/to/client/packages/impl-mcp-dev/dist/server.js"]
    }
  }
}
```

The package has the bin `mcp-dev-tools`, which starts the same file.

Claude Code starts the server once for each session. After a rebuild, restart the MCP server (or the session) to get the changes.

When the client closes the input of stdio, the server stops: the calls in flight get their grace time, and then the process ends.

## Configuration

| Environment variable | Default | Function |
|---|---|---|
| `MCP_BUNDLES` | `@procedures/bundle-mcp` | The bundles and the module files to load, separated by commas. The server imports `<bundle>/module` for each bundle. A path is a [module file](#the-module-files-of-other-repositories). `@procedures/bundle-assistant` adds the tools of the assistant. |
| `MCP_SERVER_NAME` | `impl-mcp-dev` | The server name in the MCP handshake |
| `MCP_SERVER_VERSION` | `1.0.0` | The server version in the MCP handshake |
| `MCP_DEBUG` | `false` | With `true`, the server writes debug lines to stderr |
| `MCP_TOOL_TIMEOUT_MS` | `600000` | The time limit of a tool call, in milliseconds. `0` turns the limit off. |
| `MCP_READ_ONLY` | `false` | With `true`, the tools are only the procedures that change nothing |
| `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN` | not set | The server uses Streamable HTTP on this port, not stdio. The host is `127.0.0.1` by default. A set and empty `MCP_HTTP_TOKEN` is an error at the start. |
| `MCP_HTTP_MAX_SESSIONS` | `256` | The most sessions of the Streamable HTTP face at one time (CLI-51). `Infinity` turns the limit off. |
| `MCP_PROGRAM_CHECK` | `true` | With `false`, a program starts without the check before the run |
| `MCP_FS_ROOT` | not set | The root of the files: each tool keeps its paths in this folder, or the host refuses it. Refer to "The root of the files". |
| `MCP_LISTING` | `each` | With `search`, the list has three tools: `search_tools`, `describe_tool` and `call_tool`. Refer to "The cost of the search listing". |
| `MCP_PEERS` | not set | The running peers, as `name=source` entries separated by commas. The server forwards the calls of their tools. Refer to "The procedures of running peers". |

`mark mcp` starts the same server. Its flags replace the variables: `--bundles`, `--peers`, `--tool-timeout`, `--read-only`, `--http`, `--host`, `--token`, `--max-sessions`, `--fs-root` and `--listing`.

The server operates under `run()` of `@mark1russell7/service` (CLI-11). The runner owns the signals, the stop in stages and the exit of the process.

- Over stdio, the profile is `ephemeral`. When the client closes the input, the server stops in stages and the process exits with the code 0. A first Ctrl-C stops the work, and a second one exits at once.
- Over Streamable HTTP, the profile is `localDev`. A listener of the service answers on the port, and the MCP endpoint is at `/mcp`.
- In code, `runDevToolsServer(config)` starts the server under the runner and gives the host, the service, the lifecycle and the URL.

The server serves no remote events (`documentation/EVENTS.md`). Its transport carries only MCP, and `events.subscribe` is not a tool. Thus the host has no variable for the topics.

## The root of the files

With `MCP_FS_ROOT` (or `mark mcp --fs-root <folder>`), the host confines each tool to the folder (roadmap R33):

- The host starts `confineToRoot()` of `@procedures/fs` after it builds its registry. The function replaces handlers, and it adds no procedure.
- The list of the tools and `tools.snapshot.txt` do not change. The host refuses some tools under a root.
- A tool keeps its paths in the root. The host examines the path inputs of its rules (`metadata.fsRoot`) before it starts. The nested `fs.*` calls are confined too.
- A path outside the root gives `FORBIDDEN` with the reason `outside-root`. A relative path starts at the root. A working folder without a value is the root.
- The host refuses each tool that the root cannot confine, with the same error. At the start, it writes the refused procedures to stderr.
- The host does not start when the folder does not exist.

The tools of `bundle-mcp` under a root:

| Tools | Under a root |
|---|---|
| `cue.*` | Confined: `cwd` |
| `lib.scan`, `lib.graph`, `lib.audit`, `lib.rename` | Confined: `rootPath`. Their nested git calls are refused, and `lib.scan` gives a warning. |
| `procedure.new` | Confined: `path` |
| `sqlite.*`, `logs.*` | Confined: `dbPath`, which a call must give, or `:memory:` |
| `docker.ps`, `docker.logs`, `docker.stop`, `docker.rm`, `docker.images`, `docker.inspect`, `docker.pull`, `docker.tag`, `docker.volume.*`, `docker.network.*` | Confined: `cwd`. Docker runs in a folder of the root. |
| `docker.run`, `docker.exec`, `docker.build`, `docker.compose.*` | Refused: a volume, a compose file or a Dockerfile reaches host folders, or runs a program |
| `lib.new`, `vitest.run`, `vitest.coverage` | Refused: they start code of the project |
| `client.*`, `json.*`, `yaml.*`, `mongo.*`, `program.*`, the other `procedure.*` tools | Unchanged: they reach no file |

The rules and the table of all the procedures are in [CAPABILITIES-2026-10.md](../documentation/CAPABILITIES-2026-10.md#the-root-of-the-files-roadmap-r33).

## How it selects the tools

1. The server loads each bundle. A bundle can export `mcpNamespaces`, `mcpExclude`, `mcpHostModules` and `mcpInstructions`.
   The registry gets the `mcpHostModules` before the bundles, so they replace the modules of the bundles with their names. `@procedures/bundle-assistant` gives `geo` and `ics` with the host policy of `@procedures/http` so.
2. A procedure is a tool when its namespace is in `mcpNamespaces` of a bundle, and its key is not in `mcpExclude`.
3. A `ProcedureServer` serves the registry with that rule as its `expose` rule. A data-driven procedure (`client.chain`, `client.eval`, a procedure of `procedure.define`) can use only exposed procedures.
4. `McpServerTransport` gives the exposed procedures as tools over stdio. It tells Claude when the list of tools changes.
   `createMcpHost()` of `@procedures/mcp-server` builds the host: the same factory as `mcp.serve` and the MCP hosts of the apps.
5. The host checks the program of each call to a data-driven procedure before the first step (`programCheckInterceptor` of `@procedures/compiler`). When the check finds an error, no step starts. Thus a refusal in step 3 comes before the write of step 1.

> [!WARNING]
> A bundle without `mcpNamespaces` exposes every registered procedure, `shell.exec` too. `bundle-dev` has no `mcpNamespaces`. Thus `MCP_BUNDLES=@procedures/bundle-dev` gives Claude shell access through this server.

The server sends `console.log` output to stderr, because stdout carries the MCP protocol.

## The module files of other repositories

A repository outside this monorepo can give its tools to this server, with no second MCP server. Put the path of its module file in `MCP_BUNDLES`:

```json
"env": { "MCP_BUNDLES": "@procedures/bundle-mcp,/path/to/tools/module.mjs" }
```

- An entry is a module file when it is a `file:` URL, an absolute path, or a path that starts with `./` or `../`. A relative path starts from the folder of the process.
- The default export of the file is a procedure module: an object with a list of procedures.
- The export `mcpNamespaces` of the file gives its tools. Without it, the tools are the namespaces of the procedures of the module. The modules in `requires` add no tool.
- The export `mcpInstructions` of the file is a text for the model, for example the tool to read first. The server joins the instructions of its bundles and files in their order, and gives them to the client at the start of the session.
- The file can use its own copy of `@procedures/client`. A procedure is data, so the validators of that copy examine each input.
- When a file does not load, the server stops with a message that names the file. A bundle without a `module` entry cannot have module files next to it.

This module file of one line gives the five tools of Vex. Put it in a folder with `@mark1russell7/vex-mcp` in its `node_modules`:

```js
export { vexModule as default } from "@mark1russell7/vex-mcp";
```

`src/module-file.test.ts` loads a module file with no imports next to `bundle-mcp`, and starts its tool through the server. It also examines the joined instructions of two files.

## The procedures of running peers

A process with a state, for example a daemon, keeps its procedures in its own process. A second copy of its module in this server has a different state. Thus the server forwards the calls. Put the peer in `MCP_PEERS`:

```json
"env": { "MCP_PEERS": "jobs=/path/to/jobs-daemon.json,files=http://127.0.0.1:4000/api" }
```

- The name of a peer has lowercase letters, digits and hyphens, and it starts with a letter.
- A source is the base URL of the procedures of the peer, or its discovery file. A URL sends no token.
- A discovery file is a JSON object with the URL in `url` or `endpoint`, and a bearer token in `token`. A peer that starts again writes a new port and token in the file. The server reads the file at each call, so the calls follow the peer.
- At the start, the server reads the manifest of each peer through `procedure.manifest`, with a time limit of 5 seconds. Each procedure of the manifest becomes a tool, with its description, its JSON Schemas and its effects. `client.*` and `procedure.*` stay out.
- The peer examines each input with its own schemas, and applies its own policy. `MCP_READ_ONLY` keeps only the procedures that declare no writes.
- A peer that does not answer at the start gives no tools until the next start. The server writes the reason to stderr, and `host.peers` gives the state of each peer.
- When a path of a peer is also a path of the server or of another peer, the server does not start. The message names the path.

`src/peers.test.ts` starts peers on free ports of `127.0.0.1`, with and without a token, and calls their tools through the server.

## The tool list

`tools.snapshot.txt` has the names of the 103 tools. `src/tools.test.ts` starts the real server over stdio and compares its tools with the file. It also examines that a `docker.*` tool cannot start a shell command. To change the tools, change `bundle-mcp` and `tools.snapshot.txt` in one commit. The [bundle-mcp README](../bundle-mcp/README.md) lists the tools and the reasons for the procedures that stay out.

## The cost of the search listing

A session reads the list of the tools before it uses a tool. With `MCP_LISTING=search`, the list has three tools in place of each tool. Two tests hold the gains of this listing:

- `src/search-quality.test.ts` holds the quality of `search_tools` on the task queries of `search.golden.json`.
- `src/listing-cost.test.ts` holds its cost. The test starts the server two times and measures the UTF-8 bytes of the JSON that the model reads.

The bytes are a measure of the tokens. A task is the search listing, one result of `search_tools` and one result of `describe_tool`, for one golden query. A call costs the same in the two listings, so a task has no call.

| Measure | Bytes |
|---|---|
| The list of each tool (103 tools) | 130647 |
| The search listing (3 tools) | 1420 |
| A task, on average | 4803 |
| The worst task | 9806 |

`listing.cost.json` has two limits. The bytes of the search listing are exact. The share of the worst task in the list of each tool has a ceiling of 0.08. A new tool makes the list of each tool larger, so it does not fail the gate. To accept a change, start the test with `UPDATE_LISTING_COST=1` and examine the diff.

## Troubleshooting

- **No tools in Claude.** Build the monorepo, and examine the path in the configuration. Start the server with `MCP_DEBUG=true` and read stderr.
- **Old tools or old behavior.** Restart the MCP server after a rebuild.
- **A bundle fails to load.** The server stops with the error of the import. Build the bundle, and examine the name in `MCP_BUNDLES`.
- **A peer gives no tools.** The server writes `The peer <name> (<source>) gives no tools until the next start` and the reason to stderr. Start the peer, and then start the server again.
- **A module file fails to load.** The server stops with `MCP_BUNDLES: the module file <path> did not load` and the reason. Examine the path, and install the packages that the file imports.
