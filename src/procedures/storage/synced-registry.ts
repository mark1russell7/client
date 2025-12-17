/**
 * Synced Procedure Registry
 *
 * Wraps ProcedureRegistry with storage synchronization capabilities.
 * Enables procedure persistence and sync across backends.
 */

import type { CollectionStorage } from "../../collections/storage/interface.js";
import { ProcedureRegistry } from "../registry.js";
import type { AnyProcedure, ProcedurePath, RegistrationOptions } from "../types.js";
import { pathToKey } from "../types.js";
import type {
  SerializedProcedure,
  SyncedRegistryOptions,
  SyncResult,
  SyncStatus,
  SyncDirection,
  SyncConflict,
  HandlerLoader,
} from "./types.js";
import { ProcedureStorageAdapter } from "./adapter.js";
import { serializeProcedure, getProcedureKey } from "./serialization.js";

// =============================================================================
// Extended Registration Options
// =============================================================================

/**
 * Extended registration options with persistence flag.
 */
export interface SyncedRegistrationOptions extends RegistrationOptions {
  /** Whether to persist this procedure to storage */
  persist?: boolean | undefined;
}

// =============================================================================
// Synced Procedure Registry
// =============================================================================

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
export class SyncedProcedureRegistry {
  private readonly baseRegistry: ProcedureRegistry;
  private readonly adapter: ProcedureStorageAdapter;
  private readonly options: SyncedRegistryOptions;

  /** Pending changes for write-back strategy */
  private pendingChanges: Map<string, AnyProcedure> = new Map();

  /** Whether currently connected to remote storage */
  private connected = false;

  /** Remote endpoint (if connected) */
  private endpoint: string | undefined;

  /** Last sync timestamp */
  private lastSyncTime: number | undefined;

  /** Whether currently syncing */
  private syncing = false;

