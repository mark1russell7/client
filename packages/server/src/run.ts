/**
 * The procedure server of the `server` CLI and of `mark serve` (roadmap 2.3, 3.1).
 *
 * The server builds a registry of its own from the modules of its `--procedures` packages (the
 * side-effect-free `<package>/module` entry), with the `server.*` procedures, and serves it under
 * the host policy of the core (`hostPolicy()`): the token, the `--expose` list and the browser
 * checks. A package without a module entry still works: the server imports it and takes the
 * procedures that the import added to the global registry.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PROCEDURE_REGISTRY,
  createRegistry,
  hostPolicy,
  pathToKey,
  type AnyProcedure,
  type HostPolicy,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { createPeer, type Peer, type PeerEndpoint } from "@procedures/peer";
import peerModule from "@procedures/peer/module";
import { parseConfig } from "./config.js";
import { serverModule } from "./module.js";
import type { ServerConfig } from "./types.js";
import { seconds } from "@procedures/client";

/** A package name and the subpath after it: "@a/b/register" gives ["@a/b", "./register"]. */
function splitSpec(spec: string): { name: string; subpath: string } {
  const parts = spec.split("/");
  const count = spec.startsWith("@") ? 2 : 1;
  const name = parts.slice(0, count).join("/");
  const rest = parts.slice(count).join("/");
  return { name, subpath: rest ? `./${rest}` : "." };
}

/**
 * The file of an export of a package (`subpath`: "." or "./module"), from the `node_modules`
 * folders above `from`. Undefined when no folder has the package or the export.
 */
