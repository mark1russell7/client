/**
 * MCP Transport Types
 *
 * Configuration options for the MCP server transport.
 */

import type { Readable, Writable } from "node:stream";
import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { BrowserGuardOptions, ElicitationPolicy, ProcedureRegistry } from "@procedures/client";
import type { McpServerInfo, McpTool, McpToolFilter } from "@procedures/mcp";
import type { Duration, Logger } from "@procedures/client";
import type { UntrustedContentOptions } from "./untrusted.js";
import type { McpTasksOptions } from "./tasks.js";

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
/**
 * The options of the Streamable HTTP transport (roadmap R26). The endpoint has no listener of its
 * own (CLI-11): the owner of a listener mounts its request handler (`McpServerTransport.handleHttp`
 * or `McpHost.handleHttp`), for example a listener of the service or the procedures host.
 */
export interface HttpTransportOptions {
  /** The path of the MCP endpoint (default: "/mcp") */
  path?: string | undefined;
  /**
   * A secret that each request must send as `Authorization: Bearer <token>`. The endpoint has no
   * token check of its own (CLI-2b): the server of the face checks the token in its admission of
   * each request. `createMcpHost` gives this token to its policy, as `policy.token`. Elsewhere the
   * option throws an error, because a token without its check opens the endpoint.
   * @deprecated Give the token to the server: `policy.token` of `createMcpHost`, or `hostPolicy({ token })`.
   */
  token?: string | undefined;
  /**
   * The browser origins that can call the server, besides its own origin: a list, `"*"` or a
   * function, as `browser.allowedOrigins` of the host policy. `"*"` does not permit a request with
   * cookies (CSRF).
   */
  allowedOrigins?: BrowserGuardOptions["allowedOrigins"];
  /**
   * The host names that a request on a loopback address can name in its `Host` header, besides
   * the loopback names (`browser.allowedHosts` of the host policy). `"*"` turns the check off.
   */
  allowedHosts?: readonly string[] | "*" | undefined;
  /**
   * This option has no effect: the endpoint is always mounted (CLI-11). Code that followed the
   * migration of 0.14.x gives `mount: true`, so the option stays one more release.
   * @deprecated Remove it. A later MINOR removes the option.
   */
  mount?: boolean | undefined;
  /**
   * How the procedure server reads cookies (`ambientCredentials` of `ProcedureServer`). The
   * transport sets it from its server. With a value, a request with a cookie needs a named origin.
   */
  ambientCredentials?: import("@procedures/client").AmbientCredentials | undefined;
  /**
   * The most sessions at one time (CLI-35). A new session above the limit closes the session that
   * was idle longest: no task in progress and no open response. When each session is busy, the
   * new session gets 503 with `Retry-After`. `Infinity` turns the limit off.
   * @default 256 (CLI-51, `MCP_HTTP_LIMITS.maxSessions`)
   */
  maxSessions?: number | undefined;
  /**
   * The largest body of a request, in bytes (CLI-35).
   * @default 4194304 (4 MiB, the limit of the SDK)
   */
  maxBodyBytes?: number | undefined;
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

  /**
   * The options of the Streamable HTTP transport.
   *
   * Deprecated (CLI-2b): `httpOptions.token`. Give the token to the server of the transport,
   * `new ProcedureServer({ token })`: the server checks it for each request. From the next MINOR,
   * `start()` throws an error for a token in `httpOptions`.
   */
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
   *
   * This face is local (CLI-1): a call without an HTTP request gets `LOCAL_CREDENTIALS`, so the
   * token of the server does not apply. The network transports of the SDK give the HTTP request of
   * each call, so their calls keep the credentials of that request. These credentials have no
   * connection (CLI-71): the SDK gives only the headers and the URL of the request, not its socket.
   */
  sdkTransport?: SdkTransport;

  /** Enable debug logging */
  debug?: boolean;

  /**
   * The logger of the transport (CLI-87). The debug lines go to it at the level `debug`. The
   * collisions of tool names go to it at the level `error`. The default is the logger of the server. Without
   * both, each line goes to `console.error` as before, so stdout carries only the protocol.
   */
  logger?: Logger | undefined;

  /**
   * The limits of a stream that can run without an end (`stream: { unbounded: true }` of its
   * procedure): the tool stops it at the first one and gives the items that it has (roadmap R15).
   * @default { items: 100, time: seconds(30) }
   */
  streamLimits?: { items?: number; time?: Duration } | undefined;

  /**
   * MCP tasks (CLI-35): a store, or the options of a new store (`maxRunning`, `maxStored`,
   * `reserve`, `shareKey`, `ttl`, `clock`).
   * With it, a tool whose procedure has `metadata.taskSupport` can run as a task. Without it, each
   * tool call is a normal request. The stop of the transport closes a store that it made.
   */
  tasks?: McpTasksOptions | undefined;
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
  /** The path of the Streamable HTTP endpoint, when the transport is "http". The owner of the listener gives the address (CLI-11). */
  url?: string;
  /** The open sessions of the Streamable HTTP endpoint, when the transport is "http" (CLI-35) */
  sessions?: number;
}
