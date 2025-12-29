/**
 * MCP Client Package
 *
 * MCP server transport for the procedure system.
 * Maps PROCEDURE_REGISTRY to MCP tools for use with Claude Desktop
 * and other MCP-compatible clients.
 *
 * @packageDocumentation
 */
export { McpServerTransport } from "./transport/mcp-transport.js";
export { createStdioTransport } from "./transport/stdio.js";
export { createSseTransport } from "./transport/sse.js";
export type { McpServerTransportOptions, McpServerTransportState, SseTransportOptions, } from "./types.js";
export { mcpServeProcedure } from "./procedures/mcp/serve.js";
export { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";
export type { McpTool, McpToolDefinition, McpToolFilter, McpServerInfo, McpTransportType, } from "@mark1russell7/mcp";
export { proceduresToMcpTools, procedureToMcpTool, encodePath, decodePath, } from "@mark1russell7/mcp";
//# sourceMappingURL=index.d.ts.map