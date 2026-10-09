/**
 * Procedure Storage Procedures
 *
 * CLI procedures for managing the procedure registry storage:
 * - procedure.register - Register a procedure at runtime
 * - procedure.store - Persist a procedure to storage
 * - procedure.load - Load procedures from storage
 * - procedure.sync - Sync registry with storage
 * - procedure.remote - Configure remote connection
 *
 * The procedures work on the store of the caller's registry: the `SyncedProcedureRegistry`
 * that wraps it (`createSyncedRegistry()`). When the registry has no store, they fail with
 * the code `NOT_CONFIGURED`. (Before, they reported success and did nothing: deep dive
 * CORE-16, DATA-10.)
 */

import { defineProcedure } from "../define.js";
import type { AnyProcedure, ProcedureContext, ProcedurePath } from "../types.js";
import { PROCEDURE_REGISTRY, type ProcedureRegistry } from "../registry.js";
import { pathToKey, keyToPath } from "../types.js";
import type { SyncDirection, HandlerReference, SerializedProcedure } from "./types.js";
import { deserializeProcedure, deserializeProcedureSync } from "./serialization.js";
import { getProcedureStore, type SyncedProcedureRegistry } from "./synced-registry.js";

// =============================================================================
// Any Schema Helper
// =============================================================================

const anySchema: {
  parse: (data: unknown) => unknown;
  safeParse: (data: unknown) => { success: true; data: unknown };
  _output: unknown;
} = {
  parse: (data: unknown) => data,
  safeParse: (data: unknown) => ({ success: true as const, data }),
  _output: undefined as unknown,
};

// =============================================================================
// The store of the caller
// =============================================================================

/** An error of a storage procedure that cannot do its work. */
export class ProcedureStoreError extends Error {
  override readonly name = "ProcedureStoreError";
  readonly code: "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "NO_HANDLER";

  constructor(code: "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "NO_HANDLER", message: string) {
    super(message);
    this.code = code;
  }
}

/** The registry of the caller: the context's registry when it has one, else the global one. */
function callerRegistry(ctx: ProcedureContext | undefined): ProcedureRegistry {
  return (ctx as (ProcedureContext & { registry?: ProcedureRegistry }) | undefined)?.registry ?? PROCEDURE_REGISTRY;
}

/** The store of the caller's registry, or a NOT_CONFIGURED error. */
function requireStore(ctx: ProcedureContext | undefined, what: string): SyncedProcedureRegistry {
  const store = getProcedureStore(callerRegistry(ctx));
  if (!store) {
    throw new ProcedureStoreError(
      "NOT_CONFIGURED",
      `${what} needs a procedure store, and this registry has none. ` +
        "Wrap the registry with createSyncedRegistry() or new SyncedProcedureRegistry()."
    );
  }
  return store;
}

function toPath(path: ProcedurePath | string): ProcedurePath {
  return typeof path === "string" ? keyToPath(path) : path;
}

// =============================================================================
// procedure.register - Register procedure at runtime
// =============================================================================

interface RegisterInput {
  /** Procedure path */
  path: ProcedurePath;
  /** Procedure metadata */
  metadata?: Record<string, unknown>;
  /** Whether procedure supports streaming */
  streaming?: boolean;
  /** Handler reference for loading */
  handlerRef?: HandlerReference;
  /** Whether to persist to storage */
  persist?: boolean;
}

interface RegisterOutput {
  success: boolean;
  message: string;
  path: ProcedurePath;
  /** False for a declaration: the procedure has no handler, and a Client sends its calls to the transport */
  hasHandler: boolean;
}

