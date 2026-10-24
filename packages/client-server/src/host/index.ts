/**
 * The procedures host: one factory for each procedures server in Node (CLI-7, decision D2).
 *
 * `createProcedureHost()` builds the server, its faces and its stop parts from one set of
 * options. It starts nothing and installs no signal handler. The service of the process declares
 * the parts (`host.declare(svc)`), and only the entry of the process starts `run()`.
 *
 * - The faces: HTTP (`procedureHandler`), WebSocket (`upgradeHandler`), MCP (`mcpFace()` of
 *   `@procedures/mcp-server`) and each face factory of another package.
 * - A listener that the host owns is an `httpTransport` of `@mark1russell7/service/http`. Its
 *   faces mount on its mount list, so they share one port. Without a listener, the app mounts
 *   `host.handler` and `host.upgrade` on its own listener.
 * - The request tracking: one route pattern for each face, and a function of the idempotency of
 *   each call (decision D3). Each call is a stream (decision D4). A face of requests that are not
 *   procedure calls, for example the auth routes, tracks them with `track` (CLI-54).
 * - The collections: the option `collections` gives the storages, and the host serves
 *   `collections.<name>.*`. Each storage is a dependency of the service. The expose rule applies
 *   to the collection procedures. Only `host.*` and `events.subscribe` are always on (CLI-47).
 * - The probes: each listener of the host answers the probes of the service under `/_probes`,
 *   through `probeHandler()` of the service (CLI-9, decision D5). The option `probes` changes them.
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse as NodeResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { Check, CheckFn, Dependency, DependencyHandle, Health, Lifecycle, Operation, OperationOf, ServiceBuilder, TransportImpl } from "@mark1russell7/service";
import { httpTransport, pathOf, probeHandler, type HttpKnobs, type MountStage, type ProbeKind, type RequestHandler } from "@mark1russell7/service/http";
import type { KeyedLimiter } from "@mark1russell7/service/limiter";
import {
  PROCEDURE_REGISTRY,
  ProcedureServer,
  TIMER_DEFAULTS,
  hostPolicy,
  hostProcedures,
  metricsInterceptor,
  optionalMs,
  procedureServerOptions,
  realClock,
  seconds,
  type Client,
  type Clock,
  type CollectionProceduresOptions,
  type CollectionStorage,
  type HostPolicy,
  type ProcedurePath,
  type ProcedureRegistry,
  type ProcedureServerOptions,
} from "@procedures/client";
import type { ProcedureHandlerOptions, UpgradeHandlerOptions } from "@procedures/client/node";
import { httpFace, wsFace, type HostFace, type HostFaceFactory } from "./faces.js";
import { callOperations, faceHandler, httpTracker, operationOfCall } from "./tracking.js";

/** The knobs of a transport of the service, by the names of the ordering law. */
export type HostKnobs = Parameters<ServiceBuilder["server"]>[1];

/**
 * The knobs of a listener on the computer of a developer, as data. The transport has no defaults,
 * so the caller gives these values or its own: an idle close of 5 s (the default of Node), a sweep
 * of the idle connections each second, and a `Retry-After` of 1 s on each 503.
 */
export const LOCAL_LISTENER_KNOBS: HttpKnobs = Object.freeze({
  server_idle_close: seconds(5),
  server_idle_sweep_interval: seconds(1),
  server_retry_after: seconds(1),
});

/**
 * The prefix of the probe paths on each listener of a host (CLI-9). By default, no face serves a path
 * under it: the faces serve under `/api`, `/ws` and `/mcp`. The probes mount first, thus a probe
 * path never reaches a face.
 */
export const HOST_PROBE_PREFIX = "/_probes";

/**
 * The probes of the service on the listeners of a host (CLI-9, decision D5). The probes answer
 * from the cache of the health of the service, without the token. They give only the status.
 */
export interface HostProbes {
  /** The path before each probe path. It starts with `/`, and it does not end with `/`. The default is `/_probes`. */
  readonly prefix?: string | undefined;
  /**
   * The stage of the shutdown at which the probes of a listener stop. The default is `stop intake`:
   * the listener closes when the intake stops, as without the probes, and a new connection is refused.
   * `close transports` keeps the listener open through the drain: the probes answer 503, and each
   * other request gets 503 with `Retry-After`. A probe server on a port of its own also answers through the drain.
   */
  readonly until?: MountStage | undefined;
}

