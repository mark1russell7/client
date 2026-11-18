/**
 * Configuration Loading
 *
 * Loads MCP server configuration from environment variables and CLI arguments.
 */

export interface McpServerConfig {
  /** Bundles to load (each must export /register.js) */
  bundles: string[];
  /** Server name for MCP protocol */
  serverName: string;
  /** Server version for MCP protocol */
  serverVersion: string;
  /** Enable debug logging */
  debug: boolean;
  /** The time limit of each tool call, in milliseconds. 0: no limit. */
  toolTimeoutMs: number;
  /**
   * True: the tools are only the procedures that change nothing (`effects.writes` is empty), and
   * each call operates with that capability (CAPABILITIES-2026-10).
   */
  readOnly?: boolean;
  /**
   * The Streamable HTTP endpoint of the server (roadmap R26), in place of stdio. The server
   * listens on loopback by default. A token makes each request send `Authorization: Bearer`.
   * `maxSessions` is the most sessions at one time: 256 by default (CLI-51), `Infinity` for no limit.
   */
  http?: { port: number; host?: string | undefined; token?: string | undefined; maxSessions?: number | undefined } | undefined;
  /**
   * False: the host does not check a program before it runs it (roadmap R22). The default is
   * true: a program with an error does not start, so no step of it writes.
   */
  programCheck?: boolean | undefined;
  /**
   * The root of the files of the host (roadmap R33). Each procedure keeps its paths in it, also
   * in the nested calls (`lib.scan`, `cue.add`), or the root refuses it. A path outside, and a
   * refused tool, give `FORBIDDEN` with the reason `outside-root`. No value: no root.
   */
  fsRoot?: string | undefined;
  /**
   * How the server lists its tools (direction 40). `"each"` (the default) lists each tool.
   * `"search"` lists three tools: `search_tools`, `describe_tool` and `call_tool`.
   */
  listing?: "each" | "search" | undefined;
  /**
   * The running peers (d40-tool-surface, step 2). The host reads the manifest of each peer, and each
   * tool of a peer sends its call to the peer. A peer that does not answer at the start gives no tools.
   */
  peers?: readonly PeerConfig[] | undefined;
}

/** One entry of `MCP_PEERS`: the name of the peer, and its URL or its discovery file. */
export interface PeerConfig {
  /** The name of the peer: a lowercase letter, then lowercase letters, digits and hyphens. */
  readonly name: string;
  /** The base URL of the procedures of the peer, or the path or `file:` URL of its discovery file. */
  readonly source: string;
}


/**
 * Load configuration from environment variables.
 *
 * Environment variables:
 * - MCP_BUNDLES: Comma-separated list of bundles and module files (default: "@procedures/bundle-mcp")
 * - MCP_SERVER_NAME: Server name (default: "impl-mcp-dev")
 * - MCP_SERVER_VERSION: Server version (default: "1.0.0")
 * - MCP_DEBUG: Enable debug logging (default: "false")
 * - MCP_TOOL_TIMEOUT_MS: The time limit of each tool call (default: 600000, 10 minutes; 0: no limit)
 * - MCP_READ_ONLY: "true" or "1" gives only the tools that change nothing (default: false)
 * - MCP_HTTP_PORT, MCP_HTTP_HOST, MCP_HTTP_TOKEN: serve over Streamable HTTP, not stdio
 * - MCP_HTTP_MAX_SESSIONS: the most sessions of the HTTP face (default: 256; "Infinity": no limit)
 * - MCP_PROGRAM_CHECK: "false" or "0" starts a program without the check before the run
 * - MCP_FS_ROOT: the root of the files: each tool keeps its paths in it, or it is refused (default: no root)
 * - MCP_LISTING: "search" lists the three search tools in place of each tool (default: "each")
 * - MCP_PEERS: the running peers, as `name=source` entries with commas (default: no peer)
 */
/** The default time limit of a tool call: a build or a test run can take minutes. */
export const DEFAULT_TOOL_TIMEOUT_MS = 600_000;

/**
 * The listing from its environment variable. A value that is not a listing is an error: without
 * this check, a mistake gives each tool to the context of the model.
 */
