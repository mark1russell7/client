/**
 * Hybrid Storage Implementation
 *
 * A local copy (an `InMemoryStorage`, or the `local` storage that the application gives) in
 * front of a remote `CollectionStorage` (often an `ApiStorage`). The storage has four modes, and
 * `setMode()` changes the mode while the storage operates (roadmap R28):
 *
 * | Mode | Reads | Writes | Remote calls |
 * |---|---|---|---|
 * | `local-only` | the local copy | the local copy and the queue | none |
 * | `write-through` | the local copy, the remote on a miss | the local copy, then the remote | yes |
 * | `write-back` | the local copy, the remote on a miss | the local copy and the queue, a timer sends it | yes |
 * | `remote-only` | the remote | the remote | yes, and no local copy |
 *
 * - The queue is durable through the `queueStore` that the application gives.
 * - A sync asks for the changes since a version when the remote has `getChangesSince`.
 * - With `versionOf`, a conflict is a change on both sides, and `conflictResolution` decides.
 * - `pullInterval` keeps the local copy fresh.
 */

import type { CollectionStorage, StorageChanges, StorageMetadata } from "@procedures/collections";
import { InMemoryStorage } from "@procedures/collections";
import { optionalMs, type Duration } from "@procedures/client";
import { MemoryQueueStore, idsOf, withoutId, type QueuedOperation, type QueueStore } from "./queue.js";

/**
 * Conflict resolution strategy.
 */
export type ConflictResolution = "local" | "remote" | "merge" | "error";

/**
 * Write strategy for hybrid storage.
 * @deprecated Use `HybridMode`: the strategies are two of its modes.
 */
export type WriteStrategy = "write-through" | "write-back";

/**
 * The mode of a `HybridStorage` (roadmap R28).
 *
 * - `local-only`: the storage makes no remote call. Each write goes to the local copy and to the
 *   queue, so a later switch to a remote mode sends it.
 * - `write-through`: each write goes to the local copy, then to the remote.
 * - `write-back`: each write goes to the local copy and to the queue. A timer sends the queue.
 * - `remote-only`: each read and each write goes to the remote. The storage keeps no local copy.
 */
export type HybridMode = "local-only" | "write-through" | "write-back" | "remote-only";

const MODES: ReadonlySet<string> = new Set<HybridMode>(["local-only", "write-through", "write-back", "remote-only"]);

/**
 * Hybrid storage configuration options.
 */
export interface HybridStorageOptions {
  /**
   * The first mode. `setMode()` changes it later.
   * @default "write-through"
   */
  mode?: HybridMode;

  /**
   * The first mode, with its old name. `mode` comes first when both are given.
   * @deprecated Use `mode`.
   */
  writeStrategy?: WriteStrategy;

  /**
   * Conflict resolution strategy
   * - local: Local changes win
   * - remote: Remote changes win
   * - merge: Custom merge function (requires mergeFn)
   * - error: The sync throws `ConflictError` with the ids, and changes nothing for them
   *
   * With `versionOf`, a conflict is a queued local write of an id whose remote version changed
   * after the last version that the storage saw. A queued write of an id without a known remote
   * version wins. Without `versionOf`, a conflict is a local value that differs from the remote
   * value, with no queued write: a queued write always wins.
   * @default "remote"
   */
  conflictResolution?: ConflictResolution;

  /**
   * Custom merge function for conflict resolution.
   * Only used when conflictResolution is "merge". A conflict where one side deleted the item
   * keeps the local side.
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
   * The version of an item, for example its ETag or a revision field (roadmap R28). The sync
   * compares the versions, not the JSON of the values. A remote change of an id with a queued
   * local write is a conflict.
   */
  versionOf?: (item: any) => string | undefined;

  /**
   * Automatic sync interval (for write-back mode), for example `seconds(5)`.
   * Set to 0 to disable automatic sync. In write-through mode, it is also the delay before the
   * storage sends the queue after a failure (5 seconds when it is 0).
   * @default 5 seconds
   */
  syncInterval?: Duration;

  /**
   * The interval of the periodic pull, for example `minutes(1)` (roadmap R28). A pull reads the
   * remote changes into the local copy in the modes `write-through` and `write-back`.
   * @default no periodic pull
   */
  pullInterval?: Duration;

  /**
   * Initialize by syncing from remote on construction: send the loaded queue, then read the
   * remote. The mode `local-only` makes no remote call.
   * @default true
   */
  syncOnInit?: boolean;

  /**
   * Maximum offline operations to queue. A full queue refuses the next write.
   * @default 1000
   */
  maxOfflineOps?: number;

  /**
   * The queue of the write-through mode.
   * In write-through mode, a write that the remote cannot take stays in the local cache and the
   * queue, and the write throws `PendingWriteError`. A timer sends the queue later.
   * Without the queue, the write is undone in the local cache and the write throws.
   * The modes `write-back` and `local-only` always use the queue.
   * @default true
   */
  offlineQueue?: boolean;

  /**
   * The store that keeps the queue (roadmap R28). A new storage with the same store loads the
   * queue again and sends it. `FileQueueStore` of `@procedures/store/file-queue` keeps it in a
   * file.
   * @default a new `MemoryQueueStore`
   */
  queueStore?: QueueStore;

  /**
   * True when an error of the remote means "not available now", so the write can wait in the
   * queue. Another error (a refusal of the remote) undoes the write. The default: an error with
   * `retryable: true`, or an error without a `code`.
   */
  isUnavailable?: (error: unknown) => boolean;

