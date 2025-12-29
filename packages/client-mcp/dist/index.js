/**
 * MCP Client Package
 *
 * MCP server transport for the procedure system.
 * Maps PROCEDURE_REGISTRY to MCP tools for use with Claude Desktop
 * and other MCP-compatible clients.
 *
 * @packageDocumentation
 */
// Transport
export { McpServerTransport } from "./transport/mcp-transport.js";
export { createStdioTransport } from "./transport/stdio.js";
export { createSseTransport } from "./transport/sse.js";
// Procedures
export { mcpServeProcedure } from "./procedures/mcp/serve.js";
export { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";
// Re-export mapping utilities
export { proceduresToMcpTools, procedureToMcpTool, encodePath, decodePath, } from "@mark1russell7/mcp";
//# sourceMappingURL=index.js.map