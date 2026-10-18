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
 * - Each write takes a copy of the value (`structuredClone`), for the local copy, the queue and the
 *   remote. The reads give the copies of the local copy, or of the remote in `remote-only` mode.
 * - A full sync reads the local ids with `getIds()`, so it does not copy each local item.
 * - A pull reads a local item only when the result depends on it. With `versionOf`, the storage
 *   knows the version of each local item that it wrote or read.
 * - The timers run on the clock of the options. After a failed push, pull or send of the queue,
 *   the next delay grows with `backoffDelay` of `@mark1russell7/service/backoff` (roadmap CLI-13).
 * - `getStatus()` and `onStatus()` give the state of the sync and its errors. Before, the errors
 *   went to the console.
 * - `query()` runs a selector on the local copy, or on the remote in `remote-only` mode.
 * - After `close()`, each operation rejects, and a second `close()` does nothing.
 */

import type { CollectionStorage, StorageChanges, StorageMetadata, StorageQueryOptions, StorageSelector } from "@procedures/collections";
import { InMemoryStorage, StorageListeners, queryEntries, queryOptionsProblems, selectorProblems, type ListenerErrorHandler } from "@procedures/collections";
import { optionalMs, realClock, type Cancel, type Clock, type Duration } from "@procedures/client";
import { backoffDelay } from "@mark1russell7/service/backoff";
import { MemoryQueueStore, idsOf, withoutId, type QueuedOperation, type QueueStore } from "./queue.js";
import type { SyncError, SyncStatus } from "./types.js";

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
   *
   * The storage keeps the version of each local item that it wrote or read. A pull then reads a
   * local item only for a conflict, or when it does not know the version of the item.
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
   * `close()` closes it. Only the storage writes to the local copy: with `versionOf`, a pull does
   * not see a write from outside.
   * @default a new `InMemoryStorage`
   */
  local?: LocalCopyStorage<any>;

  /**
   * The clock of the timers: the push of `write-back`, the periodic pull, and the send of the queue
   * after a failure. A test gives `fakeClock` of `@mark1russell7/service/testing`. The timers do
   * not keep a Node process alive.
   * @default the clock of the platform (`realClock` of `@procedures/client`)
   */
  clock?: Clock;

  /**
   * The growth of the delays after a failure (roadmap CLI-13). After `n` failed runs of a timer in
   * a row, its next delay is `interval × factor^n`, at most `maxDelay`, with the random part
   * `jitter`. A run that succeeds sets the delay back to the interval.
   */
  backoff?: {
    /** @default 2 */
    factor?: number;
    /** The longest backoff, for example `minutes(5)`. A timer with a longer interval uses its interval. @default 5 minutes */
    maxDelay?: Duration;
    /** The random part of each delay after a failure, from 0 to 1. @default 0.5 */
    jitter?: number;
  };

  /**
   * The random numbers of the jitter, from 0 up to 1. A test gives a fixed generator.
   * @default Math.random
   */
  random?: () => number;

  /**
   * The function that gets the error of a listener of `onStatus()`. The default throws the error
   * again in a microtask.
   */
  onListenerError?: ListenerErrorHandler;
}

/** The kinds of the timers of a `HybridStorage`. */
interface TimerOptions {
  readonly clock: Clock;
  /** The delay of a run after a run that succeeded, in milliseconds */
  readonly interval: number;
  readonly factor: number;
  readonly maxDelay: number;
  readonly jitter: number;
  readonly random: () => number;
  /** True: the timer runs again after a run that succeeded. False: it stops. */
  readonly repeat: boolean;
  readonly work: () => Promise<unknown>;
}

/**
 * A timer of a `HybridStorage` on a clock. It runs `work` after its interval. After a failed run,
 * the next delay grows with `backoffDelay` (roadmap CLI-13). The timer does not keep a Node
 * process alive.
 */
class SyncTimer {
  private cancel: Cancel | undefined;
  private active = false;
  /** True while `work` runs */
  private running = false;
  /** True when `start()` came during a run: the timer waits again after the run */
  private again = false;
  private failures = 0;

  constructor(private readonly options: TimerOptions) {}

