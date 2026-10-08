/**
 * Universal Server
 *
 * Protocol-agnostic RPC server.
 * Registers handlers and processes requests in unified format.
 */

import type {
  Method,
  ServerRequest,
  ServerResponse,
  ServerHandler,
  ServerMiddleware,
  ServerContext,
  ServerRunner,
  ServerTransport,
} from "./types.js";
import { HandlerNotFoundError, ServerError } from "./types.js";
import { compose } from "../middleware/index.js";

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
 * Registered handler entry.
 */
interface HandlerEntry {
  matcher: MethodMatcher;
  handler: ServerHandler;
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
export class Server {
  private handlers: HandlerEntry[] = [];
  private middleware: ServerMiddleware[] = [];
  private transports: ServerTransport[] = [];
  private options: ServerOptions;

  constructor(options: ServerOptions = {}) {
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
  register(
    matcher: Method | MethodMatcher,
    handler: ServerHandler
  ): void {
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
  use(middleware: ServerMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Add a transport to the server.
   *
   * @param transport - Server transport adapter
   */
  addTransport(transport: ServerTransport): void {
    this.transports.push(transport);
  }

  /**
   * Get all registered transports.
   *
   * @returns Array of server transports
   */
  getTransports(): ServerTransport[] {
    return [...this.transports];
  }

  /**
   * Start all server transports.
   * Begins listening for incoming requests.
   */
  async start(): Promise<void> {
    // Start all transports
    await Promise.all(this.transports.map((t) => t.start()));
  }

  /**
   * Stop all server transports.
   * Gracefully shuts down connections.
   */
  async stop(): Promise<void> {
    await Promise.all(this.transports.map((t) => t.stop()));
  }

  /**
   * Handle a request (called by transport adapters).
   * Processes request through middleware and handlers.
   *
   * @param request - Incoming request in unified format
   * @returns Response in unified format
   */
  async handle<TReq, TRes>(
    request: ServerRequest<TReq>
  ): Promise<ServerResponse<TRes>> {
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
      const baseRunner: ServerRunner<TReq, TRes> = async (context) => {
        return (await handler(context.request)) as ServerResponse<TRes>;
      };

      // Compose middleware
      const runner = compose(...this.middleware, baseRunner);

      // Execute
      const context: ServerContext<TReq> = {
        request,
        state: {},
      };

      const response = await runner(context);

      // Log response
      if (this.options.onResponse) {
        this.options.onResponse(response);
      }

      return response;
    } catch (error) {
      // Log error
      if (this.options.onError) {
        this.options.onError(error as Error, request);
      }

      // Convert error to response
      return this.errorToResponse<TRes>(request.id, error as Error);
    }
  }

  /**
   * Find handler for a method.
   */
  private findHandler(method: Method): ServerHandler | null {
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
  private matchesMethod(matcher: MethodMatcher, method: Method): boolean {
    // Match service
    if (matcher.service instanceof RegExp) {
      if (!matcher.service.test(method.service)) {
        return false;
      }
    } else {
      if (matcher.service !== method.service) {
        return false;
      }
    }

    // Match operation
    if (matcher.operation instanceof RegExp) {
      if (!matcher.operation.test(method.operation)) {
        return false;
      }
    } else {
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
      } else {
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
  private normalizeMethodMatcher(
    matcher: Method | MethodMatcher
  ): MethodMatcher {
    // If already a MethodMatcher, return as-is
    if ("service" in matcher && typeof matcher.service === "object") {
      return matcher as MethodMatcher;
    }

    // Convert Method to exact MethodMatcher
    const method = matcher as Method;
    return {
      service: method.service,
      operation: method.operation,
      ...(method.version !== undefined && { version: method.version }),
    };
  }

  /**
   * Convert error to response.
   */
  private errorToResponse<TRes>(id: string, error: Error): ServerResponse<TRes> {
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
