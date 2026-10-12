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
import {
  PROCEDURE_REGISTRY,
  createRegistry,
  hostPolicy,
  pathToKey,
  type AnyProcedure,
  type HostPolicy,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@mark1russell7/client";
import { createPeer, type Peer, type PeerEndpoint } from "@mark1russell7/client-server";
import serverModule from "@mark1russell7/client-server/module";
import { parseConfig } from "./config.js";
import type { ServerConfig } from "./types.js";

/** A package name without a final `/register` or `/register.js` (the form of the old examples). */
function packageBase(spec: string): string {
  return spec.replace(/\/register(\.js)?$/, "");
}

/**
 * The module of a procedure package: its `module` entry, or else the procedures that importing
 * the package adds to the global registry.
 */
export async function loadProcedureModule(spec: string): Promise<ProcedureModule> {
  try {
    const exports = (await import(`${packageBase(spec)}/module`)) as { default?: ProcedureModule };
    if (exports.default && Array.isArray(exports.default.procedures)) return exports.default;
  } catch {
    // No module entry: the package registers on import
  }
  const before = new Set(PROCEDURE_REGISTRY.getAll().map((procedure) => pathToKey(procedure.path)));
  await import(spec);
  const added: AnyProcedure[] = PROCEDURE_REGISTRY.getAll().filter((procedure) => !before.has(pathToKey(procedure.path)));
  return { name: spec, procedures: added };
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

/** This function starts the server of a configuration. It returns when the transports listen. */
export async function startServer(config: ServerConfig, log: (line: string) => void = console.log): Promise<RunningServer> {
  const modules: ProcedureModule[] = [serverModule];
  for (const spec of config.procedures) {
    if (config.verbose) log(`  Loading: ${spec}`);
    try {
      modules.push(await loadProcedureModule(spec));
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
export async function runServer(argv: string[]): Promise<void> {
  const config = parseConfig(argv);
  console.log("Starting procedure server...");
  if (config.verbose) {
    console.log("  Procedures:", config.procedures.join(", ") || "(none specified)");
    console.log("  Transports:", config.transports.map((t) => t.type).join(", "));
  }

  const running = await startServer(config);

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

  const stop = (): void => {
    console.log("\nShutting down...");
    running.peer.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Keep the process alive
  await new Promise(() => {
    // Never resolves - keeps process running
  });
}
