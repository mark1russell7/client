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

import type { CollectionStorage, StorageMetadata } from "@procedures/collections";
import { InMemoryStorage } from "@procedures/collections";

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
   * In write-through mode, a write that the remote cannot take stays in the local cache and the
   * queue, and the write throws `PendingWriteError`. A timer sends the queue later.
   * Without the queue, the write is undone in the local cache and the write throws.
   * @default true
   */
  offlineQueue?: boolean;

  /**
   * True when an error of the remote means "not available now", so the write can wait in the
   * queue. Another error (a refusal of the remote) undoes the write. The default: an error with
   * `retryable: true`, or an error without a `code`.
   */
  isUnavailable?: (error: unknown) => boolean;
}

/**
 * The remote did not take a write of the write-through mode. The write is in the local cache and
 * in the queue, and the storage sends it later (roadmap R2). `cause` is the error of the remote.
 */
export class PendingWriteError extends Error {
  override readonly name = "PendingWriteError";
  readonly code = "WRITE_PENDING";
  readonly pending = true;
  constructor(operation: string, cause: unknown) {
    super(`The remote did not take the ${operation}: it waits in the queue`, { cause });
  }
}

/** The queue of operations is full, so the storage refuses the write (roadmap R2). */
export class QueueFullError extends Error {
  override readonly name = "QueueFullError";
  readonly code = "QUEUE_FULL";
  constructor(max: number) {
    super(`The queue of operations is full (${max} operations): the storage refuses the write`);
  }
}

/** The remote gave items without a key, so a sync cannot know which local items to keep. */
export class MissingKeysError extends Error {
  override readonly name = "MissingKeysError";
  readonly code = "MISSING_KEYS";
  constructor(count: number) {
    super(`${count} remote items have no key. Give the option keyOf, or a remote storage with getEntries(). The sync changed nothing.`);
  }
}

