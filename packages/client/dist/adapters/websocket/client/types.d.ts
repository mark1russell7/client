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
    /**
     * Handler for server-initiated procedure calls.
     * Called when the server wants to call a procedure on this client.
     */
    onServerRequest?: ServerRequestHandler;
    /**
     * Handler for subscription events.
     * Called when the server pushes an event to a subscribed topic.
     */
    onEvent?: EventHandler;
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
    type: "request" | "response" | "error" | "stream" | "ping" | "pong" | "server-request" | "server-response" | "event";
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
export type ServerRequestHandler = (path: string[], input: unknown) => Promise<unknown>;
/**
 * Handler for subscription events.
 */
export type EventHandler = (topic: string, data: unknown, subscriptionId: string) => void;
//# sourceMappingURL=types.d.ts.map