  /** Auto-sync interval handle */
  private syncIntervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    baseRegistry: ProcedureRegistry,
    storage: CollectionStorage<SerializedProcedure>,
    options: Partial<SyncedRegistryOptions> = {}
  ) {
    this.baseRegistry = baseRegistry;
    this.adapter = new ProcedureStorageAdapter(storage, {
      handlerLoader: options.handlerLoader,
    });
    this.options = {
      writeStrategy: options.writeStrategy ?? "write-through",
      conflictResolution: options.conflictResolution ?? "local",
      syncInterval: options.syncInterval ?? 0,
      handlerLoader: options.handlerLoader,
      syncOnInit: options.syncOnInit ?? false,
    };

    // Set up auto-sync if configured
    if (this.options.syncInterval && this.options.syncInterval > 0) {
      this.startAutoSync(this.options.syncInterval);
    }
  }

  // ===========================================================================
  // Registry Methods (delegated to base registry)
  // ===========================================================================

  /**
   * Register a procedure with optional persistence.
   *
   * @param procedure - Procedure to register
   * @param options - Registration options including persist flag
   */
  register(procedure: AnyProcedure, options?: SyncedRegistrationOptions): void {
    // Register in base registry
    this.baseRegistry.register(procedure, options);

    // Handle persistence
    if (options?.persist !== false && this.options.writeStrategy === "write-through") {
      // Write-through: persist immediately
      void this.adapter.store(procedure).catch((err) => {
        console.error(`Failed to persist procedure ${pathToKey(procedure.path)}:`, err);
      });
    } else if (options?.persist !== false && this.options.writeStrategy === "write-back") {
      // Write-back: queue for later sync
      this.pendingChanges.set(getProcedureKey(procedure), procedure);
    }
  }

  /**
   * Unregister a procedure.
   *
   * @param path - Procedure path
   * @returns True if procedure was removed
   */
  unregister(path: ProcedurePath): boolean {
    const result = this.baseRegistry.unregister(path);

    if (result) {
      // Remove from storage if write-through
      if (this.options.writeStrategy === "write-through") {
        void this.adapter.remove(path).catch((err) => {
          console.error(`Failed to remove procedure ${pathToKey(path)} from storage:`, err);
        });
      }
      // Remove from pending changes
      this.pendingChanges.delete(pathToKey(path));
    }

    return result;
  }

  /**
   * Get a procedure by path.
   */
  get(path: ProcedurePath): AnyProcedure | undefined {
    return this.baseRegistry.get(path);
  }

  /**
   * Check if a procedure exists.
   */
  has(path: ProcedurePath): boolean {
    return this.baseRegistry.has(path);
  }

  /**
   * Get all registered procedures.
   */
  getAll(): AnyProcedure[] {
    return this.baseRegistry.getAll();
  }

  /**
   * Get procedures by prefix.
   */
  getByPrefix(prefix: ProcedurePath): AnyProcedure[] {
    return this.baseRegistry.getByPrefix(prefix);
  }

  /**
   * Get count of registered procedures.
   */
  get size(): number {
    return this.baseRegistry.size;
  }

  // ===========================================================================
  // Sync Operations
  // ===========================================================================

  /**
   * Sync from storage to registry.
   * Loads procedures from storage and merges with registry.
   *
   * @returns Sync result with counts and conflicts
   */
  async syncFromStorage(): Promise<SyncResult> {
    this.syncing = true;
    const conflicts: SyncConflict[] = [];
    let pulled = 0;

    try {
      const storedProcedures = await this.adapter.loadAll();

      for (const proc of storedProcedures) {
        const existing = this.baseRegistry.get(proc.path);

        if (existing) {
          // Handle conflict
          const conflict = this.resolveConflict(proc.path, existing, proc);
          if (conflict) {
            conflicts.push(conflict);
          }
        } else {
          // No conflict, just add
          this.baseRegistry.register(proc, { override: false });
          pulled++;
        }
      }

      this.lastSyncTime = Date.now();
      return {
        pushed: 0,
        pulled,
        conflicts,
        timestamp: this.lastSyncTime,
      };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync from registry to storage.
   * Persists all registered procedures to storage.
   *
   * @returns Sync result
   */
  async syncToStorage(): Promise<SyncResult> {
    this.syncing = true;

    try {
      const procedures = this.baseRegistry.getAll();
      await this.adapter.storeAll(procedures);

      // Clear pending changes
      this.pendingChanges.clear();

      this.lastSyncTime = Date.now();
      return {
        pushed: procedures.length,
        pulled: 0,
        conflicts: [],
        timestamp: this.lastSyncTime,
      };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Full bidirectional sync.
   *
   * @param direction - Sync direction (push/pull/both)
   * @returns Sync result
   */
  async sync(direction: SyncDirection = "both"): Promise<SyncResult> {
    const results: SyncResult = {
      pushed: 0,
      pulled: 0,
      conflicts: [],
      timestamp: Date.now(),
    };

    if (direction === "pull" || direction === "both") {
      const pullResult = await this.syncFromStorage();
      results.pulled = pullResult.pulled;
      results.conflicts.push(...pullResult.conflicts);
    }

    if (direction === "push" || direction === "both") {
      const pushResult = await this.syncToStorage();
      results.pushed = pushResult.pushed;
    }

    this.lastSyncTime = results.timestamp;
    return results;
  }

  /**
   * Flush pending changes to storage.
   * Used with write-back strategy.
   */
  async flushPending(): Promise<number> {
    if (this.pendingChanges.size === 0) return 0;

    const procedures = Array.from(this.pendingChanges.values());
    await this.adapter.storeAll(procedures);

    const count = this.pendingChanges.size;
    this.pendingChanges.clear();
    return count;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to remote storage.
   *
   * @param endpoint - Remote endpoint URL
   * @param options - Connection options
   */
  async connect(
    endpoint: string,
    options?: { syncOnConnect?: boolean }
  ): Promise<void> {
    this.endpoint = endpoint;
    this.connected = true;

    if (options?.syncOnConnect ?? this.options.syncOnInit) {
      await this.syncFromStorage();
    }
  }

  /**
   * Disconnect from remote storage.
   */
  disconnect(): void {
    this.connected = false;
    this.endpoint = undefined;
    this.stopAutoSync();
  }

  /**
   * Get current sync status.
   */
  getStatus(): SyncStatus {
    return {
      connected: this.connected,
      endpoint: this.endpoint,
      lastSync: this.lastSyncTime,
      pendingChanges: this.pendingChanges.size,
      syncing: this.syncing,
    };
  }

  // ===========================================================================
  // Auto-Sync
  // ===========================================================================

  /**
   * Start auto-sync at specified interval.
   *
   * @param intervalMs - Sync interval in milliseconds
   */
  startAutoSync(intervalMs: number): void {
    this.stopAutoSync();
    this.syncIntervalHandle = setInterval(() => {
      void this.sync("both").catch((err) => {
        console.error("Auto-sync failed:", err);
      });
    }, intervalMs);
  }

  /**
   * Stop auto-sync.
   */
  stopAutoSync(): void {
    if (this.syncIntervalHandle) {
      clearInterval(this.syncIntervalHandle);
      this.syncIntervalHandle = undefined;
    }
  }

  // ===========================================================================
  // Conflict Resolution
  // ===========================================================================

  /**
   * Resolve a conflict between local and remote procedures.
   *
   * @param path - Procedure path
   * @param local - Local procedure
   * @param remote - Remote procedure
   * @returns Conflict info if not automatically resolved
   */
  private resolveConflict(
    path: ProcedurePath,
    local: AnyProcedure,
    remote: AnyProcedure
  ): SyncConflict | undefined {
    switch (this.options.conflictResolution) {
      case "local":
        // Keep local, ignore remote
        return {
          path,
          resolution: "local",
          local: serializeProcedure(local),
          remote: serializeProcedure(remote),
        };

      case "remote":
        // Replace with remote
        this.baseRegistry.register(remote, { override: true });
        return {
          path,
          resolution: "remote",
          local: serializeProcedure(local),
          remote: serializeProcedure(remote),
        };

      case "error":
        // Throw error on conflict
        throw new Error(`Sync conflict at ${pathToKey(path)}`);

      case "merge":
        // Merge metadata, keep local handler
        const merged: AnyProcedure = {
          ...local,
          metadata: { ...remote.metadata, ...local.metadata },
        };
        this.baseRegistry.register(merged, { override: true });
        return {
          path,
          resolution: "merge",
          local: serializeProcedure(local),
          remote: serializeProcedure(remote),
        };

      default:
        return undefined;
    }
  }

  // ===========================================================================
  // Access to Underlying Components
  // ===========================================================================

  /**
   * Get the base registry.
   */
  getBaseRegistry(): ProcedureRegistry {
    return this.baseRegistry;
  }

  /**
   * Get the storage adapter.
   */
  getAdapter(): ProcedureStorageAdapter {
    return this.adapter;
  }

  /**
   * Get the handler loader.
   */
  getHandlerLoader(): HandlerLoader | undefined {
    return this.options.handlerLoader;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Close the synced registry and cleanup resources.
   */
  async close(): Promise<void> {
    this.stopAutoSync();

    // Flush pending changes before closing
    if (this.pendingChanges.size > 0) {
      await this.flushPending();
    }

    await this.adapter.close();
    this.connected = false;
  }
}