const defaultIsUnavailable = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return true;
  const { retryable, code } = error as { retryable?: unknown; code?: unknown };
  return retryable === true || code === undefined;
};

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
    isUnavailable: (error: unknown) => boolean;
  };
  private offlineOps: OfflineOperation[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  /** True while pushQueue sends the queue: the first operation can be on its way */
  private pushing = false;
  /** The timer that sends the queue of the write-through mode after a failure */
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  /** The first sync. The reads wait for it, so a read never sees an empty cache by mistake. */
  private readonly ready: Promise<void>;
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
      isUnavailable: options.isUnavailable ?? defaultIsUnavailable,
    };

    // Initialize with remote data. The reads wait for this sync (roadmap R2).
    this.ready = this.options.syncOnInit
      ? this.syncFromRemote().catch((err) => {
          console.error("Failed to sync on init:", err);
        })
      : Promise.resolve();

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
    await this.ready;
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
    await this.ready;
    // Return local cache
    return this.local.getAll();
  }

  /** Every local item with its id. */
  async getEntries(): Promise<Array<[string, T]>> {
    await this.ready;
    return this.local.getEntries();
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    await this.ready;
    // Search local cache
    return this.local.find(predicate);
  }

  async has(id: string): Promise<boolean> {
    await this.ready;
    return this.local.has(id);
  }

  async size(): Promise<number> {
    await this.ready;
    return this.local.size();
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    await this.write("set", { id, value }, [id], async () => {
      this.bump(id);
      await this.local.set(id, value);
    }, () => this.remote.set(id, value));
  }

  async delete(id: string): Promise<boolean> {
    let existed = false;
    await this.write("delete", { id }, [id], async () => {
      this.bump(id);
      existed = await this.local.delete(id);
    }, async () => {
      await this.remote.delete(id);
    });
    return existed;
  }

  async clear(): Promise<void> {
    await this.write("clear", {}, "*", async () => {
      this.clearVersion++;
      await this.local.clear();
    }, () => this.remote.clear());
  }

  //
  // ═══ Bulk Operations ═══
  //

  async setBatch(items: Array<[string, T]>): Promise<void> {
    await this.write("setBatch", { items }, items.map(([id]) => id), async () => {
      for (const [id] of items) this.bump(id);
      await this.local.setBatch(items);
    }, () => this.remote.setBatch(items));
  }

  async deleteBatch(ids: string[]): Promise<number> {
    let deleted = 0;
    await this.write("deleteBatch", { ids }, ids, async () => {
      for (const id of ids) this.bump(id);
      deleted = await this.local.deleteBatch(ids);
    }, async () => {
      await this.remote.deleteBatch(ids);
    });
    return deleted;
  }

  /**
   * One write: the local cache, then the remote (write-through) or the queue (write-back).
   *
   * - Write-back: a full queue refuses the write before the local change.
   * - Write-through, the remote refuses the write: the local change is undone, and the error
   *   of the remote passes through.
   * - Write-through, the remote is not available: with the queue, the write waits in it, a timer
   *   sends it later, and the write throws `PendingWriteError`. Without the queue, or with a full
   *   queue, the local change is undone.
   *
   * Before, a failed write-through stayed in the local cache and in the queue, no timer sent the
   * queue, a second try queued the operation again, and a full queue dropped the oldest operation
   * without a word (roadmap R2).
   */
  private async write(
    type: OfflineOperation["type"],
    data: unknown,
    ids: string[] | "*",
    applyLocal: () => Promise<void>,
    applyRemote: () => Promise<void>,
  ): Promise<void> {
    const op: OfflineOperation = { type, data, timestamp: Date.now() };
    if (this.options.writeStrategy === "write-back") {
      if (this.options.offlineQueue) this.ensureQueueRoom(op);
      await applyLocal();
      this.queueOperation(op);
      return;
    }

    const undo = await this.snapshot(ids);
    await applyLocal();
    try {
      if (this.offlineOps.length > 0) {
        // The queued operations are older: they reach the remote first, or the older value of a
        // queued write replaces this one later. A failed send keeps this write behind them.
        await this.serialize(async () => {
          await this.pushQueue();
          await applyRemote();
        });
      } else {
        await applyRemote();
      }
    } catch (error) {
      if (this.options.offlineQueue && this.options.isUnavailable(error) && this.hasQueueRoom(op)) {
        this.isOnline = false;
        console.error(`Remote ${type} failed: the operation waits in the queue`);
        this.queueOperation(op);
        this.scheduleDrain();
        throw new PendingWriteError(type, error);
      }
      await undo();
      throw error;
    }
  }

  /**
   * The local values of the ids before a write, and a function that puts them back. It puts back
   * only the ids that no later write changed.
   */
  private async snapshot(ids: string[] | "*"): Promise<() => Promise<void>> {
    const before = ids === "*" ? new Map(await this.local.getEntries()) : await this.local.getBatch(ids);
    const touched = ids === "*" ? [...before.keys()] : ids;
    // The versions after the write: this write adds one to each id (clear adds to clearVersion)
    const versions = new Map(touched.map((id) => [id, (this.writeVersions.get(id) ?? 0) + (ids === "*" ? 0 : 1)]));
    const clearVersion = this.clearVersion + (ids === "*" ? 1 : 0);
    return async () => {
      if (this.clearVersion !== clearVersion) return;
      for (const id of touched) {
        if ((this.writeVersions.get(id) ?? 0) !== versions.get(id)) continue;
        const value = before.get(id);
        if (value === undefined) await this.local.delete(id);
        else await this.local.set(id, value);
      }
    };
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    await this.ready;
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
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
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

    let remoteEntries: Array<[string, T]>;
    try {
      remoteEntries = await this.remoteEntries();
    } catch (error) {
      if (!(error instanceof MissingKeysError)) this.isOnline = false;
      throw error;
    }

    const remoteIds = new Set<string>();
    for (const [id, item] of remoteEntries) {
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

  /**
   * The remote items with their ids: from `getEntries()` when the remote has it, or else from
   * `getAll()` and `keyOf`. An item without a key stops the sync before any change. Before, the
   * sync skipped such items and then deleted each local item that the remote list did not have,
   * so the remote list without ids emptied the cache (roadmap R2).
   */
  private async remoteEntries(): Promise<Array<[string, T]>> {
    if (this.remote.getEntries) return this.remote.getEntries();
    const items = await this.remote.getAll();
    const entries: Array<[string, T]> = [];
    let missing = 0;
    for (const item of items) {
      const id = this.options.keyOf(item);
      if (id) entries.push([id, item]);
      else missing++;
    }
    if (missing > 0) throw new MissingKeysError(missing);
    return entries;
  }

  private async pushQueue(): Promise<void> {
    this.pushing = true;
    try {
      await this.sendQueue();
    } finally {
      this.pushing = false;
    }
  }

  private async sendQueue(): Promise<void> {
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
    // A set or a delete of one id replaces the queued set or delete of that id, when no later
    // operation touches the id: a second try of a write does not queue it two times
    const replaced = this.replaceableIndex(op);
    if (replaced >= 0) {
      this.offlineOps[replaced] = op;
      return;
    }
    this.ensureQueueRoom(op);
    this.offlineOps.push(op);
  }

  /** The index of the queued operation that `op` replaces, or -1. */
  private replaceableIndex(op: OfflineOperation): number {
    if (op.type !== "set" && op.type !== "delete") return -1;
    const [id] = idsOf(op);
    if (id === undefined) return -1;
    for (let index = this.offlineOps.length - 1; index >= 0; index--) {
      const queued = this.offlineOps[index]!;
      const ids = idsOf(queued);
      if (!ids.includes(id) && !ids.includes("*")) continue;
      // pushQueue can be sending the first operation now: do not change it
      const sending = index === 0 && this.pushing;
      return !sending && (queued.type === "set" || queued.type === "delete") ? index : -1;
    }
    return -1;
  }

  /** True when the queue can take the operation. */
  private hasQueueRoom(op: OfflineOperation): boolean {
    return this.replaceableIndex(op) >= 0 || this.offlineOps.length < this.options.maxOfflineOps;
  }

  /** A full queue refuses the write. Before, it dropped the oldest operation (roadmap R2). */
  private ensureQueueRoom(op: OfflineOperation): void {
    if (!this.hasQueueRoom(op)) throw new QueueFullError(this.options.maxOfflineOps);
  }

  /**
   * In write-through mode, a timer sends the queue after a failure, and again after each failed
   * send, until the queue is empty.
   */
  private scheduleDrain(): void {
    if (this.drainTimer || this.options.writeStrategy !== "write-through") return;
    const delay = this.options.syncInterval > 0 ? this.options.syncInterval : 5000;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.syncToRemote().catch(() => this.scheduleDrain());
    }, delay);
    (this.drainTimer as { unref?: () => void }).unref?.();
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
