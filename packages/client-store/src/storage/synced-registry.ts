/**
 * Synced Procedure Registry
 *
 * Wraps ProcedureRegistry with storage synchronization capabilities.
 * Enables procedure persistence and sync across backends.
 */

import { StorageListeners, type CollectionStorage } from "@procedures/collections";
import { ProcedureRegistry } from "@procedures/client";
import type { AnyProcedure, ProcedurePath, RegistrationOptions } from "@procedures/client";
import { pathToKey } from "@procedures/client";
import type {
  SerializedProcedure,
  SyncedRegistryOptions,
  SyncError,
  SyncResult,
  SyncStatus,
  SyncDirection,
  SyncConflict,
  HandlerLoader,
  HandlerReference,
} from "./types.js";
import { ProcedureStorageAdapter } from "./adapter.js";
import { serializeProcedure, deserializeProcedure, getSerializedKey } from "./serialization.js";
import { optionalMs, realClock, toMs, type Cancel, type Clock, type Duration } from "@procedures/client";
import type { HybridMode } from "./hybrid.js";

/** A storage with modes: `HybridStorage` (roadmap R28). */
interface StorageWithModes {
  getMode(): HybridMode;
  setMode(mode: HybridMode): Promise<void>;
}

function hasModes(storage: unknown): storage is StorageWithModes {
  const candidate = storage as Partial<StorageWithModes> | null;
  return typeof candidate?.setMode === "function" && typeof candidate.getMode === "function";
}

// =============================================================================
// Extended Registration Options
// =============================================================================

/**
 * Extended registration options with persistence flag.
 */
export interface SyncedRegistrationOptions extends RegistrationOptions {
  /** Whether to persist this procedure to storage (default: true) */
  persist?: boolean | undefined;

  /**
   * The module and export of the handler. The stored record keeps it, so another process can
   * load the handler (with an allowlisted handler loader) when it pulls the record.
   */
  handlerRef?: HandlerReference | undefined;
}

// =============================================================================
// The store of a registry
// =============================================================================

const STORES = new WeakMap<ProcedureRegistry, SyncedProcedureRegistry>();

/**
 * The synced registry that wraps a registry, if one does. The `procedure.store`, `load`,
 * `sync` and `remote` procedures use it.
 *
 * @param registry - A procedure registry
 * @returns The synced registry of the newest wrapper that is not closed, or undefined
 */
