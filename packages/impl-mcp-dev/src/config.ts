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
   */
  http?: { port: number; host?: string | undefined; token?: string | undefined } | undefined;
  /**
   * False: the host does not check a program before it runs it (roadmap R22). The default is
   * true: a program with an error does not start, so no step of it writes.
   */
  programCheck?: boolean | undefined;
  /**
   * The folder that confines each path of the `fs.*` procedures of the host (roadmap R33). The
   * nested `fs.*` calls of the tools (`lib.scan`, `cue.add`) are confined too. A path outside
   * gives `FORBIDDEN` with the reason `outside-root`. No value: no root.
   */
  fsRoot?: string | undefined;
}

/**
 * Load configuration from environment variables.
 *
 * Environment variables:
 * - MCP_BUNDLES: Comma-separated list of bundles (default: "@procedures/bundle-mcp")
 * - MCP_SERVER_NAME: Server name (default: "impl-mcp-dev")
 * - MCP_SERVER_VERSION: Server version (default: "1.0.0")
 * - MCP_DEBUG: Enable debug logging (default: "false")
 * - MCP_TOOL_TIMEOUT_MS: The time limit of each tool call (default: 600000, 10 minutes; 0: no limit)
 * - MCP_READ_ONLY: "true" or "1" gives only the tools that change nothing (default: false)
 * - MCP_HTTP_PORT, MCP_HTTP_HOST, MCP_HTTP_TOKEN: serve over Streamable HTTP, not stdio
 * - MCP_PROGRAM_CHECK: "false" or "0" starts a program without the check before the run
 * - MCP_FS_ROOT: the folder that confines each path of the fs.* procedures (default: no root)
 */
/** The default time limit of a tool call: a build or a test run can take minutes. */
export const DEFAULT_TOOL_TIMEOUT_MS = 600_000;

/** The time limit from its environment variable. A value that is not a number gives the default. */
export function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_TOOL_TIMEOUT_MS;
  const ms = Number(value);
  return Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_TOOL_TIMEOUT_MS;
}

export function loadConfig(): McpServerConfig {
  const bundlesEnv = process.env["MCP_BUNDLES"] ?? "@procedures/bundle-mcp";
  const bundles = bundlesEnv.split(",").map((b) => b.trim()).filter(Boolean);
  const fsRoot = process.env["MCP_FS_ROOT"]?.trim();

  return {
    bundles,
    serverName: process.env["MCP_SERVER_NAME"] ?? "impl-mcp-dev",
    serverVersion: process.env["MCP_SERVER_VERSION"] ?? "1.0.0",
    debug: process.env["MCP_DEBUG"] === "true",
    toolTimeoutMs: parseTimeout(process.env["MCP_TOOL_TIMEOUT_MS"]),
    readOnly: process.env["MCP_READ_ONLY"] === "true" || process.env["MCP_READ_ONLY"] === "1",
    programCheck: !(process.env["MCP_PROGRAM_CHECK"] === "false" || process.env["MCP_PROGRAM_CHECK"] === "0"),
    ...(fsRoot ? { fsRoot } : {}),
    ...(process.env["MCP_HTTP_PORT"]
      ? {
          http: {
            port: Number(process.env["MCP_HTTP_PORT"]),
            ...(process.env["MCP_HTTP_HOST"] ? { host: process.env["MCP_HTTP_HOST"] } : {}),
            ...(process.env["MCP_HTTP_TOKEN"] ? { token: process.env["MCP_HTTP_TOKEN"] } : {}),
          },
        }
      : {}),
  };
}
