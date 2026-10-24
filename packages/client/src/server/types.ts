/**
 * Universal Server Types
 *
 * Protocol-agnostic server types mirroring the client architecture.
 * Enables handling HTTP, WebSocket, gRPC, etc. with unified RPC format.
 */

import type { Elicit } from "../procedures/elicit.js";
import type { ReportProgress } from "../procedures/progress.js";
import type { Metadata, Status, Method } from "../client/types.js";
import type { CapabilityRequest } from "../procedures/types.js";
import { methodName } from "./method.js";

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

  /**
   * The function that asks the person at the caller, when the face can ask (MCP elicitation,
   * CLI-12). The procedure gets it as `ctx.elicit`. It is not in the metadata, so a caller cannot
   * send it.
   */
  elicit?: Elicit | undefined;

  /**
   * The function that tells the caller the progress of the call, when the caller asked for it
   * (an MCP progress token). The procedure gets it as `ctx.progress`.
   */
  progress?: ReportProgress | undefined;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /**
   * The credentials of the request (roadmap R18). A network face reads them from the request: the
   * bearer token of an `Authorization` header or of the `token` query of a WebSocket connection,
   * the cookies, the headers and the query. A local face sets `LOCAL_CREDENTIALS` (CLI-1). They are
   * not in the metadata, so a handler and a nested call do not see them.
   *
   * A server with a token or a request hook (`principalOf`) refuses a request without credentials
   * with `UNAUTHORIZED`, and the hook does not run (CLI-1). Before, such a request skipped the
   * token check and the hook.
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
 * The key of the local marker of credentials (CLI-1). The key is a symbol. JSON, structured clone,
 * a header, a cookie and a query cannot carry a symbol key. Thus a remote request cannot claim to
 * be local. Use `LOCAL_CREDENTIALS` to set the marker.
 */
export const LOCAL_MARKER: unique symbol = Symbol.for("@procedures/client.local-credentials");

/**
 * The credentials of a request. A network transport sets each field that it can read. The request
 * hook of the server (`principalOf`) reads them. A local face sets only the local marker
 * (`LOCAL_CREDENTIALS`).
 */
export interface Credentials {
  /**
   * The local marker (CLI-1): the request comes from this application, not from the network. The
   * server applies no token and no request hook to a local request. Only a local face sets it: a
   * call in this process, MCP over stdio, or a message port. A network face never sets it.
   */
  readonly [LOCAL_MARKER]?: true | undefined;
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
 *
 * The hook can run more than one time for one request or one task. `admits()` runs it at a
 * WebSocket upgrade, and `identify()` runs it before the MCP face makes a task (roadmap CLI-69).
 * Thus a hook with a side effect, for example a count or a log line, sees each of these runs.
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

/** A report of the server for debug (the option `debug` of `ProcedureServer`). */
export interface ServerDebugReport {
  /**
   * The subject of the report. `"narrowing"`: a part of the narrowing key of a call has no effect
   * (CLI-30). A later version can add subjects.
   */
  readonly topic: string;
  /** The id of the request. */
  readonly requestId: string;
  /** The method of the request. */
  readonly method: Method;
  /** What occurred, as a sentence. */
  readonly message: string;
  /** The facts of the report. For `"narrowing"`: the `field`, the `kind` and the `code` of its note (`NarrowingNote`). */
  readonly detail?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The contract of a server transport (roadmap R18): a transport turns each protocol request
 * into a `ServerRequest` (with its signal and its credentials), gives it to `handle()`, and turns
 * the `ServerResponse` back (a value, a stream or an error). `Server` and `ProcedureServer`
 * satisfy it, and a test can give a function.
 */
export interface RequestHandler {
  handle(request: ServerRequest): Promise<ServerResponse>;
  /**
   * How the handler can authenticate a network request with ambient credentials: the cookies that
   * a browser sends by itself, also for a request of another site (CSRF). A network face then
   * trusts such a request only from a named origin. Absent: the handler reads no cookies.
   */
  readonly ambientCredentials?: AmbientCredentials | undefined;
  /**
   * This function gives the principal of a request with these credentials, before a call
   * (CLI-69). It uses the checks of each call, and gives undefined when they refuse the
   * credentials or give no principal. `ProcedureServer` has it. Absent: a face knows the principal
   * only in the call.
   */
  identify?(credentials: Credentials): Promise<Principal | undefined>;
  /**
   * This function admits a network request one time, before its calls (CLI-2b). It uses the
   * checks of each call: the request hook, the token check and the authenticate function. A face
   * that carries the calls of one network request (MCP over Streamable HTTP) gives the admitted
   * credentials to those calls, so the checks run one time for the request. `ProcedureServer` has
   * it. Absent: the handler examines each call, and the face refuses no request before its calls.
   */
  admission?(credentials: Credentials): Promise<Admission>;
}

/**
 * The result of `admission()` of a request handler (CLI-2b). A request that passes gets its
 * admitted credentials and its principal. Each call of that request with the admitted credentials
 * gets the principal and the narrowing of the admission, and the checks do not run again. A
 * refused request gets `UNAUTHORIZED` and the message of the refusal.
 */
export type Admission =
  | { readonly ok: true; readonly credentials: Credentials; readonly principal?: Principal | undefined }
  | { readonly ok: false; readonly code: "UNAUTHORIZED"; readonly message: string };

/**
 * How a server can authenticate a request with ambient credentials (cookies):
 * - `"always"`: each network request. The request hook `principalOf` reads the cookies, so a face
 *   trusts a request only from a named origin.
 * - `"cookies"`: a request that carries a cookie. An `authenticate` function can read it, so a face
 *   trusts a request with a cookie only from a named origin.
 */
export type AmbientCredentials = "always" | "cookies";

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
      `No handler found for ${methodName(method)}${
        method.version ? ` (v${method.version})` : ""
      }`
    );
    this.name = "HandlerNotFoundError";
  }
}

/**
 * A server error with an error code. The default code is `INTERNAL_ERROR` of wire v1 (CLI-4:
 * before, the default was the string `"500"`).
 */
export class ServerError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "ServerError";
  }
}
