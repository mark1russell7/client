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

/** The number of characters of a topic name (`MAX_TOPIC_LENGTH` of the core). */
const MAX_TOPIC_LENGTH = 256;

/**
 * This function gives the topic patterns of an `--events` value: comma-separated exact names
 * (`orders.created`), prefixes (`orders.*`) or `*` (`documentation/EVENTS.md`). A `*` is
 * permitted only at the end of a pattern. The patterns are the topic rule of `topicMatcher()`.
 */
export function parseTopicPatterns(value: string): string[] {
  const patterns = value
    .split(",")
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
  if (patterns.length === 0) throw new Error("--events needs a topic pattern: an exact name, a prefix such as orders.*, or *");
  for (const pattern of patterns) {
    if (pattern.length > MAX_TOPIC_LENGTH) throw new Error(`The topic pattern "${pattern.slice(0, 40)}..." has more than ${MAX_TOPIC_LENGTH} characters`);
    if (pattern.slice(0, -1).includes("*")) {
      throw new Error(`Invalid topic pattern: "${pattern}". A * is permitted only at the end (orders.* or *).`);
    }
  }
  return patterns;
}

/**
 * Parse command line arguments into server configuration.
 *
 * Usage:
 *   procedure-server --procedures @procedures/mongo/register --port 3000
 *   procedure-server --procedures pkg1,pkg2 --transport http,websocket
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
  let serverToken: string | null | undefined;
  const expose: string[] = [];
  const events: string[] = [];
  let fsRoot: string | undefined;
  let probePort: number | undefined;

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
      case "--probe-port":
        probePort = parsePort(value());
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
      case "--token":
        serverToken = value();
        break;
      case "--no-token":
        serverToken = null;
        break;
      case "--expose":
      case "-e":
        expose.push(...value().split(",").map((p) => p.trim()).filter((p) => p.length > 0));
        break;
      case "--events":
        // Repeatable: each value adds its patterns to the topic rule
        for (const pattern of parseTopicPatterns(value())) {
          if (!events.includes(pattern)) events.push(pattern);
        }
        break;
      case "--fs-root":
        fsRoot = value();
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
        throw new Error(`Unknown option: ${token}. Run 'procedure-server --help' for the options.`);
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

  return {
    procedures,
    transports,
    verbose,
    token: serverToken,
    expose,
    events,
    ...(fsRoot !== undefined ? { fsRoot } : {}),
    ...(probePort !== undefined ? { probePort } : {}),
  };
}

function printHelp(): void {
  console.log(`
procedure-server - General procedure server

USAGE:
  procedure-server [OPTIONS]

OPTIONS:
  --procedures, -p <pkgs>   Comma-separated procedure packages to load
                            Example: @procedures/mongo/register

  --transport, -t <types>   Comma-separated transports: http, websocket, local
                            Default: http

  --port <number>           Port for the first transport
                            Default: 3000 (HTTP), 3001 (WebSocket)

  --host <address>          Host to bind to
                            Default: 127.0.0.1 (0.0.0.0 exposes every
                            procedure to the network)

  --base-path <path>        Base path for HTTP transport
                            Default: /api

  --probe-port <number>     Answer the health probes on this port, on the
                            address of --host: /startup, /readiness,
                            /liveness and /report. Default: each listener
                            answers /_probes/startup, /_probes/readiness and
                            /_probes/liveness

  --cors                    Enable CORS
  --no-cors                 Disable CORS (default)

  --token <secret>          The token that every request must send
                            (Authorization: Bearer <token>, or ?token= for
                            WebSocket). Default: SERVER_TOKEN, or a random
                            token that the server prints at start
  --no-token                Serve without a token (only for a trusted host)

  --expose, -e <patterns>   Comma-separated procedures to serve: exact keys
                            (git.status) or prefixes (git.*)
                            Default: every loaded procedure

  --events <patterns>       The topics of the event bus that a peer can
                            subscribe to with events.subscribe: exact names
                            (orders.created), prefixes (orders.*) or *.
                            Repeatable, or comma-separated.
                            Default: no topics (TOPIC_NOT_FOUND)

  --fs-root <folder>        Keep each path of each procedure in this folder,
                            also in the nested calls. A path outside gives
                            FORBIDDEN (outside-root). A procedure that the
                            folder cannot confine (git.*, pnpm.*, docker.run,
                            a program) gives the same error. Default: no root

  --verbose, -v             Verbose output

  --help, -h                Show this help

EXAMPLES:
  # Start MongoDB procedure server
  procedure-server --procedures @procedures/mongo/register --port 3000

  # Start with multiple procedure packages
  procedure-server -p @procedures/fs/register,@procedures/git/register

  # Start with both HTTP and WebSocket
  procedure-server -p @procedures/mongo/register -t http,websocket

  # Serve the topics orders.* to subscribers over WebSocket
  procedure-server -p ./my-procedures.js -t websocket --events "orders.*"

  # Confine the procedures to one folder
  procedure-server -p @procedures/fs,@procedures/sqlite --fs-root ./data
`);
}
