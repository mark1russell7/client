/**
 * Peer Module
 *
 * A peer is a procedures host with a service of its own (CLI-7), for a process that has no service
 * of its own: a test, or a host that a procedure starts (`server.create`). `createPeer()` builds it
 * with `createProcedureHost()`: each HTTP or WebSocket transport of the options is a face on a
 * listener of the host, and the listener is an `httpTransport` of `@mark1russell7/service/http`.
 *
 * - `start()` declares the parts in a service and starts `run()` of `@mark1russell7/service`, on
 *   a process port that installs no signal handler and never ends the process.
 * - `stop()` asks the lifecycle for its shutdown, and waits for the end of its stages.
 *
 * A process that has a service of its own declares the parts of `createProcedureHost()` with
 * `host.declare(svc)`, in place of a peer (decision D2). The peer has no listener, URL strategy,
 * `/health` route or token check of its own.
 */

import { daemon, embeddedProcess, service, type Lifecycle, type Profile } from "@mark1russell7/service";
import {
  hostPolicy,
  isLoopbackHost,
  seconds,
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
import { createProcedureHost, httpFace, LOCAL_LISTENER_KNOBS, wsFace, type HostFaceFactory, type HostListener, type ProcedureHost, type ProcedureHostOptions } from "../host/index.js";

/**
 * The origin rule of a peer, as data for the browser checks of the core (CLI-2b): a web page of a
 * loopback origin (any port), or an origin of the list. The core check (`checkBrowserRequest`)
 * calls it one time for each request, after the check of the Host header. The peer has no check
 * of its own: its token and its request hook are the checks of the server of its host.
 */
function peerOrigins(allowlist: readonly string[] = []): (origin: string) => boolean {
  return (origin) => {
    if (allowlist.includes(origin)) return true;
    try {
      return isLoopbackHost(new URL(origin).hostname);
    } catch {
      return false;
    }
  };
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
  /** The profile of the service of the peer. The default is `PEER_PROFILE`. */
  profile?: Profile | undefined;
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
  /**
   * This method asks the lifecycle of the peer for its shutdown, and waits for the end of its stages.
   *
   * @param options - Deprecated: the grace has no effect. The drain of the profile of the peer gives
   *   the calls in flight their time (CLI-7).
   */
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
    allowedOrigins: browser.allowedOrigins ?? peerOrigins(config.corsOrigins),
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
    allowedOrigins: browser.allowedOrigins ?? peerOrigins(config.origins),
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

/**
 * This function gives the options of a procedures host for the options of a peer: each HTTP or
 * WebSocket transport is a face on a listener with `LOCAL_LISTENER_KNOBS`, and the peer has one
 * token. `createPeer()` uses it, and so does `runProcedureHost()` of `@procedures/server` (CLI-8).
 */
export function peerHostOptions(options: PeerOptions, name: string = "peer"): ProcedureHostOptions {
  const policy = peerPolicy(options);
  const { faces, listen } = facesOf(options.transports, policy.browser);
  const local = options.transports.some((transport) => transport.type === "local");
  return {
    name,
    id: options.id,
    policy,
    faces,
    listen,
    autoRegister: options.autoRegister ?? true,
    ...(options.registry ? { registry: options.registry } : {}),
    ...(options.expose ? { expose: options.expose } : {}),
    ...(options.metrics !== undefined ? { metrics: options.metrics } : {}),
    ...(local ? { endpoints: [{ type: "local", address: "local://in-process" }] } : {}),
  };
}

/** The cap of the stage `drain` of the profile `daemon`. */
const DAEMON_DRAIN = daemon.phases?.find((phase) => phase.name === "drain")?.cap ?? seconds(4);

/**
 * The profile of the service of a peer, as data: the caps of `daemon`, and the cooperative abort at
 * the start of the drain. Thus `stop()` aborts the calls in flight at once, as `stop()` without a
 * grace did before (CLI-7). A repeat signal has no effect, and the port of a peer has no signal.
 */
export const PEER_PROFILE: Profile = Object.freeze({ ...daemon, cooperativeWindow: DAEMON_DRAIN, cooperativeFloor: "none" as const });

class PeerImpl implements Peer {
  readonly id: string;
  private readonly host: ProcedureHost;
  private readonly profile: Profile;
  private life: Lifecycle | undefined;
  private state: "new" | "started" | "stopped" = "new";

  constructor(options: PeerOptions) {
    this.id = options.id;
    this.host = createProcedureHost(peerHostOptions(options));
    this.profile = options.profile ?? PEER_PROFILE;
  }

  async start(): Promise<void> {
    if (this.state === "started") return;
    if (this.state === "stopped") throw new Error("This peer stopped. A peer starts one time: create a new peer.");
    this.state = "started";
    const svc = this.host.declare(service(this.id).profile(this.profile));
    // No check gates the policies of a peer: it is ready from the end of its startup
    if (!this.profile.readiness) svc.readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 });
    if (!this.profile.liveness) svc.liveness({ type: "window", failAfter: seconds(45) });
    if (!this.profile.startup) svc.startup(seconds(30));
    if (!this.profile.onRepeatSignal) svc.onRepeatSignal("ignore");
    // The port of a lifecycle in a process that another part owns (SYS-27): no signal handler, no
    // hold of the process, and an exit that only records the code
    const life = await svc.run({ process: embeddedProcess() });
    if (life.state !== "running") {
      // The startup failed: the lifecycle stops the parts that started, so no port stays open
      this.state = "stopped";
      await life.done;
      throw new Error(life.errors.join("; ") || "The peer did not start");
    }
    this.life = life;
  }

  async stop(_options: StopOptions = {}): Promise<void> {
    const life = this.life;
    if (this.state !== "started" || life === undefined) return;
    this.state = "stopped";
    await life.shutdown("the peer stops");
    await life.done;
  }

  getEndpoints(): PeerEndpoint[] {
    if (this.state !== "started" || this.life === undefined) return [];
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
 * Create a new peer instance: a procedures host with a service of its own, for a process that has
 * no service of its own. A process with a service uses `createProcedureHost()` and `host.declare(svc)`.
 */
export async function createPeer(options: PeerOptions): Promise<Peer> {
  return new PeerImpl(options);
}
