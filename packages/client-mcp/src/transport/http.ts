/**
 * The MCP transport over Streamable HTTP (roadmap R26), the HTTP transport of the current MCP
 * specification. Before, this package had only stdio, and its SSE transport only threw.
 *
 * Each client gets a session: its `initialize` request makes a transport and an MCP server of its
 * own, and the later requests of the client carry the `mcp-session-id` header of that session.
 * A session gets the progress of a tool call and the `list_changed` notifications. The checks of
 * a local server apply: the listener of the service listens on loopback by default, and the
 * endpoint refuses a web page of another host or origin (DNS rebinding, cross-site requests).
 *
 * Each request has one check of its credentials (CLI-2b): the admission of the server of the
 * face (`admission()` of its handler). The admission runs the request hook (`principalOf`), the
 * token check and the authenticate function of the server, for each request: `initialize`, a
 * call, the GET stream and the DELETE of a session. The endpoint has no token check of its own.
 * The tool calls of the request get the admitted credentials (CLI-10), so the server does not
 * run its checks again for them. A server that reads cookies trusts a request with a cookie only
 * from a named origin (CSRF). The credentials of each request have the connection of its socket
 * (`credentials.connection`, CLI-71), so a request hook can find the TCP peer.
 *
 * The endpoint has no listener of its own (CLI-11). The owner of a listener mounts `handle`: a
 * listener of the service (`httpTransport` of `@mark1russell7/service/http`) or the procedures host.
 * Thus the runner of the process owns the port, the stop in stages and the exit.
 *
 * The browser checks of each request are in `guard.ts` (CLI-35). Only an `initialize` request starts a
 * session, and each body has a limit. The endpoint keeps at most `maxSessions` sessions: 256 by
 * default (CLI-51), or no limit with `Infinity`.
 *
 * The endpoint stays on its listener through the drain (CLI-74). Its handler has `until` of a
 * `RequestHandler` of the service: `close transports`. Thus a call in progress gets the answer of an
 * elicitation and its cancel. The endpoint refuses new work itself, after the stop of its intake. The
 * SSE stream of a POST ends when each request of the POST has its answer or is cancelled.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { hasAmbientCredentials, requestCredentials, type Admission, type Credentials } from "@procedures/client";
import { BodyError, readJsonBody } from "@procedures/client/node";
import type { HttpTransportOptions } from "../types.js";
import { MCP_HTTP_LIMITS, guardMcpRequest } from "./guard.js";

/**
 * The key of the credentials of a request in the auth info of the MCP SDK. The value is the
 * admitted credentials (CLI-2b). Without an admission, it is the credentials of the request
 * (CLI-71). The endpoint sets it on `req.auth`, and the SDK gives it to each message of that request.
 */
const CREDENTIALS_KEY = "procedures.credentials";

/** The auth info of the MCP SDK on a request (`req.auth`), as far as the endpoint uses it. */
interface AuthInfoOf {
  token: string;
  clientId: string;
  scopes: string[];
  extra?: Record<string, unknown>;
}

/**
 * This function gives the credentials of the HTTP request of a message, from the auth info that
 * the SDK gives the message. They are the admitted credentials (CLI-2b), or the credentials of the
 * request when the endpoint has no admission. Both have the connection of the socket (CLI-71). It
 * gives undefined when the endpoint set no credentials for the request.
 */
export function requestCredentialsOf(authInfo: { readonly extra?: Record<string, unknown> | undefined } | undefined): Credentials | undefined {
  const value = authInfo?.extra?.[CREDENTIALS_KEY];
  return typeof value === "object" && value !== null ? (value as Credentials) : undefined;
}

/** This function puts the credentials on the request, for the SDK and each message of the request. */
function attachCredentials(req: IncomingMessage, credentials: Credentials): void {
  const carrier = req as IncomingMessage & { auth?: AuthInfoOf };
  const auth: AuthInfoOf = carrier.auth ?? { token: "", clientId: "", scopes: [] };
  carrier.auth = { ...auth, extra: { ...auth.extra, [CREDENTIALS_KEY]: credentials } };
}

/**
 * The parts of the endpoint that its owner gives: the limits of the sessions (CLI-35) and the
 * admission of each request (CLI-2b). The HTTP options win over the limits.
 */
