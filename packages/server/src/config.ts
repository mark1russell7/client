/**
 * Configuration Parser
 *
 * Parses command line arguments for the server.
 */

import type { ServerConfig, TransportConfig } from "./types.js";

const TRANSPORT_TYPES = ["http", "websocket", "local"] as const;

/**
 * The port number of a `--port` value. An invalid port is an error: before, it was ignored and
 * the server used port 3000 (deep dive CLI-16).
 */
function parsePort(value: string): number {
  const port = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: "${value}". Give a number from 1 to 65535.`);
  }
  return port;
}

/**
 * Parse command line arguments into server configuration.
 *
 * Usage:
 *   server --procedures @mark1russell7/client-mongo/register --port 3000
 *   server --procedures pkg1,pkg2 --transport http,websocket
 *
 * An unknown option, an option with no value, an invalid port and an unknown transport are
 * errors. The order of the options does not matter: `--cors` before `--transport` also applies.
 */
export function parseConfig(argv: string[]): ServerConfig {
  const procedures: string[] = [];
  const types: TransportConfig["type"][] = [];
  let port: number | undefined;
  let host: string | undefined;
  let basePath: string | undefined;
  let cors: boolean | undefined;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    const eq = token.startsWith("--") ? token.indexOf("=") : -1;
    const arg = eq === -1 ? token : token.slice(0, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error(`${arg} needs a value`);
      }
      i++;
      return next;
    };

    switch (arg) {
      case "--procedures":
      case "-p":
        procedures.push(...value().split(",").map((p) => p.trim()).filter((p) => p.length > 0));
        break;
      case "--port":
        port = parsePort(value());
        break;
      case "--host":
        host = value();
        break;
      case "--transport":
      case "-t":
        for (const type of value().split(",").map((t) => t.trim())) {
          const known = TRANSPORT_TYPES.find((name) => name === type);
          if (!known) {
            throw new Error(`Unknown transport: "${type}". Give ${TRANSPORT_TYPES.join(", ")}.`);
          }
          if (!types.includes(known)) {
            types.push(known);
          }
        }
        break;
      case "--cors":
        cors = true;
        break;
      case "--no-cors":
        cors = false;
        break;
      case "--base-path":
        basePath = value();
        break;
      case "--verbose":
      case "-v":
        verbose = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        return process.exit(0);
      default:
        throw new Error(`Unknown option: ${token}. Run 'server --help' for the options.`);
    }
  }

  // Default to HTTP transport if none specified. Loopback and no CORS by default: the server
  // serves every procedure it loads. Before, it listened on 0.0.0.0 with
  // Access-Control-Allow-Origin: * (deep dive CLI-1, DATA-20).
  if (types.length === 0) {
    types.push("http");
  }

  // --port is the port of the first transport. --host applies to each network transport.
  const transports = types.map((type, index): TransportConfig => {
    const first = index === 0;
    if (type === "http") {
      return {
        type,
        port: (first ? port : undefined) ?? 3000,
        host: host ?? "127.0.0.1",
        basePath: basePath ?? "/api",
        ...(cors !== undefined ? { cors } : {}),
      };
    }
    if (type === "websocket") {
      return { type, port: (first ? port : undefined) ?? 3001, host: host ?? "127.0.0.1", path: "/ws" };
    }
    return { type };
  });

  return { procedures, transports, verbose };
}

function printHelp(): void {
  console.log(`
server - General procedure server

USAGE:
  server [OPTIONS]

OPTIONS:
  --procedures, -p <pkgs>   Comma-separated procedure packages to load
                            Example: @mark1russell7/client-mongo/register

  --transport, -t <types>   Comma-separated transports: http, websocket, local
                            Default: http

  --port <number>           Port for the first transport
                            Default: 3000 (HTTP), 3001 (WebSocket)

  --host <address>          Host to bind to
                            Default: 127.0.0.1 (0.0.0.0 exposes every
                            procedure to the network)

  --base-path <path>        Base path for HTTP transport
                            Default: /api

  --cors                    Enable CORS
  --no-cors                 Disable CORS (default)

  --verbose, -v             Verbose output

  --help, -h                Show this help

EXAMPLES:
  # Start MongoDB procedure server
  server --procedures @mark1russell7/client-mongo/register --port 3000

  # Start with multiple procedure packages
  server -p @mark1russell7/client-fs/register,@mark1russell7/client-git/register

  # Start with both HTTP and WebSocket
  server -p @mark1russell7/client-mongo/register -t http,websocket
`);
}
