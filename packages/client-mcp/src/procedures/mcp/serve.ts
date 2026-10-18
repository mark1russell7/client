/**
 * mcp.serve Procedure
 *
 * Start MCP server to expose procedures as tools.
 *
 * Which procedures are tools is a security decision. Before, `mcp.serve` exposed every
 * procedure of the registry, `shell.exec` too (deep dive, architecture review 3.2). Now the tools
 * come from `namespaces`/`exclude`, or from the `mcpNamespaces`/`mcpExclude` of the bundles
 * (default: `@procedures/bundle-mcp`, resolved from the current folder). Without a list,
 * nothing is exposed. The nested calls follow the call policy (`strictCalls`), and each tool call
 * has a time limit.
 *
 * The server comes from `createMcpHost()` (CLI-10), so its options come from `hostPolicy()` of the
 * core, as for the dev-tools server. Before, `mcp.serve` built them by hand.
 */

import { z } from "zod";
import {
  defineProcedure,
  ProcedureServer,
  PROCEDURE_REGISTRY,
  ProcedureRegistry,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedurePath,
  type ToolSurface,
} from "@procedures/client";
import { exposeRule, importBundles, mergeSurfaces } from "../../surface.js";
import { createMcpHost, type McpHost, type McpHostFaces } from "../../host.js";
import { ms } from "@procedures/client";

/** The default bundle of the tool surface. */
export const DEFAULT_SERVE_BUNDLE = "@procedures/bundle-mcp";

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
  /** True: the tools are only the procedures that change nothing, and each call has that capability. */
  readOnly: z.boolean().default(false).describe("True: the tools are only the procedures that change nothing, and each call has that capability."),
  /** The instructions of the server: the MCP client gives them to the model. */
  instructions: z.string().optional().describe("The instructions of the server: the MCP client gives them to the model."),
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
  /** True: the tools are only the procedures that change nothing. */
  readOnly?: boolean | undefined;
  /** The name of the server for the MCP client. */
  name?: string | undefined;
  /** The version of the server for the MCP client. */
  version?: string | undefined;
  /** The instructions of the server. */
  instructions?: string | undefined;
  /** True: debug lines go to stderr. */
  debug?: boolean | undefined;
  /** The faces of the host. The default is stdio. */
  faces?: McpHostFaces | undefined;
}

/** The server of `mcp.serve`, before its transport starts. */
export interface ServeSetup {
  server: ProcedureServer;
  expose: (path: ProcedurePath) => boolean;
  /** The MCP host of the server: `host.start()` starts its faces. */
  host: McpHost;
  /** Why the server has no tools, when it has none. */
  warning?: string;
}

/**
 * This function builds the procedure server of `mcp.serve`: its expose rule, its call policy and
 * its interceptors. The bundles resolve from `from` (default: the current folder). The server
 * serves `registry` (default: the global registry). The `register.js` of a bundle registers its
 * procedures in the global registry; for another registry, the bundles give only the tool list,
 * and the host registers the modules (P9).
 */
export async function prepareServe(
  input: ServeOptions,
  from: string = process.cwd(),
  registry: ProcedureRegistry = PROCEDURE_REGISTRY
): Promise<ServeSetup> {
  // Without a surface, nothing is a tool
  let surface: ToolSurface | ((path: ProcedurePath) => boolean) = () => false;
  let warning: string | undefined;
  if (input.namespaces) {
    surface = { namespaces: input.namespaces, exclude: input.exclude };
  } else {
    const bundles = input.bundles ?? [DEFAULT_SERVE_BUNDLE];
    try {
      const merged = mergeSurfaces(await importBundles(bundles, from));
      if (merged) {
        surface = { namespaces: merged.namespaces, exclude: [...(merged.exclude ?? []), ...(input.exclude ?? [])] };
      } else {
        warning = `The bundles ${bundles.join(", ")} give no mcpNamespaces, so no procedure is a tool. Give namespaces.`;
      }
    } catch (error) {
      warning =
        `The bundles ${bundles.join(", ")} cannot be loaded from ${from} (${(error as Error).message}), ` +
        `so no procedure is a tool. Give namespaces, or run in a project that has the bundles.`;
    }
  }

  const host = createMcpHost({
    registry,
    surface,
    readOnly: input.readOnly === true,
    policy: { strictCalls: input.strictCalls ?? true, timeout: ms(input.toolTimeoutMs ?? 600_000) },
    serverOptions: { autoRegister: input.autoRegister ?? true },
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.version !== undefined ? { version: input.version } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(input.debug !== undefined ? { debug: input.debug } : {}),
    faces: input.faces ?? { stdio: true },
  });
  // A surface always gives a rule, so the host has one
  const expose = host.expose ?? (typeof surface === "function" ? surface : exposeRule(surface));
  const setup: ServeSetup = { server: host.server, expose, host };
  if (warning !== undefined) setup.warning = warning;
  return setup;
}

export const mcpServeProcedure: AnyProcedure = defineProcedure({
  path: ["mcp", "serve"],
  input: McpServeInputSchema,
  output: McpServeOutputSchema,
  metadata: {
    description: "Start MCP server to expose procedures as tools",
    tags: ["mcp", "server"],
    // It imports the bundles of the project, which register their procedures, and serves on stdio
    effects: { reads: ["fs", "registry"], writes: ["process", "registry", "server"] },
  },
  handler: async (input: McpServeInput, ctx?: ProcedureContext): Promise<McpServeOutput> => {
    const serverName = input.name ?? "procedure-server";
    const serverVersion = input.version ?? "1.0.0";
    // The registry of the caller: a host with its own registry serves its own procedures
    const registry = ctx?.registry instanceof ProcedureRegistry ? ctx.registry : PROCEDURE_REGISTRY;
    const { host, warning } = await prepareServe(
      { ...input, name: serverName, version: serverVersion, faces: { stdio: true } },
      process.cwd(),
      registry,
    );
    // The face of stdio: it stops the host when the client closes the input
    await host.start();

    const toolCount = host.state().faces[0]?.toolCount ?? host.tools().length;
    if (warning) console.error(`[mcp.serve] ${warning}`);

    return {
      success: true,
      transport: input.transport,
      toolCount,
      serverName,
      ...(warning ? { warning } : {}),
    };
  },
});
