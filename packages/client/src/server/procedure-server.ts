/**
 * Procedure Server
 *
 * Server implementation with procedure auto-registration and repository pattern.
 * Integrates with ProcedureRegistry and CollectionStorage backends.
 */

import { Server, type ServerOptions } from "./server.js";
import type { AmbientCredentials, Credentials, Method, Principal, PrincipalOf, RequestIdentity, ServerHandler, ServerRequest, ServerResponse } from "./types.js";
import { methodToPath, pathToMethod } from "./method.js";
import type {
  AnyProcedure,
  ProcedurePath,
  RepositoryProvider,
  ProcedureModule,
} from "../procedures/types.js";
import { pathToKey } from "../procedures/types.js";
import { ProcedureRegistry, PROCEDURE_REGISTRY } from "../procedures/registry.js";
import { createCollectionProcedures } from "../procedures/collection/procedures.js";
import { InvocationError, invokeProcedure, type AdmitItem, type Interceptor, type Invocation } from "../procedures/invoke.js";
import type { Capability, ClearanceOrder, ProcedureContext, ResourcesOf } from "../procedures/types.js";
import type { CollectionPartitions } from "../procedures/collection/partition.js";
import { TIMEOUT_METADATA_KEY, effectsOf, joinNarrowing, narrowCapability } from "../procedures/capability.js";
import { IdempotencyCache, idempotencyKeyOf, isRepeatable, type IdempotencyOptions } from "../procedures/idempotency.js";
import { optionalMs, type Duration } from "../duration.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";
import { TIMER_DEFAULTS } from "../timers.js";
import { realClock, type Clock } from "../clock.js";
import { errorCodeOf } from "../protocol.js";
import { EventPublisher, type EventPublisherOptions } from "../events/publisher.js";
import { getGlobalEventBus } from "../events/bus.js";
import type { CollectionProceduresOptions } from "../procedures/collection/procedures.js";
import type { NarrowingNote } from "../procedures/narrowing.js";
import type { ServerDebugReport } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Storage configuration for a collection.
 */
export interface StorageConfig<T = unknown> {
  /** Storage backend instance */
  storage: CollectionStorage<T>;
  /** Collection name (for mapping) */
  name: string;
}

/** How `ProcedureServer.useStorage` puts a new storage in the place of an old one (roadmap R28). */
export interface UseStorageOptions {
  /**
   * True: the server calls `flush()` of the old storage before it changes the storage. When the
   * flush fails, the old storage stays and `useStorage` throws.
   */
  drain?: boolean | undefined;
  /**
   * True: the server closes the old storage after the change. The close waits for the calls that
   * took the old storage, for the time of `grace` at most.
   */
  close?: boolean | undefined;
  /**
   * The longest time that the close waits for the calls on the old storage, for example
   * `seconds(5)`. When the time ends, the server closes the old storage. A call that still uses it
   * then fails with the error of a closed storage. 0: the server closes it at once.
   * @default 30 seconds (`TIMER_DEFAULTS.server.storageGraceMs`)
   */
  grace?: Duration | undefined;
}

/**
 * Options for ProcedureServer.
 */
export interface ProcedureServerOptions extends ServerOptions {
  /** Procedure registry to use (defaults to global) */
  registry?: ProcedureRegistry;

  /** Whether to auto-register all procedures from registry */
  autoRegister?: boolean;

  /** Collections to configure with storage backends */
  collections?: Record<string, CollectionStorage<unknown>>;

  /**
   * The clock of the waits of the server (roadmap R35): the wait of `useStorage` for the calls on
   * an old storage, the deadline of `drain()` and the grace of `stop()` (CLI-5). The default is the
   * clock of the platform. A test gives a fake clock. The runner gives the clock of its lifecycle.
   */
  clock?: Clock | undefined;

  /**
   * The procedures that the callers of this server can reach. The rule applies to each procedure
   * that the server serves: the procedures of the registry and the procedures that
   * `registerProcedure()` pins, also the collection procedures (CLI-47). Only a procedure that the
   * server pins with `alwaysOn` is outside the rule. A data-driven procedure (control flow, `eval`,
   * a procedure that `procedure.define` made) can call only these procedures too, because its
   * caller chooses what it calls. A procedure of code calls the procedures of its `metadata.calls`
   * (`docker.run` declares `shell.run`) and the exposed ones. Without this rule, the server
   * exposes every procedure. See `procedures/policy.ts` (deep dive MCP-3).
   */
  expose?: ((path: ProcedurePath) => boolean) | undefined;

  /**
   * True: a procedure of code without `metadata.calls` can call only the exposed procedures.
   * A server for an outside caller (the MCP server of the dev tools) sets it.
   */
  strictCalls?: boolean | undefined;

  /**
   * The interceptors of each request and its nested calls, the outermost first: policy,
   * tracing, timeouts, metrics (see `procedures/interceptors.ts`).
   */
  interceptors?: readonly Interceptor[] | undefined;

  /**
   * The capability of each request (CAPABILITIES-2026-10): one value, or a function of the
   * request. The function reads only what the transport authenticated. Without it: no limits.
   */
  capability?: Capability | ((request: ServerRequest<unknown>) => Capability | undefined) | undefined;
  /** The order of the clearance values. */
  clearanceOrder?: ClearanceOrder | undefined;
  /** The resources of each invocation for its capability (`ctx.resources`). */
  resources?: ((invocation: Invocation) => ResourcesOf) | undefined;
  /** The filter of the output that leaves the server. */
  admitItem?: AdmitItem | undefined;

  /**
   * The results of keyed calls (roadmap R1). A call to a procedure that is not repeatable, with
   * an idempotency key in its metadata, runs one time: a later try with the same key gets the
   * same result. `false` turns this off. The default keeps 1000 results for 10 minutes.
   */
  idempotency?: IdempotencyOptions | false | undefined;

  /**
   * The token of the server (roadmap R18). Each request with credentials (a network request)
   * must present it as its bearer token, or the server answers `UNAUTHORIZED`. Before, only the
   * Express middleware of the peer examined the token, so a `ProcedureServer` with the HTTP or
   * WebSocket transport of the core and the token of a host policy accepted each request.
   */
  token?: string | undefined;

