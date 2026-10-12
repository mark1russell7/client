/**
 * MCP Server Entry Point
 *
 * Starts an MCP server that exposes procedures as tools to Claude Desktop.
 * Configurable via environment variables.
 */

import { ProcedureServer, PROCEDURE_REGISTRY, timeoutInterceptor } from "@mark1russell7/client";
import { McpServerTransport, exposeRule, mergeSurfaces, type BundleSurfaceModule } from "@mark1russell7/client-mcp";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Defense-in-depth for the stdio transport: stdout is reserved for JSON-RPC framing, so any
  // stray console.log (from a procedure handler or a dependency) would corrupt the protocol.
  // Redirect console.log to stderr before loading bundles / handling calls. The MCP SDK writes
  // protocol frames via process.stdout.write directly, so it is unaffected.
  // See documentation/BUGS-2026-07.md (Bug5).
  console.log = (...args: unknown[]): void => {
    console.error(...args);
  };

  if (config.debug) {
    console.error("[mcp-server] Starting with config:", JSON.stringify(config, null, 2));
  }

  // Load the bundles: importing a bundle registers its procedures, and its mcpNamespaces and
  // mcpExclude give the tools. Bundles without mcpNamespaces expose everything.
  const modules: BundleSurfaceModule[] = [];
  for (const bundle of config.bundles) {
    try {
      if (config.debug) {
        console.error(`[mcp-server] Loading bundle: ${bundle}`);
      }
      // The import resolves from this package, which depends on its bundles
      modules.push((await import(`${bundle}/register.js`)) as BundleSurfaceModule);
    } catch (error) {
      console.error(`[mcp-server] Failed to load bundle "${bundle}":`, error);
      process.exit(1);
    }
  }
  const surface = mergeSurfaces(modules);
  const expose = surface ? exposeRule(surface) : undefined;

  // Only the exposed procedures are tools (BUGS-2026-07 H18). The nested calls follow the call
  // policy (deep dive MCP-3): a data-driven procedure (client.chain) calls only tools, a code
  // procedure calls what its metadata.calls declares (docker.* declares shell.run), and with
  // strictCalls a code procedure that declares nothing calls only tools. Each tool call has a
  // time limit (roadmap 1.2).
  const server = new ProcedureServer({
    autoRegister: true,
    registry: PROCEDURE_REGISTRY,
    expose,
    strictCalls: true,
    interceptors: [timeoutInterceptor({ ms: config.toolTimeoutMs })],
  });

  // Create MCP transport
  const transport = new McpServerTransport(server, {
    transport: "stdio",
    serverInfo: {
      name: config.serverName,
      version: config.serverVersion,
    },
    debug: config.debug,
    ...(expose ? { toolFilter: { include: expose } } : {}),
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
