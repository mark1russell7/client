/**
 * The dev-tools MCP host: its registry, its policy and its server (roadmap 2.3, 3.1).
 *
 * The host builds a registry of its own from the modules of its bundles (`<bundle>/module`), not
 * from the global registry. Its policy comes from `hostPolicy()` of the core:
 * - only the tool surface of the bundles is exposed (`mcpNamespaces` less `mcpExclude`);
 * - `strictCalls`: a procedure of code that declares no nested calls calls only tools;
 * - each tool call has a time limit.
 *
 * `server.ts` (the file in the MCP configuration of Claude Code) and `mark mcp` both run the
 * server with `runDevToolsServer()`, under `run()` of `@mark1russell7/service` (CLI-11). The host
 * comes from `createMcpHost()` of `@procedures/mcp-server` (CLI-10): the same factory as
 * `mcp.serve` and the hosts of the apps.
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
import { createServer } from "node:http";
import { ephemeral, localDev, service, type Lifecycle, type Profile, type RunOptions, type ServiceBuilder } from "@mark1russell7/service";
import { httpTransport, type HttpKnobs, type HttpTransport } from "@mark1russell7/service/http";
import { loadConfig, type McpServerConfig } from "./config.js";
import { ms, seconds } from "@procedures/client";

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

/**
 * The face of the configuration: Streamable HTTP with `config.http`, else stdio. With `mount`, the
 * HTTP face has no listener of its own: the listener of the service answers for it (CLI-11).
 */
function facesOf(config: McpServerConfig, mount: boolean): McpHostFaces {
  if (!config.http) return { stdio: true };
  if (mount) return { http: { mount: true, ...(config.http.token ? { token: config.http.token } : {}) } };
  return {
    http: {
      port: config.http.port,
      ...(config.http.host ? { host: config.http.host } : {}),
      ...(config.http.token ? { token: config.http.token } : {}),
    },
  };
}

/** The options of `createDevToolsHost()`. */
export interface DevToolsHostOptions {
  /**
   * True: the HTTP face has no listener of its own, and the caller mounts `mcp.handleHttp` on a
   * listener. `runDevToolsServer()` gives true. The default is false, the listener of the face.
   */
  mountHttp?: boolean | undefined;
}

/** This function builds the host. It starts no transport. */
export async function createDevToolsHost(config: McpServerConfig = loadConfig(), options: DevToolsHostOptions = {}): Promise<DevToolsHost> {
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
    faces: facesOf(config, options.mountHttp === true),
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

/** The knobs of the HTTP listener on the computer of a developer, as data (as the procedures host gives them). */
const LISTENER_KNOBS: HttpKnobs = Object.freeze({
  server_idle_close: seconds(5),
  server_idle_sweep_interval: seconds(1),
  server_retry_after: seconds(1),
});

/** A dev-tools server that runs under `run()`: the host, its service, the lifecycle and the URL of HTTP. */
export interface RunningDevToolsServer {
  readonly host: DevToolsHost;
  readonly service: ServiceBuilder;
  /** The lifecycle: `life.done` resolves with the exit code after the stop. */
  readonly life: Lifecycle;
  /** The URL of the Streamable HTTP endpoint, with `config.http`. */
  readonly url?: string | undefined;
}

/**
 * This function runs the dev-tools MCP server under `run()` of `@mark1russell7/service` (CLI-11).
 * The runner owns the signals, the stop in stages and the exit of the process.
 *
 * - Over stdio, the profile is `ephemeral`, and the end of the input is the trigger `stdin-close`.
 *   stdout carries the protocol, so `console.log` goes to stderr from here on (BUGS-2026-07 Bug5).
 * - With `config.http`, the profile is `localDev`. An `httpTransport` of the service listens on the
 *   port, and the Streamable HTTP face mounts on it at `/mcp`. The address is loopback by default.
 *
 * After a startup that failed, `life.errors` tells why, and the process exits with the code 1.
 */
export async function runDevToolsServer(config: McpServerConfig = loadConfig(), run?: RunOptions): Promise<RunningDevToolsServer> {
  // Defense-in-depth for the stdio transport: a stray console.log would corrupt the protocol
  redirectConsoleToStderr();
  if (config.debug) console.error("[mcp-server] Starting with config:", JSON.stringify(config, null, 2));

  const host = await createDevToolsHost(config, { mountHttp: true });
  const profile: Profile = config.http ? localDev : ephemeral;
  const svc = host.mcp.declare(service("mcp-dev-tools").profile(profile));
  // A profile without policies leaves them to the service (as runProcedureHost does)
  if (!profile.readiness) svc.readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 });
  if (!profile.liveness) svc.liveness({ type: "window", failAfter: seconds(45) });
  if (!profile.startup) svc.startup(seconds(30));

  let listener: HttpTransport | undefined;
  if (config.http) {
    const address = config.http.host ?? "127.0.0.1";
    listener = httpTransport(createServer(), LISTENER_KNOBS, { listen: { port: config.http.port, host: address } });
    listener.mount((req, res) => host.mcp.handleHttp(req, res));
    svc.server("mcp-dev-tools.listen", listener.knobs, listener);
  }

  const life = await svc.run(run);
  const face = host.mcp.state().faces[0];
  if (config.debug) console.error(`[mcp-server] Started with ${face?.toolCount ?? 0} tools`);
  if (host.fsRoot !== undefined) console.error(`[mcp-server] Each tool refuses a path outside ${host.fsRoot}. Refused under the root: ${String(host.refusedUnderRoot)}`);
  let url: string | undefined;
  const bound = listener?.server.address();
  if (config.http && bound && typeof bound === "object") {
    const shown = bound.address === "0.0.0.0" || bound.address === "::" ? "localhost" : bound.address.includes(":") ? `[${bound.address}]` : bound.address;
    url = `http://${shown}:${bound.port}/mcp`;
    console.error(`[mcp-server] Streamable HTTP at ${url}${config.http.token ? " (send Authorization: Bearer <token>)" : ""}`);
  }
  return { host, service: svc, life, ...(url ? { url } : {}) };
}

/**
 * This function starts the dev-tools MCP server over stdio, or over Streamable HTTP with
 * `config.http` (roadmap R26). Over stdio, stdout carries the protocol, so `console.log` goes to
 * stderr from here on (BUGS-2026-07 Bug5). The stdio server stops when the client closes its
 * input: `host.mcp.closed` then resolves.
 *
 * @deprecated Use `runDevToolsServer()`: it runs the server under `run()` of the service, with a
 * listener of the service for HTTP. The next MINOR removes this function (CLI-11).
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