  /**
   * The storage of the local copy (roadmap R45). A durable storage, for example `SqliteStorage`
   * of `@procedures/sqlite`, keeps the local copy after a restart. Then a new storage in
   * `local-only` mode reads the items of the last run. Give it with a durable `queueStore`.
   * `close()` closes it.
   * @default a new `InMemoryStorage`
   */
  local?: LocalCopyStorage<any>;
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

/**
 * The queue store failed (roadmap R28). A write that the store did not keep is undone and not
 * acknowledged. A storage whose store cannot load refuses each operation.
 */
export class QueueStoreError extends Error {
  override readonly name = "QueueStoreError";
  readonly code = "QUEUE_STORE";
  constructor(action: "load" | "write", cause: unknown) {
    super(`The queue store could not ${action === "load" ? "load the queue" : "keep the queue"}`, { cause });
  }
}

/**
 * The sync found conflicts and `conflictResolution` is "error" (roadmap R28). The local values and
 * their queued writes stay. `ids` are the ids of the conflicts.
 */
export class ConflictError extends Error {
  override readonly name = "ConflictError";
  readonly code = "SYNC_CONFLICT";
  constructor(readonly ids: string[]) {
    super(`Conflict detected between local and remote versions of ${ids.length} items: ${ids.slice(0, 10).join(", ")}`);
  }
}

/**
 * `setMode()` could not change the mode (roadmap R28). The mode did not change. `cause` is the
 * error of the flush or of the sync.
 */
export class ModeSwitchError extends Error {
  override readonly name = "ModeSwitchError";
  readonly code = "MODE_SWITCH_FAILED";
  constructor(readonly from: HybridMode, readonly to: HybridMode, cause: unknown) {
    super(`The storage could not change from ${from} to ${to}: the mode is still ${from}`, { cause });
  }
}

const defaultIsUnavailable = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return true;
  const { retryable, code } = error as { retryable?: unknown; code?: unknown };
  return retryable === true || code === undefined;
};

/** True when a remote does not know a procedure: an older server without `changes`. */
const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "NOT_FOUND";

