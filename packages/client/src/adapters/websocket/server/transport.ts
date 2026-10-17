/**
 * WebSocket Server Transport Implementation
 *
 * Adapts WebSocket connections to unified RPC format.
 * Supports bidirectional streaming and persistent connections.
 */

import type { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { ServerTransport, ServerRequest } from "../../../server/types.js";
import type { Message, ResponseItem, Transport } from "../../../client/types.js";
import { pathToMethod } from "../../../server/method.js";
import { IncomingCalls, OutgoingCalls } from "../shared/rpc.js";
import type { RequestHandler } from "../../../server/types.js";
import type {
  WebSocketServerTransportOptions,
  WebSocketMessage,
  TrackedConnection,
  ConnectionEventHandler,
} from "./types.js";
import { withoutInternalKeys } from "../../metadata.js";
import { checkBrowserRequest, type BrowserGuardOptions } from "../../../server/browser-guard.js";
import { optionalMs } from "../../../duration.js";
import { credentialsOf, withoutSecretHeaders } from "../../../server/request-auth.js";
import { PROTOCOL_VERSION, protocolVersionOf } from "../../../protocol.js";
import { TIMER_DEFAULTS } from "../../../timers.js";
import {
  remoteEvents,
  subscribeRemote,
  type RemoteEvent,
  type RemoteEventHandler,
  type RemoteEventsOptions,
  type SubscribeOptions,
  type Subscription,
} from "../../../events/remote.js";

/**
 * WebSocket server transport adapter.
 *
 * Provides persistent, bidirectional RPC over WebSocket.
 * Perfect for real-time updates and streaming responses.
 *
 * @example
 * ```typescript
 * import { createServer } from "http";
 * const httpServer = createServer();
 *
 * const server = new Server();
 * const wsTransport = new WebSocketServerTransport(server, {
 *   server: httpServer,
 *   path: "/ws",
 *   authenticate: async (req) => {
 *     // Verify token from query string or headers
 *     return true;
 *   }
 * });
 *
 * await wsTransport.start();
 * httpServer.listen(3000);
 * ```
 */
export class WebSocketServerTransport implements ServerTransport {
  readonly name = "websocket";

  private wss: WebSocketServer | null = null;
  private options: Required<
    Omit<WebSocketServerTransportOptions, "authenticate" | "onConnection" | "allowedOrigins" | "allowedHosts" | "heartbeat" | "reverseRequestTimeout">
  > & {
    authenticate?: WebSocketServerTransportOptions["authenticate"];
    onConnection?: WebSocketServerTransportOptions["onConnection"];
  };
  private server: RequestHandler;
  private connections: Set<WebSocket> = new Set();

  /** The time until the first frame of a call to a client, in milliseconds (R24) */
  private readonly reverseRequestTimeoutMs: number;
  /** The heartbeat of the server, or undefined when it is off (roadmap R3) */
  private readonly heartbeat: { interval: number; misses: number } | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  /** The pings without a pong, one after the other, of each connection */
  private readonly missedPongs = new WeakMap<WebSocket, number>();

  // Tracked connections with IDs for bidirectional RPC
  private trackedConnections = new Map<string, TrackedConnection>();
  private connectionCounter = 0;

  /**
   * The calls of each connection in the two directions (roadmap R24): the calls that the client
   * sends (served by the server) and the calls that the server sends to the client.
   */
  private readonly channels = new Map<string, { incoming: IncomingCalls; outgoing: OutgoingCalls }>();

  /** The browser checks of each connection (see `server/browser-guard.ts`) */
  private readonly guard: BrowserGuardOptions;

  // Connection lifecycle event handlers
  private connectHandlers: ConnectionEventHandler[] = [];
  private disconnectHandlers: ConnectionEventHandler[] = [];

  constructor(server: RequestHandler, options: WebSocketServerTransportOptions) {
    this.server = server;
    this.options = {
      server: options.server,
      path: options.path ?? "/ws",
      authenticate: options.authenticate,
      onConnection: options.onConnection,
      perMessageDeflate: options.perMessageDeflate ?? false,
      maxPayload: options.maxPayload ?? 1024 * 1024, // 1MB default
      clientTracking: options.clientTracking ?? true,
      highWaterMark: options.highWaterMark ?? 1024 * 1024,
    };
    this.guard = { allowedOrigins: options.allowedOrigins, allowedHosts: options.allowedHosts };
    this.reverseRequestTimeoutMs = optionalMs(options.reverseRequestTimeout, "reverseRequestTimeout") ?? TIMER_DEFAULTS.webSocketServer.reverseRequestTimeoutMs;
    this.heartbeat =
      options.heartbeat === false
        ? undefined
        : {
            interval: optionalMs(options.heartbeat?.interval, "heartbeat.interval") ?? TIMER_DEFAULTS.webSocketServer.heartbeatIntervalMs,
            misses: Math.max(1, options.heartbeat?.misses ?? TIMER_DEFAULTS.webSocketServer.heartbeatMisses),
          };
  }

  /**
   * One beat of the heartbeat: a connection that missed too many pongs closes at once (its close
   * event aborts its requests), and each other connection gets a ping.
   */
  private beat(): void {
    if (!this.heartbeat) return;
    for (const ws of this.connections) {
      const missed = this.missedPongs.get(ws) ?? 0;
      if (missed >= this.heartbeat.misses) {
        console.error(`[${this.name}] A connection missed ${missed} pongs: closing it`);
        ws.terminate();
        continue;
      }
      this.missedPongs.set(ws, missed + 1);
      try {
        ws.ping();
      } catch {
        // The socket is closing: its close event cleans up
      }
    }
  }

  async start(): Promise<void> {
    // Create WebSocket server
    this.wss = new WebSocketServer({
      server: this.options.server,
      path: this.options.path,
      perMessageDeflate: this.options.perMessageDeflate,
      maxPayload: this.options.maxPayload,
      clientTracking: this.options.clientTracking,
      // The browser checks run for every connection: before, a connection was checked only
      // when the host gave an authenticate handler, so any web page could open one and call
      // procedures (cross-site WebSocket hijacking)
      verifyClient: async (
        { req }: { req: IncomingMessage },
        callback: (result: boolean, code?: number, message?: string) => void
      ) => {
        const guard = checkBrowserRequest(req, this.guard);
        if (!guard.ok) {
          callback(false, guard.status, guard.message);
          return;
        }
        if (!this.options.authenticate) {
          callback(true);
          return;
        }
        try {
          callback(await this.options.authenticate(req));
        } catch (error) {
          console.error("[WebSocket] Authentication error:", error);
          callback(false);
        }
      },
    });

    // Handle connections
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    if (this.heartbeat) {
      this.heartbeatTimer = setInterval(() => this.beat(), this.heartbeat.interval);
      // The heartbeat must not keep the process alive
      this.heartbeatTimer.unref?.();
    }

    console.log(`[${this.name}] WebSocket server listening on ${this.options.path}`);
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.wss) {
      // Stop the requests in progress, so their handlers end (deep dive TRN-15), and fail the
      // calls that the server sent to its clients
      for (const channel of this.channels.values()) {
        channel.incoming.abortAll();
        channel.outgoing.failAll("Server stopped");
      }
      this.channels.clear();

      // Close all connections
      for (const ws of this.connections) {
        ws.close();
      }
      this.connections.clear();

      // Close server
      return new Promise((resolve, reject) => {
        this.wss!.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            console.log(`[${this.name}] WebSocket server stopped`);
            this.wss = null;
            resolve();
          }
        });
      });
    }
  }

  isRunning(): boolean {
    return this.wss !== null;
  }

  /**
   * Handle new WebSocket connection.
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Track connection (legacy)
    this.connections.add(ws);

    // Create tracked connection with ID
    const connectionId = `conn_${++this.connectionCounter}_${Date.now()}`;
    const trackedConnection: TrackedConnection = {
      id: connectionId,
      socket: ws,
      connectedAt: new Date(),
      metadata: {
        remoteAddress: req.socket.remoteAddress,
        headers: withoutSecretHeaders(req.headers as Record<string, unknown>),
      },
    };
    this.trackedConnections.set(connectionId, trackedConnection);

    // The calls of this connection in the two directions (roadmap R24)
    const isOpen = (): boolean => ws.readyState === WebSocket.OPEN;
    const send = (frame: WebSocketMessage): void => this.send(ws, frame);
    this.channels.set(connectionId, {
      incoming: new IncomingCalls({
        handler: this.server,
        send,
        sendWithBackpressure: (frame, signal) => this.sendWithBackpressure(ws, frame, signal),
        isOpen,
        requestOf: (frame, signal) => this.requestOf(frame, req, connectionId, signal),
      }),
      outgoing: new OutgoingCalls({
        send,
        isOpen,
        requestTimeoutMs: this.reverseRequestTimeoutMs,
        streamWindow: 64,
        idPrefix: "r:",
      }),
    });

    // Call user connection handler (legacy)
    if (this.options.onConnection) {
      this.options.onConnection(ws, req);
    }

    // Emit connect event
    for (const handler of this.connectHandlers) {
      try {
        handler(trackedConnection);
      } catch (error) {
        console.error("[WebSocket] Connect handler error:", error);
      }
    }

    // A pong answers the ping of the heartbeat
    ws.on("pong", () => this.missedPongs.set(ws, 0));

    // Handle messages
    ws.on("message", async (data: Buffer) => {
      try {
        await this.handleMessage(ws, data, req, connectionId);
      } catch (error) {
        console.error("[WebSocket] Message handling error:", error);
        this.sendError(ws, "unknown", "Internal server error");
      }
    });

    // Handle close
    ws.on("close", () => {
      this.connections.delete(ws);
      // The calls of the client stop, and the calls to the client fail (BUGS-2026-07 L29)
      const channel = this.channels.get(connectionId);
      channel?.incoming.abortAll();
      channel?.outgoing.failAll("WebSocket connection closed");
      this.channels.delete(connectionId);
      const conn = this.trackedConnections.get(connectionId);
      if (conn) {
        this.trackedConnections.delete(connectionId);
        // Emit disconnect event
        for (const handler of this.disconnectHandlers) {
          try {
            handler(conn);
          } catch (error) {
            console.error("[WebSocket] Disconnect handler error:", error);
          }
        }
      }
    });

    // Handle errors. The socket emits "close" after "error": the close handler does the
    // cleanup and the disconnect event (deep dive TRN-16: before, this handler removed the
    // connection first, so the close handler found nothing and sent no disconnect event).
    ws.on("error", (error: Error) => {
      console.error("[WebSocket] Connection error:", error);
    });
  }

  /**
   * The server request of a `request` frame of a connection: the metadata of the frame and of the
   * connection, the signal of the call, and the credentials of the upgrade (roadmap R18).
   */
  private requestOf(frame: WebSocketMessage, req: IncomingMessage, connectionId: string, signal: AbortSignal): ServerRequest {
    return {
      id: frame.id,
      method: frame.method!,
      // Only an absent payload becomes {}: before, 0, false and "" became {} too (deep dive TRN-10)
      payload: frame.payload === undefined ? {} : frame.payload,
      metadata: {
        ...withoutInternalKeys(frame.metadata),
        // Add connection info
        connectionId,
        remoteAddress: req.socket.remoteAddress,
        // The upgrade headers without their secrets (roadmap R18)
        headers: withoutSecretHeaders(req.headers as Record<string, unknown>),
      },
      signal,
      // The credentials of the connection: the bearer token of its upgrade (R18)
      credentials: credentialsOf(req),
    };
  }

  /**
   * Handle WebSocket message: a heartbeat, a frame of a call that the server sent (a response,
   * an error, a stream), or a frame of a call of the client (a request, a cancel, a credit).
   */
  private async handleMessage(
    ws: WebSocket,
    data: Buffer,
    _req: IncomingMessage,
    connectionId: string
  ): Promise<void> {
    // Parse message
    let message: WebSocketMessage;
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.sendError(ws, "unknown", "Invalid JSON message");
      return;
    }

    // Handle ping (client heartbeat)
    if (message.type === "ping") {
      this.send(ws, { id: message.id, type: "pong" });
      return;
    }
    // A pong answers a ping of the server: nothing to do
    if (message.type === "pong") return;

    // The hello of the client: the protocol version (roadmap R25)
    if (message.type === "hello") {
      const version = protocolVersionOf(message.protocol);
      const connection = this.trackedConnections.get(connectionId);
      if (connection && version !== undefined) connection.metadata = { ...connection.metadata, protocol: version };
      if (version !== undefined && version > PROTOCOL_VERSION) {
        this.sendError(ws, message.id || "hello", `This server speaks the protocol ${PROTOCOL_VERSION}, and the client uses ${version}`, "PROTOCOL_VERSION");
        ws.close(1002, "protocol version");
        return;
      }
      this.send(ws, { id: message.id || "hello", type: "hello", protocol: PROTOCOL_VERSION });
      return;
    }

    const channel = this.channels.get(connectionId);
    if (!channel) return;
    // A frame of a call that the server sent to this client (roadmap R24)
    if (channel.outgoing.receive(message)) return;
    // A frame of a call of the client: a request, a cancel or a credit
    if (channel.incoming.receive(message)) return;
    // A server-response frame of an older client, for a call that no longer exists
    if (message.type === "server-response") return;
    // A late answer of a call that the server stopped: a cancel (an unsubscribe), a time limit
    if (message.type === "stream" || message.type === "response" || message.type === "error") return;
    this.sendError(ws, message.id || "unknown", "Invalid message format");
  }

  /**
   * Send a frame. When the connection's send buffer is past the high-water mark, wait until
   * the socket has written this frame, or the signal aborts.
   */
  private sendWithBackpressure(ws: WebSocket, message: WebSocketMessage, signal: AbortSignal): Promise<void> {
    if (ws.readyState !== WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let waiting = false;
      const onAbort = (): void => resolve();
      ws.send(JSON.stringify(message), () => {
        if (!waiting) return;
        signal.removeEventListener("abort", onAbort);
        resolve();
      });
      if (ws.bufferedAmount > this.options.highWaterMark && !signal.aborted) {
        waiting = true;
        signal.addEventListener("abort", onAbort, { once: true });
      } else {
        resolve();
      }
    });
  }

  /**
   * Send error to client.
   */
  private sendError(ws: WebSocket, id: string, message: string, code = "INTERNAL_ERROR"): void {
    const errorMessage: WebSocketMessage = {
      id,
      type: "error",
      status: {
        type: "error",
        code,
        message,
        retryable: false,
      },
      error: {
        code,
        message,
        retryable: false,
      },
    };

    this.send(ws, errorMessage);
  }

  /**
   * Send message to client.
   */
  private send(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all connected clients.
   */
  broadcast(message: WebSocketMessage): void {
    for (const ws of this.connections) {
      this.send(ws, message);
    }
  }

  /**
   * Get number of connected clients.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  // ===========================================================================
  // Tracked Connection Methods (for bidirectional RPC)
  // ===========================================================================

  /**
   * Get all tracked connections.
   */
  getTrackedConnections(): TrackedConnection[] {
    return Array.from(this.trackedConnections.values());
  }

  /**
   * Get a specific tracked connection by ID.
   */
  getTrackedConnection(connectionId: string): TrackedConnection | undefined {
    return this.trackedConnections.get(connectionId);
  }

  /**
   * Send a message to a specific connection.
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const conn = this.trackedConnections.get(connectionId);
    if (conn) {
      this.send(conn.socket, message);
    }
  }

  /**
   * Send a call to a client (roadmap R24): the same frames as the calls of the client, with
   * streaming, credit, cancel, the signal and the remaining time of the call. The client serves it
   * with its own handler (the `serve` option of `WebSocketTransport`). An unknown connection gives a
   * `CONNECTION_NOT_FOUND` error item.
   */
  callConnection<TReq, TRes>(connectionId: string, message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return (async function* () {
        yield {
          id: message.id,
          status: { type: "error", code: "CONNECTION_NOT_FOUND", message: `Connection not found: ${connectionId}`, retryable: false },
          payload: null as TRes,
          metadata: {},
        } as ResponseItem<TRes>;
      })();
    }
    return channel.outgoing.call<TReq, TRes>(message);
  }

  /**
   * A transport to one client: a `Client` over it calls the procedures that the client serves,
   * with each client middleware (retry, timeouts) of the caller (roadmap R24).
   */
  transportFor(connectionId: string): Transport {
    return {
      name: `websocket-reverse:${connectionId}`,
      send: <TReq, TRes>(message: Message<TReq>) => this.callConnection<TReq, TRes>(connectionId, message),
      close: async () => undefined,
    };
  }

  /**
   * This function subscribes to topics of the bus of a client (`documentation/EVENTS.md`). The
   * client serves them with its `serve` option: a `ProcedureServer` with the option `events`. The
   * subscription ends with its connection: a reconnect is a new connection, so the server
   * subscribes again in its `onConnect` handler. The `onError` handler gets the end.
   *
   * @param connectionId - The id of the connection of the client
   * @param topics - One topic, or a list of 1 to 64 topics
   * @param handler - The handler of each event, in order
   * @param options - `onSubscribed`, `onError`, a signal, the metadata of the call
   */
  subscribe<T = unknown>(
    connectionId: string,
    topics: string | readonly string[],
    handler: RemoteEventHandler<T>,
    options: SubscribeOptions = {},
  ): Subscription {
    return subscribeRemote<T>(this.transportFor(connectionId), topics, handler, options, { resubscribe: false });
  }

  /**
   * This function gives the events of topics of the bus of a client as an async iterator. The
   * iteration ends with the connection, with an error.
   *
   * @param connectionId - The id of the connection of the client
   * @param topics - One topic, or a list of 1 to 64 topics
   * @param options - A signal, `onSubscribed`, the metadata of the call
   */
  events<T = unknown>(connectionId: string, topics: string | readonly string[], options: RemoteEventsOptions = {}): AsyncIterable<RemoteEvent<T>> {
    return remoteEvents<T>(this.transportFor(connectionId), topics, options, { resubscribe: false });
  }

  /**
   * Call a procedure on a specific client (server-to-client RPC). It gives the value of the
   * call, and fails with its error. It is a wrapper of `callConnection` (roadmap R24).
   */
  async callClient(connectionId: string, path: string[], input: unknown, timeout = 30000): Promise<unknown> {
    if (!this.channels.has(connectionId)) throw new Error(`Connection not found: ${connectionId}`);
    const signal = AbortSignal.timeout(timeout);
    const message: Message<unknown> = {
      id: `sreq_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      method: pathToMethod(path),
      payload: input,
      metadata: { "procedure-timeout": timeout },
      signal,
    };
    let last: ResponseItem<unknown> | undefined;
    for await (const item of this.callConnection(connectionId, message)) {
      if (item.status.type === "error") {
        if (signal.aborted) throw new Error(`Request timeout after ${timeout}ms`);
        throw Object.assign(new Error(item.status.message), { code: item.status.code, retryable: item.status.retryable });
      }
      last = item;
    }
    return last?.payload;
  }

  /**
   * Register a handler for new connections.
   * Returns a function to unregister the handler.
   */
  onConnect(handler: ConnectionEventHandler): () => void {
    this.connectHandlers.push(handler);
    return () => {
      const index = this.connectHandlers.indexOf(handler);
      if (index >= 0) {
        this.connectHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a handler for disconnections.
   * Returns a function to unregister the handler.
   */
  onDisconnect(handler: ConnectionEventHandler): () => void {
    this.disconnectHandlers.push(handler);
    return () => {
      const index = this.disconnectHandlers.indexOf(handler);
      if (index >= 0) {
        this.disconnectHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Update metadata for a tracked connection.
   */
  updateConnectionMetadata(
    connectionId: string,
    metadata: Record<string, unknown>
  ): void {
    const conn = this.trackedConnections.get(connectionId);
    if (conn) {
      conn.metadata = { ...conn.metadata, ...metadata };
    }
  }

  /**
   * Set discovered procedures for a tracked connection.
   */
  setConnectionProcedures(connectionId: string, procedures: string[]): void {
    const conn = this.trackedConnections.get(connectionId);
    if (conn) {
      conn.procedures = procedures;
    }
  }
}
