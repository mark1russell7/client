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
import { ClientError } from "./types";
import { compose } from "../middleware/compose";
/**
 * Generate a unique message ID.
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
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
export class Client {
    transport;
    middleware = [];
    defaultMetadata;
    throwOnError;
    constructor(options) {
        // Support both new Client(transport) and new Client({ transport, ... })
        if ("send" in options && typeof options.send === "function") {
            // Direct transport passed - narrow to Transport type
            const transport = options;
            this.transport = transport;
            this.defaultMetadata = {};
            this.throwOnError = true;
        }
        else {
            // Options object - narrow to ClientOptions type
            const opts = options;
            this.transport = opts.transport;
            this.defaultMetadata = opts.defaultMetadata || {};
            this.throwOnError = opts.throwOnError !== false;
        }
    }
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
    use(middleware) {
        this.middleware.push(middleware);
        // Cast is safe because we're just adding type information
        // Runtime behavior is unchanged
        return this;
    }
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
    async call(method, payload, metadata) {
        const stream = this.stream(method, payload, metadata);
        const iterator = stream[Symbol.asyncIterator]();
        const { value, done } = await iterator.next();
        if (done || !value) {
            throw new Error("No response received from stream");
        }
        return value;
    }
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
    async *stream(method, payload, metadata) {
        // Create message
        const message = {
            id: generateId(),
            method,
            payload,
            metadata: {
                ...this.defaultMetadata,
                ...metadata,
            },
        };
        // Compose middleware chain
        const runner = this.composeMiddleware();
        // Execute through middleware chain
        const context = { message };
        const responseStream = runner(context);
        // Yield payloads, handling errors
        for await (const item of responseStream) {
            if (item.status.type === "error" && this.throwOnError) {
                throw new ClientError(item.status, item.id);
            }
            yield item.payload;
        }
    }
    /**
     * Compose middleware chain using universal middleware composition.
     *
     * @returns Composed runner function
     * @private
     */
    composeMiddleware() {
        // Innermost function: call transport
        const self = this;
        const transportRunner = async function* (context) {
            yield* self.transport.send(context.message);
        };
        // Use universal middleware composition
        // compose(...middleware, finalRunner) applies middleware in order (onion model)
        return compose(...this.middleware, transportRunner);
    }
    /**
     * Get transport name.
     */
    get transportName() {
        return this.transport.name;
    }
    /**
     * Close client and cleanup transport resources.
     */
    async close() {
        await this.transport.close();
    }
}
//# sourceMappingURL=client.js.map