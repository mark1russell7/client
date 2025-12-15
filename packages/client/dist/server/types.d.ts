/**
 * Universal Server Types
 *
 * Protocol-agnostic server types mirroring the client architecture.
 * Enables handling HTTP, WebSocket, gRPC, etc. with unified RPC format.
 */
import type { Metadata, Status, Method } from "../client/types.js";
export type { Method };
/**
 * Server request in unified RPC format.
 * Created by transport adapters from protocol-specific requests.
 */
export interface ServerRequest<TReq = unknown> {
    /** Unique request ID (for correlation, logging) */
    id: string;
    /** RPC method (service, operation, version) */
    method: Method;
    /** Request payload */
    payload: TReq;
    /** Request metadata (headers, query params, etc.) */
    metadata: Metadata;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
}
/**
 * Server response in unified RPC format.
 * Converted by transport adapters to protocol-specific responses.
 */
export interface ServerResponse<TRes = unknown> {
    /** Request ID (for correlation) */
    id: string;
    /** Response status */
    status: Status;
    /** Response payload (only present on success) */
    payload?: TRes;
    /** Response metadata */
    metadata: Metadata;
}
/**
 * Server handler function.
 * Processes requests in unified RPC format.
 */
export type ServerHandler<TReq = unknown, TRes = unknown> = (request: ServerRequest<TReq>) => Promise<ServerResponse<TRes>> | ServerResponse<TRes>;
/**
 * Server middleware context.
 * Passed through middleware chain.
 */
export interface ServerContext<TReq = unknown> {
    /** The incoming request */
    request: ServerRequest<TReq>;
    /** Additional context data (can be set by middleware) */
    state: Record<string, unknown>;
}
/**
 * Server middleware runner.
 * Processes a request and returns a response.
 */
export type ServerRunner<TReq = unknown, TRes = unknown> = (context: ServerContext<TReq>) => Promise<ServerResponse<TRes>>;
/**
 * Server middleware function.
 * Can intercept, modify, or handle requests.
 */
export type ServerMiddleware<TReq = unknown, TRes = unknown> = (next: ServerRunner<TReq, TRes>) => ServerRunner<TReq, TRes>;
/**
 * Server transport adapter interface.
 * Adapts protocol-specific servers to unified RPC format.
 */
export interface ServerTransport {
    /** Transport name (for logging, debugging) */
    readonly name: string;
    /**
     * Start the server transport.
     * Begins listening for incoming requests.
     */
    start(): Promise<void>;
    /**
     * Stop the server transport.
     * Gracefully shuts down and closes connections.
     */
    stop(): Promise<void>;
    /**
     * Check if transport is running.
     */
    isRunning(): boolean;
}
/**
 * Handler not found error.
 */
export declare class HandlerNotFoundError extends Error {
    constructor(method: Method);
}
/**
 * Server error with status code.
 */
export declare class ServerError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(message: string, code?: string, retryable?: boolean);
}
//# sourceMappingURL=types.d.ts.map