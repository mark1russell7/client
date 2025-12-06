/**
 * Universal Server
 *
 * Protocol-agnostic RPC server.
 * Registers handlers and processes requests in unified format.
 */
import { HandlerNotFoundError, ServerError } from "./types";
import { compose } from "../middleware";
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
export class Server {
    handlers = [];
    middleware = [];
    transports = [];
    options;
    constructor(options = {}) {
        this.options = options;
        this.transports = options.transports ?? [];
    }
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
    register(matcher, handler) {
        this.handlers.push({
            matcher: this.normalizeMethodMatcher(matcher),
            handler,
        });
    }
    /**
     * Add middleware to the server.
     * Middleware is applied in the order it's registered.
     *
     * @param middleware - Middleware function
     */
    use(middleware) {
        this.middleware.push(middleware);
    }
    /**
     * Add a transport to the server.
     *
     * @param transport - Server transport adapter
     */
    addTransport(transport) {
        this.transports.push(transport);
    }
    /**
     * Start all server transports.
     * Begins listening for incoming requests.
     */
    async start() {
        // Start all transports
        await Promise.all(this.transports.map((t) => t.start()));
    }
    /**
     * Stop all server transports.
     * Gracefully shuts down connections.
     */
    async stop() {
        await Promise.all(this.transports.map((t) => t.stop()));
    }
    /**
     * Handle a request (called by transport adapters).
     * Processes request through middleware and handlers.
     *
     * @param request - Incoming request in unified format
     * @returns Response in unified format
     */
    async handle(request) {
        // Log request
        if (this.options.onRequest) {
            this.options.onRequest(request);
        }
        try {
            // Find handler
            const handler = this.findHandler(request.method);
            if (!handler) {
                throw new HandlerNotFoundError(request.method);
            }
            // Create base runner
            const baseRunner = async (context) => {
                return (await handler(context.request));
            };
            // Compose middleware
            const runner = compose(...this.middleware, baseRunner);
            // Execute
            const context = {
                request,
                state: {},
            };
            const response = await runner(context);
            // Log response
            if (this.options.onResponse) {
                this.options.onResponse(response);
            }
            return response;
        }
        catch (error) {
            // Log error
            if (this.options.onError) {
                this.options.onError(error, request);
            }
            // Convert error to response
            return this.errorToResponse(request.id, error);
        }
    }
    /**
     * Find handler for a method.
     */
    findHandler(method) {
        for (const entry of this.handlers) {
            if (this.matchesMethod(entry.matcher, method)) {
                return entry.handler;
            }
        }
        return null;
    }
    /**
     * Check if a method matches a matcher.
     */
    matchesMethod(matcher, method) {
        // Match service
        if (matcher.service instanceof RegExp) {
            if (!matcher.service.test(method.service)) {
                return false;
            }
        }
        else {
            if (matcher.service !== method.service) {
                return false;
            }
        }
        // Match operation
        if (matcher.operation instanceof RegExp) {
            if (!matcher.operation.test(method.operation)) {
                return false;
            }
        }
        else {
            if (matcher.operation !== method.operation) {
                return false;
            }
        }
        // Match version (optional)
        if (matcher.version !== undefined) {
            if (matcher.version instanceof RegExp) {
                if (!matcher.version.test(method.version ?? "")) {
                    return false;
                }
            }
            else {
                if (matcher.version !== method.version) {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * Normalize method matcher.
     */
    normalizeMethodMatcher(matcher) {
        // If already a MethodMatcher, return as-is
        if ("service" in matcher && typeof matcher.service === "object") {
            return matcher;
        }
        // Convert Method to exact MethodMatcher
        const method = matcher;
        return {
            service: method.service,
            operation: method.operation,
            ...(method.version !== undefined && { version: method.version }),
        };
    }
    /**
     * Convert error to response.
     */
    errorToResponse(id, error) {
        if (error instanceof HandlerNotFoundError) {
            return {
                id,
                status: {
                    type: "error",
                    code: "404",
                    message: error.message,
                    retryable: false,
                },
                metadata: {},
            };
        }
        if (error instanceof ServerError) {
            return {
                id,
                status: {
                    type: "error",
                    code: error.code,
                    message: error.message,
                    retryable: error.retryable,
                },
                metadata: {},
            };
        }
        // Generic error
        return {
            id,
            status: {
                type: "error",
                code: "500",
                message: error.message || "Internal server error",
                retryable: false,
            },
            metadata: {},
        };
    }
}
//# sourceMappingURL=server.js.map