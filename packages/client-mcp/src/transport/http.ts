/**
 * The MCP transport over Streamable HTTP (roadmap R26), the HTTP transport of the current MCP
 * specification. Before, this package had only stdio, and its SSE transport only threw.
 *
 * Each client gets a session: its `initialize` request makes a transport and an MCP server of its
 * own, and the later requests of the client carry the `mcp-session-id` header of that session.
 * A session gets the progress of a tool call and the `list_changed` notifications. The checks of
 * a local server apply: the server listens on loopback by default, it refuses a web page of
 * another host or origin (DNS rebinding, cross-site requests), and with a token it refuses a
 * request without the token.
 *
 * Each tool call carries the credentials of its HTTP request (CLI-10), so the request hook of the
 * server (`principalOf`) and its token check apply. A server that reads cookies trusts a request
 * with a cookie only from a named origin (CSRF).
 *
 * The checks of each request are in `guard.ts` (CLI-35). Only an `initialize` request starts a
 * session, each body has a limit, and with `maxSessions` the endpoint keeps at most that many sessions.
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { hasAmbientCredentials } from "@procedures/client";
import { BodyError, readJsonBody } from "@procedures/client/node";
import type { HttpTransportOptions } from "../types.js";
import { MCP_HTTP_LIMITS, guardMcpRequest } from "./guard.js";

/** The limits of the sessions of the endpoint (CLI-35). The HTTP options win over them. */
export interface McpHttpSessionOptions {
  /** The most sessions at one time. The default is no limit. */
  readonly maxSessions?: number | undefined;
  /** The largest body of a request. The default is 4 MiB, the limit of the SDK. */
  readonly maxBodyBytes?: number | undefined;
  /** The sessions that have a task in progress: the session limit does not close them. */
  readonly busySessions?: (() => ReadonlySet<string>) | undefined;
}

/** The HTTP endpoint of an MCP server, with a session for each client. */
export interface McpHttpTransport {
  /** This function starts to listen, when the endpoint has a server of its own. It gives the URL, or the path of a mounted endpoint. */
  listen(): Promise<string>;
  /**
   * This function answers a request of the path of the endpoint and gives true. It gives false for
   * another path, when the endpoint does not own its server.
   */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  /** The number of open sessions. */
  readonly sessions: number;
  /** This function closes each session, and the server when the endpoint made one. */
  close(): Promise<void>;
}

/** True for a limit: an integer of 1 or more, or no limit (`Infinity`). */
function isLimit(value: number): boolean {
  return value === Number.POSITIVE_INFINITY || (Number.isInteger(value) && value >= 1);
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
  const host = options.host ?? "127.0.0.1";
  const mounted = options.mount === true;
  const owned = !mounted && options.server === undefined;
  const server: HttpServer | undefined = mounted ? undefined : (options.server ?? createServer());
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  /** The time of the last request of each session: the session limit closes the session that was idle longest */
  const lastUsed = new Map<string, number>();
  /** The open responses of each session (a call, a GET stream): a session with one is not idle */
  const openResponses = new Map<string, number>();
  /** The new sessions that do not have their id yet: the session limit counts them */
  let pending = 0;
  const maxSessions = options.maxSessions ?? limits.maxSessions ?? MCP_HTTP_LIMITS.maxSessions;
  const maxBodyBytes = options.maxBodyBytes ?? limits.maxBodyBytes ?? MCP_HTTP_LIMITS.maxBodyBytes;
  if (!isLimit(maxSessions)) throw new RangeError(`maxSessions must be an integer of 1 or more, or Infinity, not ${String(maxSessions)}`);
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) throw new RangeError(`maxBodyBytes must be an integer of 1 or more, not ${String(maxBodyBytes)}`);

  const refuse = (res: ServerResponse, status: number, code: string, message: string, headers: Readonly<Record<string, string>> = {}): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message, data: { code } }, id: null }));
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
      lastUsed.set(sessionId, Date.now());
      // A call or a GET stream keeps its session busy until its response closes
      track(sessionId, res);
      await transport.handleRequest(req, res);
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

  const handle = (req: IncomingMessage, res: ServerResponse): boolean => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== path) {
      if (!owned) return false;
      refuse(res, 404, "NOT_FOUND", `No MCP endpoint at ${url.pathname}`);
      return true;
    }
    // A web page must not reach the tools: the host and the origin of the request, then the token
    // (guard.ts). A server that reads cookies trusts a request with ambient credentials only from a
    // named origin (CSRF)
    const ambient = options.ambientCredentials === "always" || hasAmbientCredentials(req.headers);
    const guard = guardMcpRequest(req, {
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
      ...(options.allowedHosts ? { allowedHosts: options.allowedHosts } : {}),
      ambient,
    });
    if (!guard.ok) {
      refuse(res, guard.status, guard.code, guard.message, guard.headers);
      return true;
    }
    serve(req, res).catch((error: unknown) => {
      if (!res.headersSent) refuse(res, 500, "INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
    });
    return true;
  };
  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    handle(req, res);
  };
  server?.on("request", onRequest);

  return {
    handle,
    listen: async () => {
      if (!server) return path;
      if (owned && !server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(options.port ?? 3003, host, () => {
            server.off("error", reject);
            resolve();
          });
        });
      }
      const address = server.address() as AddressInfo | null;
      const shown = host === "0.0.0.0" ? "localhost" : host;
      return `http://${shown}:${address?.port ?? options.port ?? 3003}${path}`;
    },
    get sessions() {
      return sessions.size;
    },
    close: async () => {
      server?.off("request", onRequest);
      const open = [...sessions.values()];
      sessions.clear();
      lastUsed.clear();
      openResponses.clear();
      await Promise.all(open.map((transport) => transport.close().catch(() => undefined)));
      if (owned && server?.listening) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
      }
    },
  };
}
