# @mark1russell7/client-mcp

MCP server transport for the procedure system.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Claude Desktop                             │
│                              │                                    │
│                    MCP Protocol (stdio)                           │
│                              │                                    │
│                    ┌─────────▼─────────┐                         │
│                    │ ListToolsRequest  │                         │
│                    │ CallToolRequest   │                         │
│                    └─────────┬─────────┘                         │
└──────────────────────────────┼───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│                     McpServerTransport                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ListTools → PROCEDURE_REGISTRY.getAll() → MCP Tools        │  │
│  │ CallTool  → server.handle(request) → JSON Response         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│                      ProcedureServer                              │
│                              │                                    │
│              ┌───────────────┼───────────────┐                   │
│              ▼               ▼               ▼                   │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│     │ fs.read     │  │ git.commit  │  │ shell.run   │           │
│     │ handler()   │  │ handler()   │  │ handler()   │           │
│     └─────────────┘  └─────────────┘  └─────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install @mark1russell7/client-mcp
```

## Quick Start

```typescript
import { ProcedureServer, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { McpServerTransport } from "@mark1russell7/client-mcp";

// Load procedures (via side-effect imports)
import "@mark1russell7/bundle-dev/register.js";

// Create procedure server
const server = new ProcedureServer({
  autoRegister: true,
  registry: PROCEDURE_REGISTRY,
});

// Create MCP transport
const mcp = new McpServerTransport(server, {
  transport: "stdio",
  serverInfo: { name: "my-server", version: "1.0.0" },
});

// Add transport and start
server.addTransport(mcp);
await server.start();
```

## Features

### Dynamic Tool Registration

The transport automatically refreshes MCP tools when procedures are registered or unregistered:

```typescript
// Tools are automatically updated when procedures change
PROCEDURE_REGISTRY.register(newProcedure);  // → MCP tools refresh
PROCEDURE_REGISTRY.unregister(oldPath);     // → MCP tools refresh
```

### Tool Filtering

Filter which procedures are exposed as MCP tools:

```typescript
const mcp = new McpServerTransport(server, {
  transport: "stdio",
  filter: {
    includeTags: ["public"],
    excludeInternal: true,
    pathPrefix: ["api"],
  },
});
```

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
const mcp = new McpServerTransport(server, {
  transport: "stdio",
  debug: true,  // Logs to stderr
});
```

## Claude Desktop Configuration

Add to `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["@mark1russell7/impl-mcp-dev"]
    }
  }
}
```

## API Reference

### McpServerTransport

Main transport class for MCP integration.

```typescript
new McpServerTransport(server: ProcedureServer, options: McpServerTransportOptions)
```

Options:
- `transport: "stdio" | "sse"` - Transport type (stdio recommended for Claude Desktop)
- `serverInfo: { name, version }` - Server identification
- `filter?: McpToolFilter` - Tool filtering options
- `debug?: boolean` - Enable debug logging

Methods:
- `getState()` - Get current transport state (connected, toolCount, etc.)
- `close()` - Close the transport

## Procedures

This package includes built-in procedures:

- `mcp.serve` - Start MCP server programmatically
- `mcp.list-tools` - List available MCP tools with filtering