  /**
   * This function gives the principal of a request, or undefined to refuse it with
   * `UNAUTHORIZED`. It runs after the token check. The capability function can read
   * `request.principal`.
   */
  authenticate?: ((request: ServerRequest<unknown>) => Principal | undefined | Promise<Principal | undefined>) | undefined;

  /**
   * The request hook of the server: it reads the credentials of each network request (a cookie, a
   * header, the query) and gives a bearer token, a principal and a narrowing. It runs before the
   * token check: its bearer token replaces the bearer token of the credentials. Its principal
   * replaces the principal of the token check. `authenticate` runs after it and can read
   * `request.principal`. Undefined or an error refuses the request with `UNAUTHORIZED`. A request
   * without credentials (from this process) does not go through the hook.
   */
  principalOf?: PrincipalOf | undefined;

  /**
   * How the server can authenticate a request with ambient credentials (cookies), for the CSRF
   * checks of the network faces. The default is `"always"` with `principalOf`, `"cookies"` with
   * `authenticate`, and none without them. `false`: the server reads no cookies, for example an
   * `authenticate` function that reads only the bearer token.
   */
  ambientCredentials?: AmbientCredentials | false | undefined;

  /**
   * The remote events of the server (`documentation/EVENTS.md`): a bus and its topic rule, or an
   * `EventPublisher`. The server pins the procedure `events.subscribe`, outside its registry, so a
   * peer can subscribe to the topics. The procedures of the server get this bus as `ctx.bus`.
   * `stop()` ends each subscription first, with `UNAVAILABLE`.
   */
  events?: EventPublisherOptions | EventPublisher | undefined;

  /**
   * The debug reports of the server. `true` writes each report with `console.debug`, and a
   * function gets each report. The server reports each part of the narrowing of a call that has
   * no effect (CLI-30). Such a part asks for more than the call holds, or it is not valid. The
   * call goes on without that part. The server also reports a source that refuses the call.
   * @default false
   */
  debug?: boolean | ((report: ServerDebugReport) => void) | undefined;
}

/** The options of `registerProcedure()`, `registerProcedures()` and `registerModule()` (CLI-47). */
export interface RegisterProcedureOptions {
  /**
   * True: the server serves the procedure, also when its expose rule does not match the path. A
   * host sets it only for its own procedures: `host.health`, `host.info` and `host.metrics`. The
   * server sets it for `events.subscribe`, because the topic rule is the expose rule of that
   * procedure. False: the expose rule applies, as for a procedure of the registry.
   * @default false
   */
  alwaysOn?: boolean | undefined;
}

/**
 * The metadata key of a stream response whose procedure declares `stream: { unbounded: true }`.
 * Its value is "unbounded".
 */
export const STREAM_METADATA_KEY = "stream";

/** True when a stream response can run without an end (roadmap R15). */
export function isUnboundedStream(response: { metadata?: Record<string, unknown> | undefined }): boolean {
  return response.metadata?.[STREAM_METADATA_KEY] === "unbounded";
}

/**
 * True when the presented token is the expected one. The comparison reads each character of the
 * expected token for each presented token, so its time depends only on the expected token. The
 * time tells neither the token nor its length. The function runs in a browser too, so it uses
 * no `node:crypto`.
 */
export function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (presented === undefined) return false;
  // A difference of the lengths makes the result false, after the same loop as an equal length
  let difference = expected.length ^ presented.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (presented.charCodeAt(index) | 0);
  return difference === 0;
}

/** The options of `ProcedureServer.stop()`. */
export interface StopOptions {
  /**
   * The time for the calls in flight to end (roadmap R14). The server refuses new calls at once
   * with a retryable `UNAVAILABLE`. When the time ends, the server aborts the calls that still
   * run. Absent or 0: the server aborts them at once.
   */
  grace?: Duration | undefined;
}

/**
 * The stop parts of a server in the shape of a transport of the runner (`TransportImpl` of
 * `@mark1russell7/service`, CLI-5). The type is structural, so the engine imports no code of the
 * runner. The stage `stop intake` calls `stopIntake()`, the stage `drain` calls `drain()`, and
 * the stage `close transports` calls `close()`.
 */
export interface StopParts {
  /** This method refuses each new call with a retryable `UNAVAILABLE`, and ends each subscription. */
  stopIntake(): Promise<void> | void;
  /**
   * This method waits until no call is in flight, or until `deadline` (milliseconds on the clock
   * of the server). When `signal` aborts, each call that still runs gets the abort.
   */
  drain(deadline: number, signal: AbortSignal): Promise<void> | void;
  /** This method gives the number of calls in flight. A stream is in flight until its end. */
  inFlight(): number;
  /** This method aborts each call that still runs and stops the transports. A second close has no effect. */
  close(): Promise<void> | void;
}

/**
 * A storage of the server as a dependency of the runner (`DependencyHandle` of
 * `@mark1russell7/service`, CLI-5). The runner closes it in the stage `tear down dependencies`,
 * after the transports close. Thus no call uses a closed storage.
 */
export interface StorageHandle {
  /** The name of the dependency: `collections.` and the names of the collections of the storage, joined with `+`. */
  readonly name: string;
  /** The collections that use the storage, in the sequence of their configuration. */
  readonly collections: readonly string[];
  readonly storage: CollectionStorage<unknown>;
  /** A storage is open from its construction, so this method does nothing. */
  connect(signal: AbortSignal): Promise<void> | void;
  /** This method closes the storage and removes its collections from the server. */
  close(): Promise<void>;
}

/** The items of a stream. At the end of the stream, or when its reader stops, `release` runs. */
async function* releasedAtEnd<T>(items: AsyncIterable<T>, release: () => void): AsyncGenerator<T, void, undefined> {
  try {
    yield* items;
  } finally {
    release();
  }
}

