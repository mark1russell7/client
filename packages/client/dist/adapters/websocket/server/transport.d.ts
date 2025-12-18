/**
 * WebSocket Server Transport Implementation
 *
 * Adapts WebSocket connections to unified RPC format.
 * Supports bidirectional streaming and persistent connections.
 */
import type { ServerTransport } from "../../../server/types.js";
import type { Server } from "../../../server/server.js";
import type { WebSocketServerTransportOptions, WebSocketMessage, TrackedConnection, ConnectionEventHandler } from "./types.js";
export declare class WebSocketServerTransport implements ServerTransport {
    readonly name = "websocket";
    private wss;
    private options;
    private server;
    private connections;
    private trackedConnections;
    private pendingRequests;
    private connectionCounter;
    private connectHandlers;
    private disconnectHandlers;
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
    /**
     * Get all tracked connections.
     */
    getTrackedConnections(): TrackedConnection[];
    /**
     * Get a specific tracked connection by ID.
     */
    getTrackedConnection(connectionId: string): TrackedConnection | undefined;
    /**
     * Send a message to a specific connection.
     */
    sendToConnection(connectionId: string, message: WebSocketMessage): void;
    /**
     * Call a procedure on a specific client (server-to-client RPC).
     * Returns a promise that resolves with the client's response.
     */
    callClient(connectionId: string, path: string[], input: unknown, timeout?: number): Promise<unknown>;
    /**
     * Register a handler for new connections.
     * Returns a function to unregister the handler.
     */
    onConnect(handler: ConnectionEventHandler): () => void;
    /**
     * Register a handler for disconnections.
     * Returns a function to unregister the handler.
     */
    onDisconnect(handler: ConnectionEventHandler): () => void;
    /**
     * Update metadata for a tracked connection.
     */
    updateConnectionMetadata(connectionId: string, metadata: Record<string, unknown>): void;
    /**
     * Set discovered procedures for a tracked connection.
     */
    setConnectionProcedures(connectionId: string, procedures: string[]): void;
}
//# sourceMappingURL=transport.d.ts.map