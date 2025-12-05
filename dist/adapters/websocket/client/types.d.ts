/**
 * WebSocket Client Transport Types
 *
 * Type definitions for WebSocket client adapter.
 */
/**
 * WebSocket client transport options.
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
         * Initial delay before reconnecting (ms).
         * @default 1000
         */
        initialDelay?: number;
        /**
         * Maximum delay between reconnection attempts (ms).
         * @default 30000
         */
        maxDelay?: number;
        /**
         * Backoff multiplier for reconnection delay.
         * @default 1.5
         */
        backoffMultiplier?: number;
    };
    /**
     * Connection timeout (ms).
     * @default 10000
     */
    connectionTimeout?: number;
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
         * Heartbeat interval (ms).
         * @default 30000
         */
        interval?: number;
        /**
         * Heartbeat timeout (ms).
         * @default 5000
         */
        timeout?: number;
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
}
/**
 * WebSocket connection state.
 */
export declare enum WebSocketState {
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    DISCONNECTING = "DISCONNECTING",
    DISCONNECTED = "DISCONNECTED",
    RECONNECTING = "RECONNECTING"
}
/**
 * WebSocket message format for RPC.
 */
export interface WebSocketMessage<T = unknown> {
    /** Message ID for request/response matching */
    id: string;
    /** Message type */
    type: "request" | "response" | "error" | "stream" | "ping" | "pong";
    /** RPC method (for requests) */
    method?: {
        service: string;
        operation: string;
        version?: string;
    };
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
    /** Stream indicator (for streaming responses) */
    stream?: {
        /** Is this the last message in the stream? */
        done: boolean;
    };
}
//# sourceMappingURL=types.d.ts.map