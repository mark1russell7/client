/**
 * Universal Server Types
 *
 * Protocol-agnostic server types mirroring the client architecture.
 * Enables handling HTTP, WebSocket, gRPC, etc. with unified RPC format.
 */

import type { Metadata, Status, Method } from "../client/types.js";
import type { CapabilityRequest } from "../procedures/types.js";

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
   * The credentials that a network transport read from the request (roadmap R18). They have the
   * bearer token of an `Authorization` header, or of the `token` query of a WebSocket connection.
   * They also have the cookies, the headers and the query of the request. They are not in the
   * metadata, so a handler and a nested call do not see them. A request without credentials comes
   * from this process (a direct `handle()`, MCP over stdio).
   */
  credentials?: Credentials | undefined;

  /** The principal of the request: who sends it. `ProcedureServer` sets it when it authenticates the request. */
  principal?: Principal | undefined;

  /**
   * A narrower capability that the request asks for. The request hook of the server
   * (`principalOf`) can set it. The server narrows the capability of the call with it, so the
   * capability does not become wider.
   */
  narrowing?: CapabilityRequest | undefined;
}

/**
 * The credentials of a request. A network transport sets each field that it can read. The request
 * hook of the server (`principalOf`) reads them.
 */
export interface Credentials {
  /** The bearer token that the request presents. */
  readonly bearer?: string | undefined;
  /** The cookies of the request, by name (the `Cookie` header of an HTTP request or of an upgrade). */
  readonly cookies?: Readonly<Record<string, string>> | undefined;
  /** Each header of the request, the secret headers too, by lower-case name. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** The first value of each query parameter of the request URL, by name. */
  readonly query?: Readonly<Record<string, string>> | undefined;
}

/**
 * What the request hook of a server (`principalOf`) gives for a network request. Each field is
 * optional: an empty object accepts the request without a principal.
 */
export interface RequestIdentity {
  /**
   * The token to compare with the token of the server, for example the value of a cookie or of an
   * application header. Without it, the server compares the bearer token of the credentials.
   */
  readonly bearer?: string | undefined;
  /** The principal of the request. It replaces the principal of the token check. */
  readonly principal?: Principal | undefined;
  /**
   * A narrower capability that the request asks for, for example a guest mode of a cookie. The
   * server narrows the capability of the call with it. A request for more has no effect.
   */
  readonly narrowing?: CapabilityRequest | undefined;
}

/**
 * The request hook of a server: it reads the credentials of a network request (a cookie, a header,
 * the query) and gives the identity of the request. Undefined, or an error, refuses the request
 * with `UNAUTHORIZED`. The hook runs before the token check and before `authenticate`.
 */
export type PrincipalOf = (
  credentials: Credentials,
  request: ServerRequest<unknown>
) => RequestIdentity | undefined | Promise<RequestIdentity | undefined>;

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