export interface McpHttpSessionOptions {
  /** The most sessions at one time. The default is 256 (CLI-51). `Infinity` turns the limit off. */
  readonly maxSessions?: number | undefined;
  /** The largest body of a request. The default is 4 MiB, the limit of the SDK. */
  readonly maxBodyBytes?: number | undefined;
  /** The sessions that have a task in progress: the session limit does not close them. */
  readonly busySessions?: (() => ReadonlySet<string>) | undefined;
  /**
   * The one check of the credentials of each request (CLI-2b): `admission()` of the handler of the
   * face. A refusal gets 401 with `WWW-Authenticate`. Without it, the endpoint checks no
   * credentials, and each call goes to the handler with the credentials of its request.
   */
  readonly admission?: ((credentials: Credentials) => Promise<Admission>) | undefined;
}

/** The HTTP endpoint of an MCP server, with a session for each client. */
export interface McpHttpTransport {
  /** The path of the endpoint, for example `/mcp`. */
  readonly path: string;
  /** This function answers a request of the path of the endpoint and gives true. It gives false for another path. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  /** The number of open sessions. */
  readonly sessions: number;
  /**
   * This function stops the intake (CLI-72): a new session and a new GET stream get 503. It ends
   * the GET stream of each session without a task in progress. Thus the drain of a listener waits
   * only for the calls and the tasks, not for the idle streams.
   */
  stopIntake(): void;
  /** This function accepts new sessions and new GET streams again, after `stopIntake()`. */
  startIntake(): void;
  /**
   * After the stop of the intake, this function ends the GET stream of each session without a task
   * in progress. The end of the work of a task calls it.
   */
  endIdleStreams(): void;
  /** This function closes each session. The listener stays with its owner. */
  close(): Promise<void>;
}

/** True for a limit: an integer of 1 or more, or no limit (`Infinity`). */
function isLimit(value: number): boolean {
  return value === Number.POSITIVE_INFINITY || (Number.isInteger(value) && value >= 1);
}

/**
 * The stage of the shutdown at which a mount of the endpoint stops: the close of the transports
 * (CLI-74). A listener of the service reads it as `until` of a `RequestHandler`. Thus the listener
 * stays open through the drain, and a call in progress gets the answer of an elicitation and its
 * cancel. The endpoint refuses new work itself after the stop of its intake.
 */
export const MCP_MOUNT_STAGE = "close transports";

/**
 * This function gives the handler of an endpoint with the stage of its mount: `until` of a
 * `RequestHandler` of `@mark1russell7/service/http` (CLI-74). A function that wraps the handler
 * loses the stage.
 */
export function throughTheDrain<H extends (req: IncomingMessage, res: ServerResponse) => boolean>(handler: H): H & { readonly until: typeof MCP_MOUNT_STAGE } {
  return Object.assign(handler, { until: MCP_MOUNT_STAGE } as const);
}

/** The id of a JSON-RPC request. */
type RequestId = string | number;

/** A JSON-RPC message, as far as the endpoint reads it. */
interface MessageFields {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: { readonly requestId?: unknown } | undefined;
}

/** The fields of a JSON-RPC message that the endpoint reads. */
function fieldsOf(message: unknown): MessageFields {
  return typeof message === "object" && message !== null ? (message as MessageFields) : {};
}

/** The id of a JSON-RPC message, when it is a string or a number. */
function idOf(value: unknown): RequestId | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/** The requests of one POST of a session: the requests without an answer, and the cancelled requests. */
interface PostRequests {
  readonly open: Set<RequestId>;
  readonly cancelled: RequestId[];
}

/**
 * This function makes a session end the SSE stream of a POST when each request of the POST has its
 * answer or is cancelled (CLI-74). The SDK sends no answer to a request that the client cancels with
 * `notifications/cancelled`. Thus the SDK kept the stream of that POST open until the close of the
 * session, and the drain of a listener waited for that stream until its deadline.
 *
 * - The SDK gives one `requestInfo` to each message of one POST. The function groups the requests by it.
 * - The function reads a cancel one turn of the event loop later, after the SDK aborted the call.
 * - The function ends the stream with `closeSSEStream()` of the SDK. A batch POST keeps its stream
 *   until each other request of the batch has its answer.
 */
