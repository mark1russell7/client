/**
 * Hybrid Storage Implementation
 *
 * Combines local cache (InMemoryStorage) with remote persistence (ApiStorage).
 * Provides fast local reads with remote backup and sync.
 *
 * Features:
 * - Local cache for fast reads, with a remote read on a miss
 * - Write-through or write-back strategies
 * - Automatic sync on initialization
 * - Conflict resolution
 * - Offline operation queue
 */

import type { CollectionStorage, StorageMetadata } from "@mark1russell7/client-collections";
import { InMemoryStorage } from "@mark1russell7/client-collections";

/**
 * Conflict resolution strategy.
 */
export type ConflictResolution = "local" | "remote" | "merge" | "error";

/**
 * Write strategy for hybrid storage.
 */
export type WriteStrategy = "write-through" | "write-back";

/**
 * Hybrid storage configuration options.
 */
export interface HybridStorageOptions {
  /**
   * Write strategy
   * - write-through: Write to both local and remote immediately
   * - write-back: Write to local immediately, sync to remote later
   * @default "write-through"
   */
  writeStrategy?: WriteStrategy;

  /**
   * Conflict resolution strategy
   * - local: Local changes win
   * - remote: Remote changes win
   * - merge: Custom merge function (requires mergeFn)
   * - error: Throw error on conflict
   * @default "remote"
   */
  conflictResolution?: ConflictResolution;

  /**
   * Custom merge function for conflict resolution.
   * Only used when conflictResolution is "merge".
   *
   * @param local - Local version
   * @param remote - Remote version
   * @returns Merged value
   */
  mergeFn?: <T>(local: T, remote: T) => T;

  /**
   * The key of a remote item, for the local cache. The default reads a string `id` field. Give
   * a function for items with another key, for example `getSerializedKey` for procedure records.
   */
  keyOf?: (item: any) => string | undefined;

  /**
   * Automatic sync interval in milliseconds (for write-back mode).
   * Set to 0 to disable automatic sync.
   * @default 5000 (5 seconds)
   */
  syncInterval?: number;

  /**
   * Initialize by syncing from remote on construction.
   * @default true
   */
  syncOnInit?: boolean;

  /**
   * Maximum offline operations to queue.
   * @default 1000
   */
  maxOfflineOps?: number;

  /**
   * Enable offline operation queue.
   * When remote is unavailable, operations are queued and retried.
   * @default true
   */
  offlineQueue?: boolean;
}

/**
 * Offline operation for write-back/queue.
 */
interface OfflineOperation {
  type: "set" | "delete" | "setBatch" | "deleteBatch" | "clear";
  data: unknown;
  timestamp: number;
}

/** The ids that an operation changes ("*" for clear). */
function idsOf(op: OfflineOperation): string[] {
  const data = op.data as { id?: string; ids?: string[]; items?: Array<[string, unknown]> };
  switch (op.type) {
    case "set":
    case "delete":
      return data.id === undefined ? [] : [data.id];
    case "setBatch":
      return (data.items ?? []).map(([id]) => id);
    case "deleteBatch":
      return data.ids ?? [];
    case "clear":
      return ["*"];
  }
}

const defaultKeyOf = (item: unknown): string | undefined => {
  const id = (item as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
};

/**
 * Hybrid storage combining local cache with remote persistence.
 *
 * @example
 * ```typescript
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" })
 * });
 *
 * const remote = new ApiStorage(client, { collection: "users" });
 * const hybrid = new HybridStorage(remote, {
 *   writeStrategy: "write-through",
 *   conflictResolution: "remote",
 *   syncInterval: 5000
 * });
 *
 * // Fast local reads
 * const user = await hybrid.get("123"); // From cache, or from the remote on a miss
 *
 * // Writes go to both local and remote
 * await hybrid.set("123", { name: "John" });
 * ```
 */
export class HybridStorage<T> implements CollectionStorage<T> {
  private local: InMemoryStorage<T>;
  private remote: CollectionStorage<T>;
  private options: {
    writeStrategy: WriteStrategy;
    conflictResolution: ConflictResolution;
    mergeFn?: <T>(local: T, remote: T) => T;
    keyOf: (item: T) => string | undefined;
    syncInterval: number;
    syncOnInit: boolean;
    maxOfflineOps: number;
    offlineQueue: boolean;
  };
  private offlineOps: OfflineOperation[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  /** A counter of local writes for each id, so a sync does not restore an older remote value */
  private readonly writeVersions = new Map<string, number>();
  private clearVersion = 0;
  /** The running sync: syncs run one at a time */
  private syncChain: Promise<unknown> = Promise.resolve();
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    syncCount: 0,
    conflicts: 0,
  };

  constructor(
    remote: CollectionStorage<T>,
    options: HybridStorageOptions = {}
  ) {
    this.local = new InMemoryStorage<T>();
    this.remote = remote;
    this.options = {
      writeStrategy: options.writeStrategy ?? "write-through",
      conflictResolution: options.conflictResolution ?? "remote",
      ...(options.mergeFn !== undefined && { mergeFn: options.mergeFn }),
      keyOf: options.keyOf ?? defaultKeyOf,
      syncInterval: options.syncInterval ?? 5000,
      syncOnInit: options.syncOnInit ?? true,
      maxOfflineOps: options.maxOfflineOps ?? 1000,
      offlineQueue: options.offlineQueue ?? true,
    };

    // Initialize with remote data
    if (this.options.syncOnInit) {
      this.syncFromRemote().catch((err) => {
        console.error("Failed to sync on init:", err);
      });
    }

    // Start periodic sync for write-back mode
    if (
      this.options.writeStrategy === "write-back" &&
      this.options.syncInterval > 0
    ) {
      this.startPeriodicSync();
    }
  }

  //
  // ═══ Read Operations ═══
  //

  /**
   * The local item, or else the remote item (which the cache then keeps). When the remote
   * cannot answer, the storage is offline and the result is undefined.
   */
  async get(id: string): Promise<T | undefined> {
    // Try local cache first
    const cached = await this.local.get(id);
    if (cached !== undefined) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;
    // A pending local delete means "no item": do not read it back from the remote
    if (this.hasPendingOp(id)) {
      return undefined;
    }
    const version = this.versionOf(id);
    try {
      const remote = await this.remote.get(id);
      this.isOnline = true;
      if (remote !== undefined && this.versionOf(id) === version) {
        await this.local.set(id, remote);
      }
      return remote;
    } catch {
      this.isOnline = false;
      return undefined;
    }
  }

  async getAll(): Promise<T[]> {
    // Return local cache
    return this.local.getAll();
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    // Search local cache
    return this.local.find(predicate);
  }

  async has(id: string): Promise<boolean> {
    return this.local.has(id);
  }

  async size(): Promise<number> {
    return this.local.size();
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    this.bump(id);
    // Always write to local immediately
    await this.local.set(id, value);

    if (this.options.writeStrategy === "write-through") {
      // Write-through: sync to remote immediately
      try {
        await this.remote.set(id, value);
      } catch (error) {
        this.handleRemoteFailure("set", { id, value });
        throw error;
      }
    } else {
      // Write-back: queue for later sync
      this.queueOperation({
        type: "set",
        data: { id, value },
        timestamp: Date.now(),
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    this.bump(id);
    const existed = await this.local.delete(id);

    if (this.options.writeStrategy === "write-through") {
      try {
        await this.remote.delete(id);
      } catch (error) {
        this.handleRemoteFailure("delete", { id });
        throw error;
      }
    } else {
      this.queueOperation({
        type: "delete",
        data: { id },
        timestamp: Date.now(),
      });
    }

    return existed;
  }

  async clear(): Promise<void> {
    this.clearVersion++;
    await this.local.clear();

    if (this.options.writeStrategy === "write-through") {
      try {
        await this.remote.clear();
      } catch (error) {
        this.handleRemoteFailure("clear", {});
        throw error;
      }
    } else {
      this.queueOperation({
        type: "clear",
        data: {},
        timestamp: Date.now(),
      });
    }
  }

  //
  // ═══ Bulk Operations ═══
  //

  async setBatch(items: Array<[string, T]>): Promise<void> {
    for (const [id] of items) this.bump(id);
    await this.local.setBatch(items);

    if (this.options.writeStrategy === "write-through") {
      try {
        await this.remote.setBatch(items);
      } catch (error) {
        this.handleRemoteFailure("setBatch", { items });
        throw error;
      }
    } else {
      this.queueOperation({
        type: "setBatch",
        data: { items },
        timestamp: Date.now(),
      });
    }
  }

  async deleteBatch(ids: string[]): Promise<number> {
    for (const id of ids) this.bump(id);
    const deleted = await this.local.deleteBatch(ids);

    if (this.options.writeStrategy === "write-through") {
      try {
        await this.remote.deleteBatch(ids);
      } catch (error) {
        this.handleRemoteFailure("deleteBatch", { ids });
        throw error;
      }
    } else {
      this.queueOperation({
        type: "deleteBatch",
        data: { ids },
        timestamp: Date.now(),
      });
    }

    return deleted;
  }

  getBatch(ids: string[]): Promise<Map<string, T>> {
    return this.local.getBatch(ids);
  }

  //
  // ═══ Sync Operations ═══
  //

  /**
   * Sync all data from remote to local.
   * Handles conflicts according to conflict resolution strategy.
   *
   * - Each remote item goes into the cache under `keyOf(item)`.
   * - A local item that the remote does not have is removed, unless a queued local operation
   *   changes it (the remote deleted it).
   * - An id that a local write changed during the sync keeps the local value: the remote value
   *   is older.
   * - Syncs run one at a time.
   */
  syncFromRemote(): Promise<void> {
    return this.serialize(() => this.pullRemote());
  }

  /**
   * Sync all pending offline operations to remote.
   * Processes queued operations in order. When one fails, it and the later operations stay in
   * the queue: the operations that reached the remote are not sent again.
   */
  syncToRemote(): Promise<void> {
    return this.serialize(() => this.pushQueue());
  }

  /**
   * Force a full sync (both directions).
   */
  async sync(): Promise<void> {
    await this.syncToRemote();
    await this.syncFromRemote();
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  async close(): Promise<void> {
    // Stop periodic sync
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Sync pending operations before closing
    if (this.offlineOps.length > 0) {
      try {
        await this.syncToRemote();
      } catch (error) {
        console.error("Failed to sync before close:", error);
      }
    }

    // Close remote storage (an ApiStorage leaves the caller's client open)
    await this.remote.close();
  }

  async getMetadata(): Promise<StorageMetadata> {
    const totalOps = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = totalOps > 0 ? (this.stats.cacheHits / totalOps) * 100 : 0;
    const currentSize = await this.local.size();

    return {
      type: "hybrid",
      size: currentSize,
      stats: {
        hitRate: Math.round(hitRate * 100) / 100,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        syncCount: this.stats.syncCount,
        conflicts: this.stats.conflicts,
        pendingOps: this.offlineOps.length,
        isOnline: this.isOnline,
        writeStrategy: this.options.writeStrategy,
        conflictResolution: this.options.conflictResolution,
      },
    };
  }

  //
  // ═══ Internal Helpers ═══
  //

  private async pullRemote(): Promise<void> {
    const versions = new Map(this.writeVersions);
    const clearVersion = this.clearVersion;
    // True when a local write changed the id after the sync started
    const changedLocally = (id: string): boolean =>
      this.clearVersion !== clearVersion || (this.writeVersions.get(id) ?? 0) !== (versions.get(id) ?? 0);

    let remoteData: T[];
    try {
      remoteData = await this.remote.getAll();
    } catch (error) {
      this.isOnline = false;
      throw error;
    }

    const remoteIds = new Set<string>();
    for (const item of remoteData) {
      const id = this.options.keyOf(item);
      if (!id) {
        console.warn("Item has no key, skipping:", item);
        continue;
      }
      remoteIds.add(id);
      if (changedLocally(id) || this.hasPendingOp(id)) {
        continue;
      }

      const localItem = await this.local.get(id);
      if (localItem === undefined) {
        // No local version - just store remote
        await this.local.set(id, item);
      } else if (JSON.stringify(localItem) !== JSON.stringify(item)) {
        // Conflict - resolve according to strategy
        const resolved = this.resolveConflict(localItem, item);
        await this.local.set(id, resolved);
        this.stats.conflicts++;
      }
    }

    // The remote deleted these items
    for (const id of await this.localIds()) {
      if (!remoteIds.has(id) && !changedLocally(id) && !this.hasPendingOp(id)) {
        await this.local.delete(id);
      }
    }

    this.stats.syncCount++;
    this.isOnline = true;
  }

  private async pushQueue(): Promise<void> {
    while (this.offlineOps.length > 0) {
      const op = this.offlineOps[0]!;
      try {
        await this.executeOperation(op);
      } catch (error) {
        // This operation and the later ones stay queued
        this.isOnline = false;
        throw error;
      }
      // Remove the operation only after it reached the remote
      if (this.offlineOps[0] === op) {
        this.offlineOps.shift();
      }
    }
    this.isOnline = true;
  }

  /** Run syncs one at a time. */
  private serialize(run: () => Promise<void>): Promise<void> {
    const next = this.syncChain.then(run, run);
    this.syncChain = next.catch(() => undefined);
    return next;
  }

  private async localIds(): Promise<string[]> {
    return [...this.local.keys()];
  }

  private bump(id: string): void {
    this.writeVersions.set(id, (this.writeVersions.get(id) ?? 0) + 1);
  }

  private versionOf(id: string): string {
    return `${this.clearVersion}:${this.writeVersions.get(id) ?? 0}`;
  }

  private hasPendingOp(id: string): boolean {
    return this.offlineOps.some((op) => {
      const ids = idsOf(op);
      return ids.includes(id) || ids.includes("*");
    });
  }

  /**
   * Resolve conflict between local and remote versions.
   */
  private resolveConflict(local: T, remote: T): T {
    switch (this.options.conflictResolution) {
      case "local":
        return local;

      case "remote":
        return remote;

      case "merge":
        if (!this.options.mergeFn) {
          throw new Error(
            "Merge function required for conflict resolution strategy 'merge'"
          );
        }
        return this.options.mergeFn(local, remote);

      case "error":
        throw new Error(
          `Conflict detected between local and remote versions`
        );

      default:
        return remote;
    }
  }

  /**
   * Queue operation for later sync.
   */
  private queueOperation(op: OfflineOperation): void {
    if (!this.options.offlineQueue) {
      return;
    }

    this.offlineOps.push(op);

    // Enforce max queue size
    if (this.offlineOps.length > this.options.maxOfflineOps) {
      this.offlineOps.shift(); // Remove oldest
    }
  }

  /**
   * Execute a queued operation against remote storage.
   */
  private async executeOperation(op: OfflineOperation): Promise<void> {
    const data = op.data as any;

    switch (op.type) {
      case "set":
        await this.remote.set(data.id, data.value);
        break;

      case "delete":
        await this.remote.delete(data.id);
        break;

      case "setBatch":
        await this.remote.setBatch(data.items);
        break;

      case "deleteBatch":
        await this.remote.deleteBatch(data.ids);
        break;

      case "clear":
        await this.remote.clear();
        break;
    }
  }

  /**
   * Handle remote operation failure.
   */
  private handleRemoteFailure(operation: OfflineOperation["type"], data: unknown): void {
    console.error(`Remote ${operation} failed, marking offline`);
    this.isOnline = false;

    // Queue operation if offline queue enabled
    if (this.options.offlineQueue) {
      this.queueOperation({
        type: operation,
        data,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Start periodic background sync.
   */
  private startPeriodicSync(): void {
    this.syncTimer = setInterval(() => {
      this.syncToRemote().catch((err) => {
        console.error("Periodic sync failed:", err);
      });
    }, this.options.syncInterval);
    // The timer must not keep the process alive (deep dive DATA-9)
    (this.syncTimer as { unref?: () => void }).unref?.();
  }

  /**
   * Get current online status.
   */
  isRemoteOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get pending offline operations count.
   */
  getPendingOpsCount(): number {
    return this.offlineOps.length;
  }
}