/** A signal that aborts when one of the signals aborts. */
function joinSignals(first: AbortSignal | undefined, second: AbortSignal): AbortSignal {
  if (!first) return second;
  const any = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (any) return any([first, second]);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (first.aborted || second.aborted) controller.abort();
  first.addEventListener("abort", abort, { once: true });
  second.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

/** This function waits for a promise, or gives undefined when the signal aborts first. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T | undefined> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve(undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** The capability of a request with the remaining time of its caller, when it sends one. */
function withRequestTimeout(
  capability: Capability | undefined,
  request: ServerRequest<unknown>,
  order: ClearanceOrder | undefined
): Capability | undefined {
  const timeoutMs = request.metadata[TIMEOUT_METADATA_KEY];
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) return capability;
  return narrowCapability(capability, { timeoutMs }, order);
}

/**
 * The error response of a failed invocation. An invocation error keeps its code
 * (VALIDATION_ERROR, NOT_EXPOSED, ABORTED and so on). An error of the handler keeps its own code
 * when it is a string, as for a stream (`WIRE-PROTOCOL.md`). Without a code, it is HANDLER_ERROR.
 */
export function errorResponse(id: string, error: unknown): ServerResponse<unknown> {
  // An error that says it is retryable stays retryable: before, every error lost the flag
  // (deep dive TRN-7)
  const retryable = (error as { retryable?: unknown } | undefined)?.retryable;
  // A refusal of the capability says why (CAPABILITIES-2026-10)
  const reason = error instanceof InvocationError ? error.reason : undefined;
  // An error can ask the client to wait before a retry: retryAfterMs, in milliseconds (R12)
  const retryAfterMs = (error as { retryAfterMs?: unknown } | undefined)?.retryAfterMs;
  const metadata: Record<string, unknown> = reason ? { reason } : {};
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) metadata["retry-after"] = retryAfterMs;
  return {
    id,
    status: {
      type: "error",
      code: errorCodeOf(error),
      message: error instanceof Error ? error.message : String(error),
      retryable: typeof retryable === "boolean" ? retryable : false,
    },
    metadata,
  };
}

// =============================================================================
// Procedure Server
// =============================================================================

/**
 * Server with procedure auto-registration and repository pattern.
 *
 * Features:
 * - Auto-registers handlers from procedure definitions
 * - Repository pattern for storage backend injection
 * - Collection storage configuration per-collection
 * - Integrates with ProcedureRegistry
 *
 * @example
 * ```typescript
 * const server = new ProcedureServer({
 *   collections: {
 *     users: new ApiStorage(remoteClient, { service: 'users' }),
 *     cache: new InMemoryStorage(),
 *   }
 * });
 *
 * // Register collection procedures
 * server.registerCollectionProcedures('users');
 *
 * // Or auto-register all from registry
 * server.registerFromRegistry();
 *
 * await server.start();
 * ```
 */
export class ProcedureServer extends Server implements RepositoryProvider, StopParts {
  private readonly procedureRegistry: ProcedureRegistry;
  private readonly storages = new Map<string, CollectionStorage<unknown>>();
  /** The partitions of each partitioned collection: their storages and their resolver (roadmap CLI-17) */
  private readonly partitions = new Map<string, CollectionPartitions<unknown>>();
  /** For each storage: the calls in flight that took it, and the closes that wait for them */
  private readonly storageUses = new Map<CollectionStorage<unknown>, { calls: number; waiters: Array<() => void> }>();
  /** The clock of the wait of `useStorage` */
  private readonly clock: Clock;
  /**
   * The procedures that `registerProcedure` pinned, by key. The expose rule applies to each one,
   * unless the pin is `alwaysOn` (CLI-47).
   */
  private readonly pinnedProcedures = new Map<string, { readonly procedure: AnyProcedure; readonly alwaysOn: boolean }>();
  /**
   * True after `registerFromRegistry()`: the server serves each procedure of the registry that
   * has a handler and passes the expose rule, looked up when the request arrives (deep dive
   * TRN-13). Before, the server copied the registry at startup: a later registration was not
   * found, and an override or an unregistration was not seen.
   */
  private servesRegistry = false;
  private readonly expose: ((path: ProcedurePath) => boolean) | undefined;
  private readonly strictCalls: boolean;
  private readonly interceptors: readonly Interceptor[];
  /** The capability options of the requests (CAPABILITIES-2026-10). */
  private readonly capabilityOptions: Pick<ProcedureServerOptions, "capability" | "clearanceOrder" | "resources" | "admitItem">;
  /** The results of keyed calls, or undefined when the option turns them off (R1). */
  private readonly idempotency: IdempotencyCache<ServerResponse<unknown>> | undefined;
  /**
   * The signal of the server: the cooperative abort of `drain()` and `close()` abort it. Each call
   * gets it joined with its request signal (the request and connection scopes) and its deadline
   * (roadmap R14).
   */
  private lifetime = new AbortController();
  /** True from `stopIntake()` until the next `start()`: a new call gets UNAVAILABLE */
  private draining = false;
  /** The calls in flight, a stream until its end */
  private calls = 0;
  /** The close of this run: a second `close()` gives the same promise (CLI-5) */
  private closing: Promise<void> | undefined;
  /** The token of the server, its request hook and its authenticate function (R18) */
  private readonly token: string | undefined;
  private readonly principalOf: PrincipalOf | undefined;
  private readonly authenticate: ProcedureServerOptions["authenticate"];
  /** The functions that `drain()` waits on: each one runs when no call is in flight */
  private idleWaiters: Array<() => void> = [];
  /** The publisher of the remote events, from the option `events`, or undefined. */
  readonly publisher: EventPublisher | undefined;
  /**
   * How the server can authenticate a request with ambient credentials (cookies). The network faces
   * read it: they trust such a request only from a named origin (CSRF).
   */
  readonly ambientCredentials: AmbientCredentials | undefined;
  /** The receiver of the debug reports, or undefined when the option `debug` is off. */
  private readonly debugReport: ((report: ServerDebugReport) => void) | undefined;

