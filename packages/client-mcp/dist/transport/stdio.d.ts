/**
 * Stdio Transport Wrapper
 *
 * Creates an MCP stdio transport for CLI usage.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
/**
 * Create a stdio transport for MCP server.
 *
 * Stdio transport uses standard input/output for communication,
 * suitable for CLI tools and desktop app integrations.
 *
 * @returns MCP stdio transport instance
 */
export declare function createStdioTransport(): StdioServerTransport;
//# sourceMappingURL=stdio.d.ts.map