/**
 * Peer Module
 *
 * Transport-agnostic peer implementation for bidirectional RPC.
 */

import {
  ProcedureServer,
  HttpServerTransport,
  WebSocketServerTransport,
  type ProcedureRegistry,
  PROCEDURE_REGISTRY,
  rpcServerUrlStrategy,
  defaultServerUrlStrategy,
  defaultUrlPattern,
  type Method,
} from "@mark1russell7/client";
import type { Request } from "express";
import type { HttpTransportConfig, TransportConfig, TransportType, WebSocketTransportConfig } from "../types.js";
import { bearerToken, hostAllowed, originAllowed, tokenMatches } from "./security.js";

/**
 * URL strategy that matches the client's defaultUrlPattern
 * Maps: POST /api/server/status → { service: "server", operation: "status" }
 */
function patternUrlStrategy(req: Request): Method | null {
  const basePath = "/api";
  let path = req.path;

  // Remove base path prefix if present
  if (path.startsWith(basePath)) {
    path = path.slice(basePath.length);
  }

  // Use the client's defaultUrlPattern parser
  // Cast method to expected type (parser doesn't actually use it for this pattern)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return defaultUrlPattern.parse(path, req.method.toUpperCase() as any);
}

// =============================================================================
// Types
// =============================================================================

export interface PeerOptions {
  /** Unique peer ID */
  id: string;
  /** Transports to enable */
  transports: TransportConfig[];
  /** Auto-register procedures from registry */
  autoRegister?: boolean;
  /** Procedure registry to use */
  registry?: ProcedureRegistry;
}

export interface PeerEndpoint {
  type: TransportType;
  address: string;
}

export interface Peer {
  /** Peer ID */
  id: string;
  /** Start all transports */
  start(): Promise<void>;
  /** Stop all transports */
  stop(): Promise<void>;
  /** Get active endpoints */
  getEndpoints(): PeerEndpoint[];
  /** Get underlying server */
  getServer(): ProcedureServer;
}

// =============================================================================
// Implementation
// =============================================================================

class PeerImpl implements Peer {
  readonly id: string;
  private server: ProcedureServer;
  private transports: TransportConfig[];
  private endpoints: PeerEndpoint[] = [];
  private started = false;
  private registry: ProcedureRegistry;
  private startTime: number = Date.now();

