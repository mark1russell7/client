/**
 * Universal Client Type System
 *
 * Protocol-agnostic abstractions for RPC communication.
 * These types work across HTTP, gRPC, WebSocket, and local transports.
 */
import type { ErrorMetadata } from "./errors";
/**
 * Method identifier using structured data (no string parsing needed).
 *
 * @example
 * ```typescript
 * { service: "users", operation: "get" }
 * { service: "orders", operation: "create", version: "v2" }
 * ```
 */
export interface Method {
    /** Service name (e.g., "users", "orders", "payments") */
    service: string;
    /** Operation name (e.g., "get", "create", "update", "delete", "watch") */
    operation: string;
    /** Optional version (e.g., "v1", "v2") */
    version?: string;
}
/**
 * Protocol-agnostic metadata container.
 *
 * Adapters convert this to protocol-specific formats:
 * - HTTP: Headers
 * - gRPC: Metadata
 * - WebSocket: Frames
 */
export interface Metadata {
    /** Distributed tracing context */
    tracing?: {
        traceId: string;
        spanId: string;
        parentSpanId?: string;
    };
    /** Authentication/authorization context */
    auth?: {
        token?: string;
        apiKey?: string;
        userId?: string;
        [key: string]: unknown;
    };
    /** Timeout configuration */
    timeout?: {
        /** Overall request timeout in milliseconds */
        overall?: number;
        /** Per-attempt timeout in milliseconds (for retries) */
        perAttempt?: number;
    };
    /** Retry context (populated by retry middleware) */
    retry?: {
        attempt: number;
        maxAttempts: number;
    };
    /** Extensible for custom fields */
    [key: string]: unknown;
}
/**
 * Universal request message.
 *
 * Sent to transport for execution.
 */
export interface Message<TPayload = unknown> {
    /** Unique request correlation ID */
    id: string;
    /** Method to invoke */
    method: Method;
    /** Request payload (body) */
    payload: TPayload;
    /** Request metadata (headers, context, etc.) */
    metadata: Metadata;
    /** Cancellation signal */
    signal?: AbortSignal;
}
/**
 * Universal response status.
 *
 * Protocol-agnostic success/error indication with rich error metadata.
 *
 * @example
 * ```typescript
 * // Success status
 * const successStatus: Status = {
 *   type: "success",
 *   code: 200,
 * };
 *
 * // Error status with rich metadata
 * const errorStatus: Status = {
 *   type: "error",
 *   code: "TIMEOUT",
 *   message: "Request timed out",
 *   retryable: true,
 *   metadata: {
 *     summary: "Request timed out",
 *     detail: "The request exceeded the configured timeout duration...",
 *     userMessage: "The request took too long to complete. Please try again.",
 *     devMessage: "Request exceeded timeout threshold...",
 *     suggestions: ["Try again with a longer timeout", ...],
 *     category: "timeout",
 *     severity: "warning",
 *     // ... full ErrorMetadata
 *   },
 * };
 * ```
 */
export type Status = {
    type: "success";
    code: number;
} | {
    type: "error";
    code: string;
    message: string;
    retryable: boolean;
    /** Rich error metadata (optional but highly recommended) */
    metadata?: ErrorMetadata;
};
/**
 * Single response item from a stream.
 *
 * Streaming responses yield multiple items.
 * Request/response yields exactly one item.
 */
export interface ResponseItem<TPayload = unknown> {
    /** Correlates with request ID */
    id: string;
    /** Response status */
    status: Status;
    /** Response payload (body) */
    payload: TPayload;
    /** Response metadata (headers, timing, etc.) */
    metadata: Metadata;
}
/**
 * Transport interface - protocol-specific implementation.
 *
 * All responses are streams:
 * - Single response = stream with 1 item
 * - Streaming response = stream with N items
 */
export interface Transport {
    /** Transport name (e.g., "http", "grpc", "websocket", "local") */
    readonly name: string;
    /**
     * Send a message and receive response stream.
     *
     * @param message - Request message
     * @returns Async iterable of response items
     */
    send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
    /**
     * Close transport and cleanup resources.
     */
    close(): Promise<void>;
}
/**
 * Middleware context for universal client.
 *
 * Contains the message being sent.
 */
