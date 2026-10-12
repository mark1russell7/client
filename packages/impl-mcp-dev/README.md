# @mark1russell7/mcp-dev-tools

[![npm](https://img.shields.io/npm/v/@mark1russell7/mcp-dev-tools?color=2346c4&label=npm)](https://www.npmjs.com/package/@mark1russell7/mcp-dev-tools)

`mcp-dev-tools` is the MCP server that gives procedures to Claude as tools. Its folder in the monorepo is `packages/impl-mcp-dev`. Claude Code (or Claude Desktop) starts it over stdio. By default it loads `bundle-mcp`, which selects 62 tools.

## Set up Claude Code

Add the server to the MCP configuration of Claude Code. `npx` gets the package from npm:

```json
{
  "mcpServers": {
    "dev-tools": { "command": "npx", "args": ["-y", "@mark1russell7/mcp-dev-tools"] }
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

## Configuration

| Environment variable | Default | Function |
|---|---|---|
| `MCP_BUNDLES` | `@mark1russell7/bundle-mcp` | The bundles to load, separated by commas. The server imports `<bundle>/register.js` for each one. |
| `MCP_SERVER_NAME` | `impl-mcp-dev` | The server name in the MCP handshake |
| `MCP_SERVER_VERSION` | `1.0.0` | The server version in the MCP handshake |
| `MCP_DEBUG` | `false` | With `true`, the server writes debug lines to stderr |

## How it selects the tools

1. The server loads each bundle. A bundle can export `mcpNamespaces` and `mcpExclude`.
2. A procedure is a tool when its namespace is in `mcpNamespaces` of a bundle, and its key is not in `mcpExclude`.
3. A `ProcedureServer` serves the registry with that rule as its `expose` rule. A data-driven procedure (`client.chain`, `client.eval`, a procedure of `procedure.define`) can use only exposed procedures.
4. `McpServerTransport` gives the exposed procedures as tools over stdio. It tells Claude when the list of tools changes.

> [!WARNING]
> A bundle without `mcpNamespaces` exposes every registered procedure, `shell.exec` too. `bundle-dev` has no `mcpNamespaces`. Thus `MCP_BUNDLES=@mark1russell7/bundle-dev` gives Claude shell access through this server.

The server sends `console.log` output to stderr, because stdout carries the MCP protocol.

## The tool list

`tools.snapshot.txt` has the names of the 62 tools. `src/tools.test.ts` starts the real server over stdio and compares its tools with the file. It also examines that a `docker.*` tool cannot start a shell command. To change the tools, change `bundle-mcp` and `tools.snapshot.txt` in one commit. The [bundle-mcp README](../bundle-mcp/README.md) lists the tools and the reasons for the procedures that stay out.

## Troubleshooting

- **No tools in Claude.** Build the monorepo, and examine the path in the configuration. Start the server with `MCP_DEBUG=true` and read stderr.
- **Old tools or old behavior.** Restart the MCP server after a rebuild.
- **A bundle fails to load.** The server stops with the message `Failed to load bundle`. Build the bundle, and examine the name in `MCP_BUNDLES`.
