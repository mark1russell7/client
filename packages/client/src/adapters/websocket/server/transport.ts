/**
 * WebSocket Server Transport Implementation
 *
 * Adapts WebSocket connections to unified RPC format.
 * Supports bidirectional streaming and persistent connections.
 */

import type { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { ServerTransport, ServerRequest, ServerResponse } from "../../../server/types.js";
import type { Server } from "../../../server/server.js";
import type {
  WebSocketServerTransportOptions,
  WebSocketMessage,
  TrackedConnection,
  ConnectionEventHandler,
} from "./types.js";

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
interface PendingRequest {
  id: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class WebSocketServerTransport implements ServerTransport {
  readonly name = "websocket";

  private wss: WebSocketServer | null = null;
  private options: Required<
    Omit<WebSocketServerTransportOptions, "authenticate" | "onConnection">
  > & {
    authenticate?: WebSocketServerTransportOptions["authenticate"];
    onConnection?: WebSocketServerTransportOptions["onConnection"];
  };
  private server: Server;
  private connections: Set<WebSocket> = new Set();

  // Tracked connections with IDs for bidirectional RPC
  private trackedConnections = new Map<string, TrackedConnection>();
  private pendingRequests = new Map<string, PendingRequest>();
  private connectionCounter = 0;

  // Connection lifecycle event handlers
  private connectHandlers: ConnectionEventHandler[] = [];
  private disconnectHandlers: ConnectionEventHandler[] = [];

  constructor(server: Server, options: WebSocketServerTransportOptions) {
    this.server = server;
    this.options = {
      server: options.server,
      path: options.path ?? "/ws",
      authenticate: options.authenticate,
      onConnection: options.onConnection,
      perMessageDeflate: options.perMessageDeflate ?? false,
      maxPayload: options.maxPayload ?? 1024 * 1024, // 1MB default
      clientTracking: options.clientTracking ?? true,
    };
  }

  async start(): Promise<void> {
    // Create WebSocket server
    this.wss = new WebSocketServer({
      server: this.options.server,
      path: this.options.path,
      perMessageDeflate: this.options.perMessageDeflate,
      maxPayload: this.options.maxPayload,
      clientTracking: this.options.clientTracking,
      verifyClient: this.options.authenticate
        ? async ({ req }: { req: IncomingMessage }, callback: (result: boolean) => void) => {
            try {
              const allowed = await this.options.authenticate!(req);
              callback(allowed);
            } catch (error) {
              console.error("[WebSocket] Authentication error:", error);
              callback(false);
            }
          }
        : undefined,
    });

    // Handle connections
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    console.log(`[${this.name}] WebSocket server listening on ${this.options.path}`);
  }

  async stop(): Promise<void> {
    if (this.wss) {
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
        headers: req.headers,
      },
    };
    this.trackedConnections.set(connectionId, trackedConnection);

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

    // Handle errors
    ws.on("error", (error: Error) => {
      console.error("[WebSocket] Connection error:", error);
      this.connections.delete(ws);
      this.trackedConnections.delete(connectionId);
    });
  }

  /**
   * Handle WebSocket message.
   */
  private async handleMessage(
    ws: WebSocket,
    data: Buffer,
    req: IncomingMessage,
    connectionId: string
  ): Promise<void> {
    // Parse message
    let message: WebSocketMessage;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      this.sendError(ws, "unknown", "Invalid JSON message");
      return;
    }

    // Handle ping (client heartbeat)
    if (message.type === "ping") {
      const pong: WebSocketMessage = {
        id: message.id,
        type: "pong",
      };
      this.send(ws, pong);
      return;
    }

    // Handle pong (response to our ping)
    if (message.type === "pong") {
      // Just acknowledge, no action needed
      return;
    }

    // Handle server-response (response to server-initiated request)
    if (message.type === "server-response") {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Validate request message
    if (!message.id || message.type !== "request" || !message.method) {
      this.sendError(ws, message.id || "unknown", "Invalid message format");
      return;
    }

    // Convert to ServerRequest
    const serverRequest: ServerRequest = {
      id: message.id,
      method: message.method,
      payload: message.payload || {},
      metadata: {
        ...message.metadata,
        // Add connection info
        connectionId,
        remoteAddress: req.socket.remoteAddress,
        headers: req.headers,
      },
    };

    try {
      // Process through universal server
      const serverResponse = await this.server.handle(serverRequest);

      // Send response
      this.sendResponse(ws, serverResponse);
    } catch (error) {
      console.error("[WebSocket] Request handling error:", error);
      this.sendError(
        ws,
        message.id,
        error instanceof Error ? error.message : "Internal server error"
      );
    }
  }

  /**
   * Send response to client.
   */
  private sendResponse(ws: WebSocket, response: ServerResponse): void {
    const message: WebSocketMessage = {
      id: response.id,
      type: response.status.type === "success" ? "response" : "error",
      payload: response.payload,
      metadata: response.metadata,
      status: response.status,
    };

    if (response.status.type === "error") {
      message.error = {
        code: response.status.code,
        message: response.status.message || "Unknown error",
        retryable: response.status.retryable,
      };
    }

    this.send(ws, message);
  }

  /**
   * Send error to client.
   */
  private sendError(ws: WebSocket, id: string, message: string): void {
    const errorMessage: WebSocketMessage = {
      id,
      type: "error",
      status: {
        type: "error",
        code: "INTERNAL_ERROR",
        message,
        retryable: false,
      },
      error: {
        code: "INTERNAL_ERROR",
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
   * Call a procedure on a specific client (server-to-client RPC).
   * Returns a promise that resolves with the client's response.
   */
  callClient(
    connectionId: string,
    path: string[],
    input: unknown,
    timeout = 30000
  ): Promise<unknown> {
    const conn = this.trackedConnections.get(connectionId);
    if (!conn) {
      return Promise.reject(new Error(`Connection not found: ${connectionId}`));
    }

    const requestId = `sreq_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        id: requestId,
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      const message: WebSocketMessage = {
        type: "server-request",
        id: requestId,
        path,
        input,
      };

      this.send(conn.socket, message);
    });
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