export function parseListing(value: string | undefined): "each" | "search" | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const listing = value.trim();
  if (listing !== "each" && listing !== "search") throw new Error(`MCP_LISTING is "each" or "search", not "${listing}"`);
  return listing;
}

/** The time limit from its environment variable. A value that is not a number gives the default. */
export function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_TOOL_TIMEOUT_MS;
  const ms = Number(value);
  return Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_TOOL_TIMEOUT_MS;
}

/**
 * The session limit of the HTTP face from its environment variable, or undefined for the default
 * of the face (256). The face refuses a value that is not a limit when it starts: a wrong value
 * stops the start, so it cannot remove the limit by mistake.
 */
export function parseMaxSessions(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return Number(value.trim());
}

/**
 * The token of the HTTP face. A variable that is set and empty is an error: without this check the
 * server starts with no token, so a mistake in the environment opens it.
 */
export function parseHttpToken(value: string | undefined): string | undefined {
  if (value === "") throw new Error("MCP_HTTP_TOKEN is set and empty: give it a token, or unset it");
  return value;
}

const PEER_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * This function reads `MCP_PEERS`. The value has entries `name=source`, with commas between them. A
 * source is an `http://` or `https://` URL, or a discovery file. An entry that is not of this form is
 * an error. Without this check, a mistake removes the tools of a peer with no message.
 */
export function parsePeers(value: string | undefined): PeerConfig[] {
  const peers: PeerConfig[] = [];
  if (value === undefined) return peers;
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const eq = entry.indexOf("=");
    const name = eq === -1 ? "" : entry.slice(0, eq).trim();
    const source = eq === -1 ? "" : entry.slice(eq + 1).trim();
    if (!PEER_NAME.test(name) || source === "") {
      throw new Error(`MCP_PEERS: the entry "${entry}" is not name=source, with a lowercase name and a URL or a discovery file`);
    }
    if (peers.some((peer) => peer.name === name)) throw new Error(`MCP_PEERS: two entries have the name ${name}`);
    peers.push({ name, source });
  }
  return peers;
}

export function loadConfig(): McpServerConfig {
  const bundlesEnv = process.env["MCP_BUNDLES"] ?? "@procedures/bundle-mcp";
  const bundles = bundlesEnv.split(",").map((b) => b.trim()).filter(Boolean);
  const fsRoot = process.env["MCP_FS_ROOT"]?.trim();
  const listing = parseListing(process.env["MCP_LISTING"]);
  const peers = parsePeers(process.env["MCP_PEERS"]);
  const maxSessions = parseMaxSessions(process.env["MCP_HTTP_MAX_SESSIONS"]);
  const httpToken = process.env["MCP_HTTP_PORT"] ? parseHttpToken(process.env["MCP_HTTP_TOKEN"]) : undefined;

  return {
    bundles,
    serverName: process.env["MCP_SERVER_NAME"] ?? "impl-mcp-dev",
    serverVersion: process.env["MCP_SERVER_VERSION"] ?? "1.0.0",
    debug: process.env["MCP_DEBUG"] === "true",
    toolTimeoutMs: parseTimeout(process.env["MCP_TOOL_TIMEOUT_MS"]),
    readOnly: process.env["MCP_READ_ONLY"] === "true" || process.env["MCP_READ_ONLY"] === "1",
    programCheck: !(process.env["MCP_PROGRAM_CHECK"] === "false" || process.env["MCP_PROGRAM_CHECK"] === "0"),
    ...(fsRoot ? { fsRoot } : {}),
    ...(listing ? { listing } : {}),
    ...(peers.length > 0 ? { peers } : {}),
    ...(process.env["MCP_HTTP_PORT"]
      ? {
          http: {
            port: Number(process.env["MCP_HTTP_PORT"]),
            ...(process.env["MCP_HTTP_HOST"] ? { host: process.env["MCP_HTTP_HOST"] } : {}),
            ...(httpToken !== undefined ? { token: httpToken } : {}),
            ...(maxSessions !== undefined ? { maxSessions } : {}),
          },
        }
      : {}),
  };
}
