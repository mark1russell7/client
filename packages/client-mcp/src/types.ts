/**
 * MCP Transport Types
 *
 * Configuration options for the MCP server transport.
 */

import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ProcedureRegistry } from "@procedures/client";
import type { McpServerInfo, McpToolFilter } from "@procedures/mcp";
import type { Duration } from "@procedures/client";

/**
 * SSE transport configuration options.
 */
export interface SseTransportOptions {
  /** Port to listen on (default: 3002) */
  port?: number;
  /** Host to bind to (default: "0.0.0.0") */
  host?: string;
  /** Path for SSE endpoint (default: "/mcp/sse") */
  path?: string;
  /** Enable CORS (default: true) */
  cors?: boolean;
}

/**
 * MCP Server Transport configuration options.
 */
export interface McpServerTransportOptions {
  /** Transport type: stdio or sse (default: "stdio") */
  transport?: "stdio" | "sse";

  /** Procedure registry to use (defaults to PROCEDURE_REGISTRY) */
  registry?: ProcedureRegistry;

  /** Server info for MCP protocol */
  serverInfo?: McpServerInfo;

  /** Tool filtering options */
  toolFilter?: McpToolFilter;

  /** SSE-specific options (when transport is "sse") */
  sseOptions?: SseTransportOptions;

  /**
   * An MCP SDK transport to connect, in place of `transport`. Use it to embed the server in
   * another process, or in a test (the SDK's `InMemoryTransport`).
   */
  sdkTransport?: SdkTransport;

  /** Enable debug logging */
  debug?: boolean;

  /**
   * The limits of a stream that can run without an end (`stream: { unbounded: true }` of its
   * procedure): the tool stops it at the first one and gives the items that it has (roadmap R15).
   * @default { items: 100, time: seconds(30) }
   */
  streamLimits?: { items?: number; time?: Duration } | undefined;
}

/**
 * MCP Server Transport state.
 */
export interface McpServerTransportState {
  /** Whether the transport is running */
  running: boolean;
  /** Number of registered tools */
  toolCount: number;
  /** Transport type in use */
  transport: "stdio" | "sse";
}
