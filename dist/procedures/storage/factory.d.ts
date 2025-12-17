/**
 * Procedure Storage Factory
 *
 * Factory functions for creating storage-backed procedure registries.
 */
import type { Client } from "../../client/client.js";
import type { CollectionStorage } from "../../collections/storage/interface.js";
import type { HybridStorageOptions } from "../../collections/storage/hybrid.js";
import { ProcedureRegistry } from "../registry.js";
import type { SerializedProcedure, SyncedRegistryOptions, HandlerLoader } from "./types.js";
import { SyncedProcedureRegistry } from "./synced-registry.js";
/**
 * Configuration for creating a synced procedure registry.
 */
export interface CreateSyncedRegistryConfig {
    /**
     * Storage type to use.
     * - "memory": In-memory only (fast, volatile)
     * - "api": Remote storage via client procedures
     * - "hybrid": Local cache + remote sync
     */
    type: "memory" | "api" | "hybrid";
    /**
     * Universal client instance (required for "api" and "hybrid" types).
     */
    client?: Client | undefined;
    /**
     * Service name for API storage.
     * @default "procedures"
     */
    service?: string | undefined;
    /**
     * Additional options for hybrid storage.
     */
    hybridOptions?: Partial<HybridStorageOptions> | undefined;
    /**
     * Options for the synced registry.
     */
    registryOptions?: Partial<SyncedRegistryOptions> | undefined;
    /**
     * Base registry to wrap.
     * @default PROCEDURE_REGISTRY (global singleton)
     */
    baseRegistry?: ProcedureRegistry | undefined;
    /**
     * Custom handler loader.
     * @default Dynamic import loader
     */
    handlerLoader?: HandlerLoader | undefined;
}
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
export declare function createSyncedRegistry(config: CreateSyncedRegistryConfig): SyncedProcedureRegistry;
/**
 * Create an in-memory synced registry.
 * Useful for testing or when persistence isn't needed.
 *
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with in-memory storage
 */
export declare function createMemorySyncedRegistry(baseRegistry?: ProcedureRegistry): SyncedProcedureRegistry;
/**
 * Create an API-backed synced registry.
 *
 * @param client - Universal client instance
 * @param service - Service name for storage operations
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with API storage
 */
export declare function createApiSyncedRegistry(client: Client, service?: string, baseRegistry?: ProcedureRegistry): SyncedProcedureRegistry;
/**
 * Create a hybrid synced registry (offline-first).
 *
 * @param client - Universal client instance
 * @param service - Service name for storage operations
 * @param options - Hybrid storage options
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with hybrid storage
 */
export declare function createHybridSyncedRegistry(client: Client, service?: string, options?: Partial<HybridStorageOptions>, baseRegistry?: ProcedureRegistry): SyncedProcedureRegistry;
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
export declare function createCustomSyncedRegistry(storage: CollectionStorage<SerializedProcedure>, options?: Partial<SyncedRegistryOptions>, baseRegistry?: ProcedureRegistry): SyncedProcedureRegistry;
//# sourceMappingURL=factory.d.ts.map