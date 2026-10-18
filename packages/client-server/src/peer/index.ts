/**
 * Peer Module
 *
 * A peer is a procedures host that runs outside a service (CLI-7). `createPeer()` builds it with
 * `createProcedureHost()`: each HTTP or WebSocket transport of the options is a face on a listener
 * of the host, and the listener is an `httpTransport` of `@mark1russell7/service/http`. The peer
 * starts the parts, and `stop()` calls them in the sequence of the stages.
 *
 * A process under `run()` declares the parts of `createProcedureHost()` in place of a peer
 * (decision D2). The peer has no listener, URL strategy, `/health` route or token check of its own.
 */

import {
  hostPolicy,
  realClock,
  type BrowserGuardOptions,
  type Client,
  type HostPolicy,
  type ProcedurePath,
  type ProcedureRegistry,
  type ProcedureServer,
  type StopOptions,
} from "@procedures/client";
import { defaultServerUrlStrategy, rpcServerUrlStrategy, type ProcedureHandlerOptions, type UpgradeHandlerOptions } from "@procedures/client/node";
import type { HttpTransportConfig, TransportConfig, TransportType, WebSocketTransportConfig } from "../types.js";
import { createProcedureHost, httpFace, LOCAL_LISTENER_KNOBS, wsFace, type HostFaceFactory, type HostListener, type ProcedureHost } from "../host/index.js";
import { runOutsideService, type OutsideRun } from "../host/outside.js";
import { originAllowed } from "./security.js";

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
  /** The procedures that the peer serves (see `exposeRule`). Without it, the peer serves every procedure. */
  expose?: ((path: ProcedurePath) => boolean) | undefined;
  /**
   * The peer counts the calls of each procedure, and `host.metrics` gives the counts (roadmap
   * R19). The default is true.
   */
  metrics?: boolean | undefined;
  /**
   * The policy of the host (`hostPolicy()` of the core, roadmap 2.3): the expose rule, the call
   * rule, the interceptors (a time limit), the token and the browser checks. `expose` above, when
   * given, wins over the policy's. A peer has one token: the token of its transports, or else the
   * token of the policy.
   */
  policy?: HostPolicy | undefined;
}

export interface PeerEndpoint {
  type: TransportType;
  address: string;
}