function endCancelledStreams(transport: StreamableHTTPServerTransport): void {
  const posts = new WeakMap<object, PostRequests>();
  const postOf = new Map<RequestId, PostRequests>();
  // A request leaves its POST at its answer or at its cancel. The stream ends when no request of
  // the POST waits for an answer, and one of them was cancelled.
  const settle = (id: RequestId, cancelled: boolean): void => {
    const post = postOf.get(id);
    if (post === undefined) return;
    postOf.delete(id);
    post.open.delete(id);
    if (cancelled) post.cancelled.push(id);
    const first = post.cancelled[0];
    // The floor of the SDK has closeSSEStream(). The check keeps an older SDK from an uncaught error.
    if (post.open.size === 0 && first !== undefined && typeof transport.closeSSEStream === "function") transport.closeSSEStream(first);
  };
  // The Protocol of the SDK keeps a handler that the transport has before connect(), and calls it first
  transport.onmessage = (message, extra) => {
    const { id, method, params } = fieldsOf(message);
    if (typeof method !== "string") return;
    const requestId = idOf(id);
    if (requestId !== undefined) {
      const key: object = extra?.requestInfo ?? {};
      const post: PostRequests = posts.get(key) ?? { open: new Set<RequestId>(), cancelled: [] };
      posts.set(key, post);
      post.open.add(requestId);
      postOf.set(requestId, post);
      return;
    }
    const cancelled = method === "notifications/cancelled" ? idOf(params?.requestId) : undefined;
    // The SDK aborts the call in a later microtask: the stream ends after it
    if (cancelled !== undefined) setImmediate(() => settle(cancelled, true));
  };
  const send = transport.send.bind(transport);
  transport.send = async (message, options) => {
    try {
      await send(message, options);
    } finally {
      // An answer of the server to a request of the client: a response has an id and no method
      const { id, method } = fieldsOf(message);
      const answered = method === undefined ? idOf(id) : undefined;
      if (answered !== undefined) settle(answered, false);
    }
  };
}

/**
 * This function makes the Streamable HTTP endpoint of an MCP server. `connect` connects the
 * transport of a new session to an MCP server of its own.
 */
