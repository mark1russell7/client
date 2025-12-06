/**
 * WebSocket Server Transport Types
 *
 * Type definitions for WebSocket server adapter.
 */
import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import type { WebSocket } from "ws";
/**
 * WebSocket authentication handler.
 * Called during WebSocket upgrade to authenticate the connection.
 */
export type WebSocketAuthHandler = (req: IncomingMessage) => Promise<boolean> | boolean;
/**
 * WebSocket connection handler.
 * Called when a new WebSocket connection is established.
 */
export type WebSocketConnectionHandler = (ws: WebSocket, req: IncomingMessage) => void;
/**
 * WebSocket server transport options.
 */
export interface WebSocketServerTransportOptions {
    /**
     * HTTP server to attach WebSocket server to.
     * Required - WebSocket upgrades HTTP connections.
     */
    server: HttpServer;
    /**
     * Path for WebSocket connections.
     * @default "/ws"
     */
    path?: string;
    /**
     * Authentication handler for WebSocket upgrade.
     * Return true to allow connection, false to reject.
     */
    authenticate?: WebSocketAuthHandler;
    /**
     * Connection handler called when client connects.
     */
    onConnection?: WebSocketConnectionHandler;
    /**
     * Enable per-message compression.
     * @default false
     */
    perMessageDeflate?: boolean;
    /**
     * Maximum message size in bytes.
     * @default 1MB
     */
    maxPayload?: number;
    /**
     * Client tracking - track connected clients.
     * @default true
     */
    clientTracking?: boolean;
}
/**
 * WebSocket message format for RPC.
 */
export interface WebSocketMessage<TReq = unknown> {
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
    payload?: TReq;
    /** Metadata (headers, auth, etc.) */
    metadata?: Record<string, unknown>;
    /** Status (for responses) */
    status?: {
        type: "success" | "error";
        code: string | number;
        message?: string;
        retryable?: boolean;
    };
    /** Error details (for error messages) */
    error?: {
        code: string | number;
        message: string;
        retryable?: boolean;
    };
    /** Stream indicator (for streaming responses) */
    stream?: {
        /** Is this the last message in the stream? */
        done: boolean;
    };
}
//# sourceMappingURL=types.d.ts.map