/** A collection of the host: its storage, and the procedures `collections.<name>.*`. */
export interface HostCollection {
  readonly storage: CollectionStorage<unknown>;
  /**
   * The procedures `collections.<name>.*`: true (the default), false for none, or the options of
   * `createCollectionProcedures()` (the query policy, the change events).
   */
  readonly procedures?: boolean | CollectionProceduresOptions | undefined;
}

/**
 * The faces of the host. `http` and `ws` take `true`, their options or a face factory. Each other
 * name takes a face factory, for example `mcp: mcpFace()` of `@procedures/mcp-server`.
 */
export interface ProcedureHostFaces {
  readonly http?: boolean | ProcedureHandlerOptions | HostFaceFactory | undefined;
  readonly ws?: boolean | UpgradeHandlerOptions | HostFaceFactory | undefined;
  readonly mcp?: HostFaceFactory | undefined;
  readonly [face: string]: boolean | ProcedureHandlerOptions | UpgradeHandlerOptions | HostFaceFactory | undefined;
}

/** A listener that the host owns: an `httpTransport` of the service on one port. */
export interface HostListener {
  /** The name of the listener: its part is `<host>.listen.<name>`. The default is `http`, or the port when the host has more listeners. */
  readonly name?: string | undefined;
  /** The port. 0 gives a free port, and `host.info` gives the real one. */
  readonly port: number;
  /** The address. The default is `127.0.0.1`: only this computer can reach the procedures. */
  readonly host?: string | undefined;
  /** The faces that mount on this listener. The default is each face of the host. */
  readonly faces?: readonly string[] | undefined;
  /** The knobs of the transport. They have no defaults: give `LOCAL_LISTENER_KNOBS` or your own. */
  readonly knobs: HttpKnobs;
}

/** The options of `ProcedureServer` that the host and its policy do not give. The limits of the calls come from the policy (CLI-40). */
export type HostServerOptions = Omit<
  ProcedureServerOptions,
  "registry" | "collections" | "clock" | "transports" | "expose" | "token" | "principalOf" | "events" | "interceptors" | "limits" | "limitStores"
>;

/** The options of the controller of the calls of a host (CLI-45). */
export interface HostControllerOptions {
  /**
   * The dependencies of the service that each call needs. While a check of one of them fails
   * readiness, the service refuses each call with `UNAVAILABLE`. The default is none.
   */
  readonly requires?: readonly string[] | undefined;
}