export function getProcedureStore(registry: ProcedureRegistry): SyncedProcedureRegistry | undefined {
  return STORES.get(registry);
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
 * A pull compares the `storedAt` of each record with the one of the last sync, and a local
 * change counter for each path. A change on one side only is not a conflict: the changed side
 * wins. A change on both sides (or a path with no sync yet) is a conflict, and the
 * `conflictResolution` option decides. A record with no handler never replaces a procedure
 * that has one: the procedure keeps its handler and takes the record's metadata.
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
  /** The storage of the records: `setMode` changes its mode */
  private readonly storage: CollectionStorage<SerializedProcedure>;
  /** The options, with the sync interval in milliseconds */
  private readonly options: Omit<SyncedRegistryOptions, "syncInterval"> & { syncInterval: number };

  /** Pending changes for write-back strategy */
  private pendingChanges: Map<string, AnyProcedure> = new Map();

  /** Pending deletes for write-back strategy (deep dive DATA-8: they were never deleted) */
  private pendingDeletes: Map<string, ProcedurePath> = new Map();

  /** The handler reference of each path, for the stored records */
  private readonly handlerRefs = new Map<string, HandlerReference>();

  /** The `storedAt` of the record of each path at its last push or pull */
  private readonly syncedAt = new Map<string, number>();

  /** A counter of local changes for each path, and its value at the last push or pull */
  private readonly localVersion = new Map<string, number>();
  private readonly syncedVersion = new Map<string, number>();

  /** Write-through stores that have not finished */
  private readonly inFlight = new Set<Promise<unknown>>();

  /** Whether currently connected to remote storage */
  private connected = false;

  /** True after `close()`: the registry writes nothing to its closed storage */
  private closed = false;

  /** The sync of the auto-sync timer that runs. `close()` waits for it. */
  private autoSyncRun: Promise<unknown> | undefined;

  /** Remote endpoint (if connected) */
  private endpoint: string | undefined;

  /** Last sync timestamp */
  private lastSyncTime: number | undefined;

  /** Whether currently syncing */
  private syncing = false;

  /** The clock of the auto-sync */
  private readonly clock: Clock;

  /** The auto-sync that runs: the timer of its next sync */
  private autoSync: { cancel: Cancel | undefined } | undefined;

  /** The failures of the auto-sync and of the write-through writes that a later success did not clear */
  private readonly failures = new Map<SyncError["operation"], SyncError>();

  /** The listeners of `onStatus()` */
  private readonly statusListeners = new StorageListeners<SyncStatus>();

  constructor(
    baseRegistry: ProcedureRegistry,
    storage: CollectionStorage<SerializedProcedure>,
    options: Partial<SyncedRegistryOptions> = {}
  ) {
    this.baseRegistry = baseRegistry;
    this.storage = storage;
    this.adapter = new ProcedureStorageAdapter(storage, {
      handlerLoader: options.handlerLoader,
    });
    this.options = {
      writeStrategy: options.writeStrategy ?? "write-through",
      conflictResolution: options.conflictResolution ?? "local",
      syncInterval: optionalMs(options.syncInterval, "syncInterval") ?? 0,
      handlerLoader: options.handlerLoader,
      syncOnInit: options.syncOnInit ?? false,
    };
    this.clock = options.clock ?? realClock;

    // The storage procedures of this registry find this wrapper
    STORES.set(baseRegistry, this);

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
   * The record has the path where the procedure is registered: with a `pathPrefix`, the
   * prefixed path. (Before, the record had the path without the prefix: deep dive CORE-8.)
   *
   * @param procedure - Procedure to register
   * @param options - Registration options including persist flag
   */
  register(procedure: AnyProcedure, options?: SyncedRegistrationOptions): void {
    // Register in base registry
    this.baseRegistry.register(procedure, options);

    const path = options?.pathPrefix ? [...options.pathPrefix, ...procedure.path] : procedure.path;
    const registered = this.baseRegistry.get(path) ?? { ...procedure, path };
    const key = pathToKey(path);
    if (options?.handlerRef) {
      this.handlerRefs.set(key, options.handlerRef);
    }
    this.touch(key);

    // After close(), the storage is closed: the registry keeps the procedure in memory only
    if (options?.persist === false || this.closed) {
      return;
    }
    this.pendingDeletes.delete(key);
    if (this.options.writeStrategy === "write-through") {
      // Write-through: persist now. flushWrites() waits for these writes. A failure goes to the status.
      this.track(
        this.storeRecords([registered]).then(
          () => this.succeed("push"),
          (error: unknown) => this.fail("push", new Error(`Failed to persist procedure ${key}`, { cause: error })),
        )
      );
    } else {
      // Write-back: queue for later sync
      this.pendingChanges.set(key, registered);
    }
  }

  /**
   * Unregister a procedure. Its record is deleted from storage: now (write-through), or at the
   * next flush (write-back).
   *
   * @param path - Procedure path
   * @returns True if procedure was removed
   */
  unregister(path: ProcedurePath): boolean {
    const result = this.baseRegistry.unregister(path);

    if (result && !this.closed) {
      const key = pathToKey(path);
      this.pendingChanges.delete(key);
      this.touch(key);
      if (this.options.writeStrategy === "write-through") {
        this.track(
          this.adapter.remove(path).then(
            () => this.succeed("push"),
            (error: unknown) => this.fail("push", new Error(`Failed to remove procedure ${key} from storage`, { cause: error })),
          )
        );
      } else {
        this.pendingDeletes.set(key, path);
      }
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
   * @param filter - Pull only the records for which this function gives true (default: all)
   * @returns Sync result with counts and conflicts
   */
  async syncFromStorage(filter?: (record: SerializedProcedure) => boolean): Promise<SyncResult> {
    this.syncing = true;
    const conflicts: SyncConflict[] = [];
    let pulled = 0;

    try {
      const records = (await this.adapter.getAllRaw()).filter((record) => !filter || filter(record));

      for (const record of records) {
        const key = getSerializedKey(record);
        const remote = await deserializeProcedure(record, { handlerLoader: this.options.handlerLoader });
        if (record.handlerRef) {
          this.handlerRefs.set(key, record.handlerRef);
        }
        const existing = this.baseRegistry.get(record.path);

        if (!existing) {
          this.baseRegistry.register(remote, { override: false });
          this.markSynced(key, record);
          pulled++;
          continue;
        }

        const known = this.syncedAt.get(key);
        const remoteChanged = known === undefined || (record.storedAt ?? 0) !== known;
        const localChanged = known === undefined || this.isDirty(key);

        if (!remoteChanged) {
          continue;
        }
        if (!localChanged) {
          // Only the remote changed: it wins, and it is not a conflict
          this.baseRegistry.register(this.keepHandler(existing, remote), { override: true });
          this.markSynced(key, record);
          pulled++;
          continue;
        }

        const conflict = this.resolveConflict(record.path, existing, remote);
        if (conflict) {
          conflicts.push(conflict);
        }
        if (conflict?.resolution !== "local") {
          this.markSynced(key, record);
        } else {
          // The local version stays, and the next push stores it
          this.syncedAt.set(key, record.storedAt ?? 0);
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
   * Persists all registered procedures to storage, each with its handler reference.
   *
   * @returns Sync result
   */
  async syncToStorage(): Promise<SyncResult> {
    this.syncing = true;

    try {
      const procedures = this.baseRegistry.getAll();
      await this.storeRecords(procedures);
      await this.removeRecords([...this.pendingDeletes.values()]);

      // Clear pending changes
      this.pendingChanges.clear();
      this.pendingDeletes.clear();

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
   * Flush pending changes to storage: the queued writes and deletes of the write-back strategy.
   *
   * @returns The number of records written or deleted
   */
  async flushPending(): Promise<number> {
    await this.flushWrites();
    const procedures = Array.from(this.pendingChanges.values());
    const deletes = Array.from(this.pendingDeletes.values());
    if (procedures.length === 0 && deletes.length === 0) return 0;

    if (procedures.length > 0) {
      await this.storeRecords(procedures);
    }
    await this.removeRecords(deletes);

    this.pendingChanges.clear();
    this.pendingDeletes.clear();
    return procedures.length + deletes.length;
  }

  /**
   * Store the registered procedure at a path now, whatever the write strategy.
   *
   * @param path - Procedure path
   * @param options - A handler reference for the record
   * @returns The stored record, or undefined when no procedure is registered at the path
   */
  async storeProcedure(
    path: ProcedurePath,
    options: { handlerRef?: HandlerReference | undefined } = {}
  ): Promise<SerializedProcedure | undefined> {
    const procedure = this.baseRegistry.get(path);
    if (!procedure) return undefined;
    const key = pathToKey(path);
    if (options.handlerRef) {
      this.handlerRefs.set(key, options.handlerRef);
    }
    await this.storeRecords([procedure]);
    this.pendingChanges.delete(key);
    this.pendingDeletes.delete(key);
    return this.adapter.getRaw(path);
  }

  /**
   * Wait for the write-through writes that have started.
   */
  async flushWrites(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Record a remote endpoint, and optionally pull from storage. This method does not change the
   * storage: give the registry an `ApiStorage` for the endpoint when you make it.
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
   * Get current sync status. `error` is the newest failure of the auto-sync or of a write-through
   * write that a later success did not clear.
   */
  getStatus(): SyncStatus {
    const error = [...this.failures.values()].at(-1);
    return {
      connected: this.connected,
      endpoint: this.endpoint,
      lastSync: this.lastSyncTime,
      pendingChanges: this.pendingChanges.size + this.pendingDeletes.size,
      syncing: this.syncing,
      mode: this.getMode(),
      ...(error !== undefined && { error }),
    };
  }

  /**
   * This method sends the status to a listener after each failure and each success of the auto-sync
   * and of the write-through writes (roadmap CLI-13). Before, the failures went to the console.
   *
   * @returns The function that stops the status. A second use of it does nothing.
   */
  onStatus(listener: (status: SyncStatus) => void): () => void {
    return this.statusListeners.add(listener);
  }

  /** This method keeps a failure for the status, and sends the status. */
  private fail(operation: SyncError["operation"], error: unknown): void {
    this.failures.delete(operation);
    this.failures.set(operation, { operation, error });
    this.statusListeners.emit(this.getStatus());
  }

  /** This method clears the failure of an operation after a success, and sends the status. */
  private succeed(operation: SyncError["operation"]): void {
    if (this.failures.delete(operation)) this.statusListeners.emit(this.getStatus());
  }

  // ===========================================================================
  // The mode of the storage (roadmap R28)
  // ===========================================================================

  /** The mode of the storage, or undefined when the storage has no modes. */
  getMode(): HybridMode | undefined {
    return hasModes(this.storage) ? this.storage.getMode() : undefined;
  }

  /**
   * This method changes the mode of the storage while the registry operates (roadmap R28). The registry
   * waits for its write-through stores that run, then `HybridStorage.setMode()` changes the
   * mode: it sends the queued records before the change.
   *
   * @param mode - `local-only`, `write-through`, `write-back` or `remote-only`
   * @throws When the storage has no modes, or when the switch fails (`ModeSwitchError`)
   */
  async setMode(mode: HybridMode): Promise<void> {
    if (!hasModes(this.storage)) {
      throw new Error('The storage of this registry has no modes: use createSyncedRegistry({ type: "hybrid" })');
    }
    await this.flushWrites();
    await this.storage.setMode(mode);
  }

  // ===========================================================================
  // Auto-Sync
  // ===========================================================================

  /**
   * Start auto-sync at specified interval.
   *
   * @param interval - The sync interval
   */
  startAutoSync(interval: Duration | number): void {
    // A number is the internal form of the option, in milliseconds
    const intervalMs = typeof interval === "number" ? interval : toMs(interval, "interval");
    this.stopAutoSync();
    const loop: { cancel: Cancel | undefined } = { cancel: undefined };
    this.autoSync = loop;
    // The next sync waits for the interval after the end of the last one: one auto-sync at a time
    const arm = (): void => {
      const cancel = this.clock.after(intervalMs, () => {
        loop.cancel = undefined;
        // None after close() or stopAutoSync()
        if (this.closed || this.autoSync !== loop) return;
        const run = this.sync("both")
          .then(
            () => this.succeed("sync"),
            (error: unknown) => this.fail("sync", error),
          )
          .finally(() => {
            if (this.autoSyncRun === run) this.autoSyncRun = undefined;
            if (!this.closed && this.autoSync === loop) arm();
          });
        this.autoSyncRun = run;
      });
      // Don't let the auto-sync timer keep the process alive. See BUGS-2026-07.md (M4).
      cancel.unref?.();
      loop.cancel = cancel;
    };
    arm();
  }

  /**
   * Stop auto-sync.
   */
  stopAutoSync(): void {
    this.autoSync?.cancel?.();
    this.autoSync = undefined;
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
        // Replace with remote, but never replace a handler with a stub (deep dive CORE-8)
        this.baseRegistry.register(this.keepHandler(local, remote), { override: true });
        return {
          path,
          resolution: "remote",
          local: serializeProcedure(local),
          remote: serializeProcedure(remote),
        };

      case "error":
        // Throw error on conflict
        throw new Error(`Sync conflict at ${pathToKey(path)}`);

      case "merge": {
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
      }

      default:
        return undefined;
    }
  }

  /**
   * The remote version of a procedure. When the remote record gives no handler (a stub), the
   * local handler and schemas stay, and the remote metadata applies.
   */
  private keepHandler(local: AnyProcedure, remote: AnyProcedure): AnyProcedure {
    if (remote.handler || !local.handler) {
      return remote;
    }
    const merged: AnyProcedure = { ...local, metadata: { ...remote.metadata } };
    if (remote.streaming !== undefined) {
      merged.streaming = remote.streaming;
    }
    return merged;
  }

  // ===========================================================================
  // Change tracking
  // ===========================================================================

  /** Record a local change of a path. */
  private touch(key: string): void {
    this.localVersion.set(key, (this.localVersion.get(key) ?? 0) + 1);
  }

  /** True when the path changed locally since its last push or pull. */
  private isDirty(key: string): boolean {
    return (this.localVersion.get(key) ?? 0) !== (this.syncedVersion.get(key) ?? 0);
  }

  /** Record that storage and the registry agree on a path. */
  private markSynced(key: string, record: SerializedProcedure, version = this.localVersion.get(key) ?? 0): void {
    this.syncedAt.set(key, record.storedAt ?? 0);
    this.syncedVersion.set(key, version);
  }

  /** Store records for procedures, each with its handler reference, and mark them synced. */
  private async storeRecords(procedures: AnyProcedure[]): Promise<void> {
    // The local versions at the start: a change during the write stays dirty
    const versions = procedures.map((procedure) => this.localVersion.get(pathToKey(procedure.path)) ?? 0);
    const records = await this.adapter.storeAll(procedures, (procedure) => {
      const handlerRef = this.handlerRefs.get(pathToKey(procedure.path));
      return handlerRef ? { handlerRef } : undefined;
    });
    records.forEach((record, index) => this.markSynced(getSerializedKey(record), record, versions[index]));
  }

  /** Delete records, and forget their sync state. */
  private async removeRecords(paths: ProcedurePath[]): Promise<void> {
    if (paths.length === 0) return;
    await this.adapter.removeAll(paths);
    for (const path of paths) {
      const key = pathToKey(path);
      this.syncedAt.delete(key);
      this.syncedVersion.set(key, this.localVersion.get(key) ?? 0);
    }
  }

  private track(write: Promise<unknown>): void {
    this.inFlight.add(write);
    void write.finally(() => this.inFlight.delete(write));
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
   * This method closes the registry: it stops the auto-sync, waits for the sync that runs, writes
   * the pending changes, and closes the storage. After it, `register()` and `unregister()` change
   * only the registry in memory, because the storage rejects each operation. A second `close()`
   * does nothing.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopAutoSync();
    await this.autoSyncRun;

    // Flush pending changes before closing
    await this.flushPending();

    await this.adapter.close();
    this.connected = false;
    if (STORES.get(this.baseRegistry) === this) {
      STORES.delete(this.baseRegistry);
    }
  }
}
