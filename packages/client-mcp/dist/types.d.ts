/**
 * MCP Transport Types
 *
 * Configuration options for the MCP server transport.
 */
import type { ProcedureRegistry } from "@mark1russell7/client";
import type { McpServerInfo, McpToolFilter } from "@mark1russell7/mcp";
/**
 * SSE transport configuration options.
 */
export interface SseTransportOptions {
    /** Port to listen on (default: 3002) */
    port?: number;
    /** Host to bind to (default: "0.0.0.0") */
    host?: string;
    /** Path for SSE endpoint (default: "/mcp/sse") */
    path?: string;
    /** Enable CORS (default: true) */
    cors?: boolean;
}
/**
 * MCP Server Transport configuration options.
 */
export interface McpServerTransportOptions {
    /** Transport type: stdio or sse (default: "stdio") */
    transport?: "stdio" | "sse";
    /** Procedure registry to use (defaults to PROCEDURE_REGISTRY) */
    registry?: ProcedureRegistry;
    /** Server info for MCP protocol */
    serverInfo?: McpServerInfo;
    /** Tool filtering options */
    toolFilter?: McpToolFilter;
    /** SSE-specific options (when transport is "sse") */
    sseOptions?: SseTransportOptions;
    /** Enable debug logging */
    debug?: boolean;
}
/**
 * MCP Server Transport state.
 */
export interface McpServerTransportState {
    /** Whether the transport is running */
    running: boolean;
    /** Number of registered tools */
    toolCount: number;
    /** Transport type in use */
    transport: "stdio" | "sse";
}
//# sourceMappingURL=types.d.ts.map