  /**
   * This method starts the timer. A timer that waits does not start again. A start during a run
   * makes the timer wait again after the run, also when it does not repeat.
   */
  start(): void {
    if (this.running) {
      this.again = true;
      if (this.active) return;
      this.active = true;
      this.failures = 0;
      return;
    }
    if (this.active) return;
    this.active = true;
    this.failures = 0;
    this.arm();
  }

  /** This method stops the timer. A run that is on its way ends, and no next run starts. */
  stop(): void {
    this.active = false;
    this.again = false;
    this.cancel?.();
    this.cancel = undefined;
  }

  /** The delay of the next run: the interval, or the backoff after failures. */
  private delay(): number {
    const { interval, factor, maxDelay, jitter, random } = this.options;
    if (this.failures === 0) return interval;
    return backoffDelay(
      {
        base: interval,
        factor,
        cap: Math.max(maxDelay, interval),
        jitter: jitter > 0 ? { kind: "subtract", fraction: jitter } : { kind: "none" },
      },
      this.failures + 1,
      random,
    );
  }

  private arm(): void {
    const cancel = this.options.clock.after(this.delay(), () => {
      this.cancel = undefined;
      void this.run();
    });
    // The timer must not keep the process alive (deep dive DATA-9)
    cancel.unref?.();
    this.cancel = cancel;
  }

  private async run(): Promise<void> {
    if (!this.active) return;
    this.running = true;
    let failed = false;
    try {
      await this.options.work();
      this.failures = 0;
    } catch {
      // The work reports its error in the status of the storage
      failed = true;
      this.failures++;
    } finally {
      this.running = false;
    }
    if (!this.active) return;
    const again = this.again;
    this.again = false;
    if (failed || again || this.options.repeat) this.arm();
    else this.active = false;
  }
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
 * copy after a restart. With `getIds()`, a full sync reads the local ids without a copy of the
 * values.
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
  /** The push timer of the write-back mode, or undefined without `syncInterval` */
  private readonly pushTimer: SyncTimer | undefined;
  /** The periodic pull, or undefined without `pullInterval` */
  private readonly pullTimer: SyncTimer | undefined;
  /** True while pushQueue sends the queue: the first operation can be on its way */
  private pushing = false;
  /** The timer that sends the queue of the write-through mode after a failure */
  private readonly drainTimer: SyncTimer;
  /** The failures that a later success did not clear, the newest last */
  private readonly failures = new Map<SyncError["operation"], SyncError>();
  /** The number of pushes and pulls that run */
  private syncs = 0;
  /** The time of the last pull that succeeded (`Date.now()`) */
  private lastSync: number | undefined;
  /** The listeners of `onStatus()`, and the status that they got last */
  private readonly statusListeners: StorageListeners<SyncStatus>;
  private lastStatus: SyncStatus | undefined;
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
  /** True after `close()`: each operation rejects */
  private closed = false;
  /** The work of the first `close()` */
  private closing: Promise<void> | undefined;
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
  /**
   * With `versionOf`: the version of each local item that the storage wrote or read. A pull does
   * not read an item whose version it knows. The version of an id that is not here is unknown.
   */
  private readonly localVersions = new Map<string, string>();
  /** The number of the last local write of each id that runs: only that write records a version */
  private readonly localWrites = new Map<string, number>();
  private localWriteCount = 0;
  /** The number of clears of the local copy: a clear cancels the records of the writes that run */
  private localClears = 0;
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
    this.statusListeners = new StorageListeners<SyncStatus>(options.onListenerError);

    // The timers on the clock, with the backoff after a failure (roadmap CLI-13)
    const factor = options.backoff?.factor ?? 2;
    if (!(Number.isFinite(factor) && factor >= 1)) throw new RangeError(`backoff.factor must be a number of 1 or more, not ${factor}`);
    const jitter = options.backoff?.jitter ?? 0.5;
    if (!(jitter >= 0 && jitter <= 1)) throw new RangeError(`backoff.jitter must be from 0 to 1, not ${jitter}`);
    const timing = {
      clock: options.clock ?? realClock,
      factor,
      maxDelay: optionalMs(options.backoff?.maxDelay, "backoff.maxDelay") ?? 300_000,
      jitter,
      random: options.random ?? Math.random,
    };
    this.pushTimer =
      this.options.syncInterval > 0
        ? new SyncTimer({ ...timing, interval: this.options.syncInterval, repeat: true, work: () => (this.closed ? Promise.resolve() : this.push()) })
        : undefined;
    this.pullTimer =
      this.options.pullInterval > 0
        ? new SyncTimer({ ...timing, interval: this.options.pullInterval, repeat: true, work: () => (this.closed ? Promise.resolve() : this.pull()) })
        : undefined;
    this.drainTimer = new SyncTimer({
      ...timing,
      interval: this.options.syncInterval > 0 ? this.options.syncInterval : 5000,
      repeat: false,
      work: () => (this.closed ? Promise.resolve() : this.push()),
    });