export const procedureRegisterProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "register"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Register a procedure at runtime",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: RegisterInput, ctx: ProcedureContext): Promise<RegisterOutput> => {
    const { path, metadata = {}, streaming, handlerRef, persist = false } = input;
    const key = pathToKey(path);
    const serialized: SerializedProcedure = {
      path,
      metadata,
      streaming,
      handlerRef,
      storedAt: Date.now(),
    };

    if (persist) {
      // A stored procedure needs a handler: never store a stub (deep dive CORE-16)
      const store = requireStore(ctx, "procedure.register with persist");
      const loader = store.getHandlerLoader();
      const procedure = handlerRef && loader ? await deserializeProcedure(serialized, { handlerLoader: loader }) : undefined;
      if (!procedure?.handler) {
        throw new ProcedureStoreError(
          "NO_HANDLER",
          `procedure.register with persist needs a handler for ${key}: give a handlerRef ` +
            "that the handler loader of the store allows."
        );
      }
      store.register(procedure, { override: false, handlerRef });
      await store.flushWrites();
      return { success: true, message: `Registered and stored ${key}`, path, hasHandler: true };
    }

    // No persist: load the handler when the store's loader allows it, else declare a stub
    const loader = getProcedureStore(callerRegistry(ctx))?.getHandlerLoader();
    const procedure =
      handlerRef && loader ? await deserializeProcedure(serialized, { handlerLoader: loader }) : deserializeProcedureSync(serialized);
    try {
      callerRegistry(ctx).register(procedure, { override: false });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
        path,
        hasHandler: false,
      };
    }

    const hasHandler = typeof procedure.handler === "function";
    return {
      success: true,
      message: hasHandler
        ? `Registered ${key}`
        : `Registered ${key} with no handler: a Client sends the calls of this path to its transport`,
      path,
      hasHandler,
    };
  },
});

// =============================================================================
// procedure.store - Persist procedure to storage
// =============================================================================

interface StoreInput {
  /** Procedure path to store */
  path: ProcedurePath | string;
  /** Handler reference to associate (optional) */
  handlerRef?: HandlerReference;
}

interface StoreOutput {
  stored: boolean;
  path: ProcedurePath;
  message?: string;
  /** When the storage got the record */
  storedAt?: number;
}

export const procedureStoreProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "store"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Persist a procedure definition to storage",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: StoreInput, ctx: ProcedureContext): Promise<StoreOutput> => {
    const path = toPath(input.path);
    const store = requireStore(ctx, "procedure.store");

    const record = await store.storeProcedure(path, { handlerRef: input.handlerRef });
    if (!record) {
      return {
        stored: false,
        path,
        message: `Procedure not found: ${pathToKey(path)}`,
      };
    }
    const output: StoreOutput = { stored: true, path, message: `Stored ${pathToKey(path)}` };
    if (record.storedAt !== undefined) output.storedAt = record.storedAt;
    return output;
  },
});

// =============================================================================
// procedure.load - Load procedures from storage
// =============================================================================

interface LoadInput {
  /** Specific procedure path to load */
  path?: ProcedurePath | string;
  /** Load all procedures under prefix */
  prefix?: ProcedurePath | string;
  /** Load all procedures */
  all?: boolean;
}

interface LoadOutput {
  /** The number of procedures that the load added to the registry or changed */
  loaded: number;
  /** The paths of the stored records that matched */
  paths: ProcedurePath[];
  conflicts: Array<{ path: ProcedurePath; resolution: string }>;
  message: string;
}

export const procedureLoadProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "load"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Load procedures from storage into registry",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: LoadInput, ctx: ProcedureContext): Promise<LoadOutput> => {
    let matches: (record: SerializedProcedure) => boolean;
    let what: string;
    if (input.all) {
      matches = () => true;
      what = "all procedures";
    } else if (input.path) {
      const key = pathToKey(toPath(input.path));
      matches = (record) => pathToKey(record.path) === key;
      what = key;
    } else if (input.prefix) {
      const prefix = pathToKey(toPath(input.prefix));
      matches = (record) => {
        const key = pathToKey(record.path);
        return key === prefix || key.startsWith(`${prefix}.`);
      };
      what = `${prefix}.*`;
    } else {
      throw new Error("procedure.load needs `path`, `prefix` or `all: true`");
    }

    const store = requireStore(ctx, "procedure.load");
    const paths = (await store.getAdapter().getAllRaw()).filter(matches).map((record) => record.path);
    const result = await store.syncFromStorage(matches);
    return {
      loaded: result.pulled,
      paths,
      conflicts: result.conflicts.map(({ path, resolution }) => ({ path, resolution })),
      message: `Loaded ${result.pulled} of ${paths.length} stored procedure(s) for ${what}`,
    };
  },
});

