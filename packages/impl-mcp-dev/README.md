# @procedures/mcp-dev-tools

[![npm](https://img.shields.io/npm/v/@procedures/mcp-dev-tools?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/mcp-dev-tools)

`mcp-dev-tools` is the MCP server that gives procedures to Claude as tools. Its folder in the monorepo is `packages/impl-mcp-dev`. Claude Code (or Claude Desktop) starts it over stdio. By default it loads `bundle-mcp`, which selects 91 tools.

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
| `MCP_BUNDLES` | `@procedures/bundle-mcp` | The bundles to load, separated by commas. The server imports `<bundle>/register.js` for each one. `@procedures/bundle-assistant` adds the tools of the assistant. |
| `MCP_SERVER_NAME` | `impl-mcp-dev` | The server name in the MCP handshake |
| `MCP_SERVER_VERSION` | `1.0.0` | The server version in the MCP handshake |
| `MCP_DEBUG` | `false` | With `true`, the server writes debug lines to stderr |
| `MCP_TOOL_TIMEOUT_MS` | `600000` | The time limit of a tool call, in milliseconds. `0` turns the limit off. |
| `MCP_READ_ONLY` | `false` | With `true`, the tools are only the procedures that change nothing |
| `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN` | not set | The server uses Streamable HTTP on this port, not stdio. The host is `127.0.0.1` by default. |
| `MCP_PROGRAM_CHECK` | `true` | With `false`, a program starts without the check before the run |
| `MCP_FS_ROOT` | not set | The root of the files: each tool keeps its paths in this folder, or the host refuses it. Refer to "The root of the files". |

`mark mcp` starts the same server. Its flags replace the variables: `--bundles`, `--tool-timeout`, `--read-only`, `--http`, `--host`, `--token` and `--fs-root`.

The server operates under `run()` of `@mark1russell7/service` (CLI-11). The runner owns the signals, the stop in stages and the exit of the process.

- Over stdio, the profile is `ephemeral`. When the client closes the input, the server stops in stages and the process exits with the code 0. A first Ctrl-C stops the work, and a second one exits at once.
- Over Streamable HTTP, the profile is `localDev`. A listener of the service answers on the port, and the MCP endpoint is at `/mcp`.
- In code, `runDevToolsServer(config)` starts the server under the runner and gives the host, the service, the lifecycle and the URL. `startDevToolsServer()` is deprecated, and the next MINOR removes it.

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

1. The server loads each bundle. A bundle can export `mcpNamespaces` and `mcpExclude`.
2. A procedure is a tool when its namespace is in `mcpNamespaces` of a bundle, and its key is not in `mcpExclude`.
3. A `ProcedureServer` serves the registry with that rule as its `expose` rule. A data-driven procedure (`client.chain`, `client.eval`, a procedure of `procedure.define`) can use only exposed procedures.
4. `McpServerTransport` gives the exposed procedures as tools over stdio. It tells Claude when the list of tools changes.
   `createMcpHost()` of `@procedures/mcp-server` builds the host: the same factory as `mcp.serve` and the MCP hosts of the apps.
5. The host checks the program of each call to a data-driven procedure before the first step (`programCheckInterceptor` of `@procedures/compiler`). When the check finds an error, no step starts. Thus a refusal in step 3 comes before the write of step 1.

> [!WARNING]
> A bundle without `mcpNamespaces` exposes every registered procedure, `shell.exec` too. `bundle-dev` has no `mcpNamespaces`. Thus `MCP_BUNDLES=@procedures/bundle-dev` gives Claude shell access through this server.

The server sends `console.log` output to stderr, because stdout carries the MCP protocol.

## The tool list

`tools.snapshot.txt` has the names of the 91 tools. `src/tools.test.ts` starts the real server over stdio and compares its tools with the file. It also examines that a `docker.*` tool cannot start a shell command. To change the tools, change `bundle-mcp` and `tools.snapshot.txt` in one commit. The [bundle-mcp README](../bundle-mcp/README.md) lists the tools and the reasons for the procedures that stay out.

## Troubleshooting

- **No tools in Claude.** Build the monorepo, and examine the path in the configuration. Start the server with `MCP_DEBUG=true` and read stderr.
- **Old tools or old behavior.** Restart the MCP server after a rebuild.
- **A bundle fails to load.** The server stops with the message `Failed to load bundle`. Build the bundle, and examine the name in `MCP_BUNDLES`.
