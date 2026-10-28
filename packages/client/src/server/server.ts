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
import { callOf, exposeError, exposedResponse, markLogged, policyActs, type ExposedError, type HiddenErrorLog, type ServerErrorPolicy } from "./error-policy.js";
import { withRealError } from "./error-response.js";
import { CONSOLE_LOGGER, type LogFields, type Logger } from "../logger.js";
import { methodName } from "./method.js";

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
   * Called when a handler throws an error. The error policy (`errors`) also gives it each hidden
   * error one time. A last-resort error of a face that failed before it knew the call comes with
   * `UNKNOWN_REQUEST`: a request with the id `"unknown"`. The third argument gives the logger of
   * the server: the option `logger`, or `CONSOLE_LOGGER` without it (CLI-87).
   */
  onError?: (error: Error, request: ServerRequest, context: ServerErrorContext) => void;

  /**
   * The logger of the server and of its faces (CLI-87). The server writes its log lines and its
   * errors to it, also when `onError` gets them. A face that has no logger of its own uses this
   * logger. Without it, each line goes to the console as before.
   */
  logger?: Logger | undefined;

  /**
   * Request logger.
   */
  onRequest?: (request: ServerRequest) => void;

  /**
   * Response logger.
   */
  onResponse?: (response: ServerResponse) => void;

  /**
   * The error policy (roadmap CLI-80): what an error tells the caller when it leaves the server.
   * `handle()` applies it, so each face (HTTP, WebSocket, MCP, a message port) sends the same
   * error. A nested call of `ctx.client` keeps the real error.
   *
   * - `expose: "all"` (the default): each error goes to the caller as before.
   * - `expose: "coded"`: an error with a known code (`isKnownErrorCode`) goes to the caller as it
   *   is, and so does an error with a code of `codes`. Each other error goes as `INTERNAL_ERROR`
   *   with the message `"internal error"` and its real retryable flag. The server gives the real
   *   error one time to `onError` and to the `logger`, or to `console.error` without them.
   * - `map` runs first, with the real error of its own class. Its result goes to the caller as it
   *   is, with its `retryAfterMs`. `undefined` gives the error to `expose`.
   * - The last-resort catch of each face applies the same policy (`exposeError`).
   *
   * @example
   * ```typescript
   * new ProcedureServer({
   *   errors: {
   *     expose: "coded",
   *     map: (error) => (isDuplicateKey(error) ? new ServerError("The item exists", "CONFLICT") : undefined),
   *   },
   *   onError: (error, request) => logger.error({ err: error, id: request.id }),
   * });
   * ```
   */
  errors?: ServerErrorPolicy | undefined;
}

/** The third argument of the hook `onError` of a server (CLI-87). */
export interface ServerErrorContext {
  /** The logger of the server: the option `logger`, or `CONSOLE_LOGGER` without it. */
  readonly logger: Logger;
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

/** The request that `onError` gets for an error of a face that failed before it knew the call (CLI-80). */
const UNKNOWN_REQUEST: ServerRequest = { id: "unknown", method: { service: "", operation: "" }, payload: undefined, metadata: {} };

/** The fields of the log line of an error: the request id, the procedure, the transport and the error (CLI-87). */
function errorFields(request: ServerRequest | undefined, error: unknown): LogFields {
  if (!request) return { error };
  return {
    requestId: request.id,
    procedure: methodName(request.method),
    ...(request.transport !== undefined ? { transport: request.transport } : {}),
    error,
  };
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
    const policy = this.options.errors;
    if (!policyActs(policy)) return this.handleRaw(request);
    const response = await this.handleRaw<TReq, TRes>(request);
    return exposedResponse(policy, request, response, this.hiddenErrorLog);
  }

  /**
   * The error that the last-resort catch of a face sends (roadmap CLI-80): when `handle()` throws,
   * or the face fails after it. `raw` is the error that the face sends without a policy. Under the
   * option `errors`, `map` runs first, and `"coded"` hides the message of `INTERNAL_ERROR`. The
   * logger gets each hidden error one time. A face calls it through `lastResortError`.
   */
  exposeError(error: unknown, request: ServerRequest | undefined, raw: ExposedError): ExposedError {
    return exposeError(this.options.errors, error, callOf(request), (real) => this.hiddenErrorLog(real, request), raw);
  }

  /**
   * The logger of the server and of its faces: the option `logger`, or undefined without it. A face
   * writes to the console when it is undefined (CLI-87).
   */
  get logger(): Logger | undefined {
    return this.options.logger;
  }

  /** The third argument of `onError`: the logger of the server, or the console adapter without it. */
  private errorContext(): ServerErrorContext {
    return { logger: this.options.logger ?? CONSOLE_LOGGER };
  }

  /** The logger of the errors that the error policy hides: `onError` and the logger, or `console.error` without them. */
  private readonly hiddenErrorLog: HiddenErrorLog = (error, request) => {
    const real = error instanceof Error ? error : new Error(String(error));
    const { onError, logger } = this.options;
    // A face that failed before it knew the call gives no request: onError gets a request of no call
    if (onError) onError(real, request ?? UNKNOWN_REQUEST, this.errorContext());
    if (logger) logger.log("error", "The error policy hid an error", errorFields(request, real));
    // A constant format: the request id comes from the caller (CodeQL js/tainted-format-string)
    else if (!onError) console.error("[Server] hidden error of %s: %o", request?.id ?? "a request", real);
  };

  /** The response of a request, before the error policy. */
  private async handleRaw<TReq, TRes>(
    request: ServerRequest<TReq>
  ): Promise<ServerResponse<TRes>> {
    // Log request
    if (this.options.onRequest) {
      this.options.onRequest(request);
    }

    try {
      // Find handler
      const handler = this.findHandler(request.method, request);
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
      // Log error: to onError and to the logger (CLI-87)
      const { onError, logger } = this.options;
      if (onError) onError(error as Error, request, this.errorContext());
      if (logger) logger.log("error", "A handler failed", errorFields(request, error));
      // The error policy does not log this error again (CLI-80)
      if (onError || logger) markLogged(error);

      // Convert error to response
      return this.errorToResponse<TRes>(request, error as Error);
    }
  }

  /**
   * Find handler for a method. A subclass can add handlers that it finds at request time
   * (`ProcedureServer` looks up its registry). The request is absent for a lookup outside a call.
   * `ProcedureServer` reads the expose rule of its face from it (AG1-B).
   */
  protected findHandler(method: Method, _request?: ServerRequest<unknown>): ServerHandler | null {
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
  private errorToResponse<TRes>(request: ServerRequest<unknown>, error: Error): ServerResponse<TRes> {
    return withRealError(this.errorToStatus<TRes>(request.id, error), error, request);
  }

  /** The response of an error, without its record for the error policy. */
  private errorToStatus<TRes>(id: string, error: Error): ServerResponse<TRes> {
    if (error instanceof HandlerNotFoundError) {
      return {
        id,
        status: {
          type: "error",
          // The symbolic code, as the other errors: the HTTP transport maps it to 404. Before,
          // the code was the string "404", which the HTTP transport sent as a 500 (deep dive TRN-7).
          code: "NOT_FOUND",
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

    // Another error: the server failed outside a handler of the protocol. The code is of wire v1
    // (CLI-4: before, the code was the string "500").
    return {
      id,
      status: {
        type: "error",
        code: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        retryable: false,
      },
      metadata: {},
    };
  }
}