  constructor(options: ProcedureServerOptions = {}) {
    super(options);

    this.procedureRegistry = options.registry ?? PROCEDURE_REGISTRY;
    this.clock = options.clock ?? realClock;
    this.expose = options.expose;
    this.strictCalls = options.strictCalls ?? false;
    this.interceptors = options.interceptors ?? [];
    this.capabilityOptions = {
      capability: options.capability,
      clearanceOrder: options.clearanceOrder,
      resources: options.resources,
      admitItem: options.admitItem,
    };
    this.idempotency = options.idempotency === false ? undefined : new IdempotencyCache(options.idempotency ?? {});
    this.token = options.token;
    this.principalOf = options.principalOf;
    this.authenticate = options.authenticate;
    const ambient = options.ambientCredentials ?? (this.principalOf ? "always" : this.authenticate ? "cookies" : undefined);
    this.ambientCredentials = ambient === false ? undefined : ambient;
    this.debugReport =
      typeof options.debug === "function"
        ? options.debug
        : options.debug === true
          ? (report) => console.debug(`[ProcedureServer] ${report.topic} of ${report.requestId}: ${report.message}`)
          : undefined;
    // The remote events: the server pins events.subscribe, as a host pins host.health (EVENTS.md).
    // The topic rule is its expose rule, so the pin is always on (CLI-47).
    this.publisher = options.events instanceof EventPublisher ? options.events : options.events ? new EventPublisher(options.events) : undefined;
    if (this.publisher) this.registerProcedure(this.publisher.procedure, { alwaysOn: true });

    // Configure collections
    if (options.collections) {
      for (const [name, storage] of Object.entries(options.collections)) {
        this.storages.set(name, storage);
      }
    }

    // Auto-register if enabled
    if (options.autoRegister) {
      this.registerFromRegistry();
    }
  }

  // ===========================================================================
  // RepositoryProvider Implementation
  // ===========================================================================

  /**
   * Get storage for a collection.
   *
   * @param collection - Collection name
   * @returns Storage instance
   * @throws Error if collection not configured
   */
  getStorage<T>(collection: string): CollectionStorage<T> {
    const storage = this.storages.get(collection);
    if (!storage) {
      throw new Error(`Collection storage not configured: ${collection}`);
    }
    return storage as CollectionStorage<T>;
  }

  /**
   * Check if a collection is configured.
   *
   * @param collection - Collection name
   */
  hasCollection(collection: string): boolean {
    return this.storages.has(collection) || this.partitions.has(collection);
  }

  /**
   * The storage of one partition of a collection (roadmap CLI-17).
   *
   * @throws Error if the collection has no partitions
   */
  getPartitionStorage<T>(collection: string, partition: string): CollectionStorage<T> {
    const partitions = this.partitions.get(collection);
    if (!partitions) {
      throw new Error(`Collection has no partitions: ${collection}`);
    }
    return partitions.storageOf(partition) as CollectionStorage<T>;
  }

  /** True when the collection has partitions (roadmap CLI-17). */
  hasPartitions(collection: string): boolean {
    return this.partitions.has(collection);
  }

  /**
   * The partition of a call to a partitioned collection (roadmap CLI-17), from the resolver of
   * `usePartitions`. `null` refuses the call.
   *
   * @throws Error if the collection has no partitions
   */
  resolvePartition(collection: string, ctx: ProcedureContext, requested: string | undefined): string | undefined | null | Promise<string | undefined | null> {
    const partitions = this.partitions.get(collection);
    if (!partitions) {
      throw new Error(`Collection has no partitions: ${collection}`);
    }
    return partitions.resolve(ctx, requested);
  }

  /**
   * Configure the partitions of a collection (roadmap CLI-17). `resolve` gives the partition of
   * each call from its context (the tenant of `ctx.principal`) and the partition that the call asks
   * for: the collection procedures and the subscriptions of `EventPublisher` use it. `storageOf`
   * gives the storage of a partition: give the same storage for the same partition each time.
   *
   * The name can have a dot (roadmap CLI-42). The topic of a partition encodes the name, so the
   * name and the partition of a topic stay apart (`collectionChangeTopic()`).
   *
   * @param name - Collection name
   * @param partitions - The storage of each partition, and the resolver
   * @returns this (for chaining)
   */
  usePartitions<T>(name: string, partitions: CollectionPartitions<T>): this {
    this.partitions.set(name, partitions as CollectionPartitions<unknown>);
    return this;
  }

  // ===========================================================================
  // Storage Configuration
  // ===========================================================================

  /**
   * Configure storage for a collection.
   *
   * Without options, the server uses the new storage at once, and the old storage stays as it
   * is. With options, the change is asynchronous (roadmap R28):
   *
   * - `drain`: the server calls `flush()` of the old storage, then it uses the new storage. A
   *   failed flush keeps the old storage and throws. A call that arrives during the flush goes
   *   to the old storage.
   * - `close`: the server closes the old storage after the change. The close of a
   *   `HybridStorage` sends the writes that arrived during the flush. An old storage that another
   *   collection still uses stays open: the server closes it when the last collection leaves it.
   * - The new calls use the new storage at once. Before the close, the server waits for the calls
   *   that took the old storage, for the time of `grace` at most. Before, such a call could fail
   *   because the storage was closed.
   *
   * @param name - Collection name
   * @param storage - Storage backend
   * @param options - Drain and close the old storage
   * @returns this (for chaining), or a promise of it when options are given
   */
  useStorage<T>(name: string, storage: CollectionStorage<T>): this;
  useStorage<T>(name: string, storage: CollectionStorage<T>, options: UseStorageOptions): Promise<this>;
  useStorage<T>(name: string, storage: CollectionStorage<T>, options?: UseStorageOptions): this | Promise<this> {
    if (options === undefined) {
      this.storages.set(name, storage as CollectionStorage<unknown>);
      return this;
    }
    return this.replaceStorage(name, storage as CollectionStorage<unknown>, options);
  }

