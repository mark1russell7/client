/**
 * The hosts, the lanes and the steps of the call's journey: the data that the page needs to draw
 * a journey. This module imports no runtime, so the page code stays small. The worker runs the
 * journey (`journey.ts`).
 */

// ---------------------------------------------------------------------------
// Hosts, lanes and steps
// ---------------------------------------------------------------------------

export type Host = "local" | "http" | "websocket" | "mcp";

export const HOSTS: Array<{ id: Host; label: string; summary: string }> = [
  {
    id: "local",
    label: "In process",
    summary: "The client and the procedure are in one process. LocalTransport runs the procedure with no encoding and no server.",
  },
  {
    id: "http",
    label: "HTTP",
    summary: "HttpTransport sends a POST request. The server answers a stream as NDJSON, one line for each item.",
  },
  {
    id: "websocket",
    label: "WebSocket",
    summary: "WebSocketTransport sends one request frame with a credit. The server sends one frame for each item, then an end frame.",
  },
  {
    id: "mcp",
    label: "MCP",
    summary: "Claude Code calls the procedure as a tool. The MCP server sends a progress notification for each item, then the result.",
  },
];

export type Lane = "app" | "retry" | "timeout" | "transport" | "wire" | "server" | "interceptor" | "validation" | "handler" | "nested";

export const LANE_INFO: Record<Lane, { label: string; summary: string }> = {
  app: { label: "App", summary: "The code that makes the call and reads the items." },
  retry: { label: "Retry", summary: "The retry middleware of the client. It starts the request again after a retryable error, until the first item." },
  timeout: { label: "Timeout", summary: "The timeout middleware of the client. It ends an attempt that takes too long." },
  transport: { label: "Transport", summary: "The adapter that moves the call between the client and the procedure." },
  wire: { label: "Wire", summary: "The bytes between two processes. The page shows them as the transports write them." },
  server: { label: "Server", summary: "ProcedureServer finds the procedure of the method in its registry, with its expose rule." },
  interceptor: { label: "Interceptors", summary: "Functions around each invocation and each nested call: here the tracing interceptor (and for MCP the time limit of a tool call)." },
  validation: { label: "Validation", summary: "invokeProcedure validates the input before the handler starts, and each item that the handler yields." },
  handler: { label: "Handler", summary: "The code of the procedure shop.receipt." },
  nested: { label: "Nested calls", summary: "The procedures that the handler calls through ctx.client." },
};

/** The lanes of a host, from the app at the top to the nested calls at the bottom. */
export function lanesOf(host: Host): Lane[] {
  switch (host) {
    case "local":
      return ["app", "retry", "timeout", "transport", "validation", "handler", "nested"];
    case "http":
    case "websocket":
      return ["app", "retry", "timeout", "transport", "wire", "server", "interceptor", "validation", "handler", "nested"];
    case "mcp":
      return ["app", "wire", "transport", "server", "interceptor", "validation", "handler", "nested"];
  }
}

export interface JourneyStep {
  lane: Lane;
  /** "down": toward the handler. "up": a result or an item toward the app. "here": in the lane. */
  direction: "down" | "up" | "here";
  /** One sentence. */
  title: string;
  /** Code or the bytes on the wire. */
  detail?: string | undefined;
  /** Milliseconds from the start of the call. */
  at: number;
  /** The number of the item that the step carries (1 is the first). */
  item?: number | undefined;
}

export interface Journey {
  host: Host;
  lanes: Lane[];
  steps: JourneyStep[];
  /** The items that the app got. */
  items: string[];
  ok: boolean;
  error?: string | undefined;
  /** Milliseconds. */
  duration: number;
}