// =============================================================================
// procedure.sync - Sync registry with storage
// =============================================================================

interface SyncInput {
  /** Sync direction */
  direction?: SyncDirection;
}

interface SyncOutput {
  pushed: number;
  pulled: number;
  conflicts: Array<{
    path: ProcedurePath;
    resolution: string;
  }>;
  message: string;
}

export const procedureSyncProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "sync"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Synchronize procedure registry with storage",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: SyncInput, ctx: ProcedureContext): Promise<SyncOutput> => {
    const direction = input.direction ?? "both";
    const store = requireStore(ctx, "procedure.sync");
    const result = await store.sync(direction);
    return {
      pushed: result.pushed,
      pulled: result.pulled,
      conflicts: result.conflicts.map(({ path, resolution }) => ({ path, resolution })),
      message: `Sync ${direction}: pushed ${result.pushed}, pulled ${result.pulled}`,
    };
  },
});

// =============================================================================
// procedure.remote - Configure remote connection
// =============================================================================

interface RemoteInput {
  /** Action to perform */
  action: "connect" | "disconnect" | "status";
  /** Remote endpoint URL (for connect) */
  endpoint?: string;
  /** Connection options */
  options?: {
    syncOnConnect?: boolean;
    syncInterval?: number;
  };
}

interface RemoteOutput {
  connected: boolean;
  endpoint?: string;
  lastSync?: number;
  pendingChanges?: number;
  message: string;
}

export const procedureRemoteProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "remote"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Configure remote procedure registry connection",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: RemoteInput, ctx: ProcedureContext): Promise<RemoteOutput> => {
    switch (input.action) {
      case "status": {
        const store = getProcedureStore(callerRegistry(ctx));
        if (!store) {
          return { connected: false, message: "This registry has no procedure store" };
        }
        const status = store.getStatus();
        const output: RemoteOutput = {
          connected: status.connected,
          pendingChanges: status.pendingChanges,
          message: status.connected ? `Connected to ${status.endpoint}` : "The store is not connected to an endpoint",
        };
        if (status.endpoint !== undefined) output.endpoint = status.endpoint;
        if (status.lastSync !== undefined) output.lastSync = status.lastSync;
        return output;
      }

      case "connect":
        // The storage of a store is fixed when it is made: no call changes it at run time
        throw new ProcedureStoreError(
          "NOT_IMPLEMENTED",
          "procedure.remote connect cannot change the storage of a registry at run time. " +
            'Make the registry with createSyncedRegistry({ type: "api", client }) for the endpoint.'
        );

      case "disconnect": {
        const store = requireStore(ctx, "procedure.remote disconnect");
        store.disconnect();
        return { connected: false, message: "Stopped the auto-sync, and cleared the endpoint" };
      }

      default:
        throw new Error(`Unknown action: ${String((input as { action?: unknown }).action)}`);
    }
  },
});

// =============================================================================
// Module Export
// =============================================================================

/**
 * All procedure storage procedures as a module.
 */
export const procedureStorageModule = {
  name: "procedure-storage",
  procedures: [
    procedureRegisterProcedure,
    procedureStoreProcedure,
    procedureLoadProcedure,
    procedureSyncProcedure,
    procedureRemoteProcedure,
  ] as AnyProcedure[],
};

/**
 * Array of all procedure storage procedures.
 */
export const procedureStorageProcedures: AnyProcedure[] = procedureStorageModule.procedures;
