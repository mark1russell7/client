/**
 * WebSocket Server Transport Types
 *
 * Type definitions for WebSocket server adapter.
 */

import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import type { WebSocket } from "ws";

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
export interface WebSocketServerTransportOptions {
  /**
   * HTTP server to attach WebSocket server to.
   * Required - WebSocket upgrades HTTP connections.
   */
  server: HttpServer;

  /**
   * Path for WebSocket connections.
   * @default "/ws"
   */
  path?: string;

  /**
   * Authentication handler for WebSocket upgrade.
   * Return true to allow connection, false to reject.
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
}

/**
 * WebSocket message format for RPC.
 */
export interface WebSocketMessage<TReq = unknown> {
  /** Message ID for request/response matching */
  id: string;

  /** Message type */
  type: "request" | "response" | "error" | "stream" | "cancel" | "credit" | "ping" | "pong" | "server-request" | "server-response" | "event";

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
