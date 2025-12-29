/**
 * Configuration Loading
 *
 * Loads MCP server configuration from environment variables and CLI arguments.
 */
export interface McpServerConfig {
    /** Bundles to load (each must export /register.js) */
    bundles: string[];
    /** Server name for MCP protocol */
    serverName: string;
    /** Server version for MCP protocol */
    serverVersion: string;
    /** Enable debug logging */
    debug: boolean;
}
/**
 * Load configuration from environment variables.
 *
 * Environment variables:
 * - MCP_BUNDLES: Comma-separated list of bundles (default: "@mark1russell7/bundle-dev")
 * - MCP_SERVER_NAME: Server name (default: "impl-mcp-dev")
 * - MCP_SERVER_VERSION: Server version (default: "1.0.0")
 * - MCP_DEBUG: Enable debug logging (default: "false")
 */
export declare function loadConfig(): McpServerConfig;
//# sourceMappingURL=config.d.ts.map