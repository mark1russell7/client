/**
 * MCP Server Entry Point
 *
 * Starts an MCP server that exposes procedures as tools to Claude Desktop.
 * Configurable via environment variables.
 */

import { ProcedureServer, PROCEDURE_REGISTRY, type ProcedurePath } from "@mark1russell7/client";
import { McpServerTransport } from "@mark1russell7/client-mcp";
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

  // Load bundles dynamically
  // The namespaces that the bundles expose as tools. A bundle without mcpNamespaces exposes everything.
  let exposed: Set<string> | undefined;
  // Single procedures that are not tools, although their namespace is exposed
  const excluded = new Set<string>();
  for (const bundle of config.bundles) {
    try {
      if (config.debug) {
        console.error(`[mcp-server] Loading bundle: ${bundle}`);
      }
      const module = (await import(`${bundle}/register.js`)) as {
        mcpNamespaces?: readonly string[];
        mcpExclude?: readonly string[];
      };
      if (Array.isArray(module.mcpNamespaces)) {
        exposed ??= new Set();
        for (const namespace of module.mcpNamespaces) exposed.add(namespace);
      }
      for (const key of module.mcpExclude ?? []) excluded.add(key);
    } catch (error) {
      console.error(`[mcp-server] Failed to load bundle "${bundle}":`, error);
      process.exit(1);
    }
  }

  // Create procedure server
  // Only the exposed procedures are tools, and a data-driven procedure (client.chain) can call
  // only them. Procedures of code still call their dependencies (docker.* uses shell.exec).
  // See BUGS-2026-07 H18.
  const exposedNamespaces = exposed;
  const expose = exposedNamespaces
    ? (path: ProcedurePath): boolean => exposedNamespaces.has(path[0] ?? "") && !excluded.has(path.join("."))
    : undefined;

  const server = new ProcedureServer({
    autoRegister: true,
    registry: PROCEDURE_REGISTRY,
    expose,
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
