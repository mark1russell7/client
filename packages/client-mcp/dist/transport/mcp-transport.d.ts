/**
 * MCP Server Transport
 *
 * Implements ServerTransport interface for MCP protocol.
 * Maps PROCEDURE_REGISTRY to MCP tools.
 */
import type { ServerTransport, Server } from "@mark1russell7/client";
import { type McpTool } from "@mark1russell7/mcp";
import type { McpServerTransportOptions, McpServerTransportState } from "../types.js";
/**
 * MCP Server Transport
 *
 * Implements the ServerTransport interface for MCP (Model Context Protocol).
 * Maps procedures from PROCEDURE_REGISTRY to MCP tools, handling:
 * - ListToolsRequest: Returns all registered procedures as tools
 * - CallToolRequest: Executes the corresponding procedure
 *
 * @example
 * ```typescript
 * const server = new ProcedureServer({ autoRegister: true });
 * const mcpTransport = new McpServerTransport(server, {
 *   transport: "stdio",
 *   serverInfo: { name: "my-server", version: "1.0.0" }
 * });
 * server.addTransport(mcpTransport);
 * await server.start();
 * ```
 */
export declare class McpServerTransport implements ServerTransport {
    readonly name = "mcp";
    private mcpServer;
    private server;
    private registry;
    private options;
    private running;
    private tools;
    private registerListener?;
    private unregisterListener?;
    constructor(server: Server, options?: McpServerTransportOptions);
    /**
     * Setup MCP request handlers.
     */
    private setupHandlers;
    /**
     * Setup registry event listeners for dynamic tool updates.
     */
    private setupRegistryListeners;
    /**
     * Refresh the tool list from the registry.
     */
    private refreshTools;
    /**
     * Log a debug message if debug mode is enabled.
     */
    private log;
    /**
     * Start the MCP transport.
     */
    start(): Promise<void>;
    /**
     * Stop the MCP transport.
     */
    stop(): Promise<void>;
    /**
     * Check if the transport is running.
     */
    isRunning(): boolean;
    /**
     * Get current transport state.
     */
    getState(): McpServerTransportState;
    /**
     * Get the list of available tools.
     */
    getTools(): McpTool[];
}
//# sourceMappingURL=mcp-transport.d.ts.map