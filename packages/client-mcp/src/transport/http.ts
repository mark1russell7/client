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
 * The endpoint has no listener of its own (CLI-11). The owner of a listener mounts `handle`: a
 * listener of the service (`httpTransport` of `@mark1russell7/service/http`) or the procedures host.
 * Thus the runner of the process owns the port, the stop in stages and the exit.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerOf, checkBrowserRequest, hasAmbientCredentials, tokenMatches } from "@procedures/client";
import type { HttpTransportOptions } from "../types.js";

/** The HTTP endpoint of an MCP server, with a session for each client. */
export interface McpHttpTransport {
  /** The path of the endpoint, for example `/mcp`. */
  readonly path: string;
  /** This function answers a request of the path of the endpoint and gives true. It gives false for another path. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  /** The number of open sessions. */
  readonly sessions: number;
  /** This function closes each session. The listener stays with its owner. */
  close(): Promise<void>;
}

/**
 * This function makes the Streamable HTTP endpoint of an MCP server. `connect` connects the
 * transport of a new session to an MCP server of its own.
 */
export function createHttpTransport(
  options: HttpTransportOptions,
  connect: (transport: StreamableHTTPServerTransport) => Promise<void>,
): McpHttpTransport {
  const path = options.path ?? "/mcp";
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const refuse = (res: ServerResponse, status: number, code: string, message: string): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message, data: { code } }, id: null }));
  };

  /** The transport of a request: the one of its session, or a new one for an `initialize`. */
  const transportOf = async (req: IncomingMessage): Promise<StreamableHTTPServerTransport | undefined> => {
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string") return sessions.get(sessionId);
    if (req.method !== "POST") return undefined;
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await connect(transport);
    return transport;
  };

  const handle = (req: IncomingMessage, res: ServerResponse): boolean => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== path) return false;
    // A web page must not reach the tools: the host and the origin of the request. A server that
    // reads cookies trusts a request with ambient credentials only from a named origin (CSRF)
    const ambient = options.ambientCredentials === "always" || hasAmbientCredentials(req.headers);
    const guard = checkBrowserRequest(req, { ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}) }, false, ambient);
    if (!guard.ok) {
      refuse(res, guard.status, guard.code, guard.message);
      return true;
    }
    if (options.token !== undefined && !tokenMatches(options.token, bearerOf(req.headers["authorization"]))) {
      refuse(res, 401, "UNAUTHORIZED", "Unauthorized: this server requires its token");
      return true;
    }
    void transportOf(req)
      .then((transport) => {
        if (!transport) {
          refuse(res, 404, "SESSION_NOT_FOUND", "No session: start one with an initialize request");
          return;
        }
        return transport.handleRequest(req, res);
      })
      .catch((error: unknown) => {
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
    close: async () => {
      const open = [...sessions.values()];
      sessions.clear();
      await Promise.all(open.map((transport) => transport.close().catch(() => undefined)));
    },
  };
}