  constructor(options: PeerOptions) {
    this.id = options.id;
    this.transports = options.transports;
    this.registry = options.registry ?? PROCEDURE_REGISTRY;

    // Create procedure server
    this.server = new ProcedureServer({
      autoRegister: options.autoRegister ?? true,
      registry: this.registry,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;

    try {
      for (const transport of this.transports) {
        await this.startTransport(transport);
      }
    } catch (error) {
      // Stop the transports that started, so a failed start leaves no port open
      await this.server.stop().catch(() => {});
      this.endpoints = [];
      throw error;
    }

    this.started = true;
  }

  private async startTransport(config: TransportConfig): Promise<void> {
    switch (config.type) {
      case "http":
        await this.startHttpTransport(config);
        break;
      case "websocket":
        await this.startWebSocketTransport(config);
        break;
      case "local":
        // Local transport doesn't need network setup
        this.endpoints.push({
          type: "local",
          address: "local://in-process",
        });
        break;
    }
  }

  private async startHttpTransport(config: HttpTransportConfig): Promise<void> {
    // Dynamic import to avoid bundling express if not used
    const express = (await import("express")).default;

    const app = express();
    app.use(express.json());

    const port = config.port ?? 3000;
    // Loopback by default so the full procedure registry (incl. shell.run / fs.write) is not
    // served unauthenticated on all interfaces. Pass host: "0.0.0.0" to expose on the LAN
    // deliberately. See documentation/BUGS-2026-07.md (H19).
    const host = config.host ?? "127.0.0.1";
    const basePath = config.basePath ?? "/api";

    // Host, origin and token checks (deep dive TRN-1, CLI-1, CLI-2). The health endpoints need no
    // token: a client uses them to check that a lockfile's server is alive.
    app.use((req, res, next) => {
      if (!hostAllowed(host, req.headers.host) || !originAllowed(req.headers.origin, config.corsOrigins)) {
        res.status(403).json({ error: "Forbidden: the host or the origin is not allowed", code: "FORBIDDEN" });
        return;
      }
      const isHealth = req.path === "/health" || req.path === `${basePath}/health`;
      if (!isHealth && req.method !== "OPTIONS" && !tokenMatches(config.token, bearerToken(req.headers.authorization))) {
        res.status(401).json({ error: "Unauthorized: this server requires its token", code: "UNAUTHORIZED" });
        return;
      }
      next();
    });

    // Health endpoint for container orchestration
    app.get(`${basePath}/health`, (_req, res) => {
      const procedureCount = this.registry.getAll().filter((p) => p.handler).length;
      res.json({
        status: "ok",
        uptime: Date.now() - this.startTime,
        procedures: procedureCount,
        peerId: this.id,
      });
    });

    // Also add at root /health for convenience
    app.get("/health", (_req, res) => {
      const procedureCount = this.registry.getAll().filter((p) => p.handler).length;
      res.json({
        status: "ok",
        uptime: Date.now() - this.startTime,
        procedures: procedureCount,
        peerId: this.id,
      });
    });

    // Select URL strategy based on config
    // Default to patternUrlStrategy which matches the client's defaultUrlPattern
    const urlStrategy = config.urlStrategy === "rpc"
      ? rpcServerUrlStrategy
      : config.urlStrategy === "rest"
        ? defaultServerUrlStrategy
        : patternUrlStrategy;

    const httpTransport = new HttpServerTransport(this.server, {
      app,
      port,
      host,
      basePath,
      // Off by default: before, every peer sent Access-Control-Allow-Origin: * (deep dive CLI-2)
      cors: config.cors ?? false,
      urlStrategy,
      // The transport's browser checks follow the peer's rule: loopback origins and the listed
      // ones (the token is required in any case). The RESTful strategy calls by GET.
      allowedOrigins: (origin) => originAllowed(origin, config.corsOrigins),
      allowGet: config.urlStrategy === "rest",
    });

    this.server.addTransport(httpTransport);
    await httpTransport.start();

    this.endpoints.push({
      type: "http",
      address: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${basePath}`,
    });
  }

  private async startWebSocketTransport(config: WebSocketTransportConfig): Promise<void> {
    // WebSocket transport requires an HTTP server to attach to
    // For standalone WebSocket, we create an HTTP server first
    const { createServer } = await import("http");

    const port = config.port ?? 3001;
    // Loopback by default so the full procedure registry (incl. shell.run / fs.write) is not
    // served unauthenticated on all interfaces. Pass host: "0.0.0.0" to expose on the LAN
    // deliberately. See documentation/BUGS-2026-07.md (H19).
    const host = config.host ?? "127.0.0.1";
    const path = config.path ?? "/ws";

    const httpServer = createServer();

    // Listen first, then attach the WebSocket server. A listen error (EADDRINUSE, EACCES) rejects:
    // before, the error had no listener, so the process ended with an unhandled 'error' event
    // (deep dive CLI-16).
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        reject(new Error(`The WebSocket server cannot listen on ${host}:${port}: ${error.message}`));
      };
      httpServer.once("error", onError);
      httpServer.listen(port, host, () => {
        httpServer.off("error", onError);
        resolve();
      });
    });

    const wsTransport = new WebSocketServerTransport(this.server, {
      server: httpServer,
      path,
      allowedOrigins: (origin) => originAllowed(origin, config.origins),
      // Host, origin and token checks: before, any web page could open a connection and call
      // procedures (cross-site WebSocket hijacking, deep dive TRN-1)
      authenticate: (req) => {
        const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token") ?? bearerToken(req.headers.authorization);
        return (
          hostAllowed(host, req.headers.host) &&
          originAllowed(req.headers.origin, config.origins) &&
          tokenMatches(config.token, token)
        );
      },
    });

    this.server.addTransport(wsTransport);
    try {
      await wsTransport.start();
    } catch (error) {
      httpServer.close();
      throw error;
    }

    this.endpoints.push({
      type: "websocket",
      address: `ws://${host === "0.0.0.0" ? "localhost" : host}:${port}${path}`,
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.server.stop();
    this.started = false;
    this.endpoints = [];
  }

  getEndpoints(): PeerEndpoint[] {
    return [...this.endpoints];
  }

  getServer(): ProcedureServer {
    return this.server;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new peer instance
 */
export async function createPeer(options: PeerOptions): Promise<Peer> {
  return new PeerImpl(options);
}
