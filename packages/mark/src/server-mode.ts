/**
 * CLI Server Mode
 *
 * Runs the CLI as a persistent server, exposing all ecosystem procedures
 * via HTTP. The server has the registry of mark (the module of each package, roadmap 3.1) and
 * the host policy of the core (roadmap 2.3): the token in the lockfile, and the topics of
 * `--events`. With `--fs-root`, each procedure keeps its paths in the root, or the root refuses it.
 *
 * The server is the background host of `mark` (decision D17): it runs under `run()` of
 * `@mark1russell7/service` through `runProcedureHost()`, with the profile `daemon` (CLI-8). The
 * runner owns the signals, the stop in stages and the exit. The lockfile is a dependency of the
 * service: its connect writes it, and its close removes it after the listeners close. The cold
 * mode of `mark` runs the same host in its own process (`markHostOptions()`, CLI-26).
 */

import type { ProcedureHostRunConfig } from "@procedures/server";
import { print } from "./print.js";
import { loadEcosystemRegistry } from "./ecosystem.js";
import { randomBytes } from "node:crypto";
import { getLockfilePath, currentBuild } from "./lockfile.js";

export interface ServerModeOptions {
  port: number;
  host?: string;
  transport?: "http" | "websocket" | "both";
  verbose?: boolean;
  /**
   * The topic patterns of the remote events (`--events`, `documentation/EVENTS.md`). Empty or no
   * value: the server serves no topic, and each subscription gets `TOPIC_NOT_FOUND`.
   */
  events?: readonly string[] | undefined;
  /** The folder that confines each path of the `fs.*` procedures (`--fs-root`). */
  fsRoot?: string | undefined;
  /**
   * The port of the probe server (`--probe-port`, CLI-9), on the address of `host`. Without it, each
   * listener answers the probes under `/_probes`.
   */
  probePort?: number | undefined;
}

/**
 * Build transport configuration array
 */
function buildTransports(options: ServerModeOptions) {
  const transports: Array<{
    type: "http" | "websocket";
    port: number;
    host: string;
    basePath?: string;
    path?: string;
  }> = [];

  // Loopback and no CORS by default: the server holds the whole registry, shell.* included.
  // Before, it listened on 0.0.0.0 with Access-Control-Allow-Origin: * (deep dive CLI-1, TRN-1).
  const { port, host = "127.0.0.1", transport = "http" } = options;

  if (transport === "http" || transport === "both") {
    transports.push({
      type: "http",
      port,
      host,
      basePath: "/api",
    });
  }

  if (transport === "websocket" || transport === "both") {
    transports.push({
      type: "websocket",
      port: transport === "both" ? port + 1 : port,
      host,
      path: "/ws",
    });
  }

  return transports;
}

/**
 * Start CLI in server mode. The promise ends when the lifecycle of the server ends. `run` gives
 * the options of `run()`, for a test: a process port and a clock.
 */