  /**
   * The change of `useStorage` with options: flush the old storage, change, wait for the calls on
   * the old storage, and close it.
   */
  private async replaceStorage(name: string, storage: CollectionStorage<unknown>, options: UseStorageOptions): Promise<this> {
    const graceMs = optionalMs(options.grace, "grace") ?? TIMER_DEFAULTS.server.storageGraceMs;
    const old = this.storages.get(name);
    const other = old !== undefined && old !== storage ? old : undefined;
    if (other && options.drain) {
      await other.flush?.();
    }
    this.storages.set(name, storage);
    // Another collection that uses the same storage keeps it open. Before, the close broke the
    // calls of that collection (tracker O31).
    if (other && options.close && ![...this.storages.values()].includes(other)) {
      await this.callsOnStorageEnded(other, graceMs);
      await other.close();
    }
    return this;
  }

  /** A promise that resolves when no call uses the storage, or when `graceMs` ends. */
  private callsOnStorageEnded(storage: CollectionStorage<unknown>, graceMs: number): Promise<void> {
    const use = this.storageUses.get(storage);
    if (!use || graceMs <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = (): void => {
        cancel();
        const index = use.waiters.indexOf(done);
        if (index >= 0) use.waiters.splice(index, 1);
        resolve();
      };
      const cancel = this.clock.after(graceMs, done);
      use.waiters.push(done);
    });
  }

  /**
   * The repository of one call. The call is a user of each storage that it takes, until
   * `release()`. Then a close of `useStorage` can go on.
   */
  private callRepository(): { repository: RepositoryProvider; release: () => void } {
    const taken = new Set<CollectionStorage<unknown>>();
    let released = false;
    const take = <T>(storage: CollectionStorage<unknown>): CollectionStorage<T> => {
      if (!released && !taken.has(storage)) {
        taken.add(storage);
        const use = this.storageUses.get(storage) ?? { calls: 0, waiters: [] };
        use.calls++;
        this.storageUses.set(storage, use);
      }
      return storage as CollectionStorage<T>;
    };
    const repository: RepositoryProvider = {
      getStorage: <T>(collection: string): CollectionStorage<T> => take<T>(this.getStorage<unknown>(collection)),
      getPartitionStorage: <T>(collection: string, partition: string): CollectionStorage<T> => take<T>(this.getPartitionStorage<unknown>(collection, partition)),
      hasPartitions: (collection: string): boolean => this.hasPartitions(collection),
      resolvePartition: (collection: string, ctx: ProcedureContext, requested: string | undefined) => this.resolvePartition(collection, ctx, requested),
      hasCollection: (collection: string): boolean => this.hasCollection(collection),
    };
    const release = (): void => {
      if (released) return;
      released = true;
      for (const storage of taken) {
        const use = this.storageUses.get(storage);
        if (!use || --use.calls > 0) continue;
        this.storageUses.delete(storage);
        for (const waiter of use.waiters.slice()) waiter();
      }
    };
    return { repository, release };
  }

  /**
   * Configure multiple storages at once.
   *
   * @param storages - Map of collection names to storage backends
   * @returns this (for chaining)
   */
  useStorages(storages: Record<string, CollectionStorage<unknown>>): this {
    for (const [name, storage] of Object.entries(storages)) {
      this.storages.set(name, storage);
    }
    return this;
  }

  /**
   * Get all configured collection names.
   */
  getCollectionNames(): string[] {
    return Array.from(this.storages.keys());
  }

  // ===========================================================================
  // Procedure Registration
  // ===========================================================================

  /**
   * Register a procedure as a server handler (a pin). The server keeps this procedure object. A
   * procedure of the registry at the same path comes first when the server serves the registry.
   *
   * The expose rule of the server applies to the pin, as to a procedure of the registry (CLI-47).
   * With `alwaysOn`, the server serves the pin also when the rule does not match its path. Only
   * the procedures of a host (`host.*`) and `events.subscribe` set it.
   *
   * @param procedure - Procedure definition
   * @param options - `alwaysOn`: the expose rule does not apply to this pin
   */
  registerProcedure(procedure: AnyProcedure, options: RegisterProcedureOptions = {}): void {
    // Must have a handler
    if (!procedure.handler) {
      throw new Error(`Procedure at ${pathToKey(procedure.path)} has no handler`);
    }
    // The path must make a method: this throws for an empty path. One segment or more is valid (CLI-28)
    pathToMethod(procedure.path);
    this.pinnedProcedures.set(pathToKey(procedure.path), { procedure, alwaysOn: options.alwaysOn === true });
  }

  /**
   * Register multiple procedures. The options apply to each one.
   *
   * @param procedures - Array of procedures
   * @param options - `alwaysOn`: the expose rule does not apply to these pins
   */
  registerProcedures(procedures: AnyProcedure[], options: RegisterProcedureOptions = {}): void {
    for (const procedure of procedures) {
      this.registerProcedure(procedure, options);
    }
  }

  /**
   * Register a procedure module. The options apply to each procedure of the module.
   *
   * @param module - Module with procedures array
   * @param options - `alwaysOn`: the expose rule does not apply to these pins
   */
  registerModule(module: ProcedureModule, options: RegisterProcedureOptions = {}): void {
    this.registerProcedures(module.procedures, options);
  }

  /**
   * Serve the procedures of the registry. The server looks up each request in the registry when
   * the request arrives, so a later registration, an override or an unregistration takes effect
   * at once. A procedure without a handler (a stub synced from storage, BUGS-2026-07 H14/H28) or
   * outside the expose rule is not served.
   */
  registerFromRegistry(): void {
    this.servesRegistry = true;
  }

  /** True when the expose rule of the server matches the path, or when the server has no rule. */
  private exposes(path: ProcedurePath): boolean {
    return !this.expose || this.expose(path);
  }

  /**
   * The procedure that answers a method, or undefined. The registry comes first (when the server
   * serves it), then the pinned procedures. The expose rule applies to both, and only an
   * `alwaysOn` pin is outside it (CLI-47). Before, each pin was outside the rule, so an `exclude`
   * of the host policy did not hide a collection procedure.
   */
  private resolveProcedure(method: Method): AnyProcedure | undefined {
    const path = methodToPath(method);
    if (this.servesRegistry) {
      const procedure = this.procedureRegistry.get(path);
      if (procedure?.handler && this.exposes(procedure.path)) {
        return procedure;
      }
    }
    const pin = this.pinnedProcedures.get(pathToKey(path));
    return pin && (pin.alwaysOn || this.exposes(pin.procedure.path)) ? pin.procedure : undefined;
  }

  /**
   * The handlers that `register()` added come first (exact or pattern matches). Then the server
   * looks up the procedure of the method.
   */
  protected override findHandler(method: Method): ServerHandler | null {
    const handler = super.findHandler(method);
    if (handler) return handler;
    const procedure = this.resolveProcedure(method);
    return procedure ? (request) => this.invoke(procedure, request) : null;
  }

  /**
   * Run a procedure for a request. A keyed call to a procedure that is not repeatable runs one
   * time for its key (R1).
   */
  private async invoke(procedure: AnyProcedure, request: ServerRequest<unknown>): Promise<ServerResponse<unknown>> {
    if (this.draining) {
      // The server stops: a client can send the call to another server, or again later (R14)
      return {
        id: request.id,
        status: { type: "error", code: "UNAVAILABLE", message: "The server is stopping", retryable: true },
        metadata: {},
      };
    }
    const refusal = await this.admit(request);
    if (refusal) return refusal;
    this.calls++;
    let response: ServerResponse<unknown> | undefined;
    try {
      const key = this.idempotency ? idempotencyKeyOf(request.metadata) : undefined;
      response =
        key === undefined || isRepeatable(effectsOf(procedure))
          ? await this.run(procedure, request, joinSignals(request.signal, this.lifetime.signal))
          : await this.runKeyed(procedure, request, `${pathToKey(procedure.path)}\u0000${key}`);
    } finally {
      // A stream is in flight until its end; another response is done now
      if (!response?.stream) this.callEnded();
    }
    const stream = response.stream;
    if (stream) {
      const ended = (): void => this.callEnded();
      response = {
        ...response,
        stream: (async function* () {
          try {
            yield* stream;
          } finally {
            ended();
          }
        })(),
      };
    }
    return response;
  }

  /**
   * The token check and the principal of a request (roadmap R18). The request hook reads the
   * credentials of a network request first: a bearer token, a principal and a narrowing. A
   * network request (with credentials) must present the token. The authenticate function gives
   * the principal. The function gives an UNAUTHORIZED response, or undefined when the request
   * passes.
   */
  private async admit(request: ServerRequest<unknown>): Promise<ServerResponse<unknown> | undefined> {
    const unauthorized = (message: string): ServerResponse<unknown> => ({
      id: request.id,
      status: { type: "error", code: "UNAUTHORIZED", message, retryable: false },
      metadata: {},
    });
    const credentials = request.credentials;
    let identity: RequestIdentity | undefined;
    if (this.principalOf && credentials !== undefined) {
      try {
        identity = await this.principalOf(credentials, request);
      } catch {
        identity = undefined;
      }
      if (!identity) return unauthorized("Unauthorized: the server did not accept the credentials");
    }
    if (this.token !== undefined && credentials !== undefined) {
      const bearer = identity?.bearer ?? credentials.bearer;
      if (!tokenMatches(this.token, bearer)) return unauthorized("Unauthorized: this server requires its token");
      request.principal = { id: "token", via: "token" };
    }
    if (identity?.principal) request.principal = identity.principal;
    if (identity?.narrowing) {
      const order = this.capabilityOptions.clearanceOrder;
      request.narrowing = request.narrowing ? joinNarrowing(request.narrowing, identity.narrowing, order) : identity.narrowing;
    }
    if (this.authenticate) {
      let principal: Principal | undefined;
      try {
        principal = await this.authenticate(request);
      } catch {
        principal = undefined;
      }
      if (!principal) return unauthorized("Unauthorized: the server did not accept the credentials");
      request.principal = principal;
    }
    return undefined;
  }

  /** One call in flight ended: `drain()` can end when it was the last one. */
  private callEnded(): void {
    this.calls--;
    if (this.calls === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const waiter of waiters) waiter();
    }
  }

  /**
   * The number of calls in flight, streams included.
   *
   * @deprecated Use `inFlight()`, the stop part of the same count (CLI-5).
   */
  get callsInFlight(): number {
    return this.calls;
  }

  /** True from `stopIntake()` until the next `start()`: the server refuses new calls. */
  get stopping(): boolean {
    return this.draining;
  }

  /**
   * This method tells if the server admits a connection with these credentials, before its first
   * call. It uses the path of each call: the request hook, the token check and the authenticate
   * function (R18, CLI-2a). A face of connections refuses the upgrade when it gives false (CLI-7).
   * A request hook that accepts a request without credentials (an empty identity) admits it.
   */
  async admits(credentials: Credentials): Promise<boolean> {
    const request: ServerRequest<unknown> = { id: "connection", method: { service: "", operation: "" }, payload: undefined, metadata: {}, credentials };
    return (await this.admit(request)) === undefined;
  }

  /**
   * Run a keyed call one time. The run continues when its caller goes away, so that the next try
   * gets its result: only the deadline of the call and the stop of the server end it. A stream
   * still stops with its caller, because nobody can read it again.
   */
  private async runKeyed(procedure: AnyProcedure, request: ServerRequest<unknown>, cacheKey: string): Promise<ServerResponse<unknown>> {
    const { result, first } = this.idempotency!.run(
      cacheKey,
      async () => {
        const detached = new AbortController();
        const stopRun = (): void => detached.abort();
        this.lifetime.signal.addEventListener("abort", stopRun, { once: true });
        try {
          const response = await this.run(procedure, request, detached.signal);
          if (response.stream) {
            // A stream follows its caller again
            if (request.signal?.aborted) detached.abort();
            else request.signal?.addEventListener("abort", stopRun, { once: true });
          }
          return response;
        } finally {
          this.lifetime.signal.removeEventListener("abort", stopRun);
        }
      },
      // A retryable error lets the next try run again: the handler said that a retry is safe
      (response) => !(response.status.type === "error" && response.status.retryable),
    );
    if (first) return result;
    const response = await untilAborted(result, request.signal);
    if (response === undefined) return errorResponse(request.id, new InvocationError("ABORTED", "The request was aborted", procedure.path));
    if (response.stream) {
      return {
        id: request.id,
        status: {
          type: "error",
          code: "DUPLICATE",
          message: "A call with this idempotency key gave a stream, and a stream cannot be given again",
          retryable: false,
        },
        metadata: {},
      };
    }
    return { ...response, id: request.id };
  }

  /**
   * The capability of a request. It comes from the server, never from the request. The remaining
   * time of the caller and the narrowing of the request can only make it narrower
   * (CAPABILITIES-2026-10, decision 9). Two different clearances without an order throw.
   *
   * The narrowing key of the call (`procedure-narrowing`, CLI-30) is not part of it. The
   * invocation applies the key for each face, after the narrowing of the request hook.
   */
  private capabilityOf(request: ServerRequest<unknown>): Capability | undefined {
    const { capability, clearanceOrder } = this.capabilityOptions;
    const base = withRequestTimeout(typeof capability === "function" ? capability(request) : capability, request, clearanceOrder);
    return request.narrowing ? narrowCapability(base, request.narrowing, clearanceOrder) : base;
  }

  /** The debug reports of the notes of the narrowing of a request (CLI-30), or undefined when `debug` is off. */
  private narrowingReports(request: ServerRequest<unknown>): ((notes: readonly NarrowingNote[]) => void) | undefined {
    const report = this.debugReport;
    if (!report) return undefined;
    return (notes) => {
      for (const note of notes) {
        report({ topic: "narrowing", requestId: request.id, method: request.method, message: note.message, detail: { field: note.field, kind: note.kind, ...(note.code ? { code: note.code } : {}) } });
      }
    };
  }

  /** Run a procedure for a request with a signal. */
  private async run(procedure: AnyProcedure, request: ServerRequest<unknown>, signal: AbortSignal | undefined): Promise<ServerResponse<unknown>> {
    // The call uses the storages that it takes until its end: the end of a stream, for a stream
    const { repository, release } = this.callRepository();
    let streams = false;
    try {
      // One invocation path for every host (ARCHITECTURE-PROPOSALS P1): input validation, the
      // context, the expose rule for nested calls (BUGS-2026-07 H18) and output validation
      const { clearanceOrder, resources, admitItem } = this.capabilityOptions;
      let capability: Capability | undefined;
      try {
        capability = this.capabilityOf(request);
      } catch (error) {
        const message = `The server cannot narrow the capability of the request: ${error instanceof Error ? error.message : String(error)}`;
        return errorResponse(request.id, Object.assign(new Error(message), { code: "INTERNAL_ERROR" }));
      }
      const output = await invokeProcedure(procedure, request.payload, {
        registry: this.procedureRegistry,
        metadata: request.metadata,
        signal,
        // What the face of the call offers: it asks the person, and it shows the progress (CLI-12)
        ...(request.elicit ? { elicit: request.elicit } : {}),
        ...(request.progress ? { progress: request.progress } : {}),
        repository,
        expose: this.expose,
        strictCalls: this.strictCalls,
        interceptors: this.interceptors,
        capability,
        clearanceOrder,
        resources,
        admitItem,
        // The parts of the narrowing key without effect go to the debug reports (CLI-30)
        onNarrowingNotes: this.narrowingReports(request),
        // The principal of the authentication: ctx.principal, and the nested calls (R18)
        ...(request.principal !== undefined ? { principal: request.principal } : {}),
        // The bus of the remote events is the bus of the procedures (EVENTS.md)
        ...(this.publisher ? { bus: this.publisher.bus } : {}),
      });
      if (output.kind === "stream") {
        // The faces that collect a stream read this mark (roadmap R15)
        const unbounded = (procedure.metadata as { stream?: { unbounded?: boolean } } | undefined)?.stream?.unbounded === true;
        streams = true;
        return {
          id: request.id,
          status: { type: "success", code: 200 },
          stream: releasedAtEnd(output.items, release),
          metadata: unbounded ? { [STREAM_METADATA_KEY]: "unbounded" } : {},
        };
      }
      return { id: request.id, status: { type: "success", code: 200 }, payload: output.value, metadata: {} };
    } catch (error) {
      return errorResponse(request.id, error);
    } finally {
      if (!streams) release();
    }
  }

  /**
   * Register collection procedures for a specific collection.
   * Creates standard CRUD procedures using the configured storage.
   *
   * The expose rule of the server applies to these procedures (CLI-47). A rule that does not
   * match `collections.<name>.*` hides them, and an `exclude` of the host policy hides one of them.
   *
   * @param collectionName - Collection name
   * @param options - The query policy of `find`. `$regex` is off unless the policy permits it.
   */
  registerCollectionProcedures(collectionName: string, options?: CollectionProceduresOptions): void {
    // Uses a top-level import; require() is not available in this ESM package and
    // previously threw "Cannot find module" on every call. See BUGS-2026-07 H13.
    const procedures = createCollectionProcedures(collectionName, options);

    // Register with the procedure registry first
    this.procedureRegistry.registerAll(procedures);

    // Then register as server handlers
    this.registerProcedures(procedures);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /** The paths that the server serves now: the same rule as `resolveProcedure()`. */
  private servedKeys(): Set<string> {
    const keys = new Set<string>();
    for (const [key, pin] of this.pinnedProcedures) {
      if (pin.alwaysOn || this.exposes(pin.procedure.path)) keys.add(key);
    }
    if (this.servesRegistry) {
      for (const procedure of this.procedureRegistry.getAll()) {
        if (procedure.handler && this.exposes(procedure.path)) {
          keys.add(pathToKey(procedure.path));
        }
      }
    }
    return keys;
  }

  /**
   * Get count of the procedures that the server serves now.
   */
  get procedureCount(): number {
    return this.servedKeys().size;
  }

  /**
   * Check if the server serves a procedure now.
   *
   * @param path - Procedure path
   */
  /**
   * The registry that this server serves. A face of the server (the MCP transport) lists its
   * tools from it: with an explicit registry (`createRegistry()`), the global registry is not the
   * server's.
   */
  getRegistry(): ProcedureRegistry {
    return this.procedureRegistry;
  }

  hasProcedure(path: ProcedurePath): boolean {
    return this.resolveProcedure(pathToMethod(path)) !== undefined;
  }

  /**
   * This method gives the procedure that answers a method now, or undefined. The registry comes
   * first, then the pinned procedures. A host reads the effects of the procedure for the
   * idempotency of each request (decision D3, CLI-7).
   */
  procedureOf(method: Method): AnyProcedure | undefined {
    return this.resolveProcedure(method);
  }

  /**
   * This function publishes an event on the bus of the server: the bus of the option `events`, or
   * the global bus. Each subscription of the topic gets it (`documentation/EVENTS.md`).
   *
   * @param topic - The topic: a channel of the bus
   * @param data - The data of the event. It crosses the wire as JSON.
   */
  publish<T>(topic: string, data: T): void {
    (this.publisher?.bus ?? getGlobalEventBus()).emit(topic, data);
  }

  /**
   * This method closes each storage one time, also a storage of two collections, and removes the
   * storages from the server. A closed storage rejects each operation, so the server does not keep
   * it. Before a new `start()`, give the storages again with `useStorage()`.
   */
  async closeStorages(): Promise<void> {
    const storages = new Set(this.storages.values());
    this.storages.clear();
    const results = await Promise.allSettled(Array.from(storages, (storage) => storage.close()));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw failed.reason;
  }

  // ===========================================================================
  // Stop parts in the shape of the runner (CLI-5)
  // ===========================================================================

  /**
   * This method gives each storage of the server as a dependency handle, one handle for each
   * storage, also for a storage of two collections. The handles are in the sequence of the
   * collections. The runner closes them in the reverse sequence, after the transports close.
   */
  storageHandles(): StorageHandle[] {
    const byStorage = new Map<CollectionStorage<unknown>, string[]>();
    for (const [name, storage] of this.storages) {
      const names = byStorage.get(storage);
      if (names) names.push(name);
      else byStorage.set(storage, [name]);
    }
    return Array.from(byStorage, ([storage, collections]) => ({
      name: `collections.${collections.join("+")}`,
      collections,
      storage,
      connect: (): void => undefined,
      close: async (): Promise<void> => {
        // The collections of this storage leave the server first, so no new call takes it
        for (const [name, current] of [...this.storages]) if (current === storage) this.storages.delete(name);
        await storage.close();
      },
    }));
  }

  /**
   * This method starts the transports of the server. After `close()`, it accepts new calls again,
   * and the next calls get a new signal. Thus a server can start again.
   */
  override async start(): Promise<void> {
    this.reopen();
    await super.start();
  }

  /** The intake opens again after a close: a new signal, no drain and a new close. */
  private reopen(): void {
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
    this.draining = false;
    this.closing = undefined;
  }

  /**
   * This method refuses each new call with a retryable `UNAVAILABLE`, and ends each subscription
   * of `events.subscribe` with a retryable `UNAVAILABLE`. The calls in flight continue. A second
   * stop has no effect.
   */
  stopIntake(): void {
    if (this.draining) return;
    this.draining = true;
    // A subscription has no end: it ends now, with a retryable UNAVAILABLE (EVENTS.md)
    this.publisher?.end();
  }

  /**
   * This method waits until no call is in flight, or until `deadline` (milliseconds on the clock
   * of the server). When `signal` aborts, each call that still runs gets the abort, and the wait
   * continues to the deadline. The method uses only the clock of the server, and it does not throw.
   */
  drain(deadline: number, signal: AbortSignal): Promise<void> {
    const cooperative = (): void => this.lifetime.abort();
    if (signal.aborted) cooperative();
    if (this.calls === 0 || deadline <= this.clock.now()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = (): void => {
        cancel();
        signal.removeEventListener("abort", cooperative);
        const index = this.idleWaiters.indexOf(done);
        if (index >= 0) this.idleWaiters.splice(index, 1);
        resolve();
      };
      const cancel = this.clock.after(Math.max(0, deadline - this.clock.now()), done);
      this.idleWaiters.push(done);
      signal.addEventListener("abort", cooperative, { once: true });
    });
  }

  /** This method gives the number of calls in flight. A stream is in flight until its end. */
  inFlight(): number {
    return this.calls;
  }

  /**
   * This method aborts each call that still runs, and stops the transports of the server. The
   * intake stays stopped until the next `start()`. A second close gives the same promise. The
   * storages stay open: their handles close them (`storageHandles()`).
   */
  close(): Promise<void> {
    this.closing ??= (async () => {
      this.stopIntake();
      this.lifetime.abort();
      await super.stop();
    })();
    return this.closing;
  }

  /**
   * This method stops the server with the stop parts, in the sequence of the stages of the runner:
   * `stopIntake()`, `drain()` for the grace time, `close()`, and then the close of each storage
   * (`closeStorages()`). The server can start again, with new storages from `useStorage()`. A
   * service under `run()` declares the parts and the storage handles in place of this method.
   */
  override async stop(options: StopOptions = {}): Promise<void> {
    const graceMs = optionalMs(options.grace, "grace") ?? TIMER_DEFAULTS.server.stopGraceMs;
    // A graceful stop: new calls get UNAVAILABLE, and the calls in flight have the grace time
    // to end (roadmap R14). At the end of the grace, close() aborts the calls that still run.
    this.stopIntake();
    await this.drain(this.clock.now() + graceMs, new AbortController().signal);
    await this.close();
    try {
      await this.closeStorages();
    } finally {
      // A server can start again: its next calls get a new signal
      this.reopen();
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a procedure server with common configuration.
 *
 * @param options - Server options
 * @returns Configured ProcedureServer
 */
export function createProcedureServer(
  options: ProcedureServerOptions = {}
): ProcedureServer {
  return new ProcedureServer(options);
}
