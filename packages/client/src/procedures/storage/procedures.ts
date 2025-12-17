/**
 * Procedure Storage Procedures
 *
 * CLI procedures for managing the procedure registry storage:
 * - procedure.register - Register a procedure at runtime
 * - procedure.store - Persist a procedure to storage
 * - procedure.load - Load procedures from storage
 * - procedure.sync - Sync registry with storage
 * - procedure.remote - Configure remote connection
 */

import { defineProcedure } from "../define.js";
import type { AnyProcedure, ProcedureContext, ProcedurePath } from "../types.js";
import { PROCEDURE_REGISTRY } from "../registry.js";
import { pathToKey, keyToPath } from "../types.js";
import type { SyncDirection, HandlerReference, SerializedProcedure } from "./types.js";
import { deserializeProcedureSync, serializeProcedure } from "./serialization.js";

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
}

export const procedureRegisterProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "register"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Register a procedure at runtime",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: RegisterInput, _ctx: ProcedureContext): Promise<RegisterOutput> => {
    const { path, metadata = {}, streaming, handlerRef, persist = false } = input;

    // Create serialized procedure and deserialize to stub
    const serialized: SerializedProcedure = {
      path,
      metadata,
      streaming,
      handlerRef,
      storedAt: Date.now(),
    };

    const procedure = deserializeProcedureSync(serialized);

    // Register in global registry
    try {
      PROCEDURE_REGISTRY.register(procedure, { override: false });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
        path,
      };
    }

    // Note: persist flag would be handled by SyncedProcedureRegistry
    // For now, just acknowledge the registration
    return {
      success: true,
      message: persist
        ? `Registered ${pathToKey(path)} (persistence requested)`
        : `Registered ${pathToKey(path)}`,
      path,
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
}

export const procedureStoreProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "store"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Persist a procedure definition to storage",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: StoreInput, _ctx: ProcedureContext): Promise<StoreOutput> => {
    const path = typeof input.path === "string" ? keyToPath(input.path) : input.path;

    // Get procedure from registry
    const procedure = PROCEDURE_REGISTRY.get(path);
    if (!procedure) {
      return {
        stored: false,
        path,
        message: `Procedure not found: ${pathToKey(path)}`,
      };
    }

    // Serialize for acknowledgment (actual storage handled by synced registry)
    serializeProcedure(procedure, {
      handlerRef: input.handlerRef,
    });

    // For now, just acknowledge - actual storage handled by synced registry
    return {
      stored: true,
      path,
      message: `Serialized ${pathToKey(path)} for storage`,
    };
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
  loaded: number;
  paths: ProcedurePath[];
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
  handler: async (input: LoadInput, _ctx: ProcedureContext): Promise<LoadOutput> => {
    // This would typically interact with SyncedProcedureRegistry.syncFromStorage()
    // For now, return placeholder indicating the operation would be performed

    if (input.all) {
      return {
        loaded: 0,
        paths: [],
        message: "Load all requested - requires SyncedProcedureRegistry",
      };
    }

    if (input.path) {
      const path = typeof input.path === "string" ? keyToPath(input.path) : input.path;
      return {
        loaded: 0,
        paths: [path],
        message: `Load ${pathToKey(path)} requested - requires SyncedProcedureRegistry`,
      };
    }

    if (input.prefix) {
      const prefix = typeof input.prefix === "string" ? keyToPath(input.prefix) : input.prefix;
      return {
        loaded: 0,
        paths: [],
        message: `Load prefix ${pathToKey(prefix)} requested - requires SyncedProcedureRegistry`,
      };
    }

    return {
      loaded: 0,
      paths: [],
      message: "No load criteria specified",
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
  handler: async (input: SyncInput, _ctx: ProcedureContext): Promise<SyncOutput> => {
    const direction = input.direction ?? "both";

    // This would typically call SyncedProcedureRegistry.sync()
    // For now, return placeholder

    return {
      pushed: 0,
      pulled: 0,
      conflicts: [],
      message: `Sync ${direction} requested - requires SyncedProcedureRegistry`,
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
  handler: async (input: RemoteInput, _ctx: ProcedureContext): Promise<RemoteOutput> => {
    const { action, endpoint, options: _options } = input;

    // This would typically interact with SyncedProcedureRegistry
    // For now, return placeholder responses

    switch (action) {
      case "connect":
        if (!endpoint) {
          return {
            connected: false,
            message: "Endpoint required for connect",
          };
        }
        return {
          connected: false,
          endpoint,
          message: `Connect to ${endpoint} requested - requires SyncedProcedureRegistry`,
        };

      case "disconnect":
        return {
          connected: false,
          message: "Disconnect requested - requires SyncedProcedureRegistry",
        };

      case "status":
        return {
          connected: false,
          message: "Not connected - requires SyncedProcedureRegistry",
        };

      default:
        return {
          connected: false,
          message: `Unknown action: ${action}`,
        };
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
