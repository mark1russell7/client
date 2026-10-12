/**
 * mcp.serve Procedure
 *
 * Start MCP server to expose procedures as tools.
 *
 * Which procedures are tools is a security decision. Before, `mcp.serve` exposed every
 * procedure of the registry, `shell.exec` too (deep dive, architecture review 3.2). Now the tools
 * come from `namespaces`/`exclude`, or from the `mcpNamespaces`/`mcpExclude` of the bundles
 * (default: `@mark1russell7/bundle-mcp`, resolved from the current folder). Without a list,
 * nothing is exposed. The nested calls follow the call policy (`strictCalls`), and each tool call
 * has a time limit.
 */

import { z } from "zod";
import {
  defineProcedure,
  ProcedureServer,
  PROCEDURE_REGISTRY,
  timeoutInterceptor,
  type AnyProcedure,
  type ProcedurePath,
} from "@mark1russell7/client";
import { McpServerTransport } from "../../transport/mcp-transport.js";
import type { McpServerTransportOptions } from "../../types.js";
import { exposeRule, importBundles, mergeSurfaces } from "../../surface.js";

/** The default bundle of the tool surface. */
export const DEFAULT_SERVE_BUNDLE = "@mark1russell7/bundle-mcp";

const McpServeInputSchema = z.object({
  /**
   * Transport type (default: "stdio"). Only stdio is implemented: the SSE transport needs an
   * HTTP server integration, and accepting "sse" here only led to an error (BUGS-2026-07 L28).
   */
  transport: z.enum(["stdio"]).default("stdio").describe("Transport type (default: \"stdio\"). Only stdio is implemented: the SSE transport needs an HTTP server integration, and accepting \"sse\" here only led to an error (BUGS-2026-07 L28)."),
  /** Server name for MCP (default: "procedure-server") */
  name: z.string().optional().describe("Server name for MCP (default: \"procedure-server\")"),
  /** Server version for MCP (default: "1.0.0") */
  version: z.string().optional().describe("Server version for MCP (default: \"1.0.0\")"),
  /** Whether to auto-register all procedures (default: true) */
  autoRegister: z.boolean().default(true).describe("Whether to auto-register all procedures (default: true)"),
  /** Enable debug logging */
  debug: z.boolean().default(false).describe("Enable debug logging"),
  /** The namespaces (first path segments) of the tools. With this list, the bundles give no tools. */
  namespaces: z.array(z.string()).optional().describe("The namespaces (first path segments) of the tools. With this list, the bundles give no tools."),
  /** Procedure keys of the tool namespaces that are not tools. */
  exclude: z.array(z.string()).optional().describe("Procedure keys of the tool namespaces that are not tools."),
  /** The bundles whose mcpNamespaces and mcpExclude give the tools, when `namespaces` is not given. */
  bundles: z.array(z.string()).optional().describe("The bundles whose mcpNamespaces and mcpExclude give the tools, when `namespaces` is not given."),
  /** True (the default): a procedure of code without metadata.calls can call only tools. */
  strictCalls: z.boolean().default(true).describe("True (the default): a procedure of code without metadata.calls can call only tools."),
  /** The time limit of each tool call, in milliseconds (default: 600000). 0: no limit. */
  toolTimeoutMs: z.number().int().min(0).default(600_000).describe("The time limit of each tool call, in milliseconds (default: 600000). 0: no limit."),
});

type McpServeInput = z.infer<typeof McpServeInputSchema>;

interface McpServeOutput {
  success: boolean;
  transport: string;
  toolCount: number;
  serverName: string;
  /** Why the server has no tools, when it has none. */
  warning?: string;
}

const McpServeOutputSchema: {
  parse: (data: unknown) => McpServeOutput;
  safeParse: (data: unknown) => { success: true; data: McpServeOutput };
} = {
  parse: (data: unknown) => data as McpServeOutput,
  safeParse: (data: unknown) => ({ success: true as const, data: data as McpServeOutput }),
};

/** The options of `prepareServe`: the tool surface and the rules of the server. */
export interface ServeOptions {
  autoRegister?: boolean | undefined;
  namespaces?: readonly string[] | undefined;
  exclude?: readonly string[] | undefined;
  bundles?: readonly string[] | undefined;
  strictCalls?: boolean | undefined;
  toolTimeoutMs?: number | undefined;
}

/** The server of `mcp.serve`, before its transport starts. */
export interface ServeSetup {
  server: ProcedureServer;
  expose: (path: ProcedurePath) => boolean;
  /** Why the server has no tools, when it has none. */
  warning?: string;
}

/**
 * This function builds the procedure server of `mcp.serve`: its expose rule, its call policy and
 * its interceptors. The bundles resolve from `from` (default: the current folder).
 */
export async function prepareServe(input: ServeOptions, from: string = process.cwd()): Promise<ServeSetup> {
  let expose: (path: ProcedurePath) => boolean = () => false;
  let warning: string | undefined;
  if (input.namespaces) {
    expose = exposeRule({ namespaces: input.namespaces, exclude: input.exclude });
  } else {
    const bundles = input.bundles ?? [DEFAULT_SERVE_BUNDLE];
    try {
      const surface = mergeSurfaces(await importBundles(bundles, from));
      if (surface) {
        expose = exposeRule({ namespaces: surface.namespaces, exclude: [...(surface.exclude ?? []), ...(input.exclude ?? [])] });
      } else {
        warning = `The bundles ${bundles.join(", ")} give no mcpNamespaces, so no procedure is a tool. Give namespaces.`;
      }
    } catch (error) {
      warning =
        `The bundles ${bundles.join(", ")} cannot be loaded from ${from} (${(error as Error).message}), ` +
        `so no procedure is a tool. Give namespaces, or run in a project that has the bundles.`;
    }
  }

  const server = new ProcedureServer({
    autoRegister: input.autoRegister ?? true,
    registry: PROCEDURE_REGISTRY,
    expose,
    strictCalls: input.strictCalls ?? true,
    interceptors: [timeoutInterceptor({ ms: input.toolTimeoutMs ?? 600_000 })],
  });
  return warning === undefined ? { server, expose } : { server, expose, warning };
}

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
    const { server, expose, warning } = await prepareServe(input);

    // Build transport options
    const options: McpServerTransportOptions = {
      transport: input.transport,
      serverInfo: {
        name: serverName,
        version: serverVersion,
      },
      debug: input.debug,
      toolFilter: { include: expose },
    };

    // Create MCP transport
    const mcpTransport = new McpServerTransport(server, options);

    // Add transport and start
    server.addTransport(mcpTransport);
    await server.start();

    const state = mcpTransport.getState();
    if (warning) console.error(`[mcp.serve] ${warning}`);

    return {
      success: true,
      transport: input.transport,
      toolCount: state.toolCount,
      serverName,
      ...(warning ? { warning } : {}),
    };
  },
});
