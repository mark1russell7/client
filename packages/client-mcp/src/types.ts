/**
 * MCP Transport Types
 *
 * Configuration options for the MCP server transport.
 */

import type { Readable, Writable } from "node:stream";
import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ElicitationPolicy, ProcedureRegistry } from "@procedures/client";
import type { McpServerInfo, McpTool, McpToolFilter } from "@procedures/mcp";
import type { Duration } from "@procedures/client";
import type { UntrustedContentOptions } from "./untrusted.js";

/** The streams of the stdio transport, and what happens when its input ends. */
export interface StdioTransportOptions {
  /** The input of the protocol. The default is `process.stdin`. */
  stdin?: Readable | undefined;
  /** The output of the protocol. The default is `process.stdout`. */
  stdout?: Writable | undefined;
  /**
   * This function runs when the input ends: the client closed it. A host stops here
   * (`createMcpHost` stops its server). Without it, the transport only stops to read.
   */
  onEnd?: (() => void) | undefined;
}

/** A text block of a tool result. */
export interface McpTextBlock {
  type: "text";
  text: string;
}

/** The content of a tool result: the text blocks and the structured content. */
export interface McpToolContent {
  content: McpTextBlock[];
  structuredContent?: Record<string, unknown> | undefined;
}

/** What the content hook of a host gets: the tool, the value and the content of the default. */
export interface McpToolContentInput extends McpToolContent {
  readonly tool: McpTool;
  readonly value: unknown;
}

/**
 * The content hook of a host: it gives the content of a successful tool result that is a value,
 * or undefined for the default content.
 */
export type McpToolContentHook = (result: McpToolContentInput) => McpToolContent | undefined;

/**
 * SSE transport configuration options.
 */
/** The options of the Streamable HTTP transport (roadmap R26). */
export interface HttpTransportOptions {
  /** Port to listen on (default: 3003) */
  port?: number | undefined;
  /** Host to bind to (default: "127.0.0.1": only this computer can reach the tools) */
  host?: string | undefined;
  /** The path of the MCP endpoint (default: "/mcp") */
  path?: string | undefined;
  /** A secret that each request must send as `Authorization: Bearer <token>` */
  token?: string | undefined;
  /** Browser origins that can call the server, besides loopback origins */
  allowedOrigins?: string[] | undefined;
  /** An HTTP server to answer on, in place of a server of the transport (it does not listen then) */
  server?: import("node:http").Server | undefined;
  /**
   * How the procedure server reads cookies (`ambientCredentials` of `ProcedureServer`). The
   * transport sets it from its server. With a value, a request with a cookie needs a named origin.
   */
  ambientCredentials?: import("@procedures/client").AmbientCredentials | undefined;
}

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
  /**
   * Transport type (default: "stdio"). "http" is Streamable HTTP, the HTTP transport of the
   * current MCP specification (roadmap R26). "sse" is not implemented.
   */
  transport?: "stdio" | "sse" | "http";

  /** The options of the Streamable HTTP transport. */
  httpOptions?: HttpTransportOptions | undefined;

  /** Procedure registry to use (defaults to PROCEDURE_REGISTRY) */
  registry?: ProcedureRegistry;

  /** Server info for MCP protocol */
  serverInfo?: McpServerInfo;

  /** The instructions of the server: the MCP client gives them to the model (`initialize`). */
  instructions?: string | undefined;

  /** The streams of the stdio transport, and the function for the end of its input. */
  stdio?: StdioTransportOptions | undefined;

  /**
   * The rules of the questions to the person at the caller (MCP elicitation, CLI-12): `ask` and
   * the consents of the operator. The default asks the person when the client can, and the
   * operator gives no consent.
   */
  elicitation?: ElicitationPolicy | undefined;

  /**
   * The envelopes of the output fields with text from outside the host (`metadata.untrusted`).
   * The default tag is `untrusted-content`.
   */
  untrusted?: UntrustedContentOptions | undefined;

  /** The content hook: it can give other text blocks for a successful result that is a value. */
  content?: McpToolContentHook | undefined;

  /**
   * The JSON of the default text blocks: `"pretty"` (the default) with an indent of 2 spaces, or
   * `"compact"` on one line. A compact block uses fewer tokens of the model.
   */
  json?: "pretty" | "compact" | undefined;

  /** Tool filtering options */
  toolFilter?: McpToolFilter;

  /**
   * The name of the tool of a procedure. The default joins the segments of the path with dots
   * (`git.status`). A server that moves to this transport keeps its tool names with it, for
   * example `(path) => path.join("_")`. A tool call finds its procedure by the name, not by the
   * decoded name.
   */
  toolName?: ((path: readonly string[]) => string) | undefined;

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
  transport: "stdio" | "sse" | "http";
  /** The URL of the Streamable HTTP endpoint, when the transport is "http" */
  url?: string;
}
