/**
 * mcp.list-tools Procedure
 *
 * List available MCP tools from the procedure registry.
 */

import { z } from "zod";
import { defineProcedure, PROCEDURE_REGISTRY, type AnyProcedure } from "@mark1russell7/client";
import { proceduresToMcpTools, type McpToolFilter } from "@mark1russell7/mcp";

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

type McpListToolsInput = z.infer<typeof McpListToolsInputSchema>;

interface McpToolInfo {
  name: string;
  description: string | undefined;
  path: string[];
  streaming: boolean | undefined;
  tags: string[] | undefined;
}

interface McpListToolsOutput {
  tools: McpToolInfo[];
  count: number;
}

const McpListToolsOutputSchema: {
  parse: (data: unknown) => McpListToolsOutput;
  safeParse: (data: unknown) => { success: true; data: McpListToolsOutput };
} = {
  parse: (data: unknown) => data as McpListToolsOutput,
  safeParse: (data: unknown) => ({ success: true as const, data: data as McpListToolsOutput }),
};

export const mcpListToolsProcedure: AnyProcedure = defineProcedure({
  path: ["mcp", "list-tools"],
  input: McpListToolsInputSchema,
  output: McpListToolsOutputSchema,
  metadata: {
    description: "List available MCP tools from the procedure registry",
    tags: ["mcp", "introspection"],
  },
  handler: async (input: McpListToolsInput): Promise<McpListToolsOutput> => {
    // Build filter, only adding defined values
    const filter: McpToolFilter = {
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

    const tools: McpToolInfo[] = mcpTools.map((tool) => ({
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
