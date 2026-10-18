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
 * server with `startDevToolsServer()`. The host comes from `createMcpHost()` of
 * `@procedures/mcp-server` (CLI-10): the same factory as `mcp.serve` and the hosts of the apps.
 *
 * `MCP_FS_ROOT` confines the procedures to one folder (`confineToRoot()` of `@procedures/fs`):
 * each tool keeps its paths in it, or the root refuses the tool. The host serves no remote
 * events: its transport carries only MCP, and `events.subscribe` is not a tool.
 */

import {
  PROCEDURE_REGISTRY,
  ProcedureServer,
  createRegistry,
  registerClientProcedures,
  type HostPolicy,
  type ProcedureModule,
  type ProcedureRegistry,
  type ToolSurface,
} from "@procedures/client";
import {
  createMcpHost,
  mergeSurfaces,
  redirectConsoleToStderr,
  type BundleSurfaceModule,
  type McpHost,
  type McpHostFaces,
} from "@procedures/mcp-server";
import { programCheckInterceptor } from "@procedures/compiler";
import { loadConfig, type McpServerConfig } from "./config.js";
import { ms } from "@procedures/client";

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
  // The global registry gets the control flow only from this call (ARCHITECTURE-PROPOSALS-2026-10, P9)
  registerClientProcedures();
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
  /** The absolute path of the root of the files (`MCP_FS_ROOT`), or undefined. */
  fsRoot?: string | undefined;
  /** With a root: the keys of the procedures that the root refuses. Some of them are tools. */
  refusedUnderRoot?: string[] | undefined;
  /** The MCP host: `mcp.start()` starts its face (stdio, or Streamable HTTP with `config.http`). */
  mcp: McpHost;
}

/** The face of the configuration: Streamable HTTP with `config.http`, else stdio. */
function facesOf(config: McpServerConfig): McpHostFaces {
  if (!config.http) return { stdio: true };
  return {
    http: {
      port: config.http.port,
      ...(config.http.host ? { host: config.http.host } : {}),
      ...(config.http.token ? { token: config.http.token } : {}),
    },
  };
}

/** This function builds the host. It starts no transport. */
export async function createDevToolsHost(config: McpServerConfig = loadConfig()): Promise<DevToolsHost> {
  const loaded = await loadBundles(config.bundles);
  const registry = loaded.global ? PROCEDURE_REGISTRY : createRegistry(...loaded.modules);
  // MCP_FS_ROOT (roadmap R33): each procedure of the registry keeps its paths in the root, also
  // in the nested calls, or the root refuses it. It adds no procedure: the tools stay the same.
  let fsRoot: string | undefined;
  let refusedUnderRoot: string[] | undefined;
  if (config.fsRoot !== undefined) {
    const { confineToRoot } = await import("@procedures/fs/module");
    ({ root: fsRoot, refused: refusedUnderRoot } = confineToRoot(registry, config.fsRoot));
  }
  // Bundles without mcpNamespaces say nothing about their tools: then every procedure is a tool
  const surface = mergeSurfaces(loaded.surfaces);
  // Read only: the tools are the procedures that the capability permits, so the list shows only
  // what a call can start (CAPABILITIES-2026-10). The check before the run (roadmap R22): a
  // program with an error does not start, so a refusal in step 3 comes before the write of step 1.
  const mcp = createMcpHost({
    registry,
    ...(surface ? { surface } : {}),
    readOnly: config.readOnly === true,
    policy: { strictCalls: true, timeout: ms(config.toolTimeoutMs) },
    ...(config.programCheck === false ? {} : { interceptors: ({ expose }) => [programCheckInterceptor({ registry, expose })] }),
    name: config.serverName,
    version: config.serverVersion,
    debug: config.debug,
    faces: facesOf(config),
  });
  return {
    registry,
    surface,
    policy: mcp.policy,
    server: mcp.server,
    mcp,
    ...(fsRoot !== undefined ? { fsRoot, refusedUnderRoot } : {}),
  };
}

/**
 * This function starts the dev-tools MCP server over stdio, or over Streamable HTTP with
 * `config.http` (roadmap R26). Over stdio, stdout carries the protocol, so `console.log` goes to
 * stderr from here on (BUGS-2026-07 Bug5). The stdio server stops when the client closes its
 * input: `host.mcp.closed` then resolves.
 */
export async function startDevToolsServer(config: McpServerConfig = loadConfig()): Promise<DevToolsHost> {
  // Defense-in-depth for the stdio transport: a stray console.log (from a procedure handler, a
  // dependency or a bundle that loads) would corrupt the protocol. The MCP SDK writes its frames
  // with process.stdout.write, so it is not affected.
  redirectConsoleToStderr();
  if (config.debug) {
    console.error("[mcp-server] Starting with config:", JSON.stringify(config, null, 2));
  }

  const host = await createDevToolsHost(config);
  await host.mcp.start();
  const face = host.mcp.state().faces[0];

  if (config.debug) {
    console.error(`[mcp-server] Started with ${face?.toolCount ?? 0} tools`);
  }
  if (host.fsRoot !== undefined) console.error(`[mcp-server] Each tool refuses a path outside ${host.fsRoot}. Refused under the root: ${String(host.refusedUnderRoot)}`);
  const url = face?.url;
  if (url) console.error(`[mcp-server] Streamable HTTP at ${url}${config.http?.token ? " (send Authorization: Bearer <token>)" : ""}`);
  return host;
}
