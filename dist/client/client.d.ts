/**
 * Universal Client
 *
 * Protocol-agnostic RPC client with middleware composition.
 * Works with any transport: HTTP, gRPC, WebSocket, or local.
 *
 * The Client class is generic over its accumulated context type, enabling
 * compile-time validation of middleware chains. Each call to `use()` returns
 * a new type that includes the middleware's provided context.
 *
 * @example
 * ```typescript
 * // Type accumulates as middleware is added
 * const client = new Client(transport)
 *   .use(createRetryMiddleware())     // Client<BaseContext & RetryContext>
 *   .use(createCacheMiddleware())     // Client<... & CacheContext>
 *   .use(createAuthMiddleware(...))   // Client<... & AuthContext>
 *
 * // Middleware requiring context validates at compile time
 * client.use(middlewareThatRequiresAuth); // OK if AuthContext is in chain
 * ```
 */
import type { Transport, Method, Metadata, ClientMiddleware, ClientOptions, TypedClientMiddleware } from "./types";
/**
 * Universal Client for protocol-agnostic RPC.
 *
 * Features:
 * - Works with any transport (HTTP, gRPC, WebSocket, local)
 * - Middleware composition (retry, cache, timeout, custom)
 * - Stream-first API (single response = stream with 1 item)
 * - Type-safe request/response handling
 * - **Type-accumulating middleware**: Context types build through `use()` calls
 *
 * @typeParam TContext - Accumulated context type from applied middleware.
 *   Starts as `{}` and grows as middleware is added via `use()`.
 *
 * @example
 * ```typescript
 * // HTTP client with type-accumulating middleware
 * const client = new Client({ transport: new HttpTransport({ baseUrl: "/api" }) })
 *   .use(createRetryMiddleware())    // Client<{} & RetryContext>
 *   .use(createCacheMiddleware())    // Client<{} & RetryContext & CacheContext>
 *   .use(createAuthMiddleware({      // Client<... & AuthContext>
 *     token: "abc123"
 *   }));
 *
 * // The client type now carries all middleware context
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
export declare class Client<TContext = {}> {
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
     * **Type Accumulation**: When using `TypedClientMiddleware`, the return type
     * accumulates the middleware's provided context. This enables compile-time
     * validation of middleware chains.
     *
     * @typeParam TProvides - Context type this middleware provides
     * @typeParam TRequires - Context type this middleware requires (must be subset of TContext)
     * @param middleware - Middleware function (typed or untyped)
     * @returns Client with accumulated context type
     *
     * @example
     * ```typescript
     * // Type accumulation example
     * const client = new Client(transport)
     *   .use(createTimeoutMiddleware({ overall: 5000 }))  // Client<TimeoutContext>
     *   .use(createRetryMiddleware())                     // Client<TimeoutContext & RetryContext>
     *   .use(createCacheMiddleware());                    // Client<... & CacheContext>
     *
     * // Middleware ordering (onion model)
     * client
     *   .use(timeoutMiddleware())   // Outer: handles timeouts
     *   .use(retryMiddleware())     // Middle: handles retries
     *   .use(cacheMiddleware());    // Inner: handles caching
     * ```
     */
    use<TProvides = {}, TRequires extends TContext = TContext>(middleware: TypedClientMiddleware<TProvides, TRequires> | ClientMiddleware): Client<TContext & TProvides>;
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