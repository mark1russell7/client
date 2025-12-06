/**
 * WebSocket Server Transport Implementation
 *
 * Adapts WebSocket connections to unified RPC format.
 * Supports bidirectional streaming and persistent connections.
 */
import { WebSocketServer, WebSocket } from "ws";
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
export class WebSocketServerTransport {
    name = "websocket";
    wss = null;
    options;
    server;
    connections = new Set();
    constructor(server, options) {
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
    async start() {
        // Create WebSocket server
        this.wss = new WebSocketServer({
            server: this.options.server,
            path: this.options.path,
            perMessageDeflate: this.options.perMessageDeflate,
            maxPayload: this.options.maxPayload,
            clientTracking: this.options.clientTracking,
            verifyClient: this.options.authenticate
                ? async ({ req }, callback) => {
                    try {
                        const allowed = await this.options.authenticate(req);
                        callback(allowed);
                    }
                    catch (error) {
                        console.error("[WebSocket] Authentication error:", error);
                        callback(false);
                    }
                }
                : undefined,
        });
        // Handle connections
        this.wss.on("connection", (ws, req) => {
            this.handleConnection(ws, req);
        });
        console.log(`[${this.name}] WebSocket server listening on ${this.options.path}`);
    }
    async stop() {
        if (this.wss) {
            // Close all connections
            for (const ws of this.connections) {
                ws.close();
            }
            this.connections.clear();
            // Close server
            return new Promise((resolve, reject) => {
                this.wss.close((err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        console.log(`[${this.name}] WebSocket server stopped`);
                        this.wss = null;
                        resolve();
                    }
                });
            });
        }
    }
    isRunning() {
        return this.wss !== null;
    }
    /**
     * Handle new WebSocket connection.
     */
    handleConnection(ws, req) {
        // Track connection
        this.connections.add(ws);
        // Call user connection handler
        if (this.options.onConnection) {
            this.options.onConnection(ws, req);
        }
        // Handle messages
        ws.on("message", async (data) => {
            try {
                await this.handleMessage(ws, data, req);
            }
            catch (error) {
                console.error("[WebSocket] Message handling error:", error);
                this.sendError(ws, "unknown", "Internal server error");
            }
        });
        // Handle close
        ws.on("close", () => {
            this.connections.delete(ws);
        });
        // Handle errors
        ws.on("error", (error) => {
            console.error("[WebSocket] Connection error:", error);
            this.connections.delete(ws);
        });
    }
    /**
     * Handle WebSocket message.
     */
    async handleMessage(ws, data, req) {
        // Parse message
        let message;
        try {
            message = JSON.parse(data.toString());
        }
        catch (error) {
            this.sendError(ws, "unknown", "Invalid JSON message");
            return;
        }
        // Handle ping (client heartbeat)
        if (message.type === "ping") {
            const pong = {
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
        // Validate request message
        if (!message.id || message.type !== "request" || !message.method) {
            this.sendError(ws, message.id || "unknown", "Invalid message format");
            return;
        }
        // Convert to ServerRequest
        const serverRequest = {
            id: message.id,
            method: message.method,
            payload: message.payload || {},
            metadata: {
                ...message.metadata,
                // Add connection info
                remoteAddress: req.socket.remoteAddress,
                headers: req.headers,
            },
        };
        try {
            // Process through universal server
            const serverResponse = await this.server.handle(serverRequest);
            // Send response
            this.sendResponse(ws, serverResponse);
        }
        catch (error) {
            console.error("[WebSocket] Request handling error:", error);
            this.sendError(ws, message.id, error instanceof Error ? error.message : "Internal server error");
        }
    }
    /**
     * Send response to client.
     */
    sendResponse(ws, response) {
        const message = {
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
    sendError(ws, id, message) {
        const errorMessage = {
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
    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    /**
     * Broadcast message to all connected clients.
     */
    broadcast(message) {
        for (const ws of this.connections) {
            this.send(ws, message);
        }
    }
    /**
     * Get number of connected clients.
     */
    getConnectionCount() {
        return this.connections.size;
    }
}
//# sourceMappingURL=transport.js.map