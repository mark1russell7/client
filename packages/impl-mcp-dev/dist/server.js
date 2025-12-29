/**
 * MCP Server Entry Point
 *
 * Starts an MCP server that exposes procedures as tools to Claude Desktop.
 * Configurable via environment variables.
 */
import { ProcedureServer, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { McpServerTransport } from "@mark1russell7/client-mcp";
import { loadConfig } from "./config.js";
async function main() {
    const config = loadConfig();
    if (config.debug) {
        console.error("[mcp-server] Starting with config:", JSON.stringify(config, null, 2));
    }
    // Load bundles dynamically
    for (const bundle of config.bundles) {
        try {
            if (config.debug) {
                console.error(`[mcp-server] Loading bundle: ${bundle}`);
            }
            await import(`${bundle}/register.js`);
        }
        catch (error) {
            console.error(`[mcp-server] Failed to load bundle "${bundle}":`, error);
            process.exit(1);
        }
    }
    // Create procedure server
    const server = new ProcedureServer({
        autoRegister: true,
        registry: PROCEDURE_REGISTRY,
    });
    // Create MCP transport
    const transport = new McpServerTransport(server, {
        transport: "stdio",
        serverInfo: {
            name: config.serverName,
            version: config.serverVersion,
        },
        debug: config.debug,
    });
    // Add transport and start
    server.addTransport(transport);
    await server.start();
    const state = transport.getState();
    if (config.debug) {
        console.error(`[mcp-server] Started with ${state.toolCount} tools`);
    }
}
main().catch((error) => {
    console.error("[mcp-server] Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map