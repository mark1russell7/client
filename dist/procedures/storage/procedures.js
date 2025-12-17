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
import { PROCEDURE_REGISTRY } from "../registry.js";
import { pathToKey, keyToPath } from "../types.js";
import { deserializeProcedureSync, serializeProcedure } from "./serialization.js";
// =============================================================================
// Any Schema Helper
// =============================================================================
const anySchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data }),
    _output: undefined,
};
export const procedureRegisterProcedure = defineProcedure({
    path: ["procedure", "register"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Register a procedure at runtime",
        tags: ["procedure", "registry", "storage"],
    },
    handler: async (input, _ctx) => {
        const { path, metadata = {}, streaming, handlerRef, persist = false } = input;
        // Create serialized procedure and deserialize to stub
        const serialized = {
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
        }
        catch (error) {
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
export const procedureStoreProcedure = defineProcedure({
    path: ["procedure", "store"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Persist a procedure definition to storage",
        tags: ["procedure", "registry", "storage"],
    },
    handler: async (input, _ctx) => {
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
export const procedureLoadProcedure = defineProcedure({
    path: ["procedure", "load"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Load procedures from storage into registry",
        tags: ["procedure", "registry", "storage"],
    },
    handler: async (input, _ctx) => {
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
export const procedureSyncProcedure = defineProcedure({
    path: ["procedure", "sync"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Synchronize procedure registry with storage",
        tags: ["procedure", "registry", "storage"],
    },
    handler: async (input, _ctx) => {
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
export const procedureRemoteProcedure = defineProcedure({
    path: ["procedure", "remote"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Configure remote procedure registry connection",
        tags: ["procedure", "registry", "storage"],
    },
    handler: async (input, _ctx) => {
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
    ],
};
/**
 * Array of all procedure storage procedures.
 */
export const procedureStorageProcedures = procedureStorageModule.procedures;
//# sourceMappingURL=procedures.js.map