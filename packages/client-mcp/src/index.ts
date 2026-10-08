/**
 * MCP Client Package
 *
 * MCP server transport for the procedure system.
 * Maps PROCEDURE_REGISTRY to MCP tools for use with Claude Desktop
 * and other MCP-compatible clients.
 *
 * @packageDocumentation
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

// Transport
export { McpServerTransport } from "./transport/mcp-transport.js";
export { createStdioTransport } from "./transport/stdio.js";
export { createSseTransport } from "./transport/sse.js";

// Types
export type {
  McpServerTransportOptions,
  McpServerTransportState,
  SseTransportOptions,
} from "./types.js";

// Procedures
export { mcpServeProcedure } from "./procedures/mcp/serve.js";
export { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";

// Re-export core MCP types for convenience
export type {
  McpTool,
  McpToolDefinition,
  McpToolFilter,
  McpServerInfo,
  McpTransportType,
} from "@mark1russell7/mcp";

// Re-export mapping utilities
export {
  proceduresToMcpTools,
  procedureToMcpTool,
  encodePath,
  decodePath,
} from "@mark1russell7/mcp";
