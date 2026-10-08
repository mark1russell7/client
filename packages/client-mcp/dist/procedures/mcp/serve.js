/**
 * mcp.serve Procedure
 *
 * Start MCP server to expose procedures as tools.
 */
import { z } from "zod";
import { defineProcedure, ProcedureServer, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { McpServerTransport } from "../../transport/mcp-transport.js";
const McpServeInputSchema = z.object({
    /** Transport type (default: "stdio") */
    transport: z.enum(["stdio", "sse"]).default("stdio"),
    /** Server name for MCP (default: "procedure-server") */
    name: z.string().optional(),
    /** Server version for MCP (default: "1.0.0") */
    version: z.string().optional(),
    /** Port for SSE transport (default: 3002) */
    port: z.number().optional(),
    /** Path for SSE endpoint (default: "/mcp/sse") */
    path: z.string().optional(),
    /** Whether to auto-register all procedures (default: true) */
    autoRegister: z.boolean().default(true),
    /** Enable debug logging */
    debug: z.boolean().default(false),
});
const McpServeOutputSchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data: data }),
};
export const mcpServeProcedure = defineProcedure({
    path: ["mcp", "serve"],
    input: McpServeInputSchema,
    output: McpServeOutputSchema,
    metadata: {
        description: "Start MCP server to expose procedures as tools",
        tags: ["mcp", "server"],
    },
    handler: async (input) => {
        const serverName = input.name ?? "procedure-server";
        const serverVersion = input.version ?? "1.0.0";
        // Create procedure server
        const server = new ProcedureServer({
            autoRegister: input.autoRegister,
            registry: PROCEDURE_REGISTRY,
        });
        // Build transport options
        const options = {
            transport: input.transport,
            serverInfo: {
                name: serverName,
                version: serverVersion,
            },
            debug: input.debug,
        };
        // Add SSE options if using SSE transport
        if (input.transport === "sse") {
            const sseOpts = {};
            if (input.port !== undefined)
                sseOpts.port = input.port;
            if (input.path !== undefined)
                sseOpts.path = input.path;
            options.sseOptions = sseOpts;
        }
        // Create MCP transport
        const mcpTransport = new McpServerTransport(server, options);
        // Add transport and start
        server.addTransport(mcpTransport);
        await server.start();
        const state = mcpTransport.getState();
        return {
            success: true,
            transport: input.transport,
            toolCount: state.toolCount,
            serverName,
        };
    },
});
//# sourceMappingURL=serve.js.map