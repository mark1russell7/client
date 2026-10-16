/**
 * WebSocket Client Transport Types
 *
 * Type definitions for WebSocket client adapter.
 */

import type { Duration } from "../../../duration.js";
import type { Clock } from "../../../clock.js";
import type { MachineTransition } from "../../../machines.js";

import type { RequestHandler } from "../../../server/types.js";

/**
 * WebSocket client transport options. Each time is a `Duration` (roadmap R11).
 */
export interface WebSocketTransportOptions {
  /**
   * WebSocket URL to connect to.
   * @example "ws://localhost:3000/ws" or "wss://api.example.com/ws"
   */
  url: string;

  /**
   * Reconnection options.
   */
  reconnect?: {
    /**
     * Enable automatic reconnection.
     * @default true
     */
    enabled?: boolean;

    /**
     * Maximum number of reconnection attempts.
     * @default Infinity
     */
    maxAttempts?: number;

    /**
     * Initial delay before reconnecting.
     * @default 1 second
     */
    initialDelay?: Duration;

    /**
     * Maximum delay between reconnection attempts.
     * @default 30 seconds
     */
    maxDelay?: Duration;

    /**
     * Backoff multiplier for reconnection delay.
     * @default 1.5
     */
    backoffMultiplier?: number;

    /**
     * The random part of each reconnect delay, from 0 to 1. With 1 (full jitter), the delay is a
     * random time from 0 to the backoff delay, so many clients that lost one server do not
     * reconnect at the same time (roadmap R3). 0 gives the backoff delay exactly.
     * @default 1
     */
    jitter?: number;
  };

  /**
   * Connection timeout: how long to wait for the WebSocket to open. A handshake that takes
   * longer closes the socket, and the transport reconnects (roadmap R3: before, an address that
   * never answered kept the socket in CONNECTING).
   * @default 10 seconds
   */
  connectionTimeout?: Duration;

  /**
   * Request timeout: how long to wait for the response to one request.
   * (Before, requests used connectionTimeout, so every call was capped at 10s.)
   * @default 30 seconds
   */
  requestTimeout?: Duration;

  /**
   * The number of stream items that the transport holds for a reader that has not taken them.
   * The server sends no more items until the reader takes some (deep dive TRN-3).
   * @default 64
   */
  streamWindow?: number;

  /**
   * Heartbeat options for keeping connection alive.
   */
  heartbeat?: {
    /**
     * Enable heartbeat.
     * @default true
     */
    enabled?: boolean;

    /**
     * Heartbeat interval.
     * @default 20 seconds (`TIMER_DEFAULTS.webSocketClient.heartbeatIntervalMs`)
     */
    interval?: Duration;

    /**
     * Heartbeat timeout.
     * @default 5 seconds
     */
    timeout?: Duration;

    /**
     * The number of pings without a pong, one after the other, that drop the connection. The
     * time to find a dead server is at most `misses × interval + timeout`.
     * @default 1
     */
    misses?: number;
  };

  /**
   * Callback when connection is established.
   */
  onConnect?: () => void;

  /**
   * Callback when connection is lost.
   */
  onDisconnect?: (reason?: string) => void;

  /**
   * Callback when reconnecting.
   */
  onReconnecting?: (attempt: number) => void;

  /**
   * Callback on connection error.
   */
  onError?: (error: Error) => void;

  /**
   * Handler for server-initiated procedure calls.
   * Called when the server wants to call a procedure on this client. It gets the path and the
   * input, and gives the value. `serve` is the full form (roadmap R24).
   */
  onServerRequest?: ServerRequestHandler;

  /**
   * The handler of the calls that the server sends to this client (roadmap R24), for example a
   * `ProcedureServer` with the registry of the client. A call gets the same frames as a call of
   * the client: streaming, credit, cancel, the signal and the deadline (`procedure-timeout`). The
   * server reaches it with `callConnection()` or `transportFor()`. Without it (and without
   * `onServerRequest`), the client answers each call of the server with `NOT_FOUND`.
   */
  serve?: RequestHandler;

  /**
   * Handler for subscription events.
   * Called when the server pushes an event to a subscribed topic.
   */
  onEvent?: EventHandler;

  /**
   * The clock of each timer of the transport: the handshake, the requests, the heartbeat and the
   * reconnect (roadmap R35). The default is the clock of the platform. A test gives a fake clock.
   */
  clock?: Clock;

  /**
   * This function gets each change of the state, with its event, as a transition of
   * `WEBSOCKET_CONNECTION_MACHINE` (roadmap R35). A test replays them against the document.
   */
  onTransition?: (transition: MachineTransition) => void;

  /**
   * The class of the sockets. The default is the global `WebSocket`. The `WebSocketTransport` of
   * the Node entry `@procedures/client/node` has the `WebSocket` of the `ws` package as its
   * default. With that class, a drop ends its socket at once with `terminate()`. The global
   * `WebSocket` has only `close()`, which waits for the answer of the peer. With a dead peer, the
   * socket stays open until the kernel stops it, at most 15 minutes (the harness cells of R36).
   */
  webSocket?: WebSocketClass;
}

/** A class of WebSockets: the global `WebSocket`, or the `WebSocket` of the `ws` package. */
export type WebSocketClass = new (url: string) => unknown;

/**
 * WebSocket connection state.
 */
export enum WebSocketState {
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTING = "DISCONNECTING",
  DISCONNECTED = "DISCONNECTED",
  RECONNECTING = "RECONNECTING",
}

/**
 * WebSocket message format for RPC.
 */
export interface WebSocketMessage<T = unknown> {
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
  payload?: T;

  /** Metadata (headers, auth, etc.) */
  metadata?: Record<string, unknown>;

  /** Error details (for error messages) */
  error?: {
    code: string | number;
    message: string;
    retryable?: boolean;
  };

  /** Status (for responses) */
  status?: {
    type: "success" | "error";
    code: string | number;
    message?: string;
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
 * Server request message (server-initiated procedure call).
 */
export interface ServerRequestMessage {
  id: string;
  type: "server-request";
  path: string[];
  input?: unknown;
}

/**
 * Handler for server-initiated procedure calls.
 * Should return the result of executing the procedure.
 */
export type ServerRequestHandler = (
  path: string[],
  input: unknown
) => Promise<unknown>;

/**
 * Handler for subscription events.
 */
export type EventHandler = (
  topic: string,
  data: unknown,
  subscriptionId: string
) => void;