    // The queue first, then the first sync. The reads wait for both (roadmap R2, R28).
    this.loaded = this.loadQueue();
    this.ready = this.loaded.then(() => this.initialSync());
    this.updateTimers();
  }

  //
  // ═══ The status of the sync ═══
  //

  /**
   * The state of the sync now (roadmap CLI-13).
   *
   * - `connected` is false after a remote call failed, until a remote call succeeds.
   * - `pendingChanges` is the number of operations in the queue.
   * - `syncing` is true while a push or a pull runs.
   * - `lastSync` is the time (`Date.now()`) of the last pull that succeeded.
   * - `error` is the newest failure of a load, a push, a pull or the queue store that a later
   *   success of the same work did not clear.
   */
  getStatus(): SyncStatus {
    const error = [...this.failures.values()].at(-1);
    return {
      connected: this.isOnline,
      lastSync: this.lastSync,
      pendingChanges: this.offlineOps.length,
      syncing: this.syncs > 0,
      mode: this.mode,
      ...(error !== undefined && { error }),
    };
  }

  /**
   * This method starts to send the status to a listener at each change: a failure, a sync that
   * starts or ends, a change of the queue, of the connection or of the mode. A failure of a timer
   * reaches the listeners here: the storage does not write to the console.
   *
   * @returns The function that stops the status. A second use of it does nothing.
   */
  onStatus(listener: (status: SyncStatus) => void): () => void {
    if (this.closed) throw this.closedError();
    return this.statusListeners.add(listener);
  }

  /** This method sends the status to the listeners when it changed. */
  private notify(): void {
    if (this.statusListeners.size === 0) return;
    const status = this.getStatus();
    const last = this.lastStatus;
    if (
      last &&
      last.connected === status.connected &&
      last.lastSync === status.lastSync &&
      last.pendingChanges === status.pendingChanges &&
      last.syncing === status.syncing &&
      last.mode === status.mode &&
      last.error === status.error
    ) {
      return;
    }
    this.lastStatus = status;
    this.statusListeners.emit(status);
  }

  /** This method keeps a failure for the status. The failure of an operation replaces its older one. */
  private fail(operation: SyncError["operation"], error: unknown): void {
    this.failures.delete(operation);
    this.failures.set(operation, { operation, error });
    this.notify();
  }

  /** This method clears the failure of an operation after a success. */
  private succeed(operation: SyncError["operation"]): void {
    if (this.failures.delete(operation)) this.notify();
  }

  /** A push or a pull: the status shows it while it runs, and keeps its failure. */
  private async track(operation: "push" | "pull", work: () => Promise<void>): Promise<void> {
    this.syncs++;
    this.notify();
    try {
      await work();
      this.succeed(operation);
    } catch (error) {
      // A storage whose load failed keeps the failure of the load
      if (error !== this.loadError) this.fail(operation, error);
      throw error;
    } finally {
      this.syncs--;
      this.notify();
    }
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
    if (this.closed) throw this.closedError();
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
    this.notify();
  }

  /** This method drops the local copy. A read in flight does not fill it again. */
  private async dropLocal(): Promise<void> {
    this.clearVersion++;
    this.cursor = undefined;
    await this.localClear();
  }

  /** This method makes the local copy from the queue only, before a full sync. */
  private async rebuildLocal(): Promise<void> {
    await this.dropLocal();
    for (const op of this.offlineOps) await this.applyToLocal(op);
  }

  /**
   * This method starts and stops the timers for the mode. The push timer runs in `write-back`, the
   * pull timer in `write-through` and `write-back`, and the send of the queue after a failure only
   * in `write-through`. A failed run reports its error in the status, and the next delay grows.
   */
  private updateTimers(): void {
    if (this.closed) return;
    if (this.mode === "write-back") this.pushTimer?.start();
    else this.pushTimer?.stop();

    if (this.mode === "write-through" || this.mode === "write-back") this.pullTimer?.start();
    else this.pullTimer?.stop();

    if (this.mode !== "write-through") this.drainTimer.stop();
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
          if (remote !== undefined) await this.localSet(id, remote);
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

  /**
   * The ids of the items, in the order of the entries: the ids of the local copy, or of the remote
   * in `remote-only` mode. The ids come without a copy of the values when the storage under them
   * has `getIds()`.
   */
  async getIds(): Promise<string[]> {
    return this.run(true, () => (this.mode === "remote-only" ? this.remoteRead(() => this.remoteIds()) : this.localIds()));
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return this.run(true, () =>
      this.mode === "remote-only" ? this.remoteRead(() => this.remote.find(predicate)) : this.local.find(predicate),
    );
  }

  /**
   * The entries whose items match the selector (roadmap CLI-14): from the local copy, or from the
   * remote in `remote-only` mode. A storage under it with `query()` runs the selector itself, for
   * example `ApiStorage` on its server. Else this method runs `queryEntries()` on its entries.
   */
  async query(selector: StorageSelector, options?: StorageQueryOptions): Promise<Array<[string, T]>> {
    return this.run(true, async () => {
      const problems = [...selectorProblems(selector), ...queryOptionsProblems(options)];
      if (problems.length > 0) throw new TypeError(`The query is not correct: ${problems.join(". ")}`);
      if (this.mode === "remote-only") {
        return this.remoteRead(async () =>
          this.remote.query ? this.remote.query(selector, options) : queryEntries(await this.remoteEntries(), selector, options),
        );
      }
      return this.local.query ? this.local.query(selector, options) : queryEntries(await this.local.getEntries(), selector, options);
    });
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

  /**
   * This method sets an item. The storage takes a copy of the value, so a later change of the
   * value does not change the local copy, the queue or the remote write.
   */
  async set(id: string, written: T): Promise<void> {
    const value = structuredClone(written);
    await this.write("set", { id, value }, [id], async () => {
      this.bump(id);
      await this.localSet(id, value);
    }, () => this.remote.set(id, value));
  }

  async delete(id: string): Promise<boolean> {
    return this.write("delete", { id }, [id], async () => {
      this.bump(id);
      return this.localDelete(id);
    }, () => this.remote.delete(id));
  }

  async clear(): Promise<void> {
    await this.write("clear", {}, "*", async () => {
      this.clearVersion++;
      await this.localClear();
    }, () => this.remote.clear());
  }

  //
  // ═══ Bulk Operations ═══
  //

  /** This method sets several items. The storage takes a copy of each value, as `set` does. */
  async setBatch(written: Array<[string, T]>): Promise<void> {
    const items = written.map(([id, value]): [string, T] => [id, structuredClone(value)]);
    await this.write("setBatch", { items }, items.map(([id]) => id), async () => {
      for (const [id] of items) this.bump(id);
      await this.localSetBatch(items);
    }, () => this.remote.setBatch(items));
  }

  async deleteBatch(ids: string[]): Promise<number> {
    return this.write("deleteBatch", { ids }, ids, async () => {
      for (const id of ids) this.bump(id);
      return this.localDeleteBatch(ids);
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
          // The status shows the queue and the connection. The caller gets PendingWriteError.
          this.isOnline = false;
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
        if (value === undefined) await this.localDelete(id);
        else await this.localSet(id, value);
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
    if (this.closed) return Promise.reject(this.closedError());
    return this.pull();
  }

  /**
   * Sync all pending offline operations to remote.
   * Processes queued operations in order. When one fails, it and the later operations stay in
   * the queue: the operations that reached the remote are not sent again. In `local-only` mode,
   * the call does nothing.
   */
  syncToRemote(): Promise<void> {
    if (this.closed) return Promise.reject(this.closedError());
    return this.push();
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

  /** The pull of `syncFromRemote()`, after the syncs that run. The status keeps its failure. */
  private pull(): Promise<void> {
    return this.serialize(() =>
      this.track("pull", async () => {
        await this.loaded;
        if (this.loadError) throw this.loadError;
        if (this.mode === "write-through" || this.mode === "write-back") await this.pullRemote(false);
      }),
    );
  }

  /** The push of `syncToRemote()`, after the syncs that run. The status keeps its failure. */
  private push(): Promise<void> {
    return this.serialize(() =>
      this.track("push", async () => {
        await this.loaded;
        if (this.loadError) throw this.loadError;
        if (this.mode !== "local-only") await this.pushQueue();
      }),
    );
  }

  /** The error of an operation after `close()`. */
  private closedError(): Error {
    return new Error("The HybridStorage is closed");
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /**
   * This method closes the storage.
   *
   * - It stops the timers, and waits for the operations, the mode switch and the syncs that run.
   * - It sends the queue (not in `local-only` mode). The queue store keeps the operations that
   *   the remote did not take.
   * - It closes the remote and the local copy. A durable local copy keeps its items.
   * - After it, each operation rejects. A second `close()` does nothing: it gives the promise of
   *   the first one, without its error.
   */
  close(): Promise<void> {
    if (this.closing) return this.closing.catch(() => undefined);
    this.closed = true;
    this.closing = this.shutDown();
    return this.closing;
  }

  /** The work of `close()`. */
  private async shutDown(): Promise<void> {
    this.pushTimer?.stop();
    this.pullTimer?.stop();
    this.drainTimer.stop();

    try {
      await this.loaded;
      // The operations and the switch that started before close() end first
      await this.gate;
      await this.idle();
      // After the syncs that run: send the pending operations. The queue store keeps the ones that
      // the remote did not take, and the status gets the failure.
      await this.serialize(async () => {
        if (this.loadError || this.offlineOps.length === 0 || this.mode === "local-only") return;
        await this.track("push", () => this.pushQueue()).catch(() => undefined);
      });
      await this.storeChain;

      // Close remote storage (an ApiStorage leaves the caller's client open)
      try {
        await this.remote.close();
      } finally {
        await this.local.close();
      }
    } finally {
      this.statusListeners.clear();
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
    if (this.closed) throw this.closedError();
    await (read ? this.ready : this.loaded);
    for (;;) {
      const gate = this.gate;
      await gate;
      // No new switch started while this operation waited
      if (this.gate === gate) break;
    }
    // close() started while this operation waited
    if (this.closed) throw this.closedError();
    if (this.loadError) throw this.loadError;
    this.active++;
    try {
      return await work();
    } finally {
      if (--this.active === 0) {
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
      // A write changes the queue, and a remote call the connection
      this.notify();
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
      // The storage refuses each operation. The status shows the failure.
      this.loadError = new QueueStoreError("load", error);
      this.fail("load", this.loadError);
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
      this.fail("load", this.loadError);
    }
  }

  /** The first sync: send the loaded queue, then read the remote. */
  private async initialSync(): Promise<void> {
    // A close() before the first sync: the storage makes no remote call
    if (this.loadError || this.closed) return;
    if (this.options.syncOnInit && this.mode !== "local-only") {
      // A failure goes to the status: the reads go on with the local copy
      if (this.offlineOps.length > 0) await this.push().catch(() => undefined);
      if (!this.closed && (this.mode === "write-through" || this.mode === "write-back")) {
        await this.pull().catch(() => undefined);
      }
    }
    if (this.offlineOps.length > 0) this.scheduleDrain();
  }

  /** This method applies a queued operation to the local copy. */
  private async applyToLocal(op: QueuedOperation): Promise<void> {
    const data = op.data as { id: string; value: T; ids: string[]; items: Array<[string, T]> };
    switch (op.type) {
      case "set":
        await this.localSet(data.id, data.value);
        break;
      case "delete":
        await this.localDelete(data.id);
        break;
      case "setBatch":
        await this.localSetBatch(data.items);
        break;
      case "deleteBatch":
        await this.localDeleteBatch(data.ids);
        break;
      case "clear":
        await this.localClear();
        break;
    }
  }

  //
  // ═══ The writes of the local copy ═══
  //

  /**
   * This method writes to the local copy. With `versionOf`, it records the version of each item
   * that the write gives, so a pull does not read the item to know its version.
   *
   * - During the write, the versions of its ids are unknown. A failed write keeps them unknown.
   * - Only the last write of an id that started records its version, and a clear that started
   *   after the write cancels the record.
   */
  private writeLocal<R>(versionsOf: () => Array<[string, string | undefined]>, write: () => Promise<R>): Promise<R> {
    return this.options.versionOf ? this.recordedWrite(versionsOf(), write) : write();
  }

  /** The write of `writeLocal` with `versionOf`. */
  private async recordedWrite<R>(versions: Array<[string, string | undefined]>, write: () => Promise<R>): Promise<R> {
    const clears = this.localClears;
    const numbers = versions.map(([id]) => {
      this.localVersions.delete(id);
      const number = ++this.localWriteCount;
      this.localWrites.set(id, number);
      return number;
    });
    let written = false;
    try {
      const result = await write();
      written = true;
      return result;
    } finally {
      versions.forEach(([id, version], index) => {
        if (this.localWrites.get(id) !== numbers[index]) return;
        this.localWrites.delete(id);
        if (written && version !== undefined && clears === this.localClears) this.localVersions.set(id, version);
      });
    }
  }

  /**
   * This method reads a local item for a pull. With `versionOf`, it records the version of the item
   * when no local write started or ran during the read.
   */
  private async readLocal(id: string): Promise<T | undefined> {
    const writes = this.localWriteCount;
    const clears = this.localClears;
    const item = await this.local.get(id);
    if (
      item !== undefined &&
      this.options.versionOf &&
      writes === this.localWriteCount &&
      clears === this.localClears &&
      !this.localWrites.has(id)
    ) {
      const version = this.recordedVersion(item);
      if (version !== undefined) this.localVersions.set(id, version);
    }
    return item;
  }

  /** The version of an item for the record of the local copy, or undefined when `versionOf` fails. */
  private recordedVersion(item: T): string | undefined {
    try {
      return this.versionOfItem(item);
    } catch {
      return undefined;
    }
  }

  private localSet(id: string, value: T): Promise<void> {
    return this.writeLocal(() => [[id, this.recordedVersion(value)]], () => this.local.set(id, value));
  }

  private localDelete(id: string): Promise<boolean> {
    return this.writeLocal(() => [[id, undefined]], () => this.local.delete(id));
  }

  private localSetBatch(items: Array<[string, T]>): Promise<void> {
    return this.writeLocal(() => items.map(([id, value]) => [id, this.recordedVersion(value)]), () => this.local.setBatch(items));
  }

  private localDeleteBatch(ids: string[]): Promise<number> {
    return this.writeLocal(() => ids.map((id): [string, undefined] => [id, undefined]), () => this.local.deleteBatch(ids));
  }

  private localClear(): Promise<void> {
    this.localClears++;
    this.localVersions.clear();
    return this.local.clear();
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
    // The remote deleted these items. A full pull reads only the local ids: before, it read each
    // local entry, and the local copy copied each value for it.
    const gone = changes.full ? (await this.localIds()).filter((id) => !remoteIds.has(id)) : changes.deleted;
    for (const id of gone) {
      if (await this.pullDelete(id, changedLocally, conflicts)) queueChanged = true;
    }

    if (queueChanged) {
      this.storeDirty = true;
      // The status gets the failure of the queue store. A later direct write repairs the store first.
      await this.persistAll().catch(() => undefined);
    }
    this.stats.syncCount++;
    this.isOnline = true;
    if (conflicts.length > 0) throw new ConflictError(conflicts);
    if (changes.version !== undefined) this.cursor = changes.version;
    this.lastSync = Date.now();
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

  /**
   * This method applies one remote item. It gives true when the queue changed.
   *
   * The pull reads the local item only when the result depends on it (roadmap R28):
   * - An id with a queued write: only when the remote version changed after the last known remote
   *   version. Without versions, the queued write wins, and the pull reads nothing.
   * - An id without a queued write: not when the storage knows the version of the local item.
   *   Without versions, the pull compares the JSON of the two items, so it reads the local item.
   * Before, the pull read each local item.
   */
  private async pullItem(
    id: string,
    item: T,
    changedLocally: (id: string) => boolean,
    conflicts: string[],
  ): Promise<boolean> {
    if (changedLocally(id)) return false;
    const remoteVersion = this.versionOfItem(item);
    const knownVersion = remoteVersion === undefined ? undefined : this.localVersions.get(id);

    if (this.hasPendingOp(id)) {
      // Without versions, the queued write wins, as before
      if (remoteVersion === undefined) return false;
      // The remote did not change since the last sync, or the storage never saw a remote version
      // of the id: the queued write wins
      const base = this.bases.get(id);
      if (base === undefined || base === remoteVersion) return false;
      if (knownVersion === remoteVersion) {
        this.bases.set(id, remoteVersion);
        return false;
      }
      const localItem = await this.readLocal(id);
      if (changedLocally(id)) return false;
      if (localItem !== undefined && this.versionOfItem(localItem) === remoteVersion) {
        this.bases.set(id, remoteVersion);
        return false;
      }
      return this.resolvePending(id, localItem, item, remoteVersion, conflicts);
    }

    if (knownVersion !== undefined) {
      // Only the remote changed: it is not a conflict. The version of the local item is known.
      if (knownVersion !== remoteVersion) await this.localSet(id, item);
      this.bases.set(id, remoteVersion!);
      return false;
    }

    const localItem = await this.readLocal(id);
    if (changedLocally(id)) return false;
    const localVersion = localItem === undefined ? undefined : this.versionOfItem(localItem);
    if (localItem === undefined) {
      await this.localSet(id, item);
    } else if (remoteVersion !== undefined && localVersion !== undefined) {
      // Only the remote changed: it is not a conflict
      if (localVersion !== remoteVersion) await this.localSet(id, item);
    } else if (JSON.stringify(localItem) !== JSON.stringify(item)) {
      // Conflict - resolve according to strategy
      if (this.options.conflictResolution === "error") {
        this.stats.conflicts++;
        conflicts.push(id);
        return false;
      }
      const resolved = this.resolveConflict(localItem, item);
      await this.localSet(id, resolved);
      this.stats.conflicts++;
    }
    if (remoteVersion !== undefined) this.bases.set(id, remoteVersion);
    return false;
  }

  /** This method applies one remote delete. It gives true when the queue changed. */
  private async pullDelete(id: string, changedLocally: (id: string) => boolean, conflicts: string[]): Promise<boolean> {
    if (changedLocally(id)) return false;
    if (!this.hasPendingOp(id)) {
      await this.localDelete(id);
      if (this.options.versionOf) this.bases.set(id, null);
      return false;
    }
    // Without versions, the queued write wins, as before. With versions, the remote deleted the
    // item only if the last sync saw a version of it.
    const base = this.bases.get(id);
    if (!this.options.versionOf || base === undefined || base === null) return false;
    const localItem = await this.readLocal(id);
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
        await this.localDelete(id);
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
        await this.localSet(id, remoteItem);
        this.bases.set(id, remoteVersion);
        return true;
      case "merge": {
        if (localItem === undefined) break;
        const merged = this.resolveConflict(localItem, remoteItem);
        if (!this.dropQueued(id)) break;
        await this.localSet(id, merged);
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

  /** The ids of the local copy: from `getIds()` when it has it, without a copy of the values. */
  private async localIds(): Promise<string[]> {
    if (this.local.getIds) return this.local.getIds();
    return (await this.local.getEntries()).map(([id]) => id);
  }

  /** The ids of the remote: from `getIds()` when it has it, or else from its entries. */
  private async remoteIds(): Promise<string[]> {
    if (this.remote.getIds) return this.remote.getIds();
    return (await this.remoteEntries()).map(([id]) => id);
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
        // The store keeps sent operations, and the status gets the failure. A later direct write
        // repairs the store first.
        await this.persistAll().catch(() => undefined);
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
        this.succeed("store");
      } catch (error) {
        this.storeDirty = true;
        this.unpersisted.delete(op);
        rollback();
        const failure = new QueueStoreError("write", error);
        this.fail("store", failure);
        throw failure;
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
        this.succeed("store");
      } catch (error) {
        this.storeDirty = true;
        const failure = new QueueStoreError("write", error);
        this.fail("store", failure);
        throw failure;
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
   * send, until the queue is empty. The delay after a failed send grows with the backoff.
   */
  private scheduleDrain(): void {
    if (this.closed || this.mode !== "write-through") return;
    this.drainTimer.start();
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
