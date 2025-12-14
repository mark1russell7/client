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

import type {
  Transport,
  Method,
  Metadata,
  Message,
  ClientMiddleware,
  ClientContext,
  ClientRunner,
  ClientOptions,
  TypedClientMiddleware,
} from "./types";
import { ClientError } from "./types";
import { compose } from "../middleware/compose";
import type { CallOptions, ClientContextInput } from "./context";
import { mergeContext, normalizeCallOptions } from "./context";
import type { SchemaDefinition, ZodLike } from "./validation/types";
import { methodToKey } from "./validation/types";
import { SCHEMA_REGISTRY, type ZodMiddleware } from "./validation/middleware";

/**
 * Generate a unique message ID.
 */
function generateId(): string {
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
export class Client<TContext = {}> {
  private readonly transport: Transport;
  private readonly middleware: ClientMiddleware[] = [];
  private readonly defaultMetadata: Metadata;
  private readonly throwOnError: boolean;

  /**
   * Context values set via withContext().
   * Merged with parent context when creating child clients.
   */
  private readonly clientContext: Partial<TContext>;

  /**
   * Parent client reference (for context inheritance).
   * When set, middleware and transport are shared, only context differs.
   */
  private readonly parent?: Client<any>;

  constructor(options: ClientOptions | Transport) {
    // Support both new Client(transport) and new Client({ transport, ... })
    if ("send" in options && typeof options.send === "function") {
      // Direct transport passed - narrow to Transport type
      const transport = options as Transport;
      this.transport = transport;
      this.defaultMetadata = {};
      this.throwOnError = true;
    } else {
      // Options object - narrow to ClientOptions type
      const opts = options as ClientOptions;
      this.transport = opts.transport;
      this.defaultMetadata = opts.defaultMetadata || {};
      this.throwOnError = opts.throwOnError !== false;
    }

    // Initialize empty context (child clients override this)
    this.clientContext = {};
  }

  /**
   * Create a child client from this client (private, for withContext).
   */
  private static createChild<TParentContext, TChildContext extends TParentContext>(
    parent: Client<TParentContext>,
    additionalContext: Partial<TChildContext>,
  ): Client<TChildContext> {
    // Create a child with shared middleware chain
    const child = Object.create(Client.prototype) as Client<TChildContext>;

    // Share immutable references (no copying)
    (child as any).transport = parent.transport;
    (child as any).middleware = parent.middleware;
    (child as any).defaultMetadata = parent.defaultMetadata;
    (child as any).throwOnError = parent.throwOnError;

    // Set parent and additional context
    (child as any).parent = parent;
    (child as any).clientContext = additionalContext;

    return child;
  }

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
  withContext<TAdditional extends object = {}>(
    context: TAdditional & ClientContextInput<TContext>,
  ): Client<TContext & TAdditional> {
    return Client.createChild(this, context) as Client<TContext & TAdditional>;
  }

  /**
   * Get effective context by merging entire parent chain.
   *
   * @returns Merged context from all ancestors plus this client
   */
  private getEffectiveContext(): Partial<TContext> {
    if (this.parent) {
      return mergeContext(this.parent.getEffectiveContext(), this.clientContext);
    }
    return this.clientContext;
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
  use<TProvides = {}, TRequires extends TContext = TContext>(
    middleware: TypedClientMiddleware<TProvides, TRequires> | ClientMiddleware,
  ): Client<TContext & TProvides> {
    this.middleware.push(middleware as ClientMiddleware);
    // Cast is safe because we're just adding type information
    // Runtime behavior is unchanged
    return this as unknown as Client<TContext & TProvides>;
  }

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
  async call<TReq, TRes>(
    method: Method,
    payload: TReq,
    options?: CallOptions<TContext> | Metadata,
  ): Promise<TRes> {
    const stream = this.stream(method, payload, options);
    const iterator = stream[Symbol.asyncIterator]();

    const { value, done } = await iterator.next();

    if (done || !value) {
      throw new Error("No response received from stream");
    }

    return value as TRes;
  }

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
  async *stream<TReq, TRes>(
    method: Method,
    payload: TReq,
    options?: CallOptions<TContext> | Metadata,
  ): AsyncIterable<TRes> {
    // Normalize options (backward compatible with legacy Metadata parameter)
    const opts = normalizeCallOptions(options);

    // Merge context: parent chain -> client context -> per-call context
    const effectiveContext = mergeContext(
      this.getEffectiveContext() as object,
      (opts.context ?? {}) as object,
    );

    // Create message with merged context in metadata
    const message: Message<TReq> = {
      id: generateId(),
      method,
      payload,
      metadata: {
        ...this.defaultMetadata,
        ...effectiveContext, // Context flows into metadata
        ...opts.metadata, // Raw metadata last (highest priority)
      },
    };

    // Set signal if provided
    if (opts.signal) {
      message.signal = opts.signal;
    }

    // Store schema override in metadata for Zod middleware
    if (opts.schema) {
      (message.metadata as any).__schema = opts.schema;
    }

    // Compose middleware chain
    const runner = this.composeMiddleware<TReq, TRes>();

    // Execute through middleware chain
    const context: ClientContext<TReq> = { message };
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
  private composeMiddleware<TReq, TRes>(): ClientRunner<TReq, TRes> {
    // Innermost function: call transport
    const self = this;
    const transportRunner: ClientRunner<TReq, TRes> = async function* (context: ClientContext<TReq>) {
      yield* self.transport.send<TReq, TRes>(context.message);
    };

    // Use universal middleware composition
    // compose(...middleware, finalRunner) applies middleware in order (onion model)
    return compose<false>(...(this.middleware as any[]), transportRunner) as ClientRunner<TReq, TRes>;
  }

  /**
   * Get transport name.
   */
  get transportName(): string {
    return this.transport.name;
  }

  /**
   * Close client and cleanup transport resources.
   */
  async close(): Promise<void> {
    await this.transport.close();
  }

  // ===========================================================================
  // Schema Registration (Zod Validation)
  // ===========================================================================

  /**
   * Cached reference to Zod middleware for schema registration.
   */
  private zodMiddleware: ZodMiddleware | undefined;

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
  schema<TInput extends ZodLike = ZodLike, TOutput extends ZodLike = ZodLike>(
    method: Method,
    schemas: {
      input?: TInput;
      output?: TOutput;
    },
  ): this {
    // Find Zod middleware (lazy lookup, cached)
    if (!this.zodMiddleware) {
      this.zodMiddleware = this.findZodMiddleware();
    }

    if (!this.zodMiddleware) {
      throw new Error(
        "Cannot register schema: createZodMiddleware() must be added via .use() first",
      );
    }

    const key = methodToKey(method);
    this.zodMiddleware[SCHEMA_REGISTRY].set(key, schemas as SchemaDefinition);

    return this;
  }

  /**
   * Find Zod middleware in the middleware chain.
   */
  private findZodMiddleware(): ZodMiddleware | undefined {
    // Check parent chain first (child clients share middleware)
    if (this.parent) {
      return this.parent.findZodMiddleware();
    }

    return this.middleware.find(
      (m): m is ZodMiddleware => SCHEMA_REGISTRY in m,
    );
  }
}