const defaultKeyOf = (item: unknown): string | undefined => {
  const id = (item as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
};

function checkMode(mode: unknown): HybridMode {
  if (typeof mode !== "string" || !MODES.has(mode)) {
    throw new TypeError(`Unknown mode ${JSON.stringify(mode)}: use local-only, write-through, write-back or remote-only`);
  }
  return mode as HybridMode;
}

/** The changes that a pull applies: from `getChangesSince`, or all entries. */
type PulledChanges<T> = Omit<StorageChanges<T>, "version"> & { version?: string };

/**
 * A storage for the local copy of a `HybridStorage` (roadmap R45): a collection storage that gives
 * its entries. A durable one, for example `SqliteStorage` of `@procedures/sqlite`, keeps the local
 * copy after a restart.
 */
export type LocalCopyStorage<T> = CollectionStorage<T> & { getEntries(): Promise<Array<[string, T]>> };

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
 *   mode: "write-through",
 *   conflictResolution: "remote",
 *   syncInterval: seconds(5)
 * });
 *
 * // Fast local reads
 * const user = await hybrid.get("123"); // From cache, or from the remote on a miss
 *
 * // Writes go to both local and remote
 * await hybrid.set("123", { name: "John" });
 *
 * // Offline: no remote call. The writes wait in the queue.
 * await hybrid.setMode("local-only");
 * // Online again: the switch sends the queue, then syncs the local copy
 * await hybrid.setMode("write-through");
 * ```
 */
export class HybridStorage<T> implements CollectionStorage<T> {
  private readonly local: LocalCopyStorage<T>;
  private readonly remote: CollectionStorage<T>;
  private readonly queueStore: QueueStore;
  private options: {
    conflictResolution: ConflictResolution;
    mergeFn?: <T>(local: T, remote: T) => T;
    keyOf: (item: T) => string | undefined;
    versionOf?: (item: T) => string | undefined;
    syncInterval: number;
    pullInterval: number;
    syncOnInit: boolean;
    maxOfflineOps: number;
    offlineQueue: boolean;
    isUnavailable: (error: unknown) => boolean;
  };
  private mode: HybridMode;
  private offlineOps: QueuedOperation[] = [];
  /** The operations in `offlineOps` that the queue store does not have yet */
  private readonly unpersisted = new Set<QueuedOperation>();
  /** True when the queue store can differ from `offlineOps`: a failed write, or sent operations */
  private storeDirty = false;
  /** The calls of the queue store, one at a time */
  private storeChain: Promise<unknown> = Promise.resolve();
  /** The push timer of the write-back mode */
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  /** The periodic pull */
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  /** True while pushQueue sends the queue: the first operation can be on its way */
  private pushing = false;
  /** The timer that sends the queue of the write-through mode after a failure */
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  /** The load of the queue. The writes wait for it. */
  private readonly loaded: Promise<void>;
  /** The load and the first sync. The reads wait for it, so a read never sees an empty cache by mistake. */
  private readonly ready: Promise<void>;
  /** The error of the load (of the queue store, or of the local copy): the storage refuses each operation */
  private loadError: Error | undefined;
  /** A mode switch that runs. The operations wait for it. */
  private gate: Promise<void> = Promise.resolve();
  /** The operations that run, and the switches that wait for them to end */
  private active = 0;
  private idleWaiters: Array<() => void> = [];
  private isOnline = true;
  private closed = false;
  /** A counter of local writes for each id, so a sync does not restore an older remote value */
  private readonly writeVersions = new Map<string, number>();
  private clearVersion = 0;
  /** The running sync: syncs run one at a time */
  private syncChain: Promise<unknown> = Promise.resolve();
  /** The remote version of the last delta pull */
  private cursor: string | undefined;
  /** True when the remote has `getChangesSince` but its server does not know `changes` */
  private changesUnsupported = false;
  /** With `versionOf`: the last known remote version of each id. `null`: the remote has no item. */
  private readonly bases = new Map<string, string | null>();
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
    this.local = (options.local as LocalCopyStorage<T> | undefined) ?? new InMemoryStorage<T>();
    this.remote = remote;
    this.queueStore = options.queueStore ?? new MemoryQueueStore();
    this.mode = checkMode(options.mode ?? options.writeStrategy ?? "write-through");
    this.options = {
      conflictResolution: options.conflictResolution ?? "remote",
      ...(options.mergeFn !== undefined && { mergeFn: options.mergeFn }),
      keyOf: options.keyOf ?? defaultKeyOf,
      ...(options.versionOf !== undefined && { versionOf: options.versionOf }),
      syncInterval: optionalMs(options.syncInterval, "syncInterval") ?? 5000,
      pullInterval: optionalMs(options.pullInterval, "pullInterval") ?? 0,
      syncOnInit: options.syncOnInit ?? true,
      maxOfflineOps: options.maxOfflineOps ?? 1000,
      offlineQueue: options.offlineQueue ?? true,
      isUnavailable: options.isUnavailable ?? defaultIsUnavailable,
    };

    // The queue first, then the first sync. The reads wait for both (roadmap R2, R28).
    this.loaded = this.loadQueue();
    this.ready = this.loaded.then(() => this.initialSync());
    this.updateTimers();
  }

  //
  // ═══ Modes ═══
  //

  /** The mode of the storage now. */
  getMode(): HybridMode {
    return this.mode;
  }

  /**
   * This method changes the mode while the storage operates (roadmap R28).
   *
   * - The switch waits for the operations that run. The operations that start later wait for
   *   the switch. Switches and syncs run one at a time.
   * - A switch to a remote mode sends the queue first. A switch to `local-only` makes no remote
   *   call: the queue stays until the next remote mode.
   * - A switch to `remote-only` drops the local copy, after the queue reached the remote.
   * - A switch from `local-only` or `remote-only` to a mode with a local copy syncs the local
   *   copy. The reads wait for the sync.
   * - When the flush or the sync fails, the mode does not change, and the switch throws
   *   `ModeSwitchError`.
   */
  async setMode(mode: HybridMode): Promise<void> {
    const target = checkMode(mode);
    const previous = this.gate;
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => (release = resolve));
    try {
      await previous;
      await this.loaded;
      if (this.loadError) throw this.loadError;
      await this.idle();
      await this.serialize(() => this.switchTo(target));
    } finally {
      release();
    }
  }

  private async switchTo(target: HybridMode): Promise<void> {
    const from = this.mode;
    if (target === from) return;
    try {
      if (target !== "local-only") {
        // The queue reaches the remote before the mode changes
        await this.pushQueue();
        await this.ensureStoreClean();
      }
      if (target === "remote-only") {
        await this.dropLocal();
      } else if (from === "remote-only" || from === "local-only") {
        if (from === "remote-only") await this.rebuildLocal();
        await this.pullRemote(from === "remote-only");
      }
    } catch (error) {
      throw new ModeSwitchError(from, target, error);
    }
    this.mode = target;
    this.updateTimers();
  }

  /** This method drops the local copy. A read in flight does not fill it again. */
  private async dropLocal(): Promise<void> {
    this.clearVersion++;
    this.cursor = undefined;
    await this.local.clear();
  }

  /** This method makes the local copy from the queue only, before a full sync. */
  private async rebuildLocal(): Promise<void> {
    await this.dropLocal();
    for (const op of this.offlineOps) await this.applyToLocal(op);
  }

  /** This method starts and stops the timers for the mode. */
  private updateTimers(): void {
    if (this.closed) return;
    const push = this.mode === "write-back" && this.options.syncInterval > 0;
    if (push && !this.syncTimer) {
      this.syncTimer = setInterval(() => {
        this.syncToRemote().catch((err) => {
          console.error("Periodic sync failed:", err);
        });
      }, this.options.syncInterval);
      // The timer must not keep the process alive (deep dive DATA-9)
      (this.syncTimer as { unref?: () => void }).unref?.();
    } else if (!push && this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    const pull = this.options.pullInterval > 0 && (this.mode === "write-through" || this.mode === "write-back");
    if (pull && !this.pullTimer) {
      this.pullTimer = setInterval(() => {
        this.syncFromRemote().catch((err) => {
          console.error("Periodic pull failed:", err);
        });
      }, this.options.pullInterval);
      (this.pullTimer as { unref?: () => void }).unref?.();
    } else if (!pull && this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }

    if (this.mode !== "write-through" && this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
  }

  //
  // ═══ Read Operations ═══
  //

  /**
   * The local item, or else the remote item (which the cache then keeps). When the remote
   * cannot answer, the storage is offline and the result is undefined. In `local-only` mode, a
   * miss is undefined. In `remote-only` mode, the remote answers, and its error passes through.
   */
  async get(id: string): Promise<T | undefined> {
    return this.run(true, async () => {
      if (this.mode === "remote-only") return this.remoteRead(() => this.remote.get(id));
      // Try local cache first
      const cached = await this.local.get(id);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        return cached;
      }

      this.stats.cacheMisses++;
      // A pending local delete means "no item": do not read it back from the remote
      if (this.mode === "local-only" || this.hasPendingOp(id)) {
        return undefined;
      }
      const version = this.writeKey(id);
      try {
        const remote = await this.remote.get(id);
        this.isOnline = true;
        if (this.writeKey(id) === version && !this.hasPendingOp(id)) {
          if (remote !== undefined) await this.local.set(id, remote);
          this.noteBase(id, remote);
        }
        return remote;
      } catch {
        this.isOnline = false;
        return undefined;
      }
    });
  }

  async getAll(): Promise<T[]> {
    return this.run(true, () => (this.mode === "remote-only" ? this.remoteRead(() => this.remote.getAll()) : this.local.getAll()));
  }

  /** Every item with its id. */
  async getEntries(): Promise<Array<[string, T]>> {
    return this.run(true, () => (this.mode === "remote-only" ? this.remoteRead(() => this.remoteEntries()) : this.local.getEntries()));
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return this.run(true, () =>
      this.mode === "remote-only" ? this.remoteRead(() => this.remote.find(predicate)) : this.local.find(predicate),
    );
  }

  async has(id: string): Promise<boolean> {
    return this.run(true, () => (this.mode === "remote-only" ? this.remoteRead(() => this.remote.has(id)) : this.local.has(id)));
  }

  async size(): Promise<number> {
    return this.run(true, () => (this.mode === "remote-only" ? this.remoteRead(() => this.remote.size()) : this.local.size()));
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    return this.run(true, () =>
      this.mode === "remote-only" ? this.remoteRead(() => this.remote.getBatch(ids)) : this.local.getBatch(ids),
    );
  }

  /** A read of the remote-only mode. A queue that a restart loaded reaches the remote first. */
  private async remoteRead<R>(read: () => Promise<R>): Promise<R> {
    if (this.offlineOps.length > 0) await this.serialize(() => this.pushQueue());
    try {
      const result = await read();
      this.isOnline = true;
      return result;
    } catch (error) {
      if (!(error instanceof MissingKeysError)) this.isOnline = false;
      throw error;
    }
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
    return this.write("delete", { id }, [id], async () => {
      this.bump(id);
      return this.local.delete(id);
    }, () => this.remote.delete(id));
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
    return this.write("deleteBatch", { ids }, ids, async () => {
      for (const id of ids) this.bump(id);
      return this.local.deleteBatch(ids);
    }, () => this.remote.deleteBatch(ids));
  }

  /**
   * One write, in the mode of the storage. The result is the result of the local copy, or of the
   * remote in `remote-only` mode.
   *
   * - `remote-only`: the remote only. Its error passes through.
   * - `write-back` and `local-only`: the local copy and the queue. A full queue refuses the write
   *   before the local change. The queue store keeps the operation before the write ends.
   * - `write-through`, the remote refuses the write: the local change is undone, and the error
   *   of the remote passes through.
   * - `write-through`, the remote is not available: with the queue, the write waits in it, a timer
   *   sends it later, and the write throws `PendingWriteError`. Without the queue, or with a full
   *   queue, the local change is undone.
   *
   * Before, a failed write-through stayed in the local cache and in the queue, no timer sent the
   * queue, a second try queued the operation again, and a full queue dropped the oldest operation
   * without a word (roadmap R2).
   */
  private write<R>(
    type: QueuedOperation["type"],
    data: unknown,
    ids: string[] | "*",
    applyLocal: () => Promise<R>,
    applyRemote: () => Promise<R>,
  ): Promise<R> {
    return this.run(false, async () => {
      const op: QueuedOperation = { type, data, timestamp: Date.now() };

      if (this.mode === "remote-only") {
        const send = async (): Promise<R> => {
          await this.ensureStoreClean();
          const result = await applyRemote();
          this.noteRemoteWrite(op);
          return result;
        };
        try {
          const result = this.offlineOps.length > 0
            ? await this.serialize(async () => {
                await this.pushQueue();
                return send();
              })
            : await send();
          this.isOnline = true;
          return result;
        } catch (error) {
          if (!(error instanceof QueueStoreError) && this.options.isUnavailable(error)) this.isOnline = false;
          throw error;
        }
      }

      if (this.mode === "write-back" || this.mode === "local-only") {
        this.ensureQueueRoom(op);
        this.attachBase(op);
        const undo = await this.snapshot(ids);
        const result = await applyLocal();
        await this.enqueue(op, undo);
        return result;
      }

      const undo = await this.snapshot(ids);
      const result = await applyLocal();
      try {
        if (this.offlineOps.length > 0) {
          // The queued operations are older: they reach the remote first, or the older value of a
          // queued write replaces this one later. A failed send keeps this write behind them.
          await this.serialize(async () => {
            await this.pushQueue();
            await this.ensureStoreClean();
            await applyRemote();
          });
        } else {
          await this.ensureStoreClean();
          await applyRemote();
        }
        this.isOnline = true;
        this.noteRemoteWrite(op);
      } catch (error) {
        if (
          !(error instanceof QueueStoreError) &&
          this.options.offlineQueue &&
          this.options.isUnavailable(error) &&
          this.hasQueueRoom(op)
        ) {
          this.isOnline = false;
          console.error(`Remote ${type} failed: the operation waits in the queue`);
          this.attachBase(op);
          await this.enqueue(op, undo);
          this.scheduleDrain();
          throw new PendingWriteError(type, error);
        }
        await undo();
        throw error;
      }
      return result;
    });
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

  //
  // ═══ Sync Operations ═══
  //

  /**
   * Sync from the remote to the local copy, in the modes `write-through` and `write-back`. The
   * other modes have no local copy to sync (`remote-only`) or make no remote call (`local-only`):
   * the call does nothing.
   *
   * - The sync asks for the changes since the version of the last sync when the remote has
   *   `getChangesSince`. Else it reads all entries.
   * - Each remote item goes into the cache under its id.
   * - A local item that the remote does not have is removed, unless a queued local operation
   *   changes it.
   * - An id that a local write changed during the sync keeps the local value: the remote value
   *   is older.
   * - Syncs run one at a time.
   */
  syncFromRemote(): Promise<void> {
    return this.serialize(async () => {
      await this.loaded;
      if (this.loadError) throw this.loadError;
      if (this.mode === "write-through" || this.mode === "write-back") await this.pullRemote(false);
    });
  }

  /**
   * Sync all pending offline operations to remote.
   * Processes queued operations in order. When one fails, it and the later operations stay in
   * the queue: the operations that reached the remote are not sent again. In `local-only` mode,
   * the call does nothing.
   */
  syncToRemote(): Promise<void> {
    return this.serialize(async () => {
      await this.loaded;
      if (this.loadError) throw this.loadError;
      if (this.mode !== "local-only") await this.pushQueue();
    });
  }

  /**
   * This method sends the queue to the remote (roadmap R28). `ProcedureServer.useStorage` uses it. In
   * `local-only` mode, it sends nothing: the queue waits for a remote mode.
   */
  flush(): Promise<void> {
    return this.syncToRemote();
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

  /**
   * This method stops the timers, sends the queue (not in `local-only` mode), and closes the remote and the
   * local copy. The queue store keeps the operations that the remote did not take. A durable local
   * copy keeps its items.
   */
  async close(): Promise<void> {
    this.closed = true;
    for (const timer of [this.syncTimer, this.pullTimer]) {
      if (timer) clearInterval(timer);
    }
    this.syncTimer = null;
    this.pullTimer = null;
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    await this.loaded;
    // Sync pending operations before closing
    if (this.offlineOps.length > 0 && this.mode !== "local-only") {
      try {
        await this.syncToRemote();
      } catch (error) {
        console.error("Failed to sync before close:", error);
      }
    }
    await this.storeChain;

    // Close remote storage (an ApiStorage leaves the caller's client open)
    try {
      await this.remote.close();
    } finally {
      await this.local.close();
    }
  }

  /**
   * The metadata of the storage. `size` is the result of `size()`: the number of items of the
   * storage, also in `remote-only` mode. `stats.localSize` is the number of items of the local
   * copy. Before, `size` was the size of the local copy, which `remote-only` keeps empty (found by
   * the contract suite of `@procedures/collections/testing`).
   */
  async getMetadata(): Promise<StorageMetadata> {
    const currentSize = await this.size();
    const localSize = await this.local.size();
    const totalOps = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = totalOps > 0 ? (this.stats.cacheHits / totalOps) * 100 : 0;

    return {
      type: "hybrid",
      size: currentSize,
      stats: {
        localSize,
        hitRate: Math.round(hitRate * 100) / 100,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        syncCount: this.stats.syncCount,
        conflicts: this.stats.conflicts,
        pendingOps: this.offlineOps.length,
        isOnline: this.isOnline,
        mode: this.mode,
        writeStrategy: this.mode,
        conflictResolution: this.options.conflictResolution,
      },
    };
  }

  //
  // ═══ Internal Helpers ═══
  //

  /**
   * This method starts a public operation: after the load of the queue (a write) or the first sync (a read),
   * and never during a mode switch.
   */
  private async run<R>(read: boolean, work: () => Promise<R>): Promise<R> {
    await (read ? this.ready : this.loaded);
    for (;;) {
      const gate = this.gate;
      await gate;
      // No new switch started while this operation waited
      if (this.gate === gate) break;
    }
    if (this.loadError) throw this.loadError;
    this.active++;
    try {
      return await work();
    } finally {
      if (--this.active === 0) {
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
    }
  }

  /** A promise that resolves when no operation runs. */
  private idle(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  /** This method loads the queue, and puts its writes in the local copy. */
  private async loadQueue(): Promise<void> {
    let ops: QueuedOperation[];
    try {
      ops = await this.queueStore.load();
    } catch (error) {
      this.loadError = new QueueStoreError("load", error);
      console.error("The queue store could not load the queue: the storage refuses each operation", error);
      return;
    }
    this.offlineOps = ops.slice();
    try {
      for (const op of this.offlineOps) {
        for (const [id, version] of op.base ?? []) {
          if (!this.bases.has(id)) this.bases.set(id, version);
        }
        // A durable local copy can hold the operation already: each operation gives the same
        // result two times
        await this.applyToLocal(op);
      }
    } catch (error) {
      this.loadError = new Error("The local copy could not take the loaded queue: the storage refuses each operation", { cause: error });
      console.error(this.loadError.message, error);
    }
  }

  /** The first sync: send the loaded queue, then read the remote. */
  private async initialSync(): Promise<void> {
    if (this.loadError) return;
    if (this.options.syncOnInit && this.mode !== "local-only") {
      if (this.offlineOps.length > 0) {
        await this.syncToRemote().catch((err) => {
          console.error("Failed to send the queue on init:", err);
        });
      }
      if (this.mode === "write-through" || this.mode === "write-back") {
        await this.syncFromRemote().catch((err) => {
          console.error("Failed to sync on init:", err);
        });
      }
    }
    if (this.offlineOps.length > 0) this.scheduleDrain();
  }

  /** This method applies a queued operation to the local copy. */
  private async applyToLocal(op: QueuedOperation): Promise<void> {
    const data = op.data as { id: string; value: T; ids: string[]; items: Array<[string, T]> };
    switch (op.type) {
      case "set":
        await this.local.set(data.id, data.value);
        break;
      case "delete":
        await this.local.delete(data.id);
        break;
      case "setBatch":
        await this.local.setBatch(data.items);
        break;
      case "deleteBatch":
        await this.local.deleteBatch(data.ids);
        break;
      case "clear":
        await this.local.clear();
        break;
    }
  }

  /**
   * One pull. `full`: ask for all items (after the local copy was dropped).
   *
   * - The versions of the local writes at the start: a write during the pull keeps its value.
   * - The cursor moves only after a pull without conflicts, so a conflict of the "error" policy
   *   comes again at the next pull.
   */
  private async pullRemote(full: boolean): Promise<void> {
    const versions = new Map(this.writeVersions);
    const clearVersion = this.clearVersion;
    // True when a local write changed the id after the sync started
    const changedLocally = (id: string): boolean =>
      this.clearVersion !== clearVersion || (this.writeVersions.get(id) ?? 0) !== (versions.get(id) ?? 0);

    let changes: PulledChanges<T>;
    try {
      changes = await this.fetchChanges(full);
    } catch (error) {
      if (!(error instanceof MissingKeysError)) this.isOnline = false;
      throw error;
    }

    const conflicts: string[] = [];
    let queueChanged = false;
    const remoteIds = new Set<string>();
    for (const [id, item] of changes.changed) {
      remoteIds.add(id);
      if (await this.pullItem(id, item, changedLocally, conflicts)) queueChanged = true;
    }
    // The remote deleted these items
    const gone = changes.full
      ? (await this.local.getEntries()).map(([id]) => id).filter((id) => !remoteIds.has(id))
      : changes.deleted;
    for (const id of gone) {
      if (await this.pullDelete(id, changedLocally, conflicts)) queueChanged = true;
    }

    if (queueChanged) {
      this.storeDirty = true;
      await this.persistAll().catch((error) => {
        console.error("The queue store could not keep the queue after the sync:", error);
      });
    }
    this.stats.syncCount++;
    this.isOnline = true;
    if (conflicts.length > 0) throw new ConflictError(conflicts);
    if (changes.version !== undefined) this.cursor = changes.version;
  }

  /**
   * The remote changes: since the cursor from `getChangesSince` when the remote has it, or else
   * all entries.
   */
  private async fetchChanges(full: boolean): Promise<PulledChanges<T>> {
    if (this.remote.getChangesSince && !this.changesUnsupported) {
      try {
        return await this.remote.getChangesSince(full ? undefined : this.cursor);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        // A server without the procedure `changes`: read all entries from now on
        this.changesUnsupported = true;
      }
    }
    return { full: true, changed: await this.remoteEntries(), deleted: [] };
  }

  /** This method applies one remote item. It gives true when the queue changed. */
  private async pullItem(
    id: string,
    item: T,
    changedLocally: (id: string) => boolean,
    conflicts: string[],
  ): Promise<boolean> {
    if (changedLocally(id)) return false;
    const localItem = await this.local.get(id);
    if (changedLocally(id)) return false;
    const remoteVersion = this.versionOfItem(item);

    if (this.hasPendingOp(id)) {
      // Without versions, the queued write wins, as before
      if (remoteVersion === undefined) return false;
      // The remote did not change since the last sync, or the storage never saw a remote version
      // of the id: the queued write wins
      const base = this.bases.get(id);
      if (base === undefined || base === remoteVersion) return false;
      if (localItem !== undefined && this.versionOfItem(localItem) === remoteVersion) {
        this.bases.set(id, remoteVersion);
        return false;
      }
      return this.resolvePending(id, localItem, item, remoteVersion, conflicts);
    }

    const localVersion = localItem === undefined ? undefined : this.versionOfItem(localItem);
    if (localItem === undefined) {
      await this.local.set(id, item);
    } else if (remoteVersion !== undefined && localVersion !== undefined) {
      // Only the remote changed: it is not a conflict
      if (localVersion !== remoteVersion) await this.local.set(id, item);
    } else if (JSON.stringify(localItem) !== JSON.stringify(item)) {
      // Conflict - resolve according to strategy
      if (this.options.conflictResolution === "error") {
        this.stats.conflicts++;
        conflicts.push(id);
        return false;
      }
      const resolved = this.resolveConflict(localItem, item);
      await this.local.set(id, resolved);
      this.stats.conflicts++;
    }
    if (remoteVersion !== undefined) this.bases.set(id, remoteVersion);
    return false;
  }

  /** This method applies one remote delete. It gives true when the queue changed. */
  private async pullDelete(id: string, changedLocally: (id: string) => boolean, conflicts: string[]): Promise<boolean> {
    if (changedLocally(id)) return false;
    if (!this.hasPendingOp(id)) {
      await this.local.delete(id);
      if (this.options.versionOf) this.bases.set(id, null);
      return false;
    }
    // Without versions, the queued write wins, as before. With versions, the remote deleted the
    // item only if the last sync saw a version of it.
    const base = this.bases.get(id);
    if (!this.options.versionOf || base === undefined || base === null) return false;
    const localItem = await this.local.get(id);
    if (changedLocally(id)) return false;
    if (localItem === undefined) {
      // Both sides deleted the item
      this.bases.set(id, null);
      return false;
    }
    this.stats.conflicts++;
    switch (this.options.conflictResolution) {
      case "remote":
        if (!this.dropQueued(id)) break;
        await this.local.delete(id);
        this.bases.set(id, null);
        return true;
      case "error":
        conflicts.push(id);
        return false;
      default:
        // "local", and "merge" with one deleted side: the queued write wins
        break;
    }
    this.bases.set(id, null);
    return false;
  }

  /**
   * A queued local write of an id whose remote version changed: a conflict, and the policy
   * decides. True when the queue changed.
   */
  private async resolvePending(
    id: string,
    localItem: T | undefined,
    remoteItem: T,
    remoteVersion: string,
    conflicts: string[],
  ): Promise<boolean> {
    this.stats.conflicts++;
    switch (this.options.conflictResolution) {
      case "remote":
        // The remote value replaces the queued write. A queued clear cannot lose one id.
        if (!this.dropQueued(id)) break;
        await this.local.set(id, remoteItem);
        this.bases.set(id, remoteVersion);
        return true;
      case "merge": {
        if (localItem === undefined) break;
        const merged = this.resolveConflict(localItem, remoteItem);
        if (!this.dropQueued(id)) break;
        await this.local.set(id, merged);
        this.bases.set(id, remoteVersion);
        this.offlineOps.push({ type: "set", data: { id, value: merged }, timestamp: Date.now(), base: [[id, remoteVersion]] });
        return true;
      }
      case "error":
        conflicts.push(id);
        return false;
      default:
        break;
    }
    // "local": the queued write wins, and it replaces this remote version
    this.bases.set(id, remoteVersion);
    return false;
  }

  /**
   * This method removes an id from the queued operations. It gives false when a queued clear touches it: nothing
   * changes then.
   */
  private dropQueued(id: string): boolean {
    if (this.offlineOps.some((op) => op.type === "clear")) return false;
    const next: QueuedOperation[] = [];
    for (const op of this.offlineOps) {
      const kept = withoutId(op, id);
      if (kept) next.push(kept);
    }
    this.offlineOps = next;
    return true;
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

  /**
   * This method sends the queue. The operations that reached the remote leave the queue. The queue store
   * gets the change at the end.
   */
  private async pushQueue(): Promise<void> {
    this.pushing = true;
    let sent = 0;
    try {
      while (this.offlineOps.length > 0) {
        const op = this.offlineOps[0]!;
        if (this.unpersisted.has(op)) {
          // The write of this operation waits for the queue store
          await this.storeChain;
          continue;
        }
        try {
          await this.executeOperation(op);
        } catch (error) {
          // This operation and the later ones stay queued
          this.isOnline = false;
          throw error;
        }
        this.noteRemoteWrite(op);
        // Remove the operation only after it reached the remote
        if (this.offlineOps[0] === op) {
          this.offlineOps.shift();
          sent++;
          this.storeDirty = true;
        }
      }
      this.isOnline = true;
    } finally {
      this.pushing = false;
      if (sent > 0) {
        await this.persistAll().catch((error) => {
          // The store keeps sent operations. A later direct write repairs it first.
          console.error("The queue store could not remove the sent operations:", error);
        });
      }
    }
  }

  /** Run syncs one at a time. */
  private serialize<R>(run: () => Promise<R>): Promise<R> {
    const next = this.syncChain.then(run, run);
    this.syncChain = next.catch(() => undefined);
    return next;
  }

  private bump(id: string): void {
    this.writeVersions.set(id, (this.writeVersions.get(id) ?? 0) + 1);
  }

  /** The count of local writes of an id: it changes with each write and each clear. */
  private writeKey(id: string): string {
    return `${this.clearVersion}:${this.writeVersions.get(id) ?? 0}`;
  }

  private versionOfItem(item: T): string | undefined {
    return this.options.versionOf?.(item);
  }

  /** This method records the remote version of an id that the storage read. */
  private noteBase(id: string, item: T | undefined): void {
    if (!this.options.versionOf) return;
    if (item === undefined) {
      this.bases.set(id, null);
      return;
    }
    const version = this.versionOfItem(item);
    if (version === undefined) this.bases.delete(id);
    else this.bases.set(id, version);
  }

  /** This method records the remote versions after a write reached the remote. */
  private noteRemoteWrite(op: QueuedOperation): void {
    if (!this.options.versionOf) return;
    const data = op.data as { id: string; value: T; ids: string[]; items: Array<[string, T]> };
    switch (op.type) {
      case "set":
        this.noteBase(data.id, data.value);
        break;
      case "delete":
        this.bases.set(data.id, null);
        break;
      case "setBatch":
        for (const [id, value] of data.items) this.noteBase(id, value);
        break;
      case "deleteBatch":
        for (const id of data.ids) this.bases.set(id, null);
        break;
      case "clear":
        for (const id of this.bases.keys()) this.bases.set(id, null);
        break;
    }
  }

  /**
   * This method puts in the operation the remote version that it changes, for each id: the version that an
   * older queued operation of the id writes, or else the known remote version. A storage that
   * loads the queue after a restart takes the version of the first operation of each id.
   */
  private attachBase(op: QueuedOperation): void {
    if (!this.options.versionOf) return;
    const base: Array<[string, string | null]> = [];
    for (const id of idsOf(op)) {
      if (id === "*") continue;
      const version = this.expectedBase(id);
      if (version !== undefined) base.push([id, version]);
    }
    if (base.length > 0) op.base = base;
  }

  /** The remote version of an id after the queued operations, or undefined when it is not known. */
  private expectedBase(id: string): string | null | undefined {
    for (let index = this.offlineOps.length - 1; index >= 0; index--) {
      const op = this.offlineOps[index]!;
      const data = op.data as { id?: string; value?: T; ids?: string[]; items?: Array<[string, T]> };
      switch (op.type) {
        case "set":
          if (data.id === id) return this.versionOfItem(data.value as T);
          break;
        case "delete":
          if (data.id === id) return null;
          break;
        case "setBatch": {
          const item = (data.items ?? []).findLast(([itemId]) => itemId === id);
          if (item) return this.versionOfItem(item[1]);
          break;
        }
        case "deleteBatch":
          if ((data.ids ?? []).includes(id)) return null;
          break;
        case "clear":
          return null;
      }
    }
    return this.bases.get(id);
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

  //
  // ═══ The queue and its store ═══
  //

  /**
   * This method puts an operation in the queue, then in the queue store. The write ends only after the store
   * kept it. When the store fails, the operation leaves the queue, the local change is undone,
   * and the write throws `QueueStoreError`.
   *
   * A set or a delete of one id replaces the queued set or delete of that id, when no later
   * operation touches the id: a second try of a write does not queue it two times.
   */
  private async enqueue(op: QueuedOperation, undo: () => Promise<void>): Promise<void> {
    const index = this.replaceableIndex(op);
    let rollback: () => void;
    if (index >= 0) {
      const previous = this.offlineOps[index]!;
      // The new operation changes the same remote version as the operation that it replaces
      if (previous.base) op.base = previous.base;
      else delete op.base;
      this.offlineOps[index] = op;
      rollback = () => {
        const at = this.offlineOps.indexOf(op);
        if (at >= 0) this.offlineOps[at] = previous;
      };
    } else {
      try {
        this.ensureQueueRoom(op);
      } catch (error) {
        await undo();
        throw error;
      }
      this.offlineOps.push(op);
      rollback = () => {
        const at = this.offlineOps.indexOf(op);
        if (at >= 0) this.offlineOps.splice(at, 1);
      };
    }
    this.unpersisted.add(op);
    try {
      await this.persist(op, index < 0, rollback);
    } catch (error) {
      await undo();
      throw error;
    }
  }

  /**
   * This method writes one operation to the queue store: an append when the store holds each operation
   * before it, or else the whole queue. On a failure, `rollback` removes the operation from the
   * queue before the next call of the store.
   */
  private persist(op: QueuedOperation, appended: boolean, rollback: () => void): Promise<void> {
    const run = this.storeChain.then(async () => {
      // An earlier write of the whole queue kept it already
      if (!this.unpersisted.has(op)) return;
      const at = this.offlineOps.indexOf(op);
      const canAppend =
        appended && !this.storeDirty && at >= 0 && this.offlineOps.slice(0, at).every((other) => !this.unpersisted.has(other));
      const snapshot = this.offlineOps.slice();
      try {
        if (canAppend) {
          await this.queueStore.append(op);
          this.unpersisted.delete(op);
        } else {
          await this.queueStore.replace(snapshot);
          for (const kept of snapshot) this.unpersisted.delete(kept);
          this.unpersisted.delete(op);
          this.storeDirty = false;
        }
      } catch (error) {
        this.storeDirty = true;
        this.unpersisted.delete(op);
        rollback();
        throw new QueueStoreError("write", error);
      }
    });
    this.storeChain = run.catch(() => undefined);
    return run;
  }

  /** This method writes the whole queue to the queue store when the store can differ from the queue. */
  private persistAll(): Promise<void> {
    const run = this.storeChain.then(async () => {
      if (!this.storeDirty && this.unpersisted.size === 0) return;
      const snapshot = this.offlineOps.slice();
      try {
        if (snapshot.length === 0) await this.queueStore.clear();
        else await this.queueStore.replace(snapshot);
        for (const kept of snapshot) this.unpersisted.delete(kept);
        this.storeDirty = false;
      } catch (error) {
        this.storeDirty = true;
        throw new QueueStoreError("write", error);
      }
    });
    this.storeChain = run.catch(() => undefined);
    return run;
  }

  /**
   * Before a write goes to the remote directly, the queue store must not hold a sent operation:
   * after a restart, it would replace this newer write.
   */
  private async ensureStoreClean(): Promise<void> {
    if (this.storeDirty) await this.persistAll();
  }

  /** The index of the queued operation that `op` replaces, or -1. */
  private replaceableIndex(op: QueuedOperation): number {
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
  private hasQueueRoom(op: QueuedOperation): boolean {
    return this.replaceableIndex(op) >= 0 || this.offlineOps.length < this.options.maxOfflineOps;
  }

  /** A full queue refuses the write. Before, it dropped the oldest operation (roadmap R2). */
  private ensureQueueRoom(op: QueuedOperation): void {
    if (!this.hasQueueRoom(op)) throw new QueueFullError(this.options.maxOfflineOps);
  }

  /**
   * In write-through mode, a timer sends the queue after a failure, and again after each failed
   * send, until the queue is empty.
   */
  private scheduleDrain(): void {
    if (this.drainTimer || this.closed || this.mode !== "write-through") return;
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
  private async executeOperation(op: QueuedOperation): Promise<void> {
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
