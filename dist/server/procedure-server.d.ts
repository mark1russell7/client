/**
 * Procedure Server
 *
 * Server implementation with procedure auto-registration and repository pattern.
 * Integrates with ProcedureRegistry and CollectionStorage backends.
 */
import { Server, type ServerOptions } from "./server";
import type { AnyProcedure, ProcedurePath, RepositoryProvider, ProcedureModule } from "../procedures/types";
import { ProcedureRegistry } from "../procedures/registry";
import type { CollectionStorage } from "../collections/storage/interface";
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
}
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
export declare class ProcedureServer extends Server implements RepositoryProvider {
    private readonly procedureRegistry;
    private readonly storages;
    private readonly registeredProcedures;
    constructor(options?: ProcedureServerOptions);
    /**
     * Get storage for a collection.
     *
     * @param collection - Collection name
     * @returns Storage instance
     * @throws Error if collection not configured
     */
    getStorage<T>(collection: string): CollectionStorage<T>;
    /**
     * Check if a collection is configured.
     *
     * @param collection - Collection name
     */
    hasCollection(collection: string): boolean;
    /**
     * Configure storage for a collection.
     *
     * @param name - Collection name
     * @param storage - Storage backend
     * @returns this (for chaining)
     */
    useStorage<T>(name: string, storage: CollectionStorage<T>): this;
    /**
     * Configure multiple storages at once.
     *
     * @param storages - Map of collection names to storage backends
     * @returns this (for chaining)
     */
    useStorages(storages: Record<string, CollectionStorage<unknown>>): this;
    /**
     * Get all configured collection names.
     */
    getCollectionNames(): string[];
    /**
     * Register a procedure as a server handler.
     *
     * @param procedure - Procedure definition
     */
    registerProcedure(procedure: AnyProcedure): void;
    /**
     * Register multiple procedures.
     *
     * @param procedures - Array of procedures
     */
    registerProcedures(procedures: AnyProcedure[]): void;
    /**
     * Register a procedure module.
     *
     * @param module - Module with procedures array
     */
    registerModule(module: ProcedureModule): void;
    /**
     * Register all procedures from the registry.
     * Only registers procedures that have handlers.
     */
    registerFromRegistry(): void;
    /**
     * Register collection procedures for a specific collection.
     * Creates standard CRUD procedures using the configured storage.
     *
     * @param collectionName - Collection name
     */
    registerCollectionProcedures(collectionName: string): void;
    /**
     * Convert procedure path to Method object.
     */
    private pathToMethod;
    /**
     * Get count of registered procedures.
     */
    get procedureCount(): number;
    /**
     * Check if a procedure is registered.
     *
     * @param path - Procedure path
     */
    hasProcedure(path: ProcedurePath): boolean;
    /**
     * Close all storage backends.
     */
    closeStorages(): Promise<void>;
    /**
     * Stop server and close storages.
     */
    stop(): Promise<void>;
}
/**
 * Create a procedure server with common configuration.
 *
 * @param options - Server options
 * @returns Configured ProcedureServer
 */
export declare function createProcedureServer(options?: ProcedureServerOptions): ProcedureServer;
//# sourceMappingURL=procedure-server.d.ts.map