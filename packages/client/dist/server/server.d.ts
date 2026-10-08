/**
 * Universal Server
 *
 * Protocol-agnostic RPC server.
 * Registers handlers and processes requests in unified format.
 */
import type { Method, ServerRequest, ServerResponse, ServerHandler, ServerMiddleware, ServerTransport } from "./types.js";
/**
 * Server configuration options.
 */
export interface ServerOptions {
    /**
     * Server transports (HTTP, WebSocket, etc.)
     * Can run multiple transports simultaneously.
     */
    transports?: ServerTransport[];
    /**
     * Global error handler.
     * Called when a handler throws an error.
     */
    onError?: (error: Error, request: ServerRequest) => void;
    /**
     * Request logger.
     */
    onRequest?: (request: ServerRequest) => void;
    /**
     * Response logger.
     */
    onResponse?: (response: ServerResponse) => void;
}
/**
 * Method matcher for handler registration.
 * Can match exact methods or patterns.
 */
interface MethodMatcher {
    service: string | RegExp;
    operation: string | RegExp;
    version?: string | RegExp;
}
/**
 * Universal RPC server.
 *
 * Features:
 * - Protocol-agnostic (HTTP, WebSocket, gRPC via adapters)
 * - Middleware support (logging, auth, validation, etc.)
 * - Handler registry with pattern matching
 * - Graceful shutdown
 * - Error handling
 *
 * @example
 * ```typescript
 * const server = new Server({
 *   transports: [
 *     new HttpServerTransport({ port: 3000 }),
 *     new WebSocketServerTransport({ port: 3001 })
 *   ]
 * });
 *
 * // Register handlers
 * server.register(
 *   { service: "users", operation: "get" },
 *   async (req) => ({
 *     id: req.id,
 *     status: { type: "success", code: 200 },
 *     payload: { id: "123", name: "John" },
 *     metadata: {}
 *   })
 * );
 *
 * // Add middleware
 * server.use(createLoggingMiddleware());
 * server.use(createAuthMiddleware());
 *
 * await server.start();
 * ```
 */
export declare class Server {
    private handlers;
    private middleware;
    private transports;
    private options;
    constructor(options?: ServerOptions);
    /**
     * Register a handler for a method.
     *
     * @param matcher - Method to match (exact or pattern)
     * @param handler - Handler function
     *
     * @example
     * ```typescript
     * // Exact match
     * server.register(
     *   { service: "users", operation: "get" },
     *   async (req) => ({ ... })
     * );
     *
     * // Pattern match (all operations for a service)
     * server.register(
     *   { service: "users", operation: /.* / },
     *   async (req) => ({ ... })
     * );
     * ```
     */
    register(matcher: Method | MethodMatcher, handler: ServerHandler): void;
    /**
     * Add middleware to the server.
     * Middleware is applied in the order it's registered.
     *
     * @param middleware - Middleware function
     */
    use(middleware: ServerMiddleware): void;
    /**
     * Add a transport to the server.
     *
     * @param transport - Server transport adapter
     */
    addTransport(transport: ServerTransport): void;
    /**
     * Get all registered transports.
     *
     * @returns Array of server transports
     */
    getTransports(): ServerTransport[];
    /**
     * Start all server transports.
     * Begins listening for incoming requests.
     */
    start(): Promise<void>;
    /**
     * Stop all server transports.
     * Gracefully shuts down connections.
     */
    stop(): Promise<void>;
    /**
     * Handle a request (called by transport adapters).
     * Processes request through middleware and handlers.
     *
     * @param request - Incoming request in unified format
     * @returns Response in unified format
     */
    handle<TReq, TRes>(request: ServerRequest<TReq>): Promise<ServerResponse<TRes>>;
    /**
     * Find handler for a method.
     */
    private findHandler;
    /**
     * Check if a method matches a matcher.
     */
    private matchesMethod;
    /**
     * Normalize method matcher.
     */
    private normalizeMethodMatcher;
    /**
     * Convert error to response.
     */
    private errorToResponse;
}
export {};
//# sourceMappingURL=server.d.ts.map