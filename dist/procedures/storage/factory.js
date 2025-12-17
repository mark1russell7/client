/**
 * Procedure Storage Factory
 *
 * Factory functions for creating storage-backed procedure registries.
 */
import { InMemoryStorage } from "../../collections/storage/memory.js";
import { ApiStorage } from "../../collections/storage/api.js";
import { HybridStorage } from "../../collections/storage/hybrid.js";
import { ProcedureRegistry, PROCEDURE_REGISTRY } from "../registry.js";
import { SyncedProcedureRegistry } from "./synced-registry.js";
import { createDynamicHandlerLoader } from "./serialization.js";
// =============================================================================
// Factory Function
// =============================================================================
/**
 * Create a synced procedure registry with the specified storage backend.
 *
 * @param config - Configuration for the registry
 * @returns SyncedProcedureRegistry instance
 *
 * @example
 * ```typescript
 * // In-memory only (for testing)
 * const registry = createSyncedRegistry({ type: 'memory' });
 *
 * // API storage (remote persistence)
 * const registry = createSyncedRegistry({
 *   type: 'api',
 *   client: myClient,
 *   service: 'procedures',
 * });
 *
 * // Hybrid storage (offline-first)
 * const registry = createSyncedRegistry({
 *   type: 'hybrid',
 *   client: myClient,
 *   service: 'procedures',
 *   hybridOptions: {
 *     writeStrategy: 'write-through',
 *     conflictResolution: 'remote',
 *   },
 * });
 * ```
 */
export function createSyncedRegistry(config) {
    const { type, client, service = "procedures", hybridOptions, registryOptions = {}, baseRegistry = PROCEDURE_REGISTRY, handlerLoader = createDynamicHandlerLoader(), } = config;
    // Validate client is provided for api/hybrid
    if ((type === "api" || type === "hybrid") && !client) {
        throw new Error(`Client is required for storage type: ${type}`);
    }
    // Create the appropriate storage backend
    let storage;
    switch (type) {
        case "memory":
            storage = new InMemoryStorage();
            break;
        case "api":
            storage = new ApiStorage(client, {
                service,
                operations: {
                    get: "get",
                    getAll: "getAll",
                    find: "find",
                    has: "has",
                    size: "size",
                    set: "set",
                    delete: "delete",
                    clear: "clear",
                    setBatch: "setBatch",
                    deleteBatch: "deleteBatch",
                    getBatch: "getBatch",
                },
            });
            break;
        case "hybrid":
            const remoteStorage = new ApiStorage(client, {
                service,
            });
            storage = new HybridStorage(remoteStorage, {
                writeStrategy: hybridOptions?.writeStrategy ?? "write-through",
                conflictResolution: hybridOptions?.conflictResolution ?? "local",
                ...hybridOptions,
            });
            break;
        default:
            throw new Error(`Unknown storage type: ${type}`);
    }
    // Create and return the synced registry
    return new SyncedProcedureRegistry(baseRegistry, storage, {
        ...registryOptions,
        handlerLoader,
    });
}
// =============================================================================
// Convenience Functions
// =============================================================================
/**
 * Create an in-memory synced registry.
 * Useful for testing or when persistence isn't needed.
 *
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with in-memory storage
 */
export function createMemorySyncedRegistry(baseRegistry = PROCEDURE_REGISTRY) {
    return createSyncedRegistry({
        type: "memory",
        baseRegistry,
    });
}
/**
 * Create an API-backed synced registry.
 *
 * @param client - Universal client instance
 * @param service - Service name for storage operations
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with API storage
 */
export function createApiSyncedRegistry(client, service = "procedures", baseRegistry = PROCEDURE_REGISTRY) {
    return createSyncedRegistry({
        type: "api",
        client,
        service,
        baseRegistry,
    });
}
/**
 * Create a hybrid synced registry (offline-first).
 *
 * @param client - Universal client instance
 * @param service - Service name for storage operations
 * @param options - Hybrid storage options
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with hybrid storage
 */
export function createHybridSyncedRegistry(client, service = "procedures", options, baseRegistry = PROCEDURE_REGISTRY) {
    return createSyncedRegistry({
        type: "hybrid",
        client,
        service,
        hybridOptions: options,
        baseRegistry,
    });
}
// =============================================================================
// Custom Storage Factory
// =============================================================================
/**
 * Create a synced registry with a custom storage backend.
 *
 * @param storage - Custom CollectionStorage implementation
 * @param options - Registry options
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with custom storage
 *
 * @example
 * ```typescript
 * // Use MongoDB storage
 * const mongoStorage = new MongoCollectionStorage<SerializedProcedure>(
 *   mongoClient,
 *   'procedures'
 * );
 * const registry = createCustomSyncedRegistry(mongoStorage);
 * ```
 */
export function createCustomSyncedRegistry(storage, options, baseRegistry = PROCEDURE_REGISTRY) {
    return new SyncedProcedureRegistry(baseRegistry, storage, {
        handlerLoader: createDynamicHandlerLoader(),
        ...options,
    });
}
//# sourceMappingURL=factory.js.map