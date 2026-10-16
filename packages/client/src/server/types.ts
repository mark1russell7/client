/**
 * Universal Server Types
 *
 * Protocol-agnostic server types mirroring the client architecture.
 * Enables handling HTTP, WebSocket, gRPC, etc. with unified RPC format.
 */

import type { Metadata, Status, Method } from "../client/types.js";

// Re-export Method from client types
export type { Method };

/**
 * Server request in unified RPC format.
 * Created by transport adapters from protocol-specific requests.
 */
export interface ServerRequest<TReq = unknown> {
  /** Unique request ID (for correlation, logging) */
  id: string;

  /** RPC method (service, operation, version) */
  method: Method;

  /** Request payload */
  payload: TReq;

  /** Request metadata (headers, query params, etc.) */
  metadata: Metadata;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /**
   * The credentials that a network transport read from the request: the bearer token of an
   * `Authorization` header, or of the `token` query of a WebSocket connection (roadmap R18). They
   * are not in the metadata, so a handler and a nested call do not see them. A request without
   * credentials comes from this process (a direct `handle()`, MCP over stdio).
   */
  credentials?: Credentials | undefined;

  /** The principal of the request: who sends it. `ProcedureServer` sets it when it authenticates the request. */
  principal?: Principal | undefined;
}

/** The credentials of a request. */
export interface Credentials {
  /** The bearer token that the request presents. */
  readonly bearer?: string | undefined;
}

/** Who sends a request (roadmap R18). */
export interface Principal {
  /** The id of the principal. With the token of a host: "token". */
  readonly id: string;
  /** How the server authenticated it: "token", or the name of an authenticate function. */
  readonly via: string;
  /** More facts about the principal, from an authenticate function. */
  readonly claims?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The contract of a server transport (roadmap R18): a transport turns each protocol request
 * into a `ServerRequest` (with its signal and its credentials), gives it to `handle()`, and turns
 * the `ServerResponse` back (a value, a stream or an error). `Server` and `ProcedureServer`
 * satisfy it, and a test can give a function.
 */
export interface RequestHandler {
  handle(request: ServerRequest): Promise<ServerResponse>;
}

/**
 * Server response in unified RPC format.
 * Converted by transport adapters to protocol-specific responses.
 */
export interface ServerResponse<TRes = unknown> {
  /** Request ID (for correlation) */
  id: string;

  /** Response status */
  status: Status;

  /** Response payload (only present on success) */
  payload?: TRes;

  /**
   * The items of a stream response. When this field is set, the response is a stream: the
   * transport sends each item, then the end of the stream. An error from the iterator ends
   * the stream with an error. A transport that cannot stream sends the last item.
   */
  stream?: AsyncIterable<TRes>;

  /** Response metadata */
  metadata: Metadata;
}

/**
 * Server handler function.
 * Processes requests in unified RPC format.
 */
export type ServerHandler<TReq = unknown, TRes = unknown> = (
  request: ServerRequest<TReq>
) => Promise<ServerResponse<TRes>> | ServerResponse<TRes>;

/**
 * Server middleware context.
 * Passed through middleware chain.
 */
export interface ServerContext<TReq = unknown> {
  /** The incoming request */
  request: ServerRequest<TReq>;

  /** Additional context data (can be set by middleware) */
  state: Record<string, unknown>;
}

/**
 * Server middleware runner.
 * Processes a request and returns a response.
 */
export type ServerRunner<TReq = unknown, TRes = unknown> = (
  context: ServerContext<TReq>
) => Promise<ServerResponse<TRes>>;

/**
 * Server middleware function.
 * Can intercept, modify, or handle requests.
 */
export type ServerMiddleware<TReq = unknown, TRes = unknown> = (
  next: ServerRunner<TReq, TRes>
) => ServerRunner<TReq, TRes>;

/**
 * Server transport adapter interface.
 * Adapts protocol-specific servers to unified RPC format.
 */
export interface ServerTransport {
  /** Transport name (for logging, debugging) */
  readonly name: string;

  /**
   * Start the server transport.
   * Begins listening for incoming requests.
   */
  start(): Promise<void>;

  /**
   * Stop the server transport.
   * Gracefully shuts down and closes connections.
   */
  stop(): Promise<void>;

  /**
   * Check if transport is running.
   */
  isRunning(): boolean;
}

/**
 * Handler not found error.
 */
export class HandlerNotFoundError extends Error {
  constructor(method: Method) {
    super(
      `No handler found for ${method.service}.${method.operation}${
        method.version ? ` (v${method.version})` : ""
      }`
    );
    this.name = "HandlerNotFoundError";
  }
}

/**
 * Server error with status code.
 */
export class ServerError extends Error {
  constructor(
    message: string,
    public readonly code: string = "500",
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "ServerError";
  }
}