export interface ClientContext<TReq = unknown> {
    message: Message<TReq>;
}
/**
 * Client middleware runner function type.
 *
 * Takes context and returns async iterable of response items.
 */
export type ClientRunner<TReq = unknown, TRes = unknown> = (context: ClientContext<TReq>) => AsyncIterable<ResponseItem<TRes>>;
/**
 * Universal client middleware.
 *
 * Uses the universal middleware system from common/src/middleware.
 * Note: Uses TAsync=false because AsyncIterable is not wrapped in Promise.
 *
 * Works across all transport types!
 *
 * @example
 * ```typescript
 * const myMiddleware: ClientMiddleware = (next) => {
 *   return async function* (context) {
 *     // Before
 *     console.log('Sending:', context.message);
 *
 *     // Execute
 *     yield* next(context);
 *
 *     // After
 *     console.log('Complete');
 *   };
 * };
 * ```
 */
export type ClientMiddleware<TReq = unknown, TRes = unknown> = (next: ClientRunner<TReq, TRes>) => ClientRunner<TReq, TRes>;
/**
 * Typed client middleware with context tracking.
 *
 * This type enables compile-time validation of middleware chains by tracking
 * what context each middleware provides and requires.
 *
 * Type parameters:
 * - TProvides: The context type this middleware adds to the chain
 * - TRequires: The context type this middleware requires to be present
 *
 * When composing middleware with Client.use():
 * - TProvides is accumulated into the Client's context type
 * - TRequires is validated against the accumulated context
 * - If TRequires is not satisfied, TypeScript reports an error
 *
 * @example
 * ```typescript
 * // Retry middleware provides retry context, requires nothing
 * type RetryMiddleware = TypedClientMiddleware<RetryContext, {}>;
 *
 * // A logging middleware that requires retry context
 * type RetryLoggerMiddleware = TypedClientMiddleware<{}, RetryContext>;
 *
 * // Valid: retry provides what retryLogger requires
 * client.use(retryMiddleware).use(retryLoggerMiddleware);
 *
 * // Error: retryLogger requires retry context not yet provided
 * client.use(retryLoggerMiddleware);
 * ```
 */
export type TypedClientMiddleware<TProvides = {}, TRequires = {}, TReq = unknown, TRes = unknown> = ClientMiddleware<TReq, TRes> & {
    /**
     * Phantom type brand for context this middleware provides.
     * This property doesn't exist at runtime, only at compile time.
     */
    readonly __provides?: TProvides;
    /**
     * Phantom type brand for context this middleware requires.
     * This property doesn't exist at runtime, only at compile time.
     */
    readonly __requires?: TRequires;
};
/**
 * Extract the provides type from a typed middleware.
 */
export type MiddlewareProvides<T> = T extends TypedClientMiddleware<infer P, any, any, any> ? P : {};
/**
 * Extract the requires type from a typed middleware.
 */
export type MiddlewareRequires<T> = T extends TypedClientMiddleware<any, infer R, any, any> ? R : {};
/**
 * Validate that a middleware's requirements are satisfied by accumulated context.
 * Returns the middleware type if valid, `never` if invalid.
 */
export type ValidateMiddleware<TMiddleware extends TypedClientMiddleware<any, any, any, any>, TAccumulatedContext> = MiddlewareRequires<TMiddleware> extends TAccumulatedContext ? TMiddleware : never;
/**
 * Accumulate context type after applying a middleware.
 * Combines accumulated context with what the middleware provides.
 */
export type AccumulateContext<TMiddleware extends TypedClientMiddleware<any, any, any, any>, TAccumulatedContext> = TAccumulatedContext & MiddlewareProvides<TMiddleware>;
/**
 * Client error thrown when response has error status.
 */
export declare class ClientError extends Error {
    readonly status: Extract<Status, {
        type: "error";
    }>;
    readonly responseId: string;
    constructor(status: Extract<Status, {
        type: "error";
    }>, responseId: string);
    get code(): string;
    get retryable(): boolean;
}
/**
 * Options for creating a client.
 */
export interface ClientOptions {
    /** Transport implementation */
    transport: Transport;
    /** Default metadata applied to all requests */
    defaultMetadata?: Metadata;
    /** Whether to throw on error responses (default: true) */
    throwOnError?: boolean;
}
//# sourceMappingURL=types.d.ts.map