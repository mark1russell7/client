# @mark1russell7/impl-mcp-dev

Ready-to-use MCP server exposing the procedure ecosystem to Claude Desktop.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Claude Desktop                             │
│                             │                                    │
│                   claude_desktop_config.json                     │
│                             │                                    │
│                    npx @mark1russell7/impl-mcp-dev               │
└─────────────────────────────┼────────────────────────────────────┘
                              │ stdio
┌─────────────────────────────▼────────────────────────────────────┐
│                      impl-mcp-dev                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ MCP_BUNDLES env var → dynamic import → register procedures │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│               ┌──────────────┼──────────────┐                   │
│               ▼              ▼              ▼                   │
│        ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│        │bundle-dev│   │bundle-git│   │bundle-*  │              │
│        └────┬─────┘   └────┬─────┘   └────┬─────┘              │
│             │              │              │                     │
│             ▼              ▼              ▼                     │
│        ┌─────────────────────────────────────────┐             │
│        │          PROCEDURE_REGISTRY              │             │
│        │  fs.* | git.* | shell.* | pnpm.* | ...  │             │
│        └─────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
npx @mark1russell7/impl-mcp-dev
```

## Claude Desktop Setup

1. Open Claude Desktop settings
2. Edit `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dev-tools": {
      "command": "npx",
      "args": ["@mark1russell7/impl-mcp-dev"],
      "env": {
        "MCP_BUNDLES": "@mark1russell7/bundle-dev"
      }
    }
  }
}
```

3. Restart Claude Desktop
4. Tools will appear in Claude's tool list

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MCP_BUNDLES` | `@mark1russell7/bundle-dev` | Comma-separated list of bundles to load |
| `MCP_SERVER_NAME` | `impl-mcp-dev` | Server name for MCP protocol |
| `MCP_SERVER_VERSION` | `1.0.0` | Server version for MCP protocol |
| `MCP_DEBUG` | `false` | Enable debug logging (outputs to stderr) |

### Loading Multiple Bundles

```json
{
  "mcpServers": {
    "full-tools": {
      "command": "npx",
      "args": ["@mark1russell7/impl-mcp-dev"],
      "env": {
        "MCP_BUNDLES": "@mark1russell7/bundle-dev,@mark1russell7/bundle-git",
        "MCP_DEBUG": "true"
      }
    }
  }
}
```

## Available Tools (with bundle-dev)

When using `@mark1russell7/bundle-dev`, the following procedure namespaces are exposed:

- `shell.*` - Shell command execution
- `fs.*` - File system operations (read, write, list, etc.)
- `git.*` - Git operations (status, commit, push, etc.)
- `pnpm.*` - Package management
- `cli.*` - Mark CLI wrapper

## How It Works

1. **Startup:** Reads `MCP_BUNDLES` environment variable
2. **Bundle Loading:** Dynamically imports each bundle's `/register.js`
3. **Procedure Registration:** Side-effect imports register procedures to `PROCEDURE_REGISTRY`
4. **MCP Transport:** `McpServerTransport` exposes procedures as MCP tools
5. **Tool Execution:** Claude calls tools → transport routes to procedure handlers

## Programmatic Usage

```typescript
import { loadConfig, type McpServerConfig } from "@mark1russell7/impl-mcp-dev";

// Get the current configuration
const config: McpServerConfig = loadConfig();
console.log(config.bundles);  // ["@mark1russell7/bundle-dev"]
```

## Troubleshooting

### Tools not appearing

1. Check Claude Desktop logs for errors
2. Enable debug mode: `"MCP_DEBUG": "true"`
3. Verify bundles are installed: `npm ls @mark1russell7/bundle-dev`

### Server fails to start

1. Ensure Node.js v18+ is installed
2. Check bundle paths are correct
3. Run manually to see errors: `npx @mark1russell7/impl-mcp-dev`

### Connection issues

1. Restart Claude Desktop
2. Check `claude_desktop_config.json` syntax
3. Verify `command` path is correct (`npx` should be in PATH)
