/**
 * Universal Client
 *
 * Protocol-agnostic RPC client with middleware composition.
 * Works with any transport: HTTP, gRPC, WebSocket, or local.
 */
import type { Transport, Method, Metadata, ClientMiddleware, ClientOptions } from "./types";
/**
 * Universal Client for protocol-agnostic RPC.
 *
 * Features:
 * - Works with any transport (HTTP, gRPC, WebSocket, local)
 * - Middleware composition (retry, cache, timeout, custom)
 * - Stream-first API (single response = stream with 1 item)
 * - Type-safe request/response handling
 *
 * @example
 * ```typescript
 * // HTTP client
 * const client = new Client({ transport: new HttpTransport({ baseUrl: "/api" }) });
 * client.use(retryMiddleware());
 * client.use(cacheMiddleware());
 *
 * const user = await client.call(
 *   { service: "users", operation: "get" },
 *   { id: 123 }
 * );
 *
 * // Streaming
 * for await (const event of client.stream(
 *   { service: "events", operation: "watch" },
 *   { topic: "orders" }
 * )) {
 *   console.log(event);
 * }
 * ```
 */
export declare class Client {
    private readonly transport;
    private readonly middleware;
    private readonly defaultMetadata;
    private readonly throwOnError;
    constructor(options: ClientOptions | Transport);
    /**
     * Add middleware to the client.
     *
     * Middleware is composed in the order added (onion model):
     * - First added = outermost layer
     * - Last added = innermost layer (closest to transport)
     *
     * @param middleware - Middleware function
     * @returns this for chaining
     *
     * @example
     * ```typescript
     * client
     *   .use(timeoutMiddleware())   // Outer: handles timeouts
     *   .use(retryMiddleware())     // Middle: handles retries
     *   .use(cacheMiddleware());    // Inner: handles caching
     * ```
     */
    use(middleware: ClientMiddleware): this;
    /**
     * Make a single RPC call (request/response).
     *
     * This is a convenience method that takes the first item from the stream.
     * For streaming responses, use `stream()` instead.
     *
     * @param method - Method to invoke
     * @param payload - Request payload
     * @param metadata - Optional request metadata (merged with defaults)
     * @returns Response payload
     * @throws {ClientError} if response has error status (when throwOnError=true)
     *
     * @example
     * ```typescript
     * const user = await client.call(
     *   { service: "users", operation: "get" },
     *   { id: 123 }
     * );
     * ```
     */
    call<TReq, TRes, TMeta extends Metadata = Metadata>(method: Method, payload: TReq, metadata?: TMeta): Promise<TRes>;
    /**
     * Make a streaming RPC call.
     *
     * Returns an async iterable that yields response payloads.
     * For single request/response, yields exactly one item.
     *
     * @param method - Method to invoke
     * @param payload - Request payload
     * @param metadata - Optional request metadata (merged with defaults)
     * @returns Async iterable of response payloads
     * @throws {ClientError} if any response item has error status (when throwOnError=true)
     *
     * @example
     * ```typescript
     * // Streaming response
     * for await (const event of client.stream(
     *   { service: "events", operation: "watch" },
     *   { topic: "orders" }
     * )) {
     *   console.log(event);
     * }
     * ```
     */
    stream<TReq, TRes>(method: Method, payload: TReq, metadata?: Metadata): AsyncIterable<TRes>;
    /**
     * Compose middleware chain using universal middleware composition.
     *
     * @returns Composed runner function
     * @private
     */
    private composeMiddleware;
    /**
     * Get transport name.
     */
    get transportName(): string;
    /**
     * Close client and cleanup transport resources.
     */
    close(): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map