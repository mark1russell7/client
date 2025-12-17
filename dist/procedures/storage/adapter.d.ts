/**
 * Procedure Storage Adapter
 *
 * Wraps CollectionStorage<SerializedProcedure> to provide procedure-specific
 * storage operations with serialization/deserialization.
 */
import type { CollectionStorage } from "../../collections/storage/interface.js";
import type { AnyProcedure, ProcedurePath } from "../types.js";
import type { SerializedProcedure, HandlerLoader } from "./types.js";
import { type SerializeOptions } from "./serialization.js";
/**
 * Options for ProcedureStorageAdapter.
 */
export interface ProcedureStorageAdapterOptions {
    /** Handler loader for restoring handlers from references */
    handlerLoader?: HandlerLoader | undefined;
    /** Default serialization options */
    serializeOptions?: SerializeOptions | undefined;
}
/**
 * Adapter that wraps CollectionStorage for procedure-specific operations.
 *
 * Handles serialization/deserialization of procedures and provides
 * convenience methods for common operations.
 *
 * @example
 * ```typescript
 * const storage = new InMemoryStorage<SerializedProcedure>();
 * const adapter = new ProcedureStorageAdapter(storage, {
 *   handlerLoader: createDynamicHandlerLoader(),
 * });
 *
 * // Store a procedure
 * await adapter.store(myProcedure);
 *
 * // Load a procedure
 * const proc = await adapter.load(['lib', 'scan']);
 * ```
 */
export declare class ProcedureStorageAdapter {
    private readonly storage;
    private readonly handlerLoader;
    private readonly serializeOptions;
    constructor(storage: CollectionStorage<SerializedProcedure>, options?: ProcedureStorageAdapterOptions);
    /**
     * Store a procedure.
     *
     * @param procedure - Procedure to store
     * @param options - Override default serialization options
     */
    store(procedure: AnyProcedure, options?: SerializeOptions): Promise<void>;
    /**
     * Load a procedure by path.
     *
     * @param path - Procedure path
     * @returns Procedure or undefined if not found
     */
    load(path: ProcedurePath): Promise<AnyProcedure | undefined>;
    /**
     * Check if a procedure exists in storage.
     *
     * @param path - Procedure path
     * @returns True if procedure exists
     */
    has(path: ProcedurePath): Promise<boolean>;
    /**
     * Remove a procedure from storage.
     *
     * @param path - Procedure path
     * @returns True if procedure was removed
     */
    remove(path: ProcedurePath): Promise<boolean>;
    /**
     * Load all procedures from storage.
     *
     * @returns Array of all procedures
     */
    loadAll(): Promise<AnyProcedure[]>;
    /**
     * Load procedures matching a path prefix.
     *
     * @param prefix - Path prefix to match
     * @returns Array of matching procedures
     *
     * @example
     * ```typescript
     * // Load all lib.* procedures
     * const libProcedures = await adapter.loadByPrefix(['lib']);
     * ```
     */
    loadByPrefix(prefix: ProcedurePath): Promise<AnyProcedure[]>;
    /**
     * Store multiple procedures.
     *
     * @param procedures - Procedures to store
     * @param options - Override default serialization options
     */
    storeAll(procedures: AnyProcedure[], options?: SerializeOptions): Promise<void>;
    /**
     * Remove multiple procedures.
     *
     * @param paths - Procedure paths to remove
     * @returns Number of procedures removed
     */
    removeAll(paths: ProcedurePath[]): Promise<number>;
    /**
     * Clear all procedures from storage.
     */
    clear(): Promise<void>;
    /**
     * Get the number of stored procedures.
     */
    size(): Promise<number>;
    /**
     * List all stored procedure paths.
     *
     * @returns Array of procedure paths
     */
    listPaths(): Promise<ProcedurePath[]>;
    /**
     * Get the raw serialized data for a procedure.
     * Useful for debugging or custom processing.
     *
     * @param path - Procedure path
     * @returns Serialized procedure data or undefined
     */
    getRaw(path: ProcedurePath): Promise<SerializedProcedure | undefined>;
    /**
     * Get all raw serialized data.
     * Useful for debugging or backup.
     *
     * @returns Array of serialized procedures
     */
    getAllRaw(): Promise<SerializedProcedure[]>;
    /**
     * Close the underlying storage.
     */
    close(): Promise<void>;
    /**
     * Get the underlying storage instance.
     * Use for advanced operations or testing.
     */
    getStorage(): CollectionStorage<SerializedProcedure>;
}
//# sourceMappingURL=adapter.d.ts.map