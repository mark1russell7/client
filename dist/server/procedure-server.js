/**
 * Procedure Server
 *
 * Server implementation with procedure auto-registration and repository pattern.
 * Integrates with ProcedureRegistry and CollectionStorage backends.
 */
import { Server } from "./server.js";
import { pathToKey } from "../procedures/types.js";
import { ProcedureRegistry, PROCEDURE_REGISTRY } from "../procedures/registry.js";
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
export class ProcedureServer extends Server {
    procedureRegistry;
    storages = new Map();
    registeredProcedures = new Set();
    constructor(options = {}) {
        super(options);
        this.procedureRegistry = options.registry ?? PROCEDURE_REGISTRY;
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
    getStorage(collection) {
        const storage = this.storages.get(collection);
        if (!storage) {
            throw new Error(`Collection storage not configured: ${collection}`);
        }
        return storage;
    }
    /**
     * Check if a collection is configured.
     *
     * @param collection - Collection name
     */
    hasCollection(collection) {
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
    useStorage(name, storage) {
        this.storages.set(name, storage);
        return this;
    }
    /**
     * Configure multiple storages at once.
     *
     * @param storages - Map of collection names to storage backends
     * @returns this (for chaining)
     */
    useStorages(storages) {
        for (const [name, storage] of Object.entries(storages)) {
            this.storages.set(name, storage);
        }
        return this;
    }
    /**
     * Get all configured collection names.
     */
    getCollectionNames() {
        return Array.from(this.storages.keys());
    }
    // ===========================================================================
    // Procedure Registration
    // ===========================================================================
    /**
     * Register a procedure as a server handler.
     *
     * @param procedure - Procedure definition
     */
    registerProcedure(procedure) {
        const key = pathToKey(procedure.path);
        // Skip if already registered
        if (this.registeredProcedures.has(key)) {
            return;
        }
        // Must have a handler
        if (!procedure.handler) {
            throw new Error(`Procedure at ${key} has no handler`);
        }
        // Convert path to method
        const method = this.pathToMethod(procedure.path);
        // Create server handler that wraps the procedure handler
        const handler = procedure.handler;
        const self = this;
        this.register(method, async (request) => {
            // Validate input
            const inputResult = procedure.input.safeParse(request.payload);
            if (!inputResult.success) {
                return {
                    id: request.id,
                    status: {
                        type: "error",
                        code: "VALIDATION_ERROR",
                        message: inputResult.error.message,
                        retryable: false,
                    },
                    metadata: {},
                };
            }
            // Create the call function for inter-procedure communication
            const callProcedure = async (targetPath, input) => {
                const targetProc = self.procedureRegistry.get(targetPath);
                if (!targetProc) {
                    throw new Error(`Procedure not found: ${pathToKey(targetPath)}`);
                }
                if (!targetProc.handler) {
                    throw new Error(`Procedure has no handler: ${pathToKey(targetPath)}`);
                }
                // Validate input
                const inputResult = targetProc.input.safeParse(input);
                if (!inputResult.success) {
                    throw new Error(`Input validation failed: ${inputResult.error.message}`);
                }
                // Create nested context (inherits metadata, signal)
                const nestedContext = {
                    metadata: request.metadata,
                    repository: self,
                    path: targetPath,
                    client: { call: callProcedure },
                };
                if (request.signal) {
                    nestedContext.signal = request.signal;
                }
                // Execute and return
                return await targetProc.handler(inputResult.data, nestedContext);
            };
            // Create procedure context
            const context = {
                metadata: request.metadata,
                repository: self,
                path: procedure.path,
                client: { call: callProcedure },
            };
            // Only set signal if provided (exactOptionalPropertyTypes)
            if (request.signal) {
                context.signal = request.signal;
            }
            try {
                // Execute handler
                const output = await handler(inputResult.data, context);
                // Validate output
                const outputResult = procedure.output.safeParse(output);
                if (!outputResult.success) {
                    return {
                        id: request.id,
                        status: {
                            type: "error",
                            code: "OUTPUT_VALIDATION_ERROR",
                            message: outputResult.error.message,
                            retryable: false,
                        },
                        metadata: {},
                    };
                }
                return {
                    id: request.id,
                    status: {
                        type: "success",
                        code: 200,
                    },
                    payload: outputResult.data,
                    metadata: {},
                };
            }
            catch (error) {
                return {
                    id: request.id,
                    status: {
                        type: "error",
                        code: "HANDLER_ERROR",
                        message: error instanceof Error ? error.message : String(error),
                        retryable: false,
                    },
                    metadata: {},
                };
            }
        });
        this.registeredProcedures.add(key);
    }
    /**
     * Register multiple procedures.
     *
     * @param procedures - Array of procedures
     */
    registerProcedures(procedures) {
        for (const procedure of procedures) {
            this.registerProcedure(procedure);
        }
    }
    /**
     * Register a procedure module.
     *
     * @param module - Module with procedures array
     */
    registerModule(module) {
        this.registerProcedures(module.procedures);
    }
    /**
     * Register all procedures from the registry.
     * Only registers procedures that have handlers.
     */
    registerFromRegistry() {
        const procedures = this.procedureRegistry.getAll();
        for (const procedure of procedures) {
            if (procedure.handler) {
                this.registerProcedure(procedure);
            }
        }
    }
    /**
     * Register collection procedures for a specific collection.
     * Creates standard CRUD procedures using the configured storage.
     *
     * @param collectionName - Collection name
     */
    registerCollectionProcedures(collectionName) {
        // Import dynamically to avoid circular dependencies
        const { createCollectionProcedures } = require("../procedures/collection/procedures");
        const procedures = createCollectionProcedures(collectionName);
        // Register with the procedure registry first
        this.procedureRegistry.registerAll(procedures);
        // Then register as server handlers
        this.registerProcedures(procedures);
    }
    // ===========================================================================
    // Utility Methods
    // ===========================================================================
    /**
     * Convert procedure path to Method object.
     */
    pathToMethod(path) {
        if (path.length < 2) {
            throw new Error(`Invalid procedure path: ${path.join(".")}`);
        }
        // Path format: [service, ...nested, operation]
        // e.g., ['collections', 'users', 'get'] -> { service: 'collections.users', operation: 'get' }
        const operation = path[path.length - 1];
        const service = path.slice(0, -1).join(".");
        return { service, operation };
    }
    /**
     * Get count of registered procedures.
     */
    get procedureCount() {
        return this.registeredProcedures.size;
    }
    /**
     * Check if a procedure is registered.
     *
     * @param path - Procedure path
     */
    hasProcedure(path) {
        return this.registeredProcedures.has(pathToKey(path));
    }
    /**
     * Close all storage backends.
     */
    async closeStorages() {
        const closePromises = Array.from(this.storages.values()).map((s) => s.close());
        await Promise.all(closePromises);
    }
    /**
     * Stop server and close storages.
     */
    async stop() {
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
export function createProcedureServer(options = {}) {
    return new ProcedureServer(options);
}
//# sourceMappingURL=procedure-server.js.map