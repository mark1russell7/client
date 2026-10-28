/**
 * WebSocket Server Transport Types
 *
 * Type definitions for WebSocket server adapter.
 */

import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import type { WebSocket } from "ws";
import type { BrowserGuardOptions } from "../../../server/browser-guard.js";
import type { Duration } from "../../../duration.js";
import type { Logger } from "../../../logger.js";

/**
 * WebSocket authentication handler.
 * Called during WebSocket upgrade to authenticate the connection.
 */
export type WebSocketAuthHandler = (
  req: IncomingMessage
) => Promise<boolean> | boolean;

/**
 * WebSocket connection handler.
 * Called when a new WebSocket connection is established.
 */
export type WebSocketConnectionHandler = (ws: WebSocket, req: IncomingMessage) => void;

/**
 * WebSocket server transport options.
 */
export interface WebSocketServerTransportOptions extends Omit<BrowserGuardOptions, "allowGet"> {
  /**
   * The HTTP server whose upgrade requests the transport takes. The transport takes only the
   * upgrades of its path, so several endpoints can share one server. Without it, the owner of the
   * listener gives each upgrade to `upgrade()`, or mounts `upgradeHandler()`.
   */
  server?: HttpServer | undefined;

  /**
   * Path for WebSocket connections.
   * @default "/ws"
   */
  path?: string;

  /**
   * Authentication handler for WebSocket upgrade.
   * Return true to allow connection, false to reject. It runs after the browser checks of the
   * host and the origin (`allowedHosts`, `allowedOrigins`), which are always on.
   */
  authenticate?: WebSocketAuthHandler;

  /**
   * Connection handler called when client connects.
   */
  onConnection?: WebSocketConnectionHandler;

  /**
   * Enable per-message compression.
   * @default false
   */
  perMessageDeflate?: boolean;

  /**
   * Maximum message size in bytes.
   * @default 1MB
   */
  maxPayload?: number;

  /**
   * Client tracking - track connected clients.
   * @default true
   */
  clientTracking?: boolean;

  /**
   * The number of bytes that a connection can hold in its send buffer before a stream waits
   * (deep dive TRN-3: before, a stream ran to its end whatever the reader did).
   * @default 1 MiB
   */
  highWaterMark?: number;

  /**
   * The heartbeat of the server: a WebSocket ping to each connection at each interval. A
   * connection that misses `misses` pongs one after the other is closed, so the server finds a
   * client that went silent (roadmap R3: before, only the client sent pings). Browsers and the
   * `ws` client answer a ping without code. `false` turns it off.
   * @default { interval: seconds(15), misses: 2 } (`TIMER_DEFAULTS.webSocketServer`)
   */
  heartbeat?: { interval?: Duration; misses?: number } | false;

  /**
   * The time until the first frame of a call that the server sends to a client (roadmap R24).
   * @default seconds(30)
   */
  reverseRequestTimeout?: Duration;

  /**
   * More headers that carry a secret, for example the token header of an application. They go
   * into the credentials of each call, not into its metadata. `Authorization`,
   * `Proxy-Authorization`, `Cookie` and `X-Api-Key` are always secret.
   */
  secretHeaders?: readonly string[] | undefined;
  /**
   * The logger of the transport (CLI-87): the lines of its start, its stop, its heartbeat and its
   * errors go to it. The default is the logger of the server. Without both, each line goes to the console as before.
   */
  logger?: Logger | undefined;
}

/**
 * WebSocket message format for RPC.
 */
export interface WebSocketMessage<TReq = unknown> {
  /** Message ID for request/response matching */
  id: string;

  /** Message type */
  type: "hello" | "request" | "response" | "error" | "stream" | "cancel" | "credit" | "ping" | "pong" | "server-request" | "server-response" | "event";

  /** The protocol version of a `hello` frame (roadmap R25). */
  protocol?: number;

  /** RPC method (for requests) */
  method?: {
    service: string;
    operation: string;
    version?: string;
  };

  /** Procedure path (for server-request) */
  path?: string[];

  /** Input data (for server-request) */
  input?: unknown;

  /** Result data (for server-response) */
  result?: unknown;

  /** Message payload */
  payload?: TReq;

  /** Metadata (headers, auth, etc.) */
  metadata?: Record<string, unknown>;

  /** Status (for responses) */
  status?: {
    type: "success" | "error";
    code: string | number;
    message?: string;
    retryable?: boolean;
  };

  /** Error details (for error messages) */
  error?: {
    code: string | number;
    message: string;
    retryable?: boolean;
  };

  /**
   * Flow control of a stream (deep dive TRN-3). In a request: the number of stream items that
   * the client can take before it sends more credit. In a "credit" message: the number of more
   * items. A request without credit gets its stream with no limit (the old protocol).
   */
  credit?: number;

  /**
   * The number of a `stream` frame in its call: 1 in the first frame, and one more in each next
   * frame. The receiver drops a frame whose `seq` is not above the last one. A frame of an older
   * peer has no `seq`.
   */
  seq?: number;

  /** Stream indicator (for streaming responses) */
  stream?: {
    /** Is this the last message in the stream? */
    done: boolean;
  };

  /** Topic (for event messages) */
  topic?: string;

  /** Data (for event messages) */
  data?: unknown;

  /** Subscription ID (for event messages) */
  subscriptionId?: string;
}

/**
 * Tracked connection with ID for bidirectional communication.
 */
export interface TrackedConnection {
  /** Unique connection ID */
  id: string;
  /** WebSocket instance */
  socket: WebSocket;
  /** When the connection was established */
  connectedAt: Date;
  /** Connection metadata */
  metadata: Record<string, unknown>;
  /** Available procedures on this connection (discovered) */
  procedures?: string[];
}

/**
 * Connection event handler.
 */
export type ConnectionEventHandler = (connection: TrackedConnection) => void;