export async function startServerMode(options: ServerModeOptions, run?: ProcedureHostRunConfig["run"]): Promise<void> {
  const { port = 3000, verbose = false } = options;

  print.info("Starting CLI server mode...");

  // The registry of mark (roadmap 3.1): the module of each workspace package, with the server
  // procedures (client-server is in the workspace)
  if (verbose) {
    print.info("Loading ecosystem procedures...");
  }
  const { registry, fsRoot, refusedUnderRoot } = await loadEcosystemRegistry(verbose, true, { fsRoot: options.fsRoot });

  // Build transport config
  const transports = buildTransports(options);

  // Every request must send this token. Only the lockfile (readable by this user) holds it.
  const token = randomBytes(32).toString("hex");
  const host = options.host ?? "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    print.warning(`The server listens on ${host}: other computers can reach it. Every request needs its token.`);
  }
  if (options.transport === "websocket") {
    print.warning("A WebSocket-only server takes no `mark` commands: `mark` sends its commands over HTTP.");
  }

  // The host policy of the core (roadmap 2.3): the token of each transport. The server of mark
  // serves every procedure of the workspace to its one user, so it has no expose list. It always
  // serves events.subscribe (EVENTS.md): the topic rule is the --events patterns, else empty.
  // The bus is the global bus, which is also the ctx.bus of the procedures.
  const events = [...(options.events ?? [])];
  // The options of the host: the same registry and policy as the cold mode of mark (CLI-26)
  const { markHostOptions } = await import("./command.js");
  const { runProcedureHost } = await import("@procedures/server");
  const id = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // The lockfile for client discovery. A client uses this server only from the same folder,
  // with the same build of mark, and when host.info answers its token with this peer id.
  const shown = host === "0.0.0.0" ? "localhost" : host;
  const endpoint = options.transport === "websocket" ? `ws://${shown}:${port}/ws` : `http://${shown}:${port}/api`;
  const running = await runProcedureHost({
    name: "mark-server",
    mode: "background",
    host: await markHostOptions({ id, registry, transports, token, events }),
    lockfile: {
      pid: process.pid,
      port,
      transport: options.transport ?? "http",
      endpoint,
      startedAt: new Date().toISOString(),
      token,
      cwd: process.cwd(),
      build: currentBuild(),
      peerId: id,
      // A client uses this server only with the same --fs-root (or none)
      ...(fsRoot !== undefined ? { fsRoot } : {}),
    },
    log: (line) => print.info(line),
    // --probe-port: the probes answer on a port of their own, else on each listener under /_probes (CLI-9, D5)
    ...(options.probePort !== undefined ? { probes: { port: options.probePort, host } } : {}),
    ...(run ? { run } : {}),
  });
  if (running.life.state !== "running") {
    // The startup failed: the lifecycle stops the parts that started, and the process exits with 1
    print.error("The server did not start:");
    for (const error of running.life.errors) print.error(`  ${error}`);
    await running.life.done;
    return;
  }

  print.success("\nCLI Server running!");
  print.info(`  PID: ${process.pid}`);
  print.info(`  Server ID: ${running.host.id}`);
  print.info(`  Procedures: ${running.host.server.procedureCount}`);
  print.info(`  Lockfile: ${getLockfilePath()}`);
  print.info("\nEndpoints:");
  for (const each of running.host.info.endpoints()) {
    print.info(`  [${each.type}] ${each.address}`);
  }
  for (const base of running.probes()) {
    print.info(`  [probes] ${base}/startup, ${base}/readiness, ${base}/liveness (no token)`);
  }
  print.info(events.length > 0 ? `\nEvent topics (events.subscribe): ${events.join(", ")}` : "\nEvent topics: none (--events adds them)");
  if (fsRoot !== undefined) {
    print.info(`File root: ${fsRoot} (each procedure refuses a path outside it)`);
    print.info(`  Refused under the root: ${refusedUnderRoot?.length ?? 0} procedures that the root cannot confine`);
  }
  print.info("\nPress Ctrl+C to stop.");

  // A signal starts the stop in stages, and the runner ends the process (CLI-8)
  await running.life.done;
}

/**
 * The port number of a `--port` value. An invalid port is an error (before, it became 3000:
 * deep dive CLI-16).
 */
export function parsePort(value: string): number {
  const port = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: "${value}". Give a number from 1 to 65535.`);
  }
  return port;
}

/** The transports `--transport` accepts */
export const SERVER_TRANSPORTS = ["http", "websocket", "both"] as const;

/**
 * The transport of a `--transport` value
 */
export function parseTransport(value: string): "http" | "websocket" | "both" {
  const transport = SERVER_TRANSPORTS.find((name) => name === value);
  if (!transport) {
    throw new Error(`Invalid transport: "${value}". Give one of: ${SERVER_TRANSPORTS.join(", ")}.`);
  }
  return transport;
}

/**
 * Extract port from argv
 */
export function extractPort(argv: string[]): number | null {
  // --port 4000 and --port=4000 (before, the second form was ignored: deep dive CLI-1)
  const inline = argv.find((arg) => arg.startsWith("--port="));
  const portIdx = argv.indexOf("--port");
  if (inline === undefined && portIdx === -1) return null;
  const portValue = inline !== undefined ? inline.slice("--port=".length) : argv[portIdx + 1];
  if (portValue === undefined) {
    throw new Error("--port needs a value");
  }
  return parsePort(portValue);
}

/**
 * Extract host from argv
 */
export function extractHost(argv: string[]): string | null {
  const inline = argv.find((arg) => arg.startsWith("--host="));
  if (inline !== undefined) return inline.slice("--host=".length);
  const hostIdx = argv.indexOf("--host");
  if (hostIdx !== -1) {
    const hostValue = argv[hostIdx + 1];
    if (hostValue !== undefined) {
      return hostValue;
    }
  }
  return null;
}
