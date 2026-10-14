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

  return {
    bundles,
    serverName: process.env["MCP_SERVER_NAME"] ?? "impl-mcp-dev",
    serverVersion: process.env["MCP_SERVER_VERSION"] ?? "1.0.0",
    debug: process.env["MCP_DEBUG"] === "true",
    toolTimeoutMs: parseTimeout(process.env["MCP_TOOL_TIMEOUT_MS"]),
    readOnly: process.env["MCP_READ_ONLY"] === "true" || process.env["MCP_READ_ONLY"] === "1",
  };
}