export interface Peer {
  /** Peer ID */
  id: string;
  /** This method starts the parts of the host. A peer starts one time. */
  start(): Promise<void>;
  /** Stop the peer. With `grace`, the calls in flight have that time to end (roadmap R14). */
  stop(options?: StopOptions): Promise<void>;
  /** Get active endpoints */
  getEndpoints(): PeerEndpoint[];
  /** Get underlying server */
  getServer(): ProcedureServer;
  /** The procedures host of the peer: its parts, its faces and its info (CLI-7). */
  getHost(): ProcedureHost;
  /** The ids of the WebSocket connections of the clients (roadmap R24). */
  connections(): string[];
  /**
   * A client of one connected client (roadmap R24): its calls go to the procedures that the client
   * serves (the `serve` option of its WebSocketTransport), over the same WebSocket.
   */
  clientFor(connectionId: string): Client;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * The policy of a peer, with its one token. A transport token and a policy token must be the same:
 * the one server examines one token for each face.
 */
function peerPolicy(options: PeerOptions): HostPolicy {
  const own = new Set(options.transports.flatMap((transport) => (transport.type !== "local" && transport.token !== undefined ? [transport.token] : [])));
  const policyToken = options.policy?.token;
  if (own.size > 1 || (own.size === 1 && policyToken !== undefined && !own.has(policyToken))) {
    throw new Error("A peer has one token: give the same token to each transport, or give it only in the policy");
  }
  const token = [...own][0] ?? policyToken;
  if (options.policy) return token === policyToken ? options.policy : { ...options.policy, token };
  return hostPolicy(token !== undefined ? { token } : {});
}

/** The options of the HTTP face of a transport: the rules of the peer before CLI-7, on `procedureHandler`. */
function httpOptionsOf(config: HttpTransportConfig, browser: BrowserGuardOptions): ProcedureHandlerOptions {
  return {
    basePath: config.basePath ?? "/api",
    // Off by default: before, every peer sent Access-Control-Allow-Origin: * (deep dive CLI-2)
    cors: config.cors ?? false,
    ...(config.urlStrategy === "rpc" ? { urlStrategy: rpcServerUrlStrategy } : config.urlStrategy === "rest" ? { urlStrategy: defaultServerUrlStrategy } : {}),
    // The browser checks follow the rule of the peer: loopback origins and the listed ones
    allowedOrigins: browser.allowedOrigins ?? ((origin: string) => originAllowed(origin, config.corsOrigins)),
    ...(browser.allowedHosts !== undefined ? { allowedHosts: browser.allowedHosts } : {}),
    // The RESTful strategy calls by GET
    allowGet: browser.allowGet ?? config.urlStrategy === "rest",
    ...(config.bodyLimit !== undefined ? { bodyLimit: config.bodyLimit } : {}),
  };
}

/** The options of the WebSocket face of a transport. */
function wsOptionsOf(config: WebSocketTransportConfig, browser: BrowserGuardOptions): UpgradeHandlerOptions {
  return {
    path: config.path ?? "/ws",
    allowedOrigins: browser.allowedOrigins ?? ((origin: string) => originAllowed(origin, config.origins)),
    ...(browser.allowedHosts !== undefined ? { allowedHosts: browser.allowedHosts } : {}),
  };
}

/**
 * The faces and the listeners of the transports. Two transports on one address and port share one
 * listener. Loopback is the default address, so the whole registry (`shell.run`, `fs.write`) is
 * not served on each interface (BUGS-2026-07 H19). Give `host: "0.0.0.0"` on purpose for the LAN.
 */
function facesOf(transports: readonly TransportConfig[], browser: BrowserGuardOptions): { faces: Record<string, HostFaceFactory>; listen: HostListener[] } {
  const faces: Record<string, HostFaceFactory> = {};
  const listeners: Array<{ name: string; port: number; host: string; faces: string[] }> = [];
  const counts = { http: 0, websocket: 0 };
  for (const transport of transports) {
    if (transport.type === "local") continue;
    const kind = transport.type === "http" ? "http" : "ws";
    const index = counts[transport.type]++;
    const faceName = index === 0 ? kind : `${kind}${index + 1}`;
    faces[faceName] =
      transport.type === "http" ? httpFace(httpOptionsOf(transport, browser)) : wsFace(wsOptionsOf(transport, browser));
    const port = transport.port ?? (transport.type === "http" ? 3000 : 3001);
    const host = transport.host ?? "127.0.0.1";
    const shared = port === 0 ? undefined : listeners.find((listener) => listener.port === port && listener.host === host);
    if (shared) shared.faces.push(faceName);
    else listeners.push({ name: faceName, port, host, faces: [faceName] });
  }
  return { faces, listen: listeners.map((listener) => ({ ...listener, knobs: LOCAL_LISTENER_KNOBS })) };
}

class PeerImpl implements Peer {
  readonly id: string;
  private readonly host: ProcedureHost;
  private readonly run: OutsideRun;
  /** True when the options have a local transport: `local://in-process` is an endpoint */
  private readonly local: boolean;
  private state: "new" | "started" | "stopped" = "new";

  constructor(options: PeerOptions) {
    this.id = options.id;
    const policy = peerPolicy(options);
    const { faces, listen } = facesOf(options.transports, policy.browser);
    this.local = options.transports.some((transport) => transport.type === "local");
    this.host = createProcedureHost({
      name: "peer",
      id: options.id,
      policy,
      faces,
      listen,
      autoRegister: options.autoRegister ?? true,
      ...(options.registry ? { registry: options.registry } : {}),
      ...(options.expose ? { expose: options.expose } : {}),
      ...(options.metrics !== undefined ? { metrics: options.metrics } : {}),
      ...(this.local ? { endpoints: [{ type: "local", address: "local://in-process" }] } : {}),
    });
    this.run = runOutsideService(this.host, realClock);
  }

  async start(): Promise<void> {
    if (this.state === "started") return;
    if (this.state === "stopped") throw new Error("This peer stopped. A peer starts one time: create a new peer.");
    try {
      await this.run.start();
    } catch (error) {
      // The parts that started are closed again, so a failed start leaves no port open
      this.state = "stopped";
      throw error;
    }
    this.state = "started";
  }

  async stop(options: StopOptions = {}): Promise<void> {
    if (this.state !== "started") return;
    this.state = "stopped";
    await this.run.stop(options.grace !== undefined ? { grace: options.grace } : {});
  }

  getEndpoints(): PeerEndpoint[] {
    if (this.state !== "started") return [];
    return this.host.info.endpoints().map((endpoint) => ({ type: endpoint.type as TransportType, address: endpoint.address }));
  }

  getServer(): ProcedureServer {
    return this.host.server;
  }

  getHost(): ProcedureHost {
    return this.host;
  }

  connections(): string[] {
    return this.host.connections();
  }

  clientFor(connectionId: string): Client {
    return this.host.clientFor(connectionId);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new peer instance: a procedures host that runs outside a service.
 */
export async function createPeer(options: PeerOptions): Promise<Peer> {
  return new PeerImpl(options);
}
