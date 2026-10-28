/**
 * WebSocket Server Transport Implementation
 *
 * Adapts WebSocket connections to unified RPC format.
 * Supports bidirectional streaming and persistent connections.
 *
 * The transport runs the `WebSocketServer` of `ws` in its "no server" mode (CLI-3). `upgrade()`
 * takes the upgrade requests of its path. With the option `server`, the transport attaches
 * `upgrade()` to that server through one router for each server, so two endpoints of different
 * paths can share a server. Without it, the owner of the listener gives the upgrades to
 * `upgrade()`, or mounts `upgradeHandler()` of `@procedures/client/node`.
 */

import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
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
import { assertNamedOrigins, checkBrowserRequest, needsNamedOrigin, type BrowserGuardOptions } from "../../../server/browser-guard.js";
import { optionalMs } from "../../../duration.js";
import { headerNames, requestCredentials, urlParts, withoutSecretHeaders } from "../../../server/request-auth.js";
import { attachUpgradeTarget, refuseUpgrade } from "./upgrade-router.js";
import { realClock, type Cancel } from "../../../clock.js";
import { PROTOCOL_VERSION, protocolVersionOf } from "../../../protocol.js";
import { TIMER_DEFAULTS } from "../../../timers.js";
import { writeLog, type Logger } from "../../../logger.js";
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
    Omit<
      WebSocketServerTransportOptions,
      "server" | "authenticate" | "onConnection" | "allowedOrigins" | "allowedHosts" | "heartbeat" | "reverseRequestTimeout" | "secretHeaders" | "logger"
    >
  > & {
    server: WebSocketServerTransportOptions["server"];
    authenticate?: WebSocketServerTransportOptions["authenticate"];
    onConnection?: WebSocketServerTransportOptions["onConnection"];
  };
  /** The more headers that carry a secret (CLI-2a) */
  private readonly secretHeaders: ReadonlySet<string>;
  /** The function that detaches `upgrade()` from the `server` of the options */
  private detach: (() => void) | undefined;
  /** True after `stopIntake()`: a new upgrade gets 503, and a new call gets `UNAVAILABLE` */
  private intakeStopped = false;
  /** The functions that `drain()` waits on: each one runs when no call is in flight */
  private idleWaiters: Array<() => void> = [];
  /** True: a cookie of an upgrade is trusted only from a named origin, with or without an auth path */
  private cookiesNamed = false;
  private server: RequestHandler;
  /** The logger of the lines of the transport: the option, or the logger of the server (CLI-87) */
  private readonly logger: Logger | undefined;
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

  /**
   * The transport of the remote events of each connection: one object for each connection, so the
   * subscriptions of one connection to the same topics share one call (EVENTS.md).
   */
  private readonly eventTransports = new Map<string, Transport>();

  /** The browser checks of each connection (see `server/browser-guard.ts`) */
  private readonly guard: BrowserGuardOptions;

  // Connection lifecycle event handlers
  private connectHandlers: ConnectionEventHandler[] = [];
  private disconnectHandlers: ConnectionEventHandler[] = [];

  constructor(server: RequestHandler, options: WebSocketServerTransportOptions = {}) {
    this.server = server;
    this.logger = options.logger ?? server.logger;
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
    // CSRF: a server that reads the cookies of each request needs named origins (CLI-2a)
    assertNamedOrigins("WebSocketServerTransport", server.ambientCredentials, options.allowedOrigins, "allowedOrigins");
    this.secretHeaders = headerNames(options.secretHeaders);
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
        writeLog(this.logger, "error", "A connection missed its pongs: closing it", { transport: this.name, missed }, `[${this.name}] A connection missed ${missed} pongs: closing it`);
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
    this.open();
  }

  /**
   * This method creates the WebSocket server at once, and attaches it to the `server` of the
   * options. `start()` calls it, and `upgradeHandler()` too. A second call does nothing.
   *
   * @internal
   */
  open(): void {
    this.intakeStopped = false;
    if (this.wss) return;
    // The "no server" mode: upgrade() takes the upgrades of the path, and leaves the others alone
    this.wss = new WebSocketServer({
      noServer: true,
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
        // The cookies of an upgrade are trusted only from a named origin, when the server or the
        // authenticate handler can read them (cross-site WebSocket hijacking with cookies)
        const readsCookies = this.cookiesNamed || this.options.authenticate !== undefined;
        const ambient = needsNamedOrigin(this.server.ambientCredentials, req.headers, readsCookies);
        const guard = checkBrowserRequest(req, this.guard, false, ambient);
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
          writeLog(this.logger, "error", "Authentication error", { transport: this.name, path: this.options.path, error }, "[WebSocket] Authentication error:", error);
          callback(false);
        }
      },
    });

    // Handle connections
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
    if (this.options.server) this.detach = attachUpgradeTarget(this.options.server, this);

    if (this.heartbeat) {
      this.heartbeatTimer = setInterval(() => this.beat(), this.heartbeat.interval);
      // The heartbeat must not keep the process alive
      this.heartbeatTimer.unref?.();
    }

    writeLog(this.logger, "info", "WebSocket server listening", { transport: this.name, path: this.options.path }, `[${this.name}] WebSocket server listening on ${this.options.path}`);
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.detach?.();
    this.detach = undefined;
    if (this.wss) {
      // Stop the requests in progress, so their handlers end (deep dive TRN-15), and fail the
      // calls that the server sent to its clients
      for (const channel of this.channels.values()) {
        channel.incoming.abortAll();
        channel.outgoing.failAll("Server stopped");
      }
      this.channels.clear();
      this.callSettled();

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
            writeLog(this.logger, "info", "WebSocket server stopped", { transport: this.name, path: this.options.path }, `[${this.name}] WebSocket server stopped`);
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
   * This method makes the transport trust a cookie of an upgrade only from a named origin, also
   * without an auth path that reads it. `upgradeHandler()` calls it.
   *
   * @internal
   */
  nameOriginsForCookies(): void {
    this.cookiesNamed = true;
  }

  /** The path of the WebSocket endpoint. */
  get path(): string {
    return this.options.path;
  }

  /** This method gives true when an upgrade request is for the path of this endpoint. */
  matches(req: IncomingMessage): boolean {
    return urlParts(req.url).path === this.options.path;
  }

  /**
   * This method takes an upgrade request of its path and gives true. The browser checks, the
   * `authenticate` handler and the handshake of `ws` follow. It gives false for another path, or
   * before `start()`, and does not touch the socket. After `stopIntake()`, it refuses the upgrade
   * with 503.
   */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const wss = this.wss;
    if (!wss || !this.matches(req)) return false;
    if (this.intakeStopped) {
      refuseUpgrade(socket, 503, "The server is stopping");
      return true;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    return true;
  }

  /**
   * This method stops the intake: a new upgrade gets 503, and a new call on an open connection gets
   * the retryable error `UNAVAILABLE`. The calls in flight go on. `start()` accepts again.
   */
  stopIntake(): void {
    this.intakeStopped = true;
  }

  /** The number of the calls in flight on all connections, open streams too. */
  inFlight(): number {
    let count = 0;
    for (const channel of this.channels.values()) count += channel.incoming.size;
    return count;
  }

  /**
   * This method waits until no call is in flight, until the `deadline` (milliseconds on the
   * monotonic clock of `performance.now()`), or until the signal aborts.
   */
  drain(deadline: number, signal?: AbortSignal): Promise<void> {
    if (this.inFlight() === 0 || signal?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let timer: Cancel | undefined;
      const done = (): void => {
        timer?.();
        signal?.removeEventListener("abort", done);
        const index = this.idleWaiters.indexOf(done);
        if (index >= 0) this.idleWaiters.splice(index, 1);
        resolve();
      };
      this.idleWaiters.push(done);
      signal?.addEventListener("abort", done, { once: true });
      timer = realClock.after(Math.max(0, deadline - realClock.now()), done);
      timer.unref?.();
    });
  }

  /** This method stops the transport: the same as `stop()`. */
  close(): Promise<void> {
    return this.stop();
  }

  /** A call ended: a drain can end when no call is in flight. */
  private callSettled(): void {
    if (this.idleWaiters.length === 0 || this.inFlight() > 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const waiter of waiters) waiter();
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
        headers: withoutSecretHeaders(req.headers as Record<string, unknown>, this.secretHeaders),
      },
    };
    this.trackedConnections.set(connectionId, trackedConnection);
    // The credentials of the upgrade, for each call of the connection: the bearer token of its
    // Authorization header or of its token query, its cookies, its headers and its query (CLI-2a),
    // and the connection of its socket (CLI-71)
    const credentials = requestCredentials({ headers: req.headers as Record<string, unknown>, url: req.url, socket: req.socket }, { tokenQuery: "token" });

    // The calls of this connection in the two directions (roadmap R24)
    const isOpen = (): boolean => ws.readyState === WebSocket.OPEN;
    const send = (frame: WebSocketMessage): void => this.send(ws, frame);
    this.channels.set(connectionId, {
      incoming: new IncomingCalls({
        handler: this.server,
        send,
        sendWithBackpressure: (frame, signal) => this.sendWithBackpressure(ws, frame, signal),
        isOpen,
        requestOf: (frame, signal) => this.requestOf(frame, req, connectionId, signal, credentials),
        onSettled: () => this.callSettled(),
      }),
      outgoing: new OutgoingCalls({
        send,
        isOpen,
        requestTimeoutMs: this.reverseRequestTimeoutMs,
        streamWindow: 64,
        idPrefix: "r:",
        logger: this.logger,
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
        writeLog(this.logger, "error", "Connect handler error", { transport: this.name, connectionId, error }, "[WebSocket] Connect handler error:", error);
      }
    }

    // A pong answers the ping of the heartbeat
    ws.on("pong", () => this.missedPongs.set(ws, 0));

    // Handle messages
    ws.on("message", async (data: Buffer) => {
      try {
        await this.handleMessage(ws, data, req, connectionId);
      } catch (error) {
        writeLog(this.logger, "error", "Message handling error", { transport: this.name, connectionId, error }, "[WebSocket] Message handling error:", error);
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
      this.callSettled();
      this.eventTransports.delete(connectionId);
      const conn = this.trackedConnections.get(connectionId);
      if (conn) {
        this.trackedConnections.delete(connectionId);
        // Emit disconnect event
        for (const handler of this.disconnectHandlers) {
          try {
            handler(conn);
          } catch (error) {
            writeLog(this.logger, "error", "Disconnect handler error", { transport: this.name, connectionId, error }, "[WebSocket] Disconnect handler error:", error);
          }
        }
      }
    });

    // Handle errors. The socket emits "close" after "error": the close handler does the
    // cleanup and the disconnect event (deep dive TRN-16: before, this handler removed the
    // connection first, so the close handler found nothing and sent no disconnect event).
    ws.on("error", (error: Error) => {
      writeLog(this.logger, "error", "Connection error", { transport: this.name, connectionId, error }, "[WebSocket] Connection error:", error);
    });
  }

  /**
   * The server request of a `request` frame of a connection: the metadata of the frame and of the
   * connection, the signal of the call, and the credentials of the upgrade (roadmap R18).
   */
  private requestOf(
    frame: WebSocketMessage,
    req: IncomingMessage,
    connectionId: string,
    signal: AbortSignal,
    credentials: ServerRequest["credentials"]
  ): ServerRequest {
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
        headers: withoutSecretHeaders(req.headers as Record<string, unknown>, this.secretHeaders),
      },
      signal,
      // The face of the request, for the error policy of the server (CLI-80)
      transport: "websocket",
      // The credentials of the connection: the bearer token of its upgrade (R18), its cookies,
      // its headers and its query (CLI-2a)
      credentials,
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
    // After stopIntake(), a new call goes to another server or comes again later
    if (this.intakeStopped && message.type === "request") {
      this.sendError(ws, message.id || "unknown", "The server is stopping", "UNAVAILABLE", true);
      return;
    }
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
  private sendError(ws: WebSocket, id: string, message: string, code = "INTERNAL_ERROR", retryable = false): void {
    const errorMessage: WebSocketMessage = {
      id,
      type: "error",
      status: {
        type: "error",
        code,
        message,
        retryable,
      },
      error: {
        code,
        message,
        retryable,
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
    return subscribeRemote<T>(this.eventTransportFor(connectionId), topics, handler, options, { resubscribe: false });
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
    return remoteEvents<T>(this.eventTransportFor(connectionId), topics, options, { resubscribe: false });
  }

  /**
   * The transport of the remote events of a connection: the same object for each subscription of
   * a tracked connection. The close of the connection removes it.
   */
  private eventTransportFor(connectionId: string): Transport {
    if (!this.trackedConnections.has(connectionId)) return this.transportFor(connectionId);
    let transport = this.eventTransports.get(connectionId);
    if (!transport) {
      transport = this.transportFor(connectionId);
      this.eventTransports.set(connectionId, transport);
    }
    return transport;
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
