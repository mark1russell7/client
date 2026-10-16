/**
 * Procedure Server
 *
 * Server implementation with procedure auto-registration and repository pattern.
 * Integrates with ProcedureRegistry and CollectionStorage backends.
 */

import { Server, type ServerOptions } from "./server.js";
import type { Method, ServerHandler, ServerRequest, ServerResponse } from "./types.js";
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
import type { Capability, ClearanceOrder, ResourcesOf } from "../procedures/types.js";
import { TIMEOUT_METADATA_KEY, effectsOf, narrowCapability } from "../procedures/capability.js";
import { IdempotencyCache, idempotencyKeyOf, isRepeatable, type IdempotencyOptions } from "../procedures/idempotency.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";

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
   * The procedures that the callers of this server can reach. `registerFromRegistry()` registers
   * only these procedures. A data-driven procedure (control flow, `eval`, a procedure that
   * `procedure.define` made) can call only these procedures too, because its caller chooses
   * what it calls. A procedure of code calls the procedures of its `metadata.calls`
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
 * (VALIDATION_ERROR, NOT_EXPOSED, ABORTED and so on). An error of the handler is HANDLER_ERROR.
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
      code: error instanceof InvocationError ? error.code : "HANDLER_ERROR",
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
export class ProcedureServer extends Server implements RepositoryProvider {
  private readonly procedureRegistry: ProcedureRegistry;
  private readonly storages = new Map<string, CollectionStorage<unknown>>();
  /** The procedures that `registerProcedure` pinned, by key */
  private readonly pinnedProcedures = new Map<string, AnyProcedure>();
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
  /** The signal of the server: `stop()` aborts it. A keyed call that lost its caller stops on it. */
  private lifetime = new AbortController();

  constructor(options: ProcedureServerOptions = {}) {
    super(options);

    this.procedureRegistry = options.registry ?? PROCEDURE_REGISTRY;
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
    return this.storages.has(collection);
  }

  // ===========================================================================
  // Storage Configuration
  // ===========================================================================

  /**
   * Configure storage for a collection.
   *
   * @param name - Collection name
   * @param storage - Storage backend
   * @returns this (for chaining)
   */
  useStorage<T>(name: string, storage: CollectionStorage<T>): this {
    this.storages.set(name, storage as CollectionStorage<unknown>);
    return this;
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
   * Register a procedure as a server handler. The server keeps this procedure object. A
   * procedure of the registry at the same path comes first when the server serves the registry.
   *
   * @param procedure - Procedure definition
   */
  registerProcedure(procedure: AnyProcedure): void {
    // Must have a handler
    if (!procedure.handler) {
      throw new Error(`Procedure at ${pathToKey(procedure.path)} has no handler`);
    }
    // The path must make a method: this throws for a path of one segment
    pathToMethod(procedure.path);
    this.pinnedProcedures.set(pathToKey(procedure.path), procedure);
  }

  /**
   * Register multiple procedures.
   *
   * @param procedures - Array of procedures
   */
  registerProcedures(procedures: AnyProcedure[]): void {
    for (const procedure of procedures) {
      this.registerProcedure(procedure);
    }
  }

  /**
   * Register a procedure module.
   *
   * @param module - Module with procedures array
   */
  registerModule(module: ProcedureModule): void {
    this.registerProcedures(module.procedures);
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

  /**
   * The procedure that answers a method, or undefined. The registry comes first (when the server
   * serves it), then the pinned procedures.
   */
  private resolveProcedure(method: Method): AnyProcedure | undefined {
    const path = methodToPath(method);
    if (this.servesRegistry) {
      const procedure = this.procedureRegistry.get(path);
      if (procedure?.handler && (!this.expose || this.expose(procedure.path))) {
        return procedure;
      }
    }
    return this.pinnedProcedures.get(pathToKey(path));
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
    const key = this.idempotency ? idempotencyKeyOf(request.metadata) : undefined;
    if (key === undefined || isRepeatable(effectsOf(procedure))) return this.run(procedure, request, request.signal);
    return this.runKeyed(procedure, request, `${pathToKey(procedure.path)}\u0000${key}`);
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

  /** Run a procedure for a request with a signal. */
  private async run(procedure: AnyProcedure, request: ServerRequest<unknown>, signal: AbortSignal | undefined): Promise<ServerResponse<unknown>> {
    try {
      // One invocation path for every host (ARCHITECTURE-PROPOSALS P1): input validation, the
      // context, the expose rule for nested calls (BUGS-2026-07 H18) and output validation
      const { capability, clearanceOrder, resources, admitItem } = this.capabilityOptions;
      const output = await invokeProcedure(procedure, request.payload, {
        registry: this.procedureRegistry,
        metadata: request.metadata,
        signal,
        repository: this,
        expose: this.expose,
        strictCalls: this.strictCalls,
        interceptors: this.interceptors,
        // The capability comes from the server, never from the request. The remaining time of
        // the caller can only make the deadline earlier (CAPABILITIES-2026-10, decision 9).
        capability: withRequestTimeout(typeof capability === "function" ? capability(request) : capability, request, clearanceOrder),
        clearanceOrder,
        resources,
        admitItem,
      });
      if (output.kind === "stream") {
        return { id: request.id, status: { type: "success", code: 200 }, stream: output.items, metadata: {} };
      }
      return { id: request.id, status: { type: "success", code: 200 }, payload: output.value, metadata: {} };
    } catch (error) {
      return errorResponse(request.id, error);
    }
  }

  /**
   * Register collection procedures for a specific collection.
   * Creates standard CRUD procedures using the configured storage.
   *
   * @param collectionName - Collection name
   */
  registerCollectionProcedures(collectionName: string): void {
    // Uses a top-level import; require() is not available in this ESM package and
    // previously threw "Cannot find module" on every call. See BUGS-2026-07 H13.
    const procedures = createCollectionProcedures(collectionName);

    // Register with the procedure registry first
    this.procedureRegistry.registerAll(procedures);

    // Then register as server handlers
    this.registerProcedures(procedures);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /** The paths that the server serves now. */
  private servedKeys(): Set<string> {
    const keys = new Set(this.pinnedProcedures.keys());
    if (this.servesRegistry) {
      for (const procedure of this.procedureRegistry.getAll()) {
        if (procedure.handler && (!this.expose || this.expose(procedure.path))) {
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
   * Close all storage backends.
   */
  async closeStorages(): Promise<void> {
    const closePromises = Array.from(this.storages.values()).map((s) =>
      s.close()
    );
    await Promise.all(closePromises);
  }

  /**
   * Stop server and close storages.
   */
  override async stop(): Promise<void> {
    this.lifetime.abort();
    // A server can start again: its next keyed calls get a new signal
    this.lifetime = new AbortController();
    await super.stop();
    await this.closeStorages();
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
