/**
 * Synced Procedure Registry
 *
 * Wraps ProcedureRegistry with storage synchronization capabilities.
 * Enables procedure persistence and sync across backends.
 */
import type { CollectionStorage } from "../../collections/storage/interface.js";
import { ProcedureRegistry } from "../registry.js";
import type { AnyProcedure, ProcedurePath, RegistrationOptions } from "../types.js";
import type { SerializedProcedure, SyncedRegistryOptions, SyncResult, SyncStatus, SyncDirection, HandlerLoader } from "./types.js";
import { ProcedureStorageAdapter } from "./adapter.js";
/**
 * Extended registration options with persistence flag.
 */
export interface SyncedRegistrationOptions extends RegistrationOptions {
    /** Whether to persist this procedure to storage */
    persist?: boolean | undefined;
}
/**
 * Procedure registry with storage synchronization.
 *
 * Wraps an existing ProcedureRegistry and adds:
 * - Automatic persistence on register (write-through/write-back)
 * - Sync from storage on demand
 * - Conflict resolution
 * - Connection management for remote storage
 *
 * @example
 * ```typescript
 * const registry = new SyncedProcedureRegistry(
 *   PROCEDURE_REGISTRY,
 *   storageAdapter,
 *   {
 *     writeStrategy: 'write-through',
 *     conflictResolution: 'remote',
 *   }
 * );
 *
 * // Sync from storage on startup
 * await registry.syncFromStorage();
 *
 * // Register with auto-persistence
 * registry.register(myProcedure, { persist: true });
 *
 * // Manual sync
 * const result = await registry.sync('both');
 * ```
 */
export declare class SyncedProcedureRegistry {
    private readonly baseRegistry;
    private readonly adapter;
    private readonly options;
    /** Pending changes for write-back strategy */
    private pendingChanges;
    /** Whether currently connected to remote storage */
    private connected;
    /** Remote endpoint (if connected) */
    private endpoint;
    /** Last sync timestamp */
    private lastSyncTime;
    /** Whether currently syncing */
    private syncing;
    /** Auto-sync interval handle */
    private syncIntervalHandle;
    constructor(baseRegistry: ProcedureRegistry, storage: CollectionStorage<SerializedProcedure>, options?: Partial<SyncedRegistryOptions>);
    /**
     * Register a procedure with optional persistence.
     *
     * @param procedure - Procedure to register
     * @param options - Registration options including persist flag
     */
    register(procedure: AnyProcedure, options?: SyncedRegistrationOptions): void;
    /**
     * Unregister a procedure.
     *
     * @param path - Procedure path
     * @returns True if procedure was removed
     */
    unregister(path: ProcedurePath): boolean;
    /**
     * Get a procedure by path.
     */
    get(path: ProcedurePath): AnyProcedure | undefined;
    /**
     * Check if a procedure exists.
     */
    has(path: ProcedurePath): boolean;
    /**
     * Get all registered procedures.
     */
    getAll(): AnyProcedure[];
    /**
     * Get procedures by prefix.
     */
    getByPrefix(prefix: ProcedurePath): AnyProcedure[];
    /**
     * Get count of registered procedures.
     */
    get size(): number;
    /**
     * Sync from storage to registry.
     * Loads procedures from storage and merges with registry.
     *
     * @returns Sync result with counts and conflicts
     */
    syncFromStorage(): Promise<SyncResult>;
    /**
     * Sync from registry to storage.
     * Persists all registered procedures to storage.
     *
     * @returns Sync result
     */
    syncToStorage(): Promise<SyncResult>;
    /**
     * Full bidirectional sync.
     *
     * @param direction - Sync direction (push/pull/both)
     * @returns Sync result
     */
    sync(direction?: SyncDirection): Promise<SyncResult>;
    /**
     * Flush pending changes to storage.
     * Used with write-back strategy.
     */
    flushPending(): Promise<number>;
    /**
     * Connect to remote storage.
     *
     * @param endpoint - Remote endpoint URL
     * @param options - Connection options
     */
    connect(endpoint: string, options?: {
        syncOnConnect?: boolean;
    }): Promise<void>;
    /**
     * Disconnect from remote storage.
     */
    disconnect(): void;
    /**
     * Get current sync status.
     */
    getStatus(): SyncStatus;
    /**
     * Start auto-sync at specified interval.
     *
     * @param intervalMs - Sync interval in milliseconds
     */
    startAutoSync(intervalMs: number): void;
    /**
     * Stop auto-sync.
     */
    stopAutoSync(): void;
    /**
     * Resolve a conflict between local and remote procedures.
     *
     * @param path - Procedure path
     * @param local - Local procedure
     * @param remote - Remote procedure
     * @returns Conflict info if not automatically resolved
     */
    private resolveConflict;
    /**
     * Get the base registry.
     */
    getBaseRegistry(): ProcedureRegistry;
    /**
     * Get the storage adapter.
     */
    getAdapter(): ProcedureStorageAdapter;
    /**
     * Get the handler loader.
     */
    getHandlerLoader(): HandlerLoader | undefined;
    /**
     * Close the synced registry and cleanup resources.
     */
    close(): Promise<void>;
}
//# sourceMappingURL=synced-registry.d.ts.map