/**
 * mcp.serve Procedure
 *
 * Start MCP server to expose procedures as tools.
 */

import { z } from "zod";
import { defineProcedure, ProcedureServer, PROCEDURE_REGISTRY, type AnyProcedure } from "@mark1russell7/client";
import { McpServerTransport } from "../../transport/mcp-transport.js";
import type { McpServerTransportOptions } from "../../types.js";

const McpServeInputSchema = z.object({
  /**
   * Transport type (default: "stdio"). Only stdio is implemented: the SSE transport needs an
   * HTTP server integration, and accepting "sse" here only led to an error (BUGS-2026-07 L28).
   */
  transport: z.enum(["stdio"]).default("stdio"),
  /** Server name for MCP (default: "procedure-server") */
  name: z.string().optional(),
  /** Server version for MCP (default: "1.0.0") */
  version: z.string().optional(),
  /** Whether to auto-register all procedures (default: true) */
  autoRegister: z.boolean().default(true),
  /** Enable debug logging */
  debug: z.boolean().default(false),
});

type McpServeInput = z.infer<typeof McpServeInputSchema>;

interface McpServeOutput {
  success: boolean;
  transport: string;
  toolCount: number;
  serverName: string;
}

const McpServeOutputSchema: {
  parse: (data: unknown) => McpServeOutput;
  safeParse: (data: unknown) => { success: true; data: McpServeOutput };
} = {
  parse: (data: unknown) => data as McpServeOutput,
  safeParse: (data: unknown) => ({ success: true as const, data: data as McpServeOutput }),
};

export const mcpServeProcedure: AnyProcedure = defineProcedure({
  path: ["mcp", "serve"],
  input: McpServeInputSchema,
  output: McpServeOutputSchema,
  metadata: {
    description: "Start MCP server to expose procedures as tools",
    tags: ["mcp", "server"],
  },
  handler: async (input: McpServeInput): Promise<McpServeOutput> => {
    const serverName = input.name ?? "procedure-server";
    const serverVersion = input.version ?? "1.0.0";

    // Create procedure server
    const server = new ProcedureServer({
      autoRegister: input.autoRegister,
      registry: PROCEDURE_REGISTRY,
    });

    // Build transport options
    const options: McpServerTransportOptions = {
      transport: input.transport,
      serverInfo: {
        name: serverName,
        version: serverVersion,
      },
      debug: input.debug,
    };

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
