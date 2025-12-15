/**
 * WebSocket Client Transport Implementation
 *
 * Provides persistent bidirectional RPC over WebSocket.
 * Supports automatic reconnection, heartbeats, and streaming.
 */
import type { Transport, Message, ResponseItem } from "../../../client/types.js";
import type { WebSocketTransportOptions } from "./types.js";
import { WebSocketState } from "./types.js";
/**
 * WebSocket client transport.
 *
 * Persistent connection for real-time RPC communication.
 *
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: "ws://localhost:3000/ws",
 *   reconnect: {
 *     enabled: true,
 *     maxAttempts: 10
 *   }
 * });
 *
 * const client = new Client({ transport });
 * ```
 */
export declare class WebSocketTransport implements Transport {
    readonly name = "websocket";
    private ws;
    private state;
    private options;
    private pendingRequests;
    private reconnectAttempts;
    private reconnectTimer;
    private heartbeatTimer;
    private heartbeatTimeout;
    constructor(options: WebSocketTransportOptions);
    /**
     * Connect to WebSocket server.
     */
    private connect;
    /**
     * Handle WebSocket close.
     */
    private handleClose;
    /**
     * Schedule reconnection with exponential backoff.
     */
    private scheduleReconnect;
    /**
     * Start heartbeat to keep connection alive.
     */
    private startHeartbeat;
    /**
     * Stop heartbeat.
     */
    private stopHeartbeat;
    /**
     * Handle incoming message.
     */
    private handleMessage;
    /**
     * Create async iterable from array.
     */
    private createAsyncIterable;
    /**
     * Send RPC request over WebSocket.
     */
    send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
    /**
     * Wait for WebSocket connection.
     */
    private waitForConnection;
    /**
     * Close WebSocket connection.
     */
    close(): Promise<void>;
    /**
     * Get current connection state.
     */
    getState(): WebSocketState;
    /**
     * Check if connected.
     */
    isConnected(): boolean;
}
//# sourceMappingURL=transport.d.ts.map