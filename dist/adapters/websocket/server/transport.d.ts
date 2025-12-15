/**
 * WebSocket Server Transport Implementation
 *
 * Adapts WebSocket connections to unified RPC format.
 * Supports bidirectional streaming and persistent connections.
 */
import type { ServerTransport } from "../../../server/types.js";
import type { Server } from "../../../server/server.js";
import type { WebSocketServerTransportOptions, WebSocketMessage } from "./types.js";
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
export declare class WebSocketServerTransport implements ServerTransport {
    readonly name = "websocket";
    private wss;
    private options;
    private server;
    private connections;
    constructor(server: Server, options: WebSocketServerTransportOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    /**
     * Handle new WebSocket connection.
     */
    private handleConnection;
    /**
     * Handle WebSocket message.
     */
    private handleMessage;
    /**
     * Send response to client.
     */
    private sendResponse;
    /**
     * Send error to client.
     */
    private sendError;
    /**
     * Send message to client.
     */
    private send;
    /**
     * Broadcast message to all connected clients.
     */
    broadcast(message: WebSocketMessage): void;
    /**
     * Get number of connected clients.
     */
    getConnectionCount(): number;
}
//# sourceMappingURL=transport.d.ts.map