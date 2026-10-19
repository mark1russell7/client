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
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerOf, checkBrowserRequest, hasAmbientCredentials, tokenMatches } from "@procedures/client";
import type { HttpTransportOptions } from "../types.js";

/** The HTTP endpoint of an MCP server, with a session for each client. */
export interface McpHttpTransport {
  /**
   * This function starts to listen, when the endpoint has a server of its own. It gives the URL, or the path of a mounted endpoint.
   * @deprecated The next MINOR removes the listener of the endpoint (CLI-11): then the endpoint is always mounted.
   */
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

/**
 * This function makes the Streamable HTTP endpoint of an MCP server. `connect` connects the
 * transport of a new session to an MCP server of its own.
 */
export function createHttpTransport(
  options: HttpTransportOptions,
  connect: (transport: StreamableHTTPServerTransport) => Promise<void>,
): McpHttpTransport {
  const path = options.path ?? "/mcp";
  const host = options.host ?? "127.0.0.1";
  const mounted = options.mount === true;
  const owned = !mounted && options.server === undefined;
  const server: HttpServer | undefined = mounted ? undefined : (options.server ?? createServer());
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
    if (url.pathname !== path) {
      if (!owned) return false;
      refuse(res, 404, "NOT_FOUND", `No MCP endpoint at ${url.pathname}`);
      return true;
    }
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