/** The options of `createProcedureHost()`. */
export interface ProcedureHostOptions {
  /** The name of the host: the prefix of the names of its parts, and the name of its controller. The default is `procedures`. */
  readonly name?: string | undefined;
  /** The id of the host: `host.info` and `host.health` give it as `peerId`. The default is a new id. */
  readonly id?: string | undefined;
  /** The registry of the procedures. The default is the global registry. */
  readonly registry?: ProcedureRegistry | undefined;
  /**
   * The host policy (`hostPolicy()`): the expose rule, the token, the request hook, the browser
   * checks, the capability and the limits of the calls (CLI-40).
   */
  readonly policy?: HostPolicy | undefined;
  /**
   * The procedures that the host serves. It wins over the expose rule of the policy, for the server
   * and for each face, and `host.policy` has it. The rule applies to the collection procedures too:
   * a rule without `collections.<name>.*` hides them. `host.health`, `host.info`, `host.metrics`
   * and `events.subscribe` are always on (CLI-47).
   */
  readonly expose?: ((path: ProcedurePath) => boolean) | undefined;
  /** True (the default): the host serves each procedure of the registry, also a procedure that the registry gets later. */
  readonly autoRegister?: boolean | undefined;
  /** True (the default): the host counts the calls of each procedure for `host.metrics`. */
  readonly metrics?: boolean | undefined;
  /** The faces. The default is `{ http: true }`. */
  readonly faces?: ProcedureHostFaces | undefined;
  /** The controller of the calls: the dependencies that each call needs (CLI-45). */
  readonly controller?: HostControllerOptions | undefined;
  /** The listeners that the host owns. Without them, the app mounts `host.handler` and `host.upgrade`. */
  readonly listen?: readonly HostListener[] | undefined;
  /**
   * The probes of the service on each listener of the host (CLI-9, decision D5). The default is
   * `true`: `GET /_probes/startup`, `/_probes/readiness` and `/_probes/liveness` answer 200 or 503.
   *
   * - The probes come from `probeHandler()` of `@mark1russell7/service/http`. They answer each
   *   caller, without the token and the browser checks, and they give only the status.
   * - The report of the service (`/_probes/report`) gives the names of the checks and the dependencies.
   *   Thus a listener of the host does not answer it. `host.health` gives the details with the token.
   * - The probes stop when the intake stops, and the listener closes as before. `until` changes this.
   * - `false` turns them off, for example for a process with a probe server on a port of its own.
   * - Without a listener, the app mounts `probeHandler()` on its own listener.
   */
  readonly probes?: boolean | HostProbes | undefined;
  /** The collections by name: a storage, or a storage and its procedures. */
  readonly collections?: Readonly<Record<string, CollectionStorage<unknown> | HostCollection>> | undefined;
  /** The clock of the host: give the clock of the lifecycle. The default is the clock of the platform. */
  readonly clock?: Clock | undefined;
  /** More options of the server: `idempotency`, `authenticate`, `ambientCredentials`, the loggers. */
  readonly serverOptions?: HostServerOptions | undefined;
  /** More endpoints for `host.info`, after the endpoints of the listeners, for example `local://in-process`. */
  readonly endpoints?: readonly HostEndpoint[] | undefined;
}

/** A transport of the host for the service: its name, its knobs and its implementation. */
export interface HostPart {
  readonly name: string;
  readonly knobs: HostKnobs;
  readonly impl: TransportImpl;
}

/** A dependency of the host for the service: a storage, as a dependency handle. */
export interface HostDependency {
  readonly name: string;
  readonly spec: Omit<Dependency, "name">;
  readonly handle: DependencyHandle;
}

/** A check of the host for the service, with its function. */
export interface HostCheck {
  readonly check: Check;
  readonly run: CheckFn;
}

/** A route pattern of the controller of the host: one for each face (decision D3). */
export interface HostPattern {
  readonly pattern: string;
  readonly operations: Readonly<Record<string, Operation>>;
  readonly operationOf: OperationOf;
}

/** The controller of the calls of the host, for the declaration of the service. */
export interface HostController {
  readonly name: string;
  readonly requires: readonly string[];
  readonly patterns: readonly HostPattern[];
}

/** An endpoint of the host: the type of its face and its address. */
export interface HostEndpoint {
  readonly type: string;
  readonly address: string;
}

/** The identity of the host, as `host.info` gives it. */
export interface HostInfo {
  readonly id: string;
  /** The time at which the host was made, from `Date.now()`. */
  readonly startedAt: number;
  /** The endpoints of the faces on the listeners of the host. A listener has its address only after its start. */
  endpoints(): HostEndpoint[];
  /**
   * The base URL of the probes on each listener of the host, for example `http://127.0.0.1:3000/_probes`
   * (CLI-9). The list is empty when the option `probes` is false. A listener has its address only after its start.
   */
  probes(): string[];
  /** The number of the procedures that the host serves now. */
  procedureCount(): number;
}

