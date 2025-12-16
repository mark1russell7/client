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
} from "@mark1russell7/client";
import type { TransportConfig, TransportType } from "../types.js";

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

  constructor(options: PeerOptions) {
    this.id = options.id;
    this.transports = options.transports;

    // Create procedure server
    this.server = new ProcedureServer({
      autoRegister: options.autoRegister ?? true,
      registry: options.registry ?? PROCEDURE_REGISTRY,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;

    for (const transport of this.transports) {
      await this.startTransport(transport);
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

  private async startHttpTransport(config: { type: "http"; port?: number; host?: string; basePath?: string; cors?: boolean }): Promise<void> {
    // Dynamic import to avoid bundling express if not used
    const express = (await import("express")).default;

    const app = express();
    app.use(express.json());

    const port = config.port ?? 3000;
    const host = config.host ?? "0.0.0.0";

    const httpTransport = new HttpServerTransport(this.server, {
      app,
      port,
      host,
      basePath: config.basePath ?? "/api",
      cors: config.cors ?? true,
    });

    this.server.addTransport(httpTransport);
    await httpTransport.start();

    this.endpoints.push({
      type: "http",
      address: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${config.basePath ?? "/api"}`,
    });
  }

  private async startWebSocketTransport(config: { type: "websocket"; port?: number; host?: string; path?: string }): Promise<void> {
    // WebSocket transport requires an HTTP server to attach to
    // For standalone WebSocket, we create an HTTP server first
    const { createServer } = await import("http");

    const port = config.port ?? 3001;
    const host = config.host ?? "0.0.0.0";
    const path = config.path ?? "/ws";

    const httpServer = createServer();

    const wsTransport = new WebSocketServerTransport(this.server, {
      server: httpServer,
      path,
    });

    this.server.addTransport(wsTransport);

    // Start the HTTP server for WebSocket upgrades
    await new Promise<void>((resolve) => {
      httpServer.listen(port, host, () => resolve());
    });

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
