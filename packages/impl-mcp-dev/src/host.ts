/**
 * The dev-tools MCP host: its registry, its policy and its server (roadmap 2.3, 3.1).
 *
 * The host builds a registry of its own from the modules of its bundles (`<bundle>/module`), not
 * from the global registry. Its policy comes from `hostPolicy()` of the core:
 * - only the tool surface of the bundles is exposed (`mcpNamespaces` less `mcpExclude`);
 * - `strictCalls`: a procedure of code that declares no nested calls calls only tools;
 * - each tool call has a time limit.
 *
 * `server.ts` (the file in the MCP configuration of Claude Code) and `mark mcp` both start the
 * server with `startDevToolsServer()`.
 */

import {
  PROCEDURE_REGISTRY,
  ProcedureServer,
  createRegistry,
  hostPolicy,
  procedureServerOptions,
  type HostPolicy,
  type ProcedureModule,
  type ProcedureRegistry,
  type ToolSurface,
} from "@procedures/client";
import { McpServerTransport, mergeSurfaces, type BundleSurfaceModule } from "@procedures/mcp-server";
import { loadConfig, type McpServerConfig } from "./config.js";

/** The exports of a bundle's `module` entry: its module and the lists of its tools. */
interface BundleModuleExports extends BundleSurfaceModule {
  default?: ProcedureModule;
}

/** The modules and the tool lists of some bundles. */
export interface LoadedBundles {
  modules: ProcedureModule[];
  surfaces: BundleSurfaceModule[];
  /**
   * True when a bundle has no `module` entry: the host then imports the `register.js` of each
   * bundle and serves the global registry, as the server did before explicit registries.
   */
  global: boolean;
}

/** This function loads the module entry of each bundle (it registers nothing). */
export async function loadBundles(bundles: readonly string[]): Promise<LoadedBundles> {
  const modules: ProcedureModule[] = [];
  const surfaces: BundleSurfaceModule[] = [];
  for (const bundle of bundles) {
    let exports: BundleModuleExports;
    try {
      // The import resolves from this package, which depends on its bundles
      exports = (await import(`${bundle}/module`)) as BundleModuleExports;
    } catch {
      return loadBundlesGlobally(bundles);
    }
    if (!exports.default) return loadBundlesGlobally(bundles);
    modules.push(exports.default);
    surfaces.push(exports);
  }
  return { modules, surfaces, global: false };
}

/** The old way, for a bundle without a module entry: import each `register.js`. */
async function loadBundlesGlobally(bundles: readonly string[]): Promise<LoadedBundles> {
  const surfaces: BundleSurfaceModule[] = [];
  for (const bundle of bundles) {
    surfaces.push((await import(`${bundle}/register.js`)) as BundleSurfaceModule);
  }
  return { modules: [], surfaces, global: true };
}

/** The registry, the surface, the policy and the server of the dev-tools host. */
export interface DevToolsHost {
  registry: ProcedureRegistry;
  surface: ToolSurface | undefined;
  policy: HostPolicy;
  server: ProcedureServer;
}

/** This function builds the host. It starts no transport. */
export async function createDevToolsHost(config: McpServerConfig = loadConfig()): Promise<DevToolsHost> {
  const loaded = await loadBundles(config.bundles);
  const registry = loaded.global ? PROCEDURE_REGISTRY : createRegistry(...loaded.modules);
  // Bundles without mcpNamespaces say nothing about their tools: then every procedure is a tool
  const surface = mergeSurfaces(loaded.surfaces);
  const policy = hostPolicy({
    ...(surface ? { expose: surface } : {}),
    strictCalls: true,
    timeoutMs: config.toolTimeoutMs,
  });
  const server = new ProcedureServer(procedureServerOptions(policy, registry));
  return { registry, surface, policy, server };
}

/**
 * This function starts the dev-tools MCP server over stdio. stdout carries the protocol, so
 * `console.log` goes to stderr from here on (BUGS-2026-07 Bug5).
 */
export async function startDevToolsServer(config: McpServerConfig = loadConfig()): Promise<DevToolsHost> {
  // Defense-in-depth for the stdio transport: a stray console.log (from a procedure handler or a
  // dependency) would corrupt the protocol. The MCP SDK writes its frames with
  // process.stdout.write, so it is not affected.
  console.log = (...args: unknown[]): void => {
    console.error(...args);
  };
  if (config.debug) {
    console.error("[mcp-server] Starting with config:", JSON.stringify(config, null, 2));
  }

  const host = await createDevToolsHost(config);
  const expose = host.policy.expose;
  const transport = new McpServerTransport(host.server, {
    transport: "stdio",
    serverInfo: {
      name: config.serverName,
      version: config.serverVersion,
    },
    debug: config.debug,
    ...(expose ? { toolFilter: { include: expose } } : {}),
  });
  host.server.addTransport(transport);
  await host.server.start();

  if (config.debug) {
    console.error(`[mcp-server] Started with ${transport.getState().toolCount} tools`);
  }
  return host;
}