/** A procedures host: the parts of a service, and the handlers of the faces that the app mounts. */
export interface ProcedureHost {
  readonly name: string;
  readonly id: string;
  readonly server: ProcedureServer;
  readonly registry: ProcedureRegistry;
  /** The policy of the host. Its expose rule is the option `expose` when the options give it. */
  readonly policy: HostPolicy;
  /** The request handler of the faces that are on no listener of the host, for the mount list of the app. */
  readonly handler: (req: IncomingMessage, res: NodeResponse) => boolean;
  /** The upgrade handler of the faces that are on no listener of the host. */
  readonly upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean;
  /** The transports: the procedure server first, then the stop parts of the faces, then each listener of the host. */
  readonly parts: readonly HostPart[];
  /** The dependencies: one for each storage of the collections. */
  readonly dependencies: readonly HostDependency[];
  readonly checks: readonly HostCheck[];
  /** The controller of the calls, with one route pattern for each face. */
  readonly controllers: readonly HostController[];
  /**
   * The keyed limiters of the limits of the policy, on the clock of the host (CLI-40). The server
   * takes one unit of each limit that covers a call, on each face.
   */
  readonly limiters: readonly KeyedLimiter[];
  readonly info: HostInfo;
  /**
   * This method declares the dependencies, the transports, the checks, the controller and the
   * limiters on the builder of a service. Thus `describe()` and `lint()` see each limiter.
   */
  declare(svc: ServiceBuilder): ServiceBuilder;
  /** The ids of the connections of the faces of connections (WebSocket). */
  connections(): string[];
  /** A client of one connection of a face: its calls go to the procedures that the connected client serves. */
  clientFor(connectionId: string): Client;
}

/** The face factory of a name and its value in the options. */
function factoryOf(name: string, value: ProcedureHostFaces[string]): HostFaceFactory | undefined {
  if (value === undefined || value === false) return undefined;
  if (typeof value === "function") return value;
  const options = value === true ? {} : value;
  if (name === "http") return httpFace(options as ProcedureHandlerOptions);
  if (name === "ws") return wsFace(options as UpgradeHandlerOptions);
  throw new Error(`The face "${name}" of the host needs a face factory, for example mcpFace() of @procedures/mcp-server`);
}

/** The storage and the procedures of a collection of the options. */
function collectionOf(value: CollectionStorage<unknown> | HostCollection): HostCollection {
  return typeof (value as CollectionStorage<unknown>).get === "function" ? { storage: value as CollectionStorage<unknown> } : (value as HostCollection);
}

/** The text of an error. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The operations of a storage as a dependency: a read can go again, a write cannot. */
const STORAGE_OPERATIONS: Readonly<Record<string, Operation>> = Object.freeze({ read: { idempotent: true }, write: { idempotent: false } });

/** The prefix and the last stage of the probes of the option `probes`, or undefined when the option turns them off. */
function probesOf(probes: ProcedureHostOptions["probes"]): { prefix: string; until: MountStage } | undefined {
  if (probes === false) return undefined;
  const given = probes === true || probes === undefined ? {} : probes;
  return { prefix: given.prefix ?? HOST_PROBE_PREFIX, until: given.until ?? "stop intake" };
}

/**
 * The probe kinds of a listener of a host: each kind except the report. The report gives the whole
 * verdict, with the names of the checks and the dependencies. A listener answers each caller without
 * the token, thus `probeHandler()` passes the report path on to the next handler (SYS-30).
 */
const LISTENER_PROBE_KINDS: readonly ProbeKind[] = Object.freeze(["startup", "readiness", "liveness"]);

/** This function gives the probes of a listener of a host: `probeHandler()` of the service, without the report. */
function listenerProbes(health: () => Health | null | undefined, prefix: string): RequestHandler {
  return probeHandler(health, { prefix, kinds: LISTENER_PROBE_KINDS });
}

/**
 * This function builds a procedures host. It starts nothing: the service of the process starts
 * its parts (`host.declare(svc)` and `run()`). `createPeer()` declares them in a service of its own.
 *
 * @example
 * ```typescript
 * const host = createProcedureHost({
 *   registry,
 *   policy: hostPolicy({ token }),
 *   faces: { http: true, ws: true, mcp: mcpFace() },
 *   listen: [{ port: 3000, knobs: LOCAL_LISTENER_KNOBS }],
 * });
 * const svc = host.declare(service("mark").profile(localDev));
 * ```
 */
