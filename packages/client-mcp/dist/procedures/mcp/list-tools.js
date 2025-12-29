/**
 * mcp.list-tools Procedure
 *
 * List available MCP tools from the procedure registry.
 */
import { z } from "zod";
import { defineProcedure, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { proceduresToMcpTools } from "@mark1russell7/mcp";
const McpListToolsInputSchema = z.object({
    /** Only include procedures with these tags */
    includeTags: z.array(z.string()).optional(),
    /** Exclude procedures with these tags */
    excludeTags: z.array(z.string()).optional(),
    /** Exclude internal procedures (default: true) */
    excludeInternal: z.boolean().default(true),
    /** Only include procedures under this path prefix */
    pathPrefix: z.array(z.string()).optional(),
});
const McpListToolsOutputSchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data: data }),
};
export const mcpListToolsProcedure = defineProcedure({
    path: ["mcp", "list-tools"],
    input: McpListToolsInputSchema,
    output: McpListToolsOutputSchema,
    metadata: {
        description: "List available MCP tools from the procedure registry",
        tags: ["mcp", "introspection"],
    },
    handler: async (input) => {
        // Build filter, only adding defined values
        const filter = {
            excludeInternal: input.excludeInternal,
        };
        if (input.includeTags !== undefined) {
            filter.includeTags = input.includeTags;
        }
        if (input.excludeTags !== undefined) {
            filter.excludeTags = input.excludeTags;
        }
        if (input.pathPrefix !== undefined) {
            filter.pathPrefix = input.pathPrefix;
        }
        const procedures = PROCEDURE_REGISTRY.getAll();
        const mcpTools = proceduresToMcpTools(procedures, filter);
        const tools = mcpTools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            path: tool.procedurePath,
            streaming: tool.streaming,
            tags: tool.tags,
        }));
        return {
            tools,
            count: tools.length,
        };
    },
});
//# sourceMappingURL=list-tools.js.map