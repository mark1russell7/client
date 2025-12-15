/**
 * Hybrid Storage Implementation
 *
 * Combines local cache (InMemoryStorage) with remote persistence (ApiStorage).
 * Provides fast local reads with remote backup and sync.
 *
 * Features:
 * - Local cache for fast reads
 * - Write-through or write-back strategies
 * - Automatic sync on initialization
 * - Conflict resolution
 * - Offline operation queue
 */

import type { CollectionStorage, StorageMetadata } from "./interface.js";
import { InMemoryStorage } from "./memory.js";
import type { ApiStorage } from "./api.js";

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

/**
 * Hybrid storage combining local cache with remote persistence.
 *
 * @example
 * ```typescript
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" })
 * });
 *
 * const remote = new ApiStorage(client, { service: "users" });
 * const hybrid = new HybridStorage(remote, {
 *   writeStrategy: "write-through",
 *   conflictResolution: "remote",
 *   syncInterval: 5000
 * });
 *
 * // Fast local reads
 * const user = hybrid.get("123"); // From cache
 *
 * // Writes go to both local and remote
 * await hybrid.set("123", { name: "John" });
 * ```
 */
export class HybridStorage<T> implements CollectionStorage<T> {
  private local: InMemoryStorage<T>;
  private remote: ApiStorage<T>;
  private options: {
    writeStrategy: WriteStrategy;
    conflictResolution: ConflictResolution;
    mergeFn?: <T>(local: T, remote: T) => T;
    syncInterval: number;
    syncOnInit: boolean;
    maxOfflineOps: number;
    offlineQueue: boolean;
  };
  private offlineOps: OfflineOperation[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    syncCount: 0,
    conflicts: 0,
  };

  constructor(
    remote: ApiStorage<T>,
    options: HybridStorageOptions = {}
  ) {
    this.local = new InMemoryStorage<T>();
    this.remote = remote;
    this.options = {
      writeStrategy: options.writeStrategy ?? "write-through",
      conflictResolution: options.conflictResolution ?? "remote",
      ...(options.mergeFn !== undefined && { mergeFn: options.mergeFn }),
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

  async get(id: string): Promise<T | undefined> {
    // Try local cache first
    const cached = await this.local.get(id);
    if (cached !== undefined) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;
    return undefined;
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
   */
  async syncFromRemote(): Promise<void> {
    try {
      const remoteData = await this.remote.getAll();

      for (const item of remoteData) {
        // Assume items have an 'id' field for indexing
        const id = (item as any).id as string;
        if (!id) {
          console.warn("Item missing id field, skipping:", item);
          continue;
        }

        const localItem = await this.local.get(id);

        if (localItem === undefined) {
          // No local version - just store remote
          await this.local.set(id, item);
        } else {
          // Conflict - resolve according to strategy
          const resolved = this.resolveConflict(localItem, item);
          await this.local.set(id, resolved);
          this.stats.conflicts++;
        }
      }

      this.stats.syncCount++;
      this.isOnline = true;
    } catch (error) {
      this.isOnline = false;
      throw error;
    }
  }

  /**
   * Sync all pending offline operations to remote.
   * Processes queued operations in order.
   */
  async syncToRemote(): Promise<void> {
    if (this.offlineOps.length === 0) {
      return;
    }

    const opsToSync = [...this.offlineOps];
    this.offlineOps = [];

    try {
      for (const op of opsToSync) {
        await this.executeOperation(op);
      }
      this.isOnline = true;
    } catch (error) {
      // Re-queue failed operations
      this.offlineOps = [...opsToSync, ...this.offlineOps];
      this.isOnline = false;
      throw error;
    }
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

    // Close remote storage
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
  private handleRemoteFailure(operation: string, data: unknown): void {
    console.error(`Remote ${operation} failed, marking offline`);
    this.isOnline = false;

    // Queue operation if offline queue enabled
    if (this.options.offlineQueue) {
      this.queueOperation({
        type: operation as any,
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
