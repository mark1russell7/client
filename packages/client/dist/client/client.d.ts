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
 *
 * // Context passing via withContext() and per-call options
 * const authedClient = client.withContext({ auth: { token: "user-token" } });
 * await authedClient.call(method, payload, { context: { retry: { maxAttempts: 5 } } });
 * ```
 */
import type { Transport, Method, Metadata, ClientMiddleware, ClientOptions, TypedClientMiddleware } from "./types";
import type { CallOptions, ClientContextInput } from "./context";
import type { ZodLike } from "./validation/types";
import type { Route, CallRequest, CallResponse, StreamingCallResponse } from "./call-types";
import type { ProcedureRegistry } from "../procedures/registry";
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
    /**
     * Context values set via withContext().
     * Merged with parent context when creating child clients.
     */
    private readonly clientContext;
    /**
     * Parent client reference (for context inheritance).
     * When set, middleware and transport are shared, only context differs.
     */
    private readonly parent?;
    constructor(options: ClientOptions | Transport);
    /**
     * Create a child client from this client (private, for withContext).
     */
    private static createChild;
    /**
     * Create a child client with additional context.
     *
     * Child clients:
     * - Share the middleware chain (cheap to create)
     * - Inherit parent context (merged recursively)
     * - Can override specific context fields
     *
     * Context priority (lowest to highest):
     * 1. Middleware defaults (e.g., maxRetries: 3 from createRetryMiddleware)
     * 2. Parent client context (full inheritance chain)
     * 3. This client's context
     * 4. Per-call context override
     *
     * @param context - Context to set/override on the child client
     * @returns New client with accumulated context
     *
     * @example
     * ```typescript
     * // Create authenticated child client
     * const authedClient = client.withContext({
     *   auth: { token: "user-token" },
     *   timeout: { overall: 5000 }
     * });
     *
     * // Nested children inherit and can override
     * const adminClient = authedClient.withContext({
     *   auth: { token: "admin-token" },  // Overrides parent token
     *   // timeout inherited from parent
     * });
     * ```
     */
    withContext<TAdditional extends object = {}>(context: TAdditional & ClientContextInput<TContext>): Client<TContext & TAdditional>;
    /**
     * Get effective context by merging entire parent chain.
     *
     * @returns Merged context from all ancestors plus this client
     */
    private getEffectiveContext;
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
     * @param options - Call options (context override, metadata, signal, schema)
     *                  OR legacy Metadata object for backward compatibility
     * @returns Response payload
     * @throws {ClientError} if response has error status (when throwOnError=true)
     *
     * @example
     * ```typescript
     * // Simple call
     * const user = await client.call(
     *   { service: "users", operation: "get" },
     *   { id: 123 }
     * );
     *
     * // With context override
     * const user = await client.call(
     *   { service: "users", operation: "get" },
     *   { id: 123 },
     *   { context: { timeout: { overall: 10000 } } }
     * );
     * ```
     */
    call<TReq, TRes>(method: Method, payload: TReq, options?: CallOptions<TContext> | Metadata): Promise<TRes>;
    /**
     * Make a streaming RPC call.
     *
     * Returns an async iterable that yields response payloads.
     * For single request/response, yields exactly one item.
     *
     * @param method - Method to invoke
     * @param payload - Request payload
     * @param options - Call options (context override, metadata, signal, schema)
     *                  OR legacy Metadata object for backward compatibility
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
     *
     * // With context and signal
     * const controller = new AbortController();
     * for await (const event of client.stream(
     *   { service: "events", operation: "watch" },
     *   { topic: "orders" },
     *   { context: { timeout: { overall: 30000 } }, signal: controller.signal }
     * )) {
     *   console.log(event);
     * }
     * ```
     */
    stream<TReq, TRes>(method: Method, payload: TReq, options?: CallOptions<TContext> | Metadata): AsyncIterable<TRes>;
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
    /**
     * Cached reference to Zod middleware for schema registration.
     */
    private zodMiddleware;
    /**
     * Register a validation schema for a specific method.
     *
     * Requires `createZodMiddleware()` to be added via `.use()` first.
     * Schemas are used to validate request payloads before sending and
     * response payloads after receiving.
     *
     * @param method - Method to register schema for
     * @param schemas - Input and/or output Zod schemas
     * @returns this (for chaining)
     *
     * @example
     * ```typescript
     * import { z } from "zod";
     *
     * const client = new Client({ transport })
     *   .use(createZodMiddleware())
     *   .schema({ service: "users", operation: "get" }, {
     *     input: z.object({ id: z.string() }),
     *     output: z.object({ id: z.string(), name: z.string() }),
     *   })
     *   .schema({ service: "users", operation: "create" }, {
     *     input: UserCreateSchema,
     *     output: UserSchema,
     *   });
     *
     * // Validation happens automatically on call
     * const user = await client.call(
     *   { service: "users", operation: "get" },
     *   { id: "123" }  // Validated against input schema
     * );
     * // Response validated against output schema
     * ```
     */
    schema<TInput extends ZodLike = ZodLike, TOutput extends ZodLike = ZodLike>(method: Method, schemas: {
        input?: TInput;
        output?: TOutput;
    }): this;
    /**
     * Find Zod middleware in the middleware chain.
     */
    private findZodMiddleware;
    /**
     * Procedure registry for route resolution.
     * Uses global registry by default.
     */
    private procedureRegistry;
    /**
     * Route resolver instance (lazy initialized).
     */
    private routeResolver;
    /**
     * Batch executor instance (lazy initialized).
     */
    private batchExecutor;
    /**
     * Set a custom procedure registry for this client.
     *
     * @param registry - Procedure registry to use
     * @returns this (for chaining)
     */
    useRegistry(registry: ProcedureRegistry): this;
    /**
     * Make a call using the nested route API.
     *
     * This method supports:
     * - Per-call middleware overrides
     * - Batch execution with configurable strategies
     * - Type-safe nested route structures
     *
     * @param request - Call request with route and options
     * @returns Response mirroring the route structure
     *
     * @example
     * ```typescript
     * // Single route call
     * const result = await client.route({
     *   route: {
     *     collections: {
     *       users: {
     *         get: { id: "123" }
     *       }
     *     }
     *   }
     * });
     * // result.collections.users.get.data = { id: "123", name: "John" }
     *
     * // Batched call with middleware overrides
     * const results = await client.route({
     *   middlewares: {
     *     retry: { attempts: 3 },
     *     timeout: { ms: 5000 }
     *   },
     *   batch: { strategy: 'all' },
     *   route: {
     *     collections: {
     *       users: { get: { id: "123" } },
     *       orders: { list: { userId: "123" } }
     *     },
     *     weather: {
     *       forecast: { city: "NYC", days: 5 }
     *     }
     *   }
     * });
     * ```
     */
    route<TRoute extends Route>(request: CallRequest<TRoute>): Promise<CallResponse<TRoute>>;
    /**
     * Make a streaming call using the nested route API.
     *
     * Returns an async iterator that yields results as they complete,
     * plus a promise for the final complete response.
     *
     * @param request - Call request (batch.strategy should be 'stream')
     * @returns Streaming response with iterator and completion promise
     */
    routeStream<TRoute extends Route>(request: CallRequest<TRoute>): StreamingCallResponse<TRoute>;
    /**
     * Get the route resolver (lazy initialization).
     */
    private getRouteResolver;
    /**
     * Get the batch executor (lazy initialization).
     */
    private getBatchExecutor;
    /**
     * Create execution context from call request.
     */
    private createExecutionContext;
    /**
     * Execute a single procedure call.
     * Used by BatchExecutor.
     */
    private executeProcedure;
    /**
     * Convert procedure path to Method object.
     */
    private pathToMethod;
}
//# sourceMappingURL=client.d.ts.map