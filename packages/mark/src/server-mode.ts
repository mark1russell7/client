/**
 * CLI Server Mode
 *
 * Runs the CLI as a persistent server, exposing all ecosystem procedures
 * via HTTP. The server has the registry of mark (the module of each package, roadmap 3.1) and
 * the host policy of the core (roadmap 2.3): the token in the lockfile.
 */

import { print } from "./print.js";
import { loadEcosystemRegistry } from "./ecosystem.js";
import { randomBytes } from "node:crypto";
import { writeLockfile, removeLockfileForPort, getLockfilePath, currentBuild } from "./lockfile.js";

export interface ServerModeOptions {
  port: number;
  host?: string;
  transport?: "http" | "websocket" | "both";
  verbose?: boolean;
}

interface ServerCreateResult {
  serverId: string;
  endpoints: Array<{ type: string; address: string }>;
  procedureCount: number;
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
 * Start CLI in server mode
 */
export async function startServerMode(options: ServerModeOptions): Promise<void> {
  const { port = 3000, verbose = false } = options;

  print.info("Starting CLI server mode...");

  // The registry of mark (roadmap 3.1): the module of each workspace package, with the server
  // procedures (client-server is in the workspace)
  if (verbose) {
    print.info("Loading ecosystem procedures...");
  }
  const { registry } = await loadEcosystemRegistry(verbose);

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
  // serves every procedure of the workspace to its one user, so it has no expose list.
  const { hostPolicy } = await import("@mark1russell7/client");
  const { createPeer } = await import("@mark1russell7/client-server");
  const peer = await createPeer({
    id: `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    transports,
    registry,
    policy: hostPolicy({ token }),
  });
  await peer.start();
  const result: ServerCreateResult = {
    serverId: peer.id,
    endpoints: peer.getEndpoints(),
    procedureCount: peer.getServer().procedureCount,
  };

  // Write lockfile for client discovery. A client uses this server only from the same folder,
  // with the same build of mark, and when the health endpoint answers with this peer id.
  await writeLockfile({
    pid: process.pid,
    port,
    transport: options.transport ?? "http",
    endpoint: result.endpoints[0]?.address ?? `http://127.0.0.1:${port}/api`,
    startedAt: new Date().toISOString(),
    token,
    cwd: process.cwd(),
    build: currentBuild(),
    peerId: result.serverId,
  });

  print.success("\nCLI Server running!");
  print.info(`  PID: ${process.pid}`);
  print.info(`  Server ID: ${result.serverId}`);
  print.info(`  Procedures: ${result.procedureCount}`);
  print.info(`  Lockfile: ${getLockfilePath()}`);
  print.info("\nEndpoints:");
  for (const endpoint of result.endpoints) {
    print.info(`  [${endpoint.type}] ${endpoint.address}`);
  }
  print.info("\nPress Ctrl+C to stop.");

  // Handle shutdown
  const cleanup = async () => {
    print.info("\nStopping server...");
    removeLockfileForPort(port);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep the process alive
  await new Promise(() => {
    // Never resolves - keeps process running
  });
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