export function createProcedureHost(options: ProcedureHostOptions = {}): ProcedureHost {
  const name = options.name ?? "procedures";
  const id = options.id ?? `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const registry = options.registry ?? PROCEDURE_REGISTRY;
  // The option expose wins over the rule of the policy. The server and each face get the same
  // rule, so a face lists only the procedures that the server serves (CLI-47).
  const givenPolicy = options.policy ?? hostPolicy();
  const policy: HostPolicy = options.expose ? { ...givenPolicy, expose: options.expose } : givenPolicy;
  const clock = options.clock ?? realClock;
  const startedAt = Date.now();

  // The server: the policy, the metrics of host.metrics (R19) and the options of the caller
  const metrics = options.metrics === false ? undefined : metricsInterceptor();
  const base = procedureServerOptions(policy, registry);
  const interceptors = [...(base.interceptors ?? []), ...(metrics ? [metrics.interceptor] : [])];
  const server = new ProcedureServer({
    ...base,
    ...options.serverOptions,
    ...(interceptors.length > 0 ? { interceptors } : {}),
    autoRegister: options.autoRegister ?? true,
    registry,
    clock,
  });

  // The collections, from the option: the storage, and the procedures collections.<name>.*
  for (const [collection, value] of Object.entries(options.collections ?? {})) {
    const { storage, procedures } = collectionOf(value);
    server.useStorage(collection, storage);
    if (procedures !== false) server.registerCollectionProcedures(collection, procedures === true || procedures === undefined ? undefined : procedures);
  }

  // The lifecycle of the service, from the start of the part of the server. Before it, no tracking.
  let life: Lifecycle | null = null;
  const idempotency = options.serverOptions?.idempotency;
  const keyedWindowMs = idempotency === false ? undefined : (optionalMs(idempotency?.ttl, "idempotency.ttl") ?? TIMER_DEFAULTS.idempotency.ttlMs);

  // The faces
  const faceSpecs = options.faces ?? { http: true };
  const faces = new Map<string, HostFace>();
  for (const [faceName, value] of Object.entries(faceSpecs)) {
    const factory = factoryOf(faceName, value);
    if (!factory) continue;
    const handler = faceHandler({ server, controller: name, face: faceName, life: () => life, keyed: keyedWindowMs !== undefined });
    // The tracking of the requests of the face that are not procedure calls, on the same route pattern (CLI-54)
    const track = httpTracker({ controller: name, face: faceName, life: () => life });
    faces.set(faceName, factory({ name: faceName, handler, server, registry, policy, clock, track }));
  }

  // The listeners that the host owns, each one with the faces of its mount list. The responses
  // and the upgraded sockets of each listener go into one record, so the close of a face or of a
  // listener first lets each answer go out (CLI-48).
  const outgoing = outgoingAnswers();
  const listeners = options.listen ?? [];
  const onListener = new Set<string>();
  const endpoints: Array<() => HostEndpoint[]> = [];
  // The probes of the service on each listener (CLI-9, D5): from the health of the lifecycle, which
  // the part of the server gets before a listener starts
  const probes = probesOf(options.probes);
  const probeBases: Array<() => string | undefined> = [];
  const listenerParts: HostPart[] = listeners.map((listener, index) => {
    const host = listener.host ?? "127.0.0.1";
    const listenerName = listener.name ?? (listeners.length === 1 ? "http" : String(listener.port || index));
    const transport = httpTransport(createServer(), listener.knobs, { listen: { port: listener.port, host }, clock });
    const shown = host === "0.0.0.0" || host === "::" ? "localhost" : host;
    // The probes mount first: a probe path never reaches a face, and a face gets each other path as
    // before. By default they stop with the intake, thus the listener still closes at the stop of the intake.
    if (probes !== undefined) {
      transport.mount(listenerProbes(() => life?.health, probes.prefix), { until: probes.until });
      probeBases.push(() => {
        const address = transport.server.address();
        return typeof address === "object" && address !== null ? `http://${shown}:${address.port}${probes.prefix}` : undefined;
      });
    }
    const mounted = (listener.faces ?? [...faces.keys()]).map((faceName) => {
      const face = faces.get(faceName);
      if (!face) throw new Error(`The listener "${listenerName}" names the face "${faceName}", which the host does not have`);
      onListener.add(faceName);
      if (face.handler) {
        const handle = face.handler;
        transport.mount((req, res) => {
          const taken = handle(req, res);
          if (taken) outgoing.response(res);
          return taken;
        });
      }
      if (face.upgrade) {
        const upgrade = face.upgrade;
        transport.upgrade(upgrade.match, (req, socket, head) => {
          outgoing.socket(socket as Duplex);
          upgrade.handler(req, socket as Duplex, head as Buffer);
        });
      }
      return face;
    });
    endpoints.push(() => {
      const address = transport.server.address();
      if (typeof address !== "object" || address === null) return [];
      return mounted.flatMap((face) => (face.endpoint ? [{ type: face.endpoint.type, address: `${face.endpoint.scheme}://${shown}:${address.port}${face.endpoint.path}` }] : []));
    });
    // The faces of a listener of WebSocket only: the error of its listen names WebSocket
    const what = mounted.every((face) => face.upgrade && !face.handler) ? "WebSocket" : "HTTP";
    const impl: TransportImpl = {
      start: async (signal, lifecycle) => {
        try {
          await transport.start(signal, lifecycle);
        } catch (error) {
          throw new Error(`The ${what} server cannot listen on ${host}:${listener.port}: ${messageOf(error)}`, { cause: error });
        }
      },
      stopIntake: () => transport.stopIntake(),
      drain: (deadline, signal) => transport.drain(deadline, signal),
      inFlight: () => transport.inFlight(),
      // The close destroys each connection: first each answer that a face ended goes out (CLI-48)
      close: async () => {
        await outgoing.flushed();
        await transport.close();
      },
    };
    return { name: `${name}.listen.${listenerName}`, knobs: transport.knobs, impl };
  });

  // The faces on no listener: the app mounts them
  const appFaces = [...faces.entries()].filter(([faceName]) => !onListener.has(faceName)).map(([, face]) => face);
  const handler = (req: IncomingMessage, res: NodeResponse): boolean => {
    for (const face of appFaces) if (face.handler?.(req, res)) return true;
    return false;
  };
  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    for (const face of appFaces) {
      const match = face.upgrade?.match;
      if (match === undefined) continue;
      if (typeof match === "string" ? pathOf(req.url) === match : match(req)) {
        face.upgrade!.handler(req, socket, head);
        return true;
      }
    }
    return false;
  };

  // The transports: the server first, so its part has the lifecycle before a listener takes a call
  const serverPart: HostPart = {
    name,
    knobs: {},
    impl: {
      start: (_signal, lifecycle) => {
        life = lifecycle;
        return server.start();
      },
      stopIntake: () => server.stopIntake(),
      drain: (deadline, signal) => server.drain(deadline, signal),
      inFlight: () => server.inFlight(),
      close: () => server.close(),
    },
  };
  // The close of a face (the sessions of MCP, the connections of WebSocket) also lets each answer go out first (CLI-48)
  const faceParts: HostPart[] = [...faces.entries()].flatMap(([faceName, face]) => {
    const impl = face.parts;
    if (!impl) return [];
    const part: TransportImpl = {
      start: (signal, lifecycle) => impl.start(signal, lifecycle),
      stopIntake: () => impl.stopIntake(),
      drain: (deadline, signal) => impl.drain(deadline, signal),
      inFlight: () => impl.inFlight(),
      close: async () => {
        await outgoing.flushed();
        await impl.close();
      },
    };
    return [{ name: `${name}.${faceName}`, knobs: {}, impl: part }];
  });
  const parts: HostPart[] = [serverPart, ...faceParts, ...listenerParts];

  const dependencies: HostDependency[] = server.storageHandles().map((handle) => ({
    name: handle.name,
    spec: { system: null, knobs: {}, operations: STORAGE_OPERATIONS },
    handle,
  }));
  const checks: HostCheck[] = [];
  const operations = callOperations(keyedWindowMs);
  const controllers: HostController[] = [
    {
      name,
      requires: [...(options.controller?.requires ?? [])],
      patterns: [...faces.keys()].map((faceName) => ({ pattern: `${faceName} *`, operations, operationOf: operationOfCall })),
    },
  ];

  // The limiters of the limits of the policy: the server made them on the clock of the host (CLI-40)
  const limiters = server.limiters();

  const info: HostInfo = {
    id,
    startedAt,
    endpoints: () => [...endpoints.flatMap((each) => each()), ...(options.endpoints ?? [])],
    probes: () => probeBases.flatMap((each) => each() ?? []),
    procedureCount: () => server.procedureCount,
  };
  // host.health, host.info and host.metrics: pinned on the server, not in the registry (R19). They
  // are always on: the expose rule hides each other pin, but not them (CLI-47).
  server.registerProcedures(hostProcedures({ id, startedAt, server, endpoints: () => info.endpoints(), ...(metrics ? { metrics } : {}) }), { alwaysOn: true });

  return {
    name,
    id,
    server,
    registry,
    policy,
    handler,
    upgrade,
    parts,
    dependencies,
    checks,
    controllers,
    limiters,
    info,
    declare(svc: ServiceBuilder): ServiceBuilder {
      for (const dependency of dependencies) svc.dependency(dependency.name, dependency.spec, dependency.handle);
      for (const part of parts) svc.server(part.name, part.knobs, part.impl);
      for (const { check, run } of checks) svc.check(check, run);
      for (const controller of controllers) {
        const builder = svc.controller(controller.name).requires(...controller.requires);
        for (const pattern of controller.patterns) builder.pattern(pattern.pattern, pattern.operations, pattern.operationOf);
      }
      // Each limiter as data: describe() shows it, and a shared store must be a dependency of the service
      for (const limiter of limiters) svc.limiter(limiter.name, limiter.spec);
      return svc;
    },
    connections: () => [...faces.values()].flatMap((face) => face.connections?.() ?? []),
    clientFor(connectionId: string): Client {
      for (const face of faces.values()) {
        const client = face.clientFor?.(connectionId);
        if (client) return client;
      }
      throw new Error(`Connection not found: ${connectionId}`);
    },
  };
}

