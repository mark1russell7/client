# @mark1russell7/mcp

Core types and utilities for MCP (Model Context Protocol) integration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PROCEDURE_REGISTRY                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ fs.read  │ │git.commit│ │shell.run │ │ ...      │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
└───────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│              proceduresToMcpTools()                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • path → tool.name                                   │    │
│  │ • metadata.description → tool.description            │    │
│  │ • zodToJsonSchema(input) → tool.inputSchema          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                     MCP Tools                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ fs.read  │ │git.commit│ │shell.run │ │ ...      │       │
│  │ {JSON}   │ │ {JSON}   │ │ {JSON}   │ │ {JSON}   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install @mark1russell7/mcp
```

## Usage

```typescript
import { proceduresToMcpTools, zodToJsonSchema } from "@mark1russell7/mcp";
import { PROCEDURE_REGISTRY } from "@mark1russell7/client";

// Convert all registered procedures to MCP tools
const tools = proceduresToMcpTools(PROCEDURE_REGISTRY.getAll());

// Convert a Zod schema to JSON Schema
const jsonSchema = zodToJsonSchema(myZodSchema);
```

## Features

### Zod to JSON Schema Conversion

Converts Zod schemas to JSON Schema format for MCP tool input definitions:

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "@mark1russell7/mcp";

const schema = z.object({
  path: z.string().describe("File path"),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

const jsonSchema = zodToJsonSchema(schema);
// {
//   type: "object",
//   properties: {
//     path: { type: "string", description: "File path" },
//     encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" }
//   },
//   required: ["path"]
// }
```

### Procedure to MCP Tool Mapping

Converts procedures to MCP-compatible tool definitions:

```typescript
import { proceduresToMcpTools, type McpToolFilter } from "@mark1russell7/mcp";

// With filtering
const filter: McpToolFilter = {
  includeTags: ["fs", "git"],      // Only these tags
  excludeTags: ["internal"],       // Exclude these
  excludeInternal: true,           // Exclude internal procedures
  pathPrefix: ["fs"],              // Only fs.* procedures
};

const tools = proceduresToMcpTools(procedures, filter);
```

## API Reference

### Types

- `McpTool` - MCP tool definition with name, description, input schema
- `McpToolFilter` - Filtering options for procedure selection
- `JsonSchema` - JSON Schema type definitions

### Functions

- `zodToJsonSchema(schema)` - Convert Zod schema to JSON Schema
- `procedureToMcpTool(procedure)` - Convert single procedure to MCP tool
- `proceduresToMcpTools(procedures, filter?)` - Convert multiple procedures with optional filtering