function resolveExport(name: string, subpath: string, from: string): string | undefined {
  let dir = resolve(from);
  for (;;) {
    const folder = join(dir, "node_modules", ...name.split("/"));
    const manifestPath = join(folder, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: Record<string, unknown>; main?: string };
      const entry = manifest.exports?.[subpath] ?? manifest.exports?.[`${subpath}.js`];
      const target =
        typeof entry === "string"
          ? entry
          : ((entry as { import?: string; default?: string } | undefined)?.import ?? (entry as { default?: string } | undefined)?.default);
      if (target) return join(folder, target);
      if (subpath === "." && manifest.main) return join(folder, manifest.main);
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** The URL to import for a package export, from the first folder that has it; else the bare specifier. */
function importTarget(name: string, subpath: string, folders: readonly string[]): string | undefined {
  for (const from of folders) {
    const file = resolveExport(name, subpath, from);
    if (file && existsSync(file)) return pathToFileURL(file).href;
  }
  return undefined;
}

/**
 * The module of a procedure package: its `module` entry, or else the procedures that importing
 * the package adds to the global registry. A package resolves from the folders of `resolveFrom`
 * (the current folder by default), then from this package. "pkg/register" (the form of the old
 * examples) gives the module of "pkg". A file URL or a path is imported as it is.
 */
export async function loadProcedureModule(spec: string, resolveFrom: readonly string[] = [process.cwd()]): Promise<ProcedureModule> {
  const isFile = spec.startsWith("file:") || spec.startsWith(".") || isAbsolute(spec);
  if (!isFile) {
    const { name, subpath } = splitSpec(spec);
    const moduleUrl = importTarget(name, "./module", resolveFrom);
    try {
      const exports = (await import(moduleUrl ?? `${name}/module`)) as { default?: ProcedureModule };
      if (exports.default && Array.isArray(exports.default.procedures)) return exports.default;
    } catch {
      // No module entry: the package registers on import
    }
    return importedModule(spec, importTarget(name, subpath, resolveFrom) ?? spec);
  }
  return importedModule(spec, spec.startsWith("file:") ? spec : pathToFileURL(resolve(spec)).href);
}

/** The procedures that importing `target` adds to the global registry, as a module. */
async function importedModule(name: string, target: string): Promise<ProcedureModule> {
  const before = new Set(PROCEDURE_REGISTRY.getAll().map((procedure) => pathToKey(procedure.path)));
  await import(target);
  const added: AnyProcedure[] = PROCEDURE_REGISTRY.getAll().filter((procedure) => !before.has(pathToKey(procedure.path)));
  return { name, procedures: added };
}

/** The server that `runServer()` started. */
export interface RunningServer {
  peer: Peer;
  registry: ProcedureRegistry;
  policy: HostPolicy;
  endpoints: PeerEndpoint[];
  token: string | undefined;
  /** True when the token is random, for this run */
  generatedToken: boolean;
}

/** The token of a configuration: `--token`, else `SERVER_TOKEN`, else a random one. `--no-token`: none. */
function tokenOf(config: ServerConfig): { token: string | undefined; generated: boolean } {
  const envToken = process.env["SERVER_TOKEN"] || undefined;
  if (config.token === null) return { token: undefined, generated: false };
  if (config.token !== undefined) return { token: config.token, generated: false };
  if (envToken !== undefined) return { token: envToken, generated: false };
  return { token: randomBytes(24).toString("hex"), generated: true };
}

/** The options of `startServer()` and `runServer()`. */
export interface ServerRunOptions {
  /** The folders that a `--procedures` package resolves from, first to last (default: the current folder). */
  resolveFrom?: readonly string[] | undefined;
}

/** This function starts the server of a configuration. It returns when the transports listen. */
export async function startServer(
  config: ServerConfig,
  log: (line: string) => void = console.log,
  options: ServerRunOptions = {}
): Promise<RunningServer> {
  // The server.* procedures: those of the peer package (server.create, server.call and the
  // others), and server.start, server.stop and server.status of this package
  const modules: ProcedureModule[] = [peerModule, serverModule];
  for (const spec of config.procedures) {
    if (config.verbose) log(`  Loading: ${spec}`);
    try {
      modules.push(await loadProcedureModule(spec, options.resolveFrom ?? [process.cwd()]));
    } catch (error) {
      throw new Error(`Failed to load procedure package ${spec}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const registry = createRegistry(...modules);
  if (config.verbose) log(`  Registered procedures: ${registry.getAll().length}`);

  // A token by default: the server serves every procedure it loads, and any local program
  // could call it. `--no-token` turns this off on purpose.
  const { token, generated } = tokenOf(config);
  const policy = hostPolicy({
    ...(config.expose.length > 0 ? { expose: config.expose } : {}),
    ...(token !== undefined ? { token } : {}),
  });
  const peer = await createPeer({
    id: `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    transports: config.transports,
    registry,
    policy,
  });
  await peer.start();
  return { peer, registry, policy, endpoints: peer.getEndpoints(), token, generatedToken: generated };
}

/**
 * The `server` CLI: parse the options, start the server, print where it listens, and keep the
 * process alive until a signal. `mark serve` calls it with its own arguments.
 */
export async function runServer(argv: string[], options: ServerRunOptions = {}): Promise<void> {
  const config = parseConfig(argv);
  console.log("Starting procedure server...");
  if (config.verbose) {
    console.log("  Procedures:", config.procedures.join(", ") || "(none specified)");
    console.log("  Transports:", config.transports.map((t) => t.type).join(", "));
  }

  const running = await startServer(config, console.log, options);

  console.log("\nServer started!");
  console.log(`  Server ID: ${running.peer.id}`);
  console.log(`  Procedures: ${running.peer.getServer().procedureCount}`);
  console.log("\nEndpoints:");
  for (const endpoint of running.endpoints) {
    console.log(`  [${endpoint.type}] ${endpoint.address}`);
  }
  if (running.token === undefined) {
    console.log("\nNo token: any program on this computer can call the server.");
  } else {
    console.log(`\nToken${running.generatedToken ? " (random, for this run)" : ""}: ${running.token}`);
    console.log("  Send it as 'Authorization: Bearer <token>', or as ?token=<token> for WebSocket.");
  }
  if (config.expose.length > 0) {
    console.log(`Serves only: ${config.expose.join(", ")}`);
  }
  console.log("\nPress Ctrl+C to stop the server.");

  // The peer stops before the process exits, with a limit of 10 seconds. A failed stop exits
  // with 1, and a second signal exits at once (roadmap R5).
  let stopping = false;
  const stop = (): void => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log("\nShutting down...");
    setTimeout(() => process.exit(1), 10_000).unref();
    // The calls in flight have 5 seconds to end (roadmap R14)
    running.peer.stop({ grace: seconds(5) }).then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(`The server did not stop cleanly: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Keep the process alive
  await new Promise(() => {
    // Never resolves - keeps process running
  });
}