/** The answers that go out on the listeners of a host: each response of a face, and each upgraded socket. */
interface OutgoingAnswers {
  /** This method records a response of a face until its end. */
  response(res: NodeResponse): void;
  /** This method records an upgraded socket until its close. */
  socket(socket: Duplex): void;
  /**
   * This method waits until each answer that a face wrote has gone out to the socket. It first gives
   * one turn of the event loop, so each chain of promises that writes an answer ends (the MCP SDK).
   * Then it waits for the event `finish` of each response that is ended, and for the write callback
   * of each socket that has bytes to write. An open stream that is not ended does not hold it.
   */
  flushed(): Promise<void>;
}

/** An empty write: its callback comes after each write before it. */
const FLUSH = Buffer.alloc(0);

/** This function makes the record of the answers that go out on the listeners of a host (CLI-48). */
function outgoingAnswers(): OutgoingAnswers {
  const responses = new Set<NodeResponse>();
  const sockets = new Set<Duplex>();
  return {
    response(res) {
      if (responses.has(res)) return;
      responses.add(res);
      const done = (): void => {
        responses.delete(res);
      };
      res.once("finish", done);
      res.once("close", done);
    },
    socket(socket) {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    },
    async flushed() {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const waits: Array<Promise<void>> = [];
      for (const res of responses) {
        if (!res.writableEnded || res.writableFinished || res.destroyed) continue;
        waits.push(
          new Promise<void>((resolve) => {
            res.once("finish", () => resolve());
            res.once("close", () => resolve());
          }),
        );
      }
      for (const socket of sockets) {
        if (socket.destroyed || !socket.writable || socket.writableLength === 0) continue;
        waits.push(new Promise<void>((resolve) => socket.write(FLUSH, () => resolve())));
      }
      await Promise.all(waits);
    },
  };
}

export { httpFace, wsFace } from "./faces.js";
export { localFace, type LocalFace } from "./local-face.js";
export type { HostFace, HostFaceContext, HostFaceEndpoint, HostFaceFactory, HostFaceUpgrade } from "./faces.js";
export { callOperations, faceHandler, httpTracker, operationOfCall } from "./tracking.js";
export type { CallDetail, CallOperation, FaceHandler, FaceHandlerOptions, HttpTracker, HttpTrackerOptions } from "./tracking.js";