export function createHttpTransport(
  options: HttpTransportOptions,
  connect: (transport: StreamableHTTPServerTransport) => Promise<void>,
  limits: McpHttpSessionOptions = {},
): McpHttpTransport {
  const path = options.path ?? "/mcp";
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  /** The time of the last request of each session: the session limit closes the session that was idle longest */
  const lastUsed = new Map<string, number>();
  /** The open responses of each session (a call, a GET stream): a session with one is not idle */
  const openResponses = new Map<string, number>();
  /** The new sessions that do not have their id yet: the session limit counts them */
  let pending = 0;
  /** False from the stop of the intake (CLI-72): a new session and a new GET stream get 503 */
  let intakeOpen = true;
  const maxSessions = options.maxSessions ?? limits.maxSessions ?? MCP_HTTP_LIMITS.maxSessions;
  const maxBodyBytes = options.maxBodyBytes ?? limits.maxBodyBytes ?? MCP_HTTP_LIMITS.maxBodyBytes;
  if (!isLimit(maxSessions)) throw new RangeError(`maxSessions must be an integer of 1 or more, or Infinity, not ${String(maxSessions)}`);
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) throw new RangeError(`maxBodyBytes must be an integer of 1 or more, not ${String(maxBodyBytes)}`);
  // The endpoint has no token check of its own (CLI-2b). A token here has no check, so it stops the
  // endpoint: the token goes to the server, and the admission of the server checks it
  if (options.token !== undefined) {
    throw new TypeError(
      "The MCP endpoint checks no token of its own (CLI-2b). Give the token to the server of the face: hostPolicy({ token }), ProcedureServer({ token }), or policy.token of createMcpHost.",
    );
  }

  const refuse = (res: ServerResponse, status: number, code: string, message: string, headers: Readonly<Record<string, string>> = {}, reason?: string): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    // The reason of a FORBIDDEN refusal goes with its code, as on the other faces (CLI-4)
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message, data: { code, ...(reason !== undefined ? { reason } : {}) } }, id: null }));
  };

  /** The refusal of new work after the stop of the intake, as on the other faces: 503 with `UNAVAILABLE` and `Retry-After` */
  const refuseStopping = (res: ServerResponse): void =>
    refuse(res, 503, "UNAVAILABLE", "The server is stopping", { "retry-after": String(MCP_HTTP_LIMITS.retryAfterSeconds) });

  /**
   * After the stop of the intake, this function ends the GET stream of each session without a task
   * in progress (CLI-72). The SDK ends the response in its protocol, so the client can connect
   * again, to the next server. A session with a task in progress keeps its stream: the progress and
   * the end of the task go on it.
   */
  const endIdleStreams = (): void => {
    if (intakeOpen) return;
    const busy = limits.busySessions?.() ?? new Set<string>();
    for (const [id, transport] of sessions) if (!busy.has(id)) transport.closeStandaloneSSEStream();
  };

  /** This function counts an open response of a session until the response closes. */
  const track = (sessionId: string, res: ServerResponse): void => {
    openResponses.set(sessionId, (openResponses.get(sessionId) ?? 0) + 1);
    res.once("close", () => {
      const left = (openResponses.get(sessionId) ?? 1) - 1;
      if (left > 0) openResponses.set(sessionId, left);
      else openResponses.delete(sessionId);
      if (sessions.has(sessionId)) lastUsed.set(sessionId, Date.now());
    });
  };

  const forget = (sessionId: string): void => {
    sessions.delete(sessionId);
    lastUsed.delete(sessionId);
    openResponses.delete(sessionId);
  };

  /**
   * This function closes the session that was idle longest: no task in progress and no open
   * response (a call or a GET stream). It gives false when each session is busy.
   */
  const evict = async (): Promise<boolean> => {
    const busy = limits.busySessions?.() ?? new Set<string>();
    let oldest: string | undefined;
    for (const id of sessions.keys()) {
      if (busy.has(id) || (openResponses.get(id) ?? 0) > 0) continue;
      if (oldest === undefined || (lastUsed.get(id) ?? 0) < (lastUsed.get(oldest) ?? 0)) oldest = id;
    }
    if (oldest === undefined) return false;
    const transport = sessions.get(oldest);
    forget(oldest);
    await transport?.close().catch(() => undefined);
    return true;
  };

  /** This function starts a session for an `initialize` request whose body it read. */
  const open = async (req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> => {
    // After the stop of the intake, a new session goes to another server (CLI-72)
    if (!intakeOpen) {
      refuseStopping(res);
      return;
    }
    // The limit counts the sessions and the new sessions without an id, so the awaits below cannot
    // pass it. A new session leaves `pending` when it gets its id, or when it gets no session
    pending++;
    let counted = true;
    const release = (): void => {
      if (!counted) return;
      counted = false;
      pending--;
    };
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      while (sessions.size + pending > maxSessions) {
        if (!(await evict())) {
          refuse(res, 503, "SESSIONS_FULL", "Each session of the server is busy (a task, a call or a stream): try again later", {
            "retry-after": String(MCP_HTTP_LIMITS.retryAfterSeconds),
          });
          return;
        }
      }
      const created: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          release();
          sessions.set(id, created);
          lastUsed.set(id, Date.now());
          track(id, res);
        },
        // The SDK reads the body of each later request of the session to the same limit
        maxRequestBodySize: maxBodyBytes,
      });
      transport = created;
      created.onclose = () => {
        if (created.sessionId) forget(created.sessionId);
      };
      // The stream of a cancelled call ends, so it does not hold the drain of the listener (CLI-74)
      endCancelledStreams(created);
      await connect(created);
      await created.handleRequest(req, res, body);
    } finally {
      release();
      // No session started (the SDK refused the initialize with 406 or 415, or connect threw): the server closes
      if (transport && !transport.sessionId) await transport.close().catch(() => undefined);
    }
  };

  /**
   * This function answers a request: in its session, or in a new session for an `initialize`. Only
   * an `initialize` makes a session, so a stray POST makes no MCP server (CLI-35).
   */
  const serve = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string" || req.method !== "POST") {
      const transport = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (!transport || typeof sessionId !== "string") {
        refuse(res, 404, "SESSION_NOT_FOUND", "No session: start one with an initialize request");
        return;
      }
      // After the stop of the intake, a new GET stream goes to another server (CLI-72). A POST and
      // a DELETE of the session go on: a call in progress can need them, for example for the
      // answer of an elicitation.
      // The check and the start of the stream are in one turn, so the stop cannot come between them.
      if (!intakeOpen && req.method === "GET") {
        refuseStopping(res);
        return;
      }
      // The endpoint reads the body of a POST of the session to the limit, as for an initialize.
      // Thus a body above the limit gets the code PAYLOAD_TOO_LARGE in a session too (CLI-85).
      // Before, the SDK read it and refused it without a code.
      let parsed: unknown;
      if (req.method === "POST") {
        try {
          parsed = await readJsonBody(req, maxBodyBytes);
        } catch (error) {
          const status = error instanceof BodyError ? error.httpStatus : 400;
          refuse(res, status, status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", error instanceof Error ? error.message : String(error));
          return;
        }
      }
      lastUsed.set(sessionId, Date.now());
      // A call or a GET stream keeps its session busy until its response closes
      track(sessionId, res);
      await transport.handleRequest(req, res, parsed);
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req, maxBodyBytes);
    } catch (error) {
      const status = error instanceof BodyError ? error.httpStatus : 400;
      refuse(res, status, status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", error instanceof Error ? error.message : String(error));
      return;
    }
    const initializes = Array.isArray(body) ? body.some((message) => isInitializeRequest(message)) : isInitializeRequest(body);
    if (!initializes) {
      refuse(res, 400, "BAD_REQUEST", "No session: the first request of a session is initialize, or give the mcp-session-id header");
      return;
    }
    await open(req, res, body);
  };

  /**
   * The one check of the credentials of a request (CLI-2b): the admission of the server of the
   * face. It gives the message of a refusal, or undefined when the request passes. The calls of
   * the request get the admitted credentials through the auth info of the SDK. The credentials
   * have the connection of the socket of the request (CLI-71). Without an admission, the calls
   * get the credentials of the request, and the handler examines each call.
   */
  const admit = async (req: IncomingMessage): Promise<string | undefined> => {
    const credentials = requestCredentials({ headers: req.headers as Record<string, unknown>, url: req.url, socket: req.socket });
    const admission = limits.admission;
    if (!admission) {
      attachCredentials(req, credentials);
      return undefined;
    }
    const admitted = await admission(credentials);
    if (!admitted.ok) return admitted.message;
    attachCredentials(req, admitted.credentials);
    return undefined;
  };

  /** This function admits a request, and then answers it: in its session, or in a new session. */
  const admitAndServe = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const refused = await admit(req);
    if (refused !== undefined) {
      refuse(res, 401, "UNAUTHORIZED", refused, { "www-authenticate": 'Bearer realm="mcp"' });
      return;
    }
    await serve(req, res);
  };

  const handle = (req: IncomingMessage, res: ServerResponse): boolean => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== path) return false;
    // A web page must not reach the tools: one check of the host and the origin of the request
    // (guard.ts), then one admission of its credentials by the server. A server that reads
    // cookies trusts a request with ambient credentials only from a named origin (CSRF)
    const ambient = options.ambientCredentials === "always" || hasAmbientCredentials(req.headers);
    const guard = guardMcpRequest(req, {
      ...(options.allowedOrigins !== undefined ? { allowedOrigins: options.allowedOrigins } : {}),
      ...(options.allowedHosts !== undefined ? { allowedHosts: options.allowedHosts } : {}),
      ambient,
    });
    if (!guard.ok) {
      refuse(res, guard.status, guard.code, guard.message, guard.headers, guard.reason);
      return true;
    }
    admitAndServe(req, res).catch((error: unknown) => {
      if (!res.headersSent) refuse(res, 500, "INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
    });
    return true;
  };
  return {
    path,
    handle,
    get sessions() {
      return sessions.size;
    },
    stopIntake: () => {
      intakeOpen = false;
      endIdleStreams();
    },
    startIntake: () => {
      intakeOpen = true;
    },
    endIdleStreams,
    close: async () => {
      const open = [...sessions.values()];
      sessions.clear();
      lastUsed.clear();
      openResponses.clear();
      await Promise.all(open.map((transport) => transport.close().catch(() => undefined)));
    },
  };
}
