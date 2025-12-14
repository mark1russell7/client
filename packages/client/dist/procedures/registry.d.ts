/**
 * Procedure Registry
 *
 * Central registry for procedure definitions.
 * Supports auto-discovery via module self-registration pattern.
 */
import type { AnyProcedure, ProcedurePath, RegistryEventType, ProcedureModule, RegistrationOptions } from "./types";
/**
 * Error thrown when procedure registration fails.
 */
export declare class RegistryError extends Error {
    readonly name = "RegistryError";
    readonly path: ProcedurePath;
    constructor(message: string, path: ProcedurePath, cause?: Error);
}
/**
 * Central registry for procedure definitions.
 *
 * Features:
 * - Path-based procedure storage and lookup
 * - Event emission for registration/unregistration
 * - Module bulk registration with path prefixing
 * - Tree traversal for namespace queries
 *
 * @example
 * ```typescript
 * const registry = new ProcedureRegistry();
 *
 * // Register a procedure
 * registry.register(getUserProcedure);
 *
 * // Lookup by path
 * const proc = registry.get(['users', 'get']);
 *
 * // Listen for registrations
 * registry.on('register', (proc) => console.log('Registered:', proc.path));
 * ```
 */
export declare class ProcedureRegistry {
    /** Procedures stored by path key */
    private readonly procedures;
    /** Event listeners */
    private readonly listeners;
    /** Registered module names for debugging */
    private readonly registeredModules;
    /**
     * Register a procedure.
     *
     * @param procedure - Procedure to register
     * @param options - Registration options
     * @throws RegistryError if path already exists and override is false
     */
    register(procedure: AnyProcedure, options?: RegistrationOptions): void;
    /**
     * Unregister a procedure by path.
     *
     * @param path - Procedure path to unregister
     * @returns true if procedure was found and removed
     */
    unregister(path: ProcedurePath): boolean;
    /**
     * Register all procedures from a module.
     *
     * @param module - Module with procedures array
     * @param options - Registration options
     */
    registerModule(module: ProcedureModule, options?: RegistrationOptions): void;
    /**
     * Register multiple procedures.
     *
     * @param procedures - Array of procedures
     * @param options - Registration options
     */
    registerAll(procedures: AnyProcedure[], options?: RegistrationOptions): void;
    /**
     * Get a procedure by path.
     *
     * @param path - Procedure path
     * @returns Procedure or undefined if not found
     */
    get(path: ProcedurePath): AnyProcedure | undefined;
    /**
     * Check if a procedure exists at path.
     *
     * @param path - Procedure path
     */
    has(path: ProcedurePath): boolean;
    /**
     * Get all procedures under a namespace prefix.
     *
     * @param prefix - Path prefix to filter by
     * @returns Array of procedures under the prefix
     *
     * @example
     * ```typescript
     * // Get all collection procedures
     * const collectionProcs = registry.getByPrefix(['collections']);
     * ```
     */
    getByPrefix(prefix: ProcedurePath): AnyProcedure[];
    /**
     * Get all registered procedures.
     */
    getAll(): AnyProcedure[];
    /**
     * Get count of registered procedures.
     */
    get size(): number;
    /**
     * Get all registered module names.
     */
    getModules(): string[];
    /**
     * Get the namespace tree structure.
     * Useful for introspection and documentation generation.
     *
     * @returns Nested object representing the procedure tree
     *
     * @example
     * ```typescript
     * const tree = registry.getTree();
     * // {
     * //   collections: {
     * //     users: { get: procedure, set: procedure },
     * //     orders: { list: procedure }
     * //   },
     * //   weather: { forecast: procedure }
     * // }
     * ```
     */
    getTree(): Record<string, unknown>;
    /**
     * Get all unique namespace prefixes at a given depth.
     *
     * @param depth - Depth to query (0 = root namespaces)
     * @returns Array of unique segments at that depth
     *
     * @example
     * ```typescript
     * registry.getNamespacesAtDepth(0); // ['collections', 'weather', 'auth']
     * registry.getNamespacesAtDepth(1); // ['users', 'orders', 'forecast', ...]
     * ```
     */
    getNamespacesAtDepth(depth: number): string[];
    /**
     * Add event listener for registry events.
     *
     * @param event - Event type
     * @param listener - Callback function
     */
    on(event: RegistryEventType, listener: (procedure: AnyProcedure) => void): void;
    /**
     * Remove event listener.
     *
     * @param event - Event type
     * @param listener - Callback function to remove
     */
    off(event: RegistryEventType, listener: (procedure: AnyProcedure) => void): void;
    /**
     * Emit an event to all listeners.
     */
    private emit;
    /**
     * Clear all registered procedures.
     * Primarily useful for testing.
     */
    clear(): void;
    /**
     * Create a snapshot of current registrations.
     * Useful for debugging and testing.
     */
    snapshot(): {
        paths: string[];
        modules: string[];
    };
}
/**
 * Global procedure registry singleton.
 *
 * Used for module self-registration pattern where modules
 * register their procedures at import time.
 *
 * @example
 * ```typescript
 * // In a module's register.ts (side-effect import)
 * import { PROCEDURE_REGISTRY } from 'client/procedures';
 * import { myProcedures } from './procedures';
 *
 * PROCEDURE_REGISTRY.registerAll(myProcedures);
 *
 * // Consumer just imports the side-effect
 * import 'my-module/register';
 * ```
 */
export declare const PROCEDURE_REGISTRY: ProcedureRegistry;
//# sourceMappingURL=registry.d.ts.map