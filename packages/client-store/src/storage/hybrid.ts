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
 * - With `versionOf`, the push of a queued write sends its base version as `expectedVersion`
 *   (roadmap CLI-16). A `VERSION_CONFLICT` of the remote goes to `conflictResolution`, as a
 *   conflict of a pull does. The option `sendBaseVersions: false` stops it.
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
 *
 * The sync engine of roadmap CLI-21 (decision D9: a SignalDB collection is one strategy of the local copy):
 * - `observe()` gives the batches of the changes of the storage, with their origins.
 * - `capture: "observe"` queues the changes that the application writes to the local copy itself.
 * - `syncState` keeps the cursor and the base versions after a reload.
 * - `feed` pushes the remote deltas. A delta whose `since` is the cursor applies without a read.
 * - A pull never erases a delta that came during it, and the echo of an older own write never
 *   writes over a newer local write.
 * - The syncs of one storage run one at a time, in their order: the deltas and the hints of the
 *   feed, the pulls, the pushes, the reads after an own write, and the mode switches. Thus a
 *   remote delta and a full sync never run at the same time (Graph R18).
 * - `aroundRemoteApply` runs each apply of the remote changes inside a hook, for example inside a
 *   span of a trace (graph W8).
 */

import type {
  CollectionStorage,
  StorageBatchWriteOptions,
  StorageChangeBatch,
  StorageChangeEvent,
  StorageChanges,
  StorageItemWriteOptions,
  StorageMetadata,
  StorageObserver,
  StorageWriteOptions,
  VersionConflict,
} from "@procedures/collections";
import { InMemoryStorage, StorageListeners, type ListenerErrorHandler } from "@procedures/collections";
import {
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
  versionConflictsOf,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
} from "@procedures/client/query";
import { optionalMs, realClock, type Cancel, type Clock, type Duration } from "@procedures/client/browser";
import { backoffDelay } from "@mark1russell7/service/backoff";
import { MemoryQueueStore, idsOf, withoutId, type QueuedOperation, type QueueStore } from "./queue.js";
import type { SyncError, SyncStatus } from "./types.js";
import type { RemoteChangeFeed, RemoteChangeHint, RemoteChanges } from "./feed.js";
import { isSyncState, type SyncStateStore } from "./sync-state.js";

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
   * With `versionOf`: true sends the base version of each queued write to the remote as its
   * `expectedVersion` (roadmap CLI-16). The remote then refuses a write over a change of another
   * writer with `VERSION_CONFLICT`, and `conflictResolution` decides, as for a pull. The base
   * version is the remote version of the id when the local write was queued. False: the push
   * sends no precondition, and the queued write replaces the remote item, as before CLI-16.
   *
   * The remote must test the precondition: an `ApiStorage` of the core collection procedures over
   * a storage with the same `versionOf`. A remote that cannot test it refuses each push.
   * @default true
   */
  sendBaseVersions?: boolean;

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
   * `close()` closes it. Without `capture`, only the storage writes to the local copy: with
   * `versionOf`, a pull does not see a write from outside.
   * @default a new `InMemoryStorage`
   */
  local?: LocalCopyStorage<any>;

  /**
   * The capture of the writes of the application to the local copy (roadmap CLI-21).
   *
   * - `"none"`: only the storage writes to the local copy.
   * - `"observe"`: the storage observes the local copy, and it queues each change whose origin is
   *   not `origin`. The application can then write to the local copy directly, for example with
   *   the synchronous writes of a SignalDB collection. The local copy must have `observe()`.
   *
   * A captured change always goes in the queue, because the application made it already: the limit
   * `maxOfflineOps` does not refuse it. In the modes `write-through` and `remote-only`, the storage
   * sends the queue at once.
   * @default "none"
   */
  capture?: "none" | "observe";

  /**
   * The tag of the writes of this storage (roadmap CLI-21). Each write of the storage to the local
   * copy and to the remote has it. Thus `capture` knows the writes of the storage, and the change
   * events of a server tell which writes came from this storage.
   * @default a new random tag: `hybrid-` and 8 characters
   */
  origin?: string;

  /**
   * The origin of the changes that the sync makes in the local copy, in the batches of `observe()`:
   * a pull, a delta of the feed, a fill after a read, a mode switch and the load of the queue.
   * @default "sync"
   */
  syncOrigin?: string;

  /**
   * The push feed of the remote changes, for example `EventsChangeFeed` (roadmap CLI-21, CLI-15).
   * The storage subscribes in the modes `write-through` and `write-back`.
   *
   * - A delta whose `since` is the cursor applies without a read of the remote.
   * - A delta of the version of the cursor changes nothing: a pull read it already.
   * - Another delta, a gap, a lost event or a new subscription makes the storage pull the changes
   *   since its cursor. Many requests while a pull waits make one pull.
   * - A delta that comes during a pull applies after the pull, so the pull does not erase it.
   * - A hint without values (the default of the change events) makes a pull: the values come
   *   through the checks of a read. A hint with only deletes applies without a read.
   * - The deltas, the hints, the pulls, the pushes and the mode switches run one at a time. A
   *   remote delta and a full sync never run at the same time.
   */
  feed?: RemoteChangeFeed<any>;

  /**
   * The hook around each apply of the remote changes (graph W8), for example a span of a trace.
   * `RemoteApplyHook` gives the arguments.
   *
   * - The hook wraps the apply of each delta of the feed, each hint of the feed that applies, and
   *   each pull that the feed or a pull of the storage causes.
   * - A pull of the storage is the timer of `pullInterval`, `syncFromRemote()`, `sync()` and the
   *   first sync. The hint of a pull is undefined.
   * - A pull that many hints asked for runs one time. Its hint is the last hint, and
   *   `context.hints` has the last 128 of them.
   * - The hook runs inside the chain of the syncs, so it measures the apply, not the wait.
   * - The sync of a mode switch, the reads of the remote and the new reads of the values that an
   *   own write deferred are not in the hook.
   * - An error of `apply` or of the hook makes the pull fail, and the status keeps it. The next
   *   pull that succeeds clears it.
   * - Only the leader of a `TabCoordinator` or of a `TabGroup` makes a `HybridStorage`, so only
   *   the leader runs the hook.
   * - Without the hook, the applies run as before, with the same timing and no other allocation.
   */
  aroundRemoteApply?: RemoteApplyHook | undefined;

  /**
   * The store of the sync state: the cursor and the base versions (roadmap CLI-21). A new storage
   * with the same store asks the remote only for the changes since the cursor, and it finds the
   * conflicts of the base versions. `IndexedDbSyncStateStore` of `@procedures/store/indexeddb`
   * keeps the state in a browser.
   *
   * The state belongs to the local copy. The storage uses a loaded cursor only with the option
   * `local` and a local copy that has items. Give it with a durable local copy.
   */
  syncState?: SyncStateStore;

  /**
   * With `versionOf` or a `feed`: the time that the storage keeps the mark of an own write for its
   * echo (roadmap CLI-21). The mark is the version, or else the JSON of the value. While a newer own
   * write of an id waits for its echo, a remote change with the mark of an older own write is stale,
   * and the storage does not apply it. A local delete is a tombstone: an older echo does not bring
   * the item back. The time starts again when the write goes to the remote.
   * @default 30 seconds
   */
  echoWindow?: Duration;

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

  /**
   * The query policy of `query()` for a call without a policy. The storage gives it to the local
   * copy, or to the remote in `remote-only` mode. The procedure `find` gives the policy of its host.
   * @default DEFAULT_QUERY_POLICY: no `$regex`
   */
  queryPolicy?: StorageQueryPolicy;
}

/**
 * The cause of an apply of the remote changes (graph W8).
 *
 * - `"delta"`: a delta of the feed.
 * - `"hint"`: one or more hints of the feed.
 * - `"gap"`: a gap of the feed: a lost event, an event of another form, or a new subscription.
 * - `"pull"`: a pull of the storage: the timer, `syncFromRemote()`, `sync()` or the first sync.
 */
export type RemoteApplyCause = "delta" | "hint" | "gap" | "pull";

/** The context of an apply of the remote changes, the third argument of `aroundRemoteApply` (graph W8). */
export interface RemoteApplyContext {
  /** The cause of the apply. A pull that hints and gaps asked for has the cause `"hint"`. */
  readonly cause: RemoteApplyCause;
  /**
   * The hints of the apply, in their order of arrival. A delta gives one hint with its ids and no
   * values. A gap and a pull of the storage give no hint. A pull keeps the last 128 hints.
   */
  readonly hints: readonly RemoteChangeHint[];
}

/**
 * The hook around an apply of the remote changes (graph W8). The hook calls `apply` one time and
 * gives its promise back, for example from inside a span of a trace.
 *
 * - The storage waits for the hook and for the apply. A hook that does not settle stops the syncs.
 * - The changes apply one time. A second call of `apply` gets the promise of the first call.
 * - When the hook does not call `apply`, the storage applies the changes after the hook. Thus a
 *   hook that fails does not stop the sync.
 * - The sync fails with the error of `apply` first. A hook cannot hide or change it.
 * - Then the sync fails with the error of the hook, and then with `RemoteApplyHookError` when the
 *   hook did not call `apply` one time.
 * - The status of the storage keeps the error of the sync, with the operation `"pull"`.
 *
 * @param hint - The last hint of `context.hints`, or undefined when the apply has no hint
 * @param apply - The function that reads the changes and applies them to the local copy
 * @param context - The cause of the apply and its hints
 *
 * @example
 * ```typescript
 * aroundRemoteApply: (hint, apply) => {
 *   const traceparent = hint?.extra?.["traceparent"];
 *   return runInRemoteTrace(typeof traceparent === "string" ? traceparent : undefined, apply, { name: "realtime.echo" });
 * },
 * ```
 */
export type RemoteApplyHook = (hint: RemoteChangeHint | undefined, apply: () => Promise<void>, context: RemoteApplyContext) => Promise<unknown>;

/** The hints of an apply without hints. */
const NO_HINTS: readonly RemoteChangeHint[] = Object.freeze([]);

/** The most hints that a pull keeps for the hook. A pull drops the older ones. */
const MAX_JOINED_HINTS = 128;

/** The hint of a delta of the feed: its versions, its ids, its origin and its other fields, without the values (graph W8). */
function hintOfDelta<T>(changes: RemoteChanges<T>): RemoteChangeHint {
  return {
    ...(changes.since !== undefined && { since: changes.since }),
    ...(changes.version !== undefined && { version: changes.version }),
    changed: changes.changed.map(([id]) => id),
    deleted: [...changes.deleted],
    ...(changes.origin !== undefined && { origin: changes.origin }),
    ...(changes.versions !== undefined && { versions: changes.versions }),
    ...(changes.extra !== undefined && { extra: changes.extra }),
  };
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

/**
 * The sync state store failed (roadmap CLI-21). The storage goes on: after a failed load, the first
 * pull reads all items, and after a failed write, the next write gives the whole state.
 */
export class SyncStateError extends Error {
  override readonly name = "SyncStateError";
  readonly code = "SYNC_STATE";
  constructor(action: "load" | "write", cause: unknown) {
    super(`The sync state store could not ${action === "load" ? "load the state" : "keep the state"}`, { cause });
  }
}

/**
 * The hook `aroundRemoteApply` did not call `apply` one time (graph W8). The storage applied the
 * changes one time all the same, and the apply succeeded. `calls` is the number of calls of
 * `apply` before the hook settled.
 */
export class RemoteApplyHookError extends Error {
  override readonly name = "RemoteApplyHookError";
  readonly code = "REMOTE_APPLY_HOOK";
  constructor(readonly calls: number) {
    super(`The hook aroundRemoteApply called apply ${calls} times, not 1 time: the storage applied the changes 1 time`);
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

/** The data of a queued operation of each type. */
type OperationData<T> = { id: string; value: T; ids: string[]; items: Array<[string, T]> };

/** True when two values have the same JSON. A value without JSON is never the same. */
function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** A change with an origin, when there is one. */
function withOrigin<T>(change: StorageChangeEvent<T>, origin: string | undefined): StorageChangeEvent<T> {
  return origin === undefined ? change : { ...change, origin };
}

/** A `set` change with a copy of the value: an observer cannot change the stored item. */
function setChange<T>(id: string, value: T, origin: string | undefined): StorageChangeEvent<T> {
  return withOrigin<T>({ type: "set", id, value: structuredClone(value) }, origin);
}

/**
 * The queued operations of a batch of changes of the local copy (roadmap CLI-21). The sets in a
 * row go in one operation, and the deletes in a row too. Each value is a copy.
 */
function operationsOf<T>(changes: readonly StorageChangeEvent<T>[]): QueuedOperation[] {
  const ops: QueuedOperation[] = [];
  const timestamp = Date.now();
  let sets: Array<[string, T]> = [];
  let deletes: string[] = [];
  const flush = (): void => {
    if (sets.length === 1) ops.push({ type: "set", data: { id: sets[0]![0], value: sets[0]![1] }, timestamp });
    else if (sets.length > 1) ops.push({ type: "setBatch", data: { items: sets }, timestamp });
    if (deletes.length === 1) ops.push({ type: "delete", data: { id: deletes[0] }, timestamp });
    else if (deletes.length > 1) ops.push({ type: "deleteBatch", data: { ids: deletes }, timestamp });
    sets = [];
    deletes = [];
  };
  for (const change of changes) {
    if (change.type === "set") {
      if (deletes.length > 0) flush();
      sets.push([change.id, structuredClone(change.value)]);
    } else if (change.type === "delete") {
      if (sets.length > 0) flush();
      deletes.push(change.id);
    } else {
      flush();
      ops.push({ type: "clear", data: {}, timestamp });
    }
  }
  flush();
  return ops;
}

/**
 * The batch of a write of the `remote-only` mode. A delete gives a change only for an id that
 * existed: `existing` has the ids of a `deleteBatch`, or tells if a `clear` found items.
 */
function remoteChangesOf<T>(op: QueuedOperation, result: unknown, existing: ReadonlySet<string> | boolean | undefined, origin: string | undefined): StorageChangeEvent<T>[] {
  const data = op.data as OperationData<T>;
  switch (op.type) {
    case "set":
      return [setChange(data.id, data.value, origin)];
    case "setBatch":
      return data.items.map(([id, value]) => setChange(id, value, origin));
    case "delete":
      return result === true ? [withOrigin<T>({ type: "delete", id: data.id }, origin)] : [];
    case "deleteBatch":
      return [...new Set(data.ids)].filter((id) => existing instanceof Set && existing.has(id)).map((id) => withOrigin<T>({ type: "delete", id }, origin));
    case "clear":
      return existing === true ? [withOrigin<T>({ type: "clear" }, origin)] : [];
  }
}

/** One version of an own write in the echo ledger. */
interface EchoEntry {
  /** The version that the write gives, or `null` for a delete */
  readonly version: string | null;
  /** The time of the write, or of its send to the remote */
  at: number;
}

/**
 * The versions of the own writes of a `HybridStorage` that no remote change echoed yet (roadmap
 * CLI-21, after the EchoLedger of Graph).
 *
 * - The ledger keeps the versions of each id in the order of the writes. It records a write when
 *   the local copy takes it, because a stale echo can come before the push.
 * - A remote change with a version of the ledger is an echo: that version and each older version
 *   leave the ledger. When a newer version stays, the echo is stale: the newer echo comes later.
 * - A remote change with another version is a write of another writer.
 * - A version expires `window` milliseconds after its write, or after its send to the remote. Thus
 *   a write whose echo never comes does not hold an id long.
 */
class EchoLedger {
  /** The versions of each id, the oldest first. The ids are in the order of their last write. */
  private readonly entries = new Map<string, EchoEntry[]>();

  constructor(
    private readonly window: number,
    private readonly now: () => number,
    private readonly maxPerId = 20,
    private readonly maxIds = 10_000,
  ) {}

  /** This method records the version that an own write of an id gives. `null`: a delete. */
  wrote(id: string, version: string | null): void {
    const now = this.now();
    const list = this.live(id, now);
    list.push({ version, at: now });
    if (list.length > this.maxPerId) list.shift();
    // The id moves to the end: the ids stay in the order of their last write
    this.entries.delete(id);
    this.entries.set(id, list);
    this.prune(now);
  }

  /** This method records a delete of each id of the ledger: an own clear. */
  cleared(): void {
    for (const id of [...this.entries.keys()]) this.wrote(id, null);
  }

  /** This method starts the time of the versions of an id again: its write goes to the remote. */
  sent(id: string): void {
    const list = this.entries.get(id);
    if (!list) return;
    const now = this.now();
    for (const entry of list) entry.at = now;
    this.entries.delete(id);
    this.entries.set(id, list);
  }

  /**
   * True when a remote version of an id is a stale echo: a version of the ledger, with a newer
   * version after it. The echo takes its version and each older version out of the ledger.
   */
  isStale(id: string, version: string | null): boolean {
    const list = this.live(id, this.now());
    const at = list.findIndex((entry) => entry.version === version);
    if (at < 0) return false;
    list.splice(0, at + 1);
    if (list.length > 0) return true;
    this.entries.delete(id);
    return false;
  }

  /** The versions of an id that did not expire. */
  private live(id: string, now: number): EchoEntry[] {
    const list = this.entries.get(id);
    if (!list) return [];
    const kept = list.filter((entry) => now - entry.at < this.window);
    if (kept.length === 0) this.entries.delete(id);
    else this.entries.set(id, kept);
    return kept;
  }

  /** This method drops the ids whose versions expired, and the oldest ids above the limit. */
  private prune(now: number): void {
    for (const [id, list] of this.entries) {
      if (this.entries.size <= this.maxIds && now - list[list.length - 1]!.at < this.window) break;
      this.entries.delete(id);
    }
  }
}

/**
 * The base versions of a `HybridStorage`: a map that keeps the ids that changed since the last
 * write of the sync state (roadmap CLI-21). Without a sync state store, it keeps no ids.
 */
class BaseVersions extends Map<string, string | null> {
  /** The ids that changed since the last write of the sync state */
  readonly changed = new Set<string>();
  /** True when the storage has a sync state store */
  tracked = false;

  override set(id: string, version: string | null): this {
    super.set(id, version);
    if (this.tracked) this.changed.add(id);
    return this;
  }

  override delete(id: string): boolean {
    const had = super.delete(id);
    if (had && this.tracked) this.changed.add(id);
    return had;
  }
}

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
    sendBaseVersions: boolean;
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
  /** The query policy of a call without a policy */
  private readonly queryPolicy: StorageQueryPolicy | undefined;
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
  private readonly bases = new BaseVersions();
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
  /** The observers of `observe()` */
  private readonly observers: StorageListeners<StorageChangeBatch<T>>;
  /** The tag of the writes of this storage, and the write options that give it */
  private readonly origin: string;
  private readonly own: StorageWriteOptions;
  /** The origin of the changes that the sync makes in the local copy */
  private readonly syncOrigin: string;
  /** The push feed, the stop of its subscription, and the number of the subscription */
  private readonly feed: RemoteChangeFeed<T> | undefined;
  private feedStop: (() => void) | undefined;
  private feedToken = 0;
  /** The hook around each apply of the remote changes (graph W8) */
  private readonly aroundRemoteApply: RemoteApplyHook | undefined;
  /** With the hook: the hints that asked for the pull that waits */
  private readonly joinedHints: RemoteChangeHint[] = [];
  /** True while a pull that a gap asked for waits to start */
  private gapPull = false;
  /** True when the pull that waits must read the remote in full: a hint with `reset` asked for it. */
  private resetPull = false;
  /** The stop of the capture of the local copy */
  private readonly stopCapture: (() => void) | undefined;
  /** The captured changes that came before the end of the load. Undefined after the load. */
  private captured: StorageChangeEvent<T>[] | undefined = [];
  /** With `versionOf`: the versions of the own writes that wait for their echo */
  private readonly echoes: EchoLedger | undefined;
  /** The store of the sync state, and the state of its writes */
  private readonly stateStore: SyncStateStore | undefined;
  private stateReset = true;
  private savedCursor: string | undefined;
  private stateSaving: Promise<void> | undefined;
  private stateAgain = false;
  /** True when the application gave the local copy */
  private readonly localGiven: boolean;
  /**
   * The own writes of the `write-through` mode that wait for the remote, for each id: their number
   * and the newest value (`undefined` for a delete). A pull does not write over these ids.
   */
  private readonly inFlight = new Map<string, { count: number; value: T | undefined }>();
  /** The number of own clears that wait for the remote: each id waits */
  private inFlightClears = 0;
  /** The remote values that a pull did not apply because an own write of the id waited: `undefined` for a delete */
  private readonly deferred = new Map<string, { readonly item: T | undefined }>();
  /** The number of the last local write, of the last write of each id, and of the last clear */
  private writeSeq = 0;
  private readonly lastWrite = new Map<string, number>();
  private lastClear = 0;
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
    // The local copy tests the preconditions of the callers (roadmap CLI-16): it gets `versionOf`
    this.local =
      (options.local as LocalCopyStorage<T> | undefined) ??
      new InMemoryStorage<T>(options.versionOf !== undefined ? { versionOf: options.versionOf as (item: T) => string | undefined } : {});
    this.remote = remote;
    this.queueStore = options.queueStore ?? new MemoryQueueStore();
    this.mode = checkMode(options.mode ?? options.writeStrategy ?? "write-through");
    this.options = {
      conflictResolution: options.conflictResolution ?? "remote",
      ...(options.mergeFn !== undefined && { mergeFn: options.mergeFn }),
      keyOf: options.keyOf ?? defaultKeyOf,
      ...(options.versionOf !== undefined && { versionOf: options.versionOf }),
      sendBaseVersions: options.sendBaseVersions ?? true,
      syncInterval: optionalMs(options.syncInterval, "syncInterval") ?? 5000,
      pullInterval: optionalMs(options.pullInterval, "pullInterval") ?? 0,
      syncOnInit: options.syncOnInit ?? true,
      maxOfflineOps: options.maxOfflineOps ?? 1000,
      offlineQueue: options.offlineQueue ?? true,
      isUnavailable: options.isUnavailable ?? defaultIsUnavailable,
    };
    this.statusListeners = new StorageListeners<SyncStatus>(options.onListenerError);
    this.queryPolicy = options.queryPolicy;
    this.origin = options.origin ?? `hybrid-${Math.random().toString(36).slice(2, 10)}`;
    this.own = { origin: this.origin };
    this.syncOrigin = options.syncOrigin ?? "sync";
    this.observers = new StorageListeners<StorageChangeBatch<T>>(options.onListenerError);
    this.feed = options.feed;
    if (options.aroundRemoteApply !== undefined && typeof options.aroundRemoteApply !== "function") {
      throw new TypeError("aroundRemoteApply must be a function");
    }
    this.aroundRemoteApply = options.aroundRemoteApply;
    this.stateStore = options.syncState;
    this.bases.tracked = this.stateStore !== undefined;
    this.localGiven = options.local !== undefined;

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

    // The echoes of the own writes: by version, or by the JSON of the value with a feed (roadmap CLI-21)
    this.echoes = this.options.versionOf || this.feed
      ? new EchoLedger(optionalMs(options.echoWindow, "echoWindow") ?? 30_000, () => timing.clock.now())
      : undefined;
    const capture: unknown = options.capture ?? "none";
    if (capture !== "none" && capture !== "observe") throw new TypeError(`Unknown capture ${JSON.stringify(capture)}: use none or observe`);
    if (capture === "observe") {
      if (!this.local.observe) throw new TypeError('capture: "observe" needs a local copy with observe()');
      // The capture starts before the load: a change of the application during the load waits for it
      this.stopCapture = this.local.observe((batch) => this.onLocalChanges(batch));
    } else {
      this.stopCapture = undefined;
    }

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

  //
  // ═══ The changes of the storage (roadmap CLI-21) ═══
  //

  /**
   * This method starts to send the changes of the storage to an observer. Each write that changes
   * the storage gives one batch, before the write resolves.
   *
   * - A write of this storage gives its batch with the origin of its options.
   * - A pull, a delta of the feed, a fill after a read and a mode switch give their changes with
   *   `syncOrigin`.
   * - With `capture: "observe"`, a write of the application to the local copy gives the batch of
   *   the local copy, with its origin.
   * - In `remote-only` mode, the batches tell the writes of this storage to the remote.
   *
   * @returns The function that stops the batches. A second use of it does nothing.
   * @throws Error after `close()`
   */
  observe(observer: StorageObserver<T>): () => void {
    if (this.closed) throw this.closedError();
    return this.observers.add(observer);
  }

  /** This method sends a batch to the observers. */
  private emit(changes: readonly StorageChangeEvent<T>[]): void {
    if (changes.length > 0 && this.observers.size > 0) this.observers.emit(changes);
  }

  /**
   * This method takes a batch of the local copy. The changes whose origin is not the origin of this
   * storage come from the application: the storage queues them, and its observers get them.
   */
  private onLocalChanges(batch: StorageChangeBatch<T>): void {
    if (this.closed) return;
    const foreign = batch.filter((change) => change.origin !== this.origin);
    if (foreign.length === 0) return;
    if (this.captured) this.captured.push(...foreign);
    else this.captureChanges(foreign);
    this.emit(foreign);
  }

  /**
   * This method queues the changes of the application to the local copy (roadmap CLI-21). The
   * operations go in the queue at once, in the order of the changes. The queue store keeps them
   * later. A failure of the store keeps them in memory, and the status shows it.
   */
  private captureChanges(changes: readonly StorageChangeEvent<T>[]): void {
    if (this.loadError || this.closed) return;
    for (const op of operationsOf(changes)) {
      this.noteCaptured(op);
      this.noteOwnWrite(op);
      this.attachBase(op);
      this.enqueueCaptured(op);
    }
    this.notify();
    if (this.mode === "write-through" || this.mode === "remote-only") {
      // A failed send waits for the timer of the queue
      void this.push().catch(() => this.scheduleDrain());
    }
  }

  /**
   * This method records a captured change as a local write: a sync that runs keeps its value, and
   * the version of the local item is known.
   */
  private noteCaptured(op: QueuedOperation): void {
    if (op.type === "clear") {
      this.bumpClear();
      this.localClears++;
      this.localVersions.clear();
      return;
    }
    const data = op.data as OperationData<T>;
    const sets = op.type === "set" ? [[data.id, data.value] as [string, T]] : op.type === "setBatch" ? data.items : [];
    const deletes = op.type === "delete" ? [data.id] : op.type === "deleteBatch" ? data.ids : [];
    for (const [id, value] of sets) {
      this.bump(id);
      // A local write of the storage that runs now makes the version unknown
      const version = this.localWrites.has(id) ? undefined : this.recordedVersion(value);
      this.localWrites.delete(id);
      if (version === undefined) this.localVersions.delete(id);
      else this.localVersions.set(id, version);
    }
    for (const id of deletes) {
      this.bump(id);
      this.localWrites.delete(id);
      this.localVersions.delete(id);
    }
  }

  /** This method puts a captured operation in the queue, and then in the queue store. */
  private enqueueCaptured(op: QueuedOperation): void {
    const index = this.replaceableIndex(op);
    if (index >= 0) {
      const previous = this.offlineOps[index]!;
      if (previous.base) op.base = previous.base;
      else delete op.base;
      this.offlineOps[index] = op;
    } else {
      this.offlineOps.push(op);
    }
    this.unpersisted.add(op);
    // The application made the change already: a failure of the store keeps the operation, and
    // the next write of the store gives the whole queue
    void this.persist(op, index < 0, () => undefined).catch(() => undefined);
  }

  /**
   * This method queues the changes that the application made during the load. The load wrote the
   * loaded queue to the local copy, so the changes go to the local copy again, in order.
   */
  private async flushCaptured(): Promise<void> {
    const changes: StorageChangeEvent<T>[] = [];
    while (this.captured && this.captured.length > 0 && !this.loadError) {
      const batch = this.captured.splice(0);
      changes.push(...batch);
      for (const op of operationsOf(batch)) await this.applyToLocal(op, this.syncOrigin);
    }
    this.captured = undefined;
    if (changes.length > 0) this.captureChanges(changes);
  }

  /**
   * The mark of a value in the echo ledger: its version with `versionOf`, or else its JSON. A
   * delete is `null` in the ledger: a tombstone, so an older echo does not bring the item back.
   */
  private echoPrint(value: T): string | undefined {
    if (this.options.versionOf) return this.recordedVersion(value);
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  /** This method records the versions of an own write, for its echo (roadmap CLI-21). */
  private noteOwnWrite(op: QueuedOperation): void {
    const echoes = this.echoes;
    if (!echoes) return;
    const data = op.data as OperationData<T>;
    const wrote = (id: string, value: T): void => {
      const print = this.echoPrint(value);
      if (print !== undefined) echoes.wrote(id, print);
    };
    switch (op.type) {
      case "set":
        wrote(data.id, data.value);
        break;
      case "setBatch":
        for (const [id, value] of data.items) wrote(id, value);
        break;
      case "delete":
        echoes.wrote(data.id, null);
        break;
      case "deleteBatch":
        for (const id of data.ids) echoes.wrote(id, null);
        break;
      case "clear":
        echoes.cleared();
        break;
    }
  }

  /** This method starts the echo time of the ids of an operation again: it goes to the remote. */
  private echoSent(op: QueuedOperation): void {
    if (!this.echoes) return;
    for (const id of idsOf(op)) if (id !== "*") this.echoes.sent(id);
  }

  //
  // ═══ The push feed (roadmap CLI-21, CLI-15) ═══
  //

  /** This method subscribes to the feed in the modes with a local copy and a remote, and stops it in the others. */
  private updateFeed(): void {
    const feed = this.feed;
    if (!feed) return;
    const wanted = !this.closed && (this.mode === "write-through" || this.mode === "write-back");
    if (wanted === (this.feedStop !== undefined)) return;
    const token = ++this.feedToken;
    if (!wanted) {
      const stop = this.feedStop!;
      this.feedStop = undefined;
      try {
        stop();
      } catch {
        // The subscription is gone
      }
      return;
    }
    const live = (): boolean => token === this.feedToken && !this.closed;
    try {
      const stop = feed.subscribe({
        onChanges: (changes) => {
          if (live()) this.onRemoteChanges(changes);
        },
        onHint: (hint) => {
          if (live()) this.onRemoteHint(hint);
        },
        onGap: () => {
          if (live()) this.requestPull(undefined);
        },
        onError: (error) => {
          if (live()) this.fail("pull", error);
        },
      });
      if (live()) this.feedStop = stop;
      else stop();
    } catch (error) {
      this.fail("pull", error);
    }
  }

  /**
   * This method takes a delta of the feed. The delta applies after the syncs that run, so a pull
   * that runs does not erase it. Each decision about it comes when it applies, at its turn in the
   * chain of the syncs, from the local state of that time: the queue, the own writes that wait,
   * the echo ledger and the versions. On arrival, the storage keeps only the count of the local
   * writes: a local write after the arrival is newer than the delta, and it keeps its value.
   */
  private onRemoteChanges(changes: RemoteChanges<T>): void {
    const mark = this.writeSeq;
    void this.loaded
      .then(() => this.serialize(() => this.track("pull", () => this.applyFeed(changes, mark))))
      .catch(() => undefined);
  }

  /**
   * This method applies a delta of the feed: without a read when its `since` is the cursor. A
   * delta of the version of the cursor changes nothing. Another delta is a gap: a pull.
   */
  private async applyFeed(changes: RemoteChanges<T>, mark: number): Promise<void> {
    if (this.loadError) throw this.loadError;
    if (this.closed || (this.mode !== "write-through" && this.mode !== "write-back")) return;
    if (changes.version === this.cursor) return;
    const follows = changes.since !== undefined && changes.since === this.cursor;
    const hook = this.aroundRemoteApply;
    if (hook) {
      const apply = follows ? () => this.applyChanges(changes, (id) => this.changedSince(mark, id)) : () => this.pullRemote(false);
      await this.hookedApply(hook, "delta", [hintOfDelta(changes)], apply);
    } else if (follows) {
      await this.applyChanges(changes, (id) => this.changedSince(mark, id));
    } else {
      await this.pullRemote(false);
    }
  }

  /**
   * This method takes a hint of the feed: the ids that changed, without their values (roadmap
   * CLI-15). The hint applies after the syncs that run, against the cursor and the local state of
   * that time, as a delta does.
   */
  private onRemoteHint(hint: RemoteChangeHint): void {
    const mark = this.writeSeq;
    void this.loaded
      .then(() => this.serialize(() => this.track("pull", () => this.applyHint(hint, mark))))
      .catch(() => undefined);
  }

  /**
   * This method applies a hint. A hint of the version of the cursor changes nothing. A hint whose
   * `since` is the cursor and that changed no value applies its deletes without a read. Each other
   * hint asks for a pull: the values come through the checks of a read of the remote, and the
   * hints that come while the pull waits join it.
   */
  private async applyHint(hint: RemoteChangeHint, mark: number): Promise<void> {
    if (this.loadError) throw this.loadError;
    if (this.closed || (this.mode !== "write-through" && this.mode !== "write-back")) return;
    // The remote cannot tell what changed: a full pull
    if (hint.reset === true) return this.requestPull(hint, true);
    if (hint.version !== undefined && hint.version === this.cursor) return;
    if (hint.since !== undefined && hint.since === this.cursor && hint.version !== undefined && hint.changed.length === 0) {
      const version = hint.version;
      const hook = this.aroundRemoteApply;
      if (hook) await this.hookedApply(hook, "hint", [hint], () => this.applyDeletes(version, hint.deleted, mark));
      else await this.applyDeletes(version, hint.deleted, mark);
      return;
    }
    this.requestPull(hint);
  }

  /** This method applies the deletes of a hint whose `since` is the cursor and that changed no value. */
  private applyDeletes(version: string, deleted: readonly string[], mark: number): Promise<void> {
    return this.applyChanges({ version, full: false, changed: [], deleted: [...deleted] }, (id) => this.changedSince(mark, id));
  }

  /**
   * This method asks for a pull after the syncs that run. A request while a pull waits joins it.
   * With `aroundRemoteApply`, the pull keeps the last hints of the requests for the hook.
   */
  private requestPull(hint: RemoteChangeHint | undefined, full = false): void {
    if (full) this.resetPull = true;
    if (hint !== undefined && this.aroundRemoteApply) {
      this.joinedHints.push(hint);
      if (this.joinedHints.length > MAX_JOINED_HINTS) this.joinedHints.shift();
    }
    if (this.gapPull) return;
    this.gapPull = true;
    void this.loaded
      .then(() =>
        this.serialize(() => {
          this.gapPull = false;
          const full = this.resetPull;
          this.resetPull = false;
          const hints = this.joinedHints.length > 0 ? this.joinedHints.splice(0) : NO_HINTS;
          if (this.closed) return Promise.resolve();
          return this.track("pull", async () => {
            if (this.loadError) throw this.loadError;
            if (this.mode === "write-through" || this.mode === "write-back") await this.pullThrough(hints.length > 0 ? "hint" : "gap", hints, full);
          });
        }),
      )
      .catch(() => undefined);
  }

  /**
   * This method pulls the changes since the cursor, through the hook `aroundRemoteApply` when the
   * options give it (graph W8). Without the hook, it is `pullRemote(false)`, with no other step.
   */
  private pullThrough(cause: RemoteApplyCause, hints: readonly RemoteChangeHint[], full = false): Promise<void> {
    const hook = this.aroundRemoteApply;
    return hook ? this.hookedApply(hook, cause, hints, () => this.pullRemote(full)) : this.pullRemote(full);
  }

  /**
   * This method runs an apply of the remote changes through the hook (graph W8).
   *
   * - The apply runs one time. A second call of `apply` gets the promise of the first call.
   * - When the hook does not call `apply`, the apply runs after the hook. Thus no change is lost.
   * - The error of the apply comes first, then the error of the hook, then the misuse of the hook.
   */
  private async hookedApply(hook: RemoteApplyHook, cause: RemoteApplyCause, hints: readonly RemoteChangeHint[], apply: () => Promise<void>): Promise<void> {
    let run: Promise<void> | undefined;
    let calls = 0;
    const once = (): Promise<void> => {
      calls++;
      if (run === undefined) {
        run = apply();
        // The method reads the result after the hook: this handler only stops a report of an unhandled rejection
        run.catch(() => undefined);
      }
      return run;
    };
    let failure: { readonly error: unknown } | undefined;
    try {
      await hook(hints.at(-1), once, { cause, hints });
    } catch (error) {
      failure = { error };
    }
    // The count of the hook. A call of apply after the hook settled gets the promise of the first call.
    const called = calls;
    // A hook that did not call apply: the storage applies the changes itself
    await (run ?? once());
    if (failure) throw failure.error;
    if (called !== 1) throw new RemoteApplyHookError(called);
  }

  //
  // ═══ The sync state (roadmap CLI-21) ═══
  //

  /** This method loads the sync state: the bases, and the cursor that the load then examines. */
  private async loadState(): Promise<string | undefined> {
    if (!this.stateStore) return undefined;
    try {
      const state: unknown = await this.stateStore.load();
      if (state === undefined) return undefined;
      if (!isSyncState(state)) throw new TypeError("The store gave a value that is not a sync state");
      for (const [id, version] of state.bases) this.bases.set(id, version);
      return state.cursor;
    } catch (error) {
      // The storage goes on without the state: the first pull reads all items
      this.fail("store", new SyncStateError("load", error));
      return undefined;
    }
  }

  /**
   * This method writes the changes of the sync state to its store: the cursor and the bases that
   * changed. The writes run one at a time, and a change during a write goes in the next write.
   */
  private saveState(): void {
    if (!this.stateStore || this.loadError) return;
    if (!this.stateReset && this.bases.changed.size === 0 && this.cursor === this.savedCursor) return;
    if (this.stateSaving) {
      this.stateAgain = true;
      return;
    }
    this.stateSaving = this.writeState().finally(() => {
      this.stateSaving = undefined;
      if (this.stateAgain) {
        this.stateAgain = false;
        this.saveState();
      }
    });
  }

  /** One write of the sync state. The first write, and the write after a failure, give the whole state. */
  private async writeState(): Promise<void> {
    const reset = this.stateReset;
    const ids = reset ? [...this.bases.keys()] : [...this.bases.changed];
    this.bases.changed.clear();
    this.stateReset = false;
    const cursor = this.cursor;
    const bases: Array<[string, string | null]> = [];
    const forgotten: string[] = [];
    for (const id of ids) {
      const version = this.bases.get(id);
      if (version === undefined) forgotten.push(id);
      else bases.push([id, version]);
    }
    try {
      await this.stateStore!.write({ reset, cursor, bases, forgotten: reset ? [] : forgotten });
      this.savedCursor = cursor;
      this.succeed("store");
    } catch (error) {
      this.stateReset = true;
      this.fail("store", new SyncStateError("write", error));
    }
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
      this.saveState();
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
    this.saveState();
  }

  /** This method drops the local copy. A read in flight does not fill it again. */
  private async dropLocal(): Promise<void> {
    this.bumpClear();
    this.cursor = undefined;
    await this.localClear(this.syncOrigin);
  }

  /** This method makes the local copy from the queue only, before a full sync. */
  private async rebuildLocal(): Promise<void> {
    await this.dropLocal();
    for (const op of this.offlineOps) await this.applyToLocal(op, this.syncOrigin);
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

    this.updateFeed();
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
      // A pending local delete means "no item": do not read it back from the remote. An own delete
      // that waits for the remote too (roadmap CLI-21).
      if (this.mode === "local-only" || this.hasPendingOp(id) || this.waitsForRemote(id)) {
        return undefined;
      }
      const version = this.writeKey(id);
      try {
        const remote = await this.remote.get(id);
        this.isOnline = true;
        if (this.writeKey(id) === version && !this.hasPendingOp(id) && !this.waitsForRemote(id)) {
          if (remote !== undefined) await this.localSet(id, remote, this.syncOrigin);
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
   * example `ApiStorage` on its server. Else this method runs `queryEntries()` on its entries. The
   * policy of the call, or of the options, goes to the storage under it.
   */
  async query(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    return this.run(true, async () => {
      const limits = policy ?? this.queryPolicy;
      const problems = [...selectorProblems(selector, limits), ...queryOptionsProblems(options, limits)];
      if (problems.length > 0) throw new TypeError(`The query is not correct: ${problems.join(". ")}`);
      if (this.mode === "remote-only") {
        return this.remoteRead(async () =>
          this.remote.query ? this.remote.query(selector, options, limits) : queryEntries(await this.remoteEntries(), selector, options, limits),
        );
      }
      return this.local.query ? this.local.query(selector, options, limits) : queryEntries(await this.local.getEntries(), selector, options, limits);
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
   * value does not change the local copy, the queue or the remote write. The origin of the options
   * goes to the batches of `observe()`. The local copy and the remote get the origin of the storage.
   *
   * An `expectedVersion` (roadmap CLI-16) is a precondition on the item as the storage reads it.
   * The local copy tests it (the default local copy needs `versionOf`). In `write-through` mode, the
   * remote write also gets it. In `remote-only` mode, only the remote tests it.
   */
  async set(id: string, written: T, options?: StorageItemWriteOptions): Promise<void> {
    const value = structuredClone(written);
    const origin = options?.origin;
    const expected = this.expectedOf(options);
    await this.write("set", { id, value }, [id], origin, async () => {
      this.bump(id);
      await this.localSet(id, value, origin, expected);
    }, () => this.remote.set(id, value, { ...this.own, ...expected }));
  }

  /** This method deletes an item. An `expectedVersion` is a precondition, as for `set`. */
  async delete(id: string, options?: StorageItemWriteOptions): Promise<boolean> {
    const origin = options?.origin;
    const expected = this.expectedOf(options);
    return this.write("delete", { id }, [id], origin, async () => {
      this.bump(id);
      return this.localDelete(id, origin, expected);
    }, () => this.remote.delete(id, { ...this.own, ...expected }));
  }

  /** The precondition of the caller: the field `expectedVersion`, or no field. */
  private expectedOf(options: StorageItemWriteOptions | undefined): { expectedVersion?: string | null } {
    return options?.expectedVersion === undefined ? {} : { expectedVersion: options.expectedVersion };
  }

  async clear(options?: StorageWriteOptions): Promise<void> {
    const origin = options?.origin;
    await this.write("clear", {}, "*", origin, async () => {
      this.bumpClear();
      await this.localClear(origin);
    }, () => this.remote.clear(this.own));
  }

  //
  // ═══ Bulk Operations ═══
  //

  /**
   * This method sets several items. The storage takes a copy of each value, as `set` does. The
   * `expectedVersions` are preconditions, as `expectedVersion` of `set` is.
   */
  async setBatch(written: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void> {
    const items = written.map(([id, value]): [string, T] => [id, structuredClone(value)]);
    const origin = options?.origin;
    const expected = options?.expectedVersions !== undefined && options.expectedVersions.length > 0 ? { expectedVersions: options.expectedVersions } : {};
    await this.write("setBatch", { items }, items.map(([id]) => id), origin, async () => {
      for (const [id] of items) this.bump(id);
      await this.localSetBatch(items, origin, expected);
    }, () => this.remote.setBatch(items, { ...this.own, ...expected }));
  }

  async deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number> {
    const origin = options?.origin;
    return this.write("deleteBatch", { ids }, ids, origin, async () => {
      for (const id of ids) this.bump(id);
      return this.localDeleteBatch(ids, origin);
    }, () => this.remote.deleteBatch(ids, this.own));
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
    origin: string | undefined,
    applyLocal: () => Promise<R>,
    applyRemote: () => Promise<R>,
  ): Promise<R> {
    return this.run(false, async () => {
      const op: QueuedOperation = { type, data, timestamp: Date.now() };

      if (this.mode === "remote-only") {
        const send = async (): Promise<R> => {
          await this.ensureStoreClean();
          // The observers get a delete only for an id that existed
          const existing = this.observers.size > 0 ? await this.remoteExisting(op) : undefined;
          const result = await applyRemote();
          this.noteRemoteWrite(op);
          if (this.observers.size > 0) this.emit(remoteChangesOf<T>(op, result, existing, origin));
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
        const undo = await this.snapshot(ids, origin);
        const result = await applyLocal();
        this.noteOwnWrite(op);
        await this.enqueue(op, undo);
        return result;
      }

      const undo = await this.snapshot(ids, origin);
      // Until the remote takes the write, or the queue or the undo replaces it, a pull does not
      // write over its local value (roadmap CLI-21)
      this.startFlight(op);
      try {
        const result = await applyLocal();
        this.noteOwnWrite(op);
        try {
          if (this.offlineOps.length > 0) {
            // The queued operations are older: they reach the remote first, or the older value of a
            // queued write replaces this one later. A failed send keeps this write behind them.
            await this.serialize(async () => {
              await this.pushQueue();
              await this.ensureStoreClean();
              this.echoSent(op);
              await applyRemote();
            });
          } else {
            await this.ensureStoreClean();
            this.echoSent(op);
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
      } finally {
        this.endFlight(op);
      }
    });
  }

  //
  // ═══ The own writes that wait for the remote (roadmap CLI-21) ═══
  //

  /** This method records an own write of the `write-through` mode that goes to the remote. */
  private startFlight(op: QueuedOperation): void {
    if (op.type === "clear") {
      this.inFlightClears++;
      return;
    }
    const data = op.data as OperationData<T>;
    const values: Array<[string, T | undefined]> =
      op.type === "set" ? [[data.id, data.value]] :
      op.type === "setBatch" ? data.items :
      op.type === "delete" ? [[data.id, undefined]] :
      data.ids.map((id): [string, undefined] => [id, undefined]);
    for (const [id, value] of values) {
      const flight = this.inFlight.get(id);
      if (flight) {
        flight.count++;
        flight.value = value;
      } else {
        this.inFlight.set(id, { count: 1, value });
      }
    }
  }

  /**
   * This method ends an own write that went to the remote: the remote took it, or the queue or the
   * undo replaced it. The deferred remote values of the ids that no own write waits for now go
   * through a new read of the remote, after the syncs that run.
   */
  private endFlight(op: QueuedOperation): void {
    if (op.type === "clear") {
      this.inFlightClears--;
    } else {
      for (const id of new Set(idsOf(op))) {
        const flight = this.inFlight.get(id);
        if (!flight) continue;
        if (--flight.count <= 0) this.inFlight.delete(id);
      }
    }
    const ready = [...this.deferred.keys()].filter((id) => !this.waitsForRemote(id));
    if (ready.length === 0) return;
    void this.serialize(() => this.track("pull", () => this.applyDeferred(ready))).catch(() => undefined);
  }

  /** True when an own write of the id waits for the remote. */
  private waitsForRemote(id: string): boolean {
    return this.inFlightClears > 0 || this.inFlight.has(id);
  }

  /**
   * True when a remote value of an id is the value of the newest own write that waits for the
   * remote: its echo. `undefined` is a delete. With `versionOf` the versions decide, else the JSON.
   */
  private isFlightValue(id: string, item: T | undefined): boolean {
    const flight = this.inFlight.get(id);
    const value = flight ? flight.value : undefined;
    if (item === undefined || value === undefined) return item === undefined && value === undefined;
    if (this.options.versionOf) {
      const version = this.recordedVersion(item);
      return version !== undefined && version === this.recordedVersion(value);
    }
    return JSON.stringify(item) === JSON.stringify(value);
  }

  /**
   * A pull keeps the local value of an id whose own write waits for the remote, and the storage
   * keeps the remote value for later. True when the pull defers the id. The echo of the write
   * itself is not deferred: it is the local value.
   */
  private deferIfInFlight(id: string, item: T | undefined): boolean {
    if (!this.waitsForRemote(id) || this.isFlightValue(id, item)) return false;
    this.deferred.set(id, { item });
    return true;
  }

  /**
   * This method applies the deferred remote values of ids whose own writes ended. The storage
   * reads each id from the remote again: the deferred value can be older than the write, or a
   * newer write of another writer. Then the rules of a pull decide. When the remote cannot answer,
   * the deferred value goes through the rules.
   */
  private async applyDeferred(ids: readonly string[]): Promise<void> {
    if (this.loadError) throw this.loadError;
    if (this.closed) return;
    const conflicts: string[] = [];
    let queueChanged = false;
    for (const id of ids) {
      const deferred = this.deferred.get(id);
      // A new own write of the id waits: its end applies the value
      if (!deferred || this.waitsForRemote(id)) continue;
      this.deferred.delete(id);
      const mark = this.writeSeq;
      let item = deferred.item;
      if (this.mode === "write-through" || this.mode === "write-back") {
        try {
          item = await this.remote.get(id);
          this.isOnline = true;
        } catch {
          // The deferred value is the newest value that the storage knows
          this.isOnline = false;
        }
      }
      const changedLocally = (other: string): boolean => this.changedSince(mark, other);
      const changed = item === undefined
        ? await this.pullDelete(id, changedLocally, conflicts)
        : await this.pullItem(id, item, changedLocally, conflicts);
      if (changed) queueChanged = true;
    }
    if (queueChanged) {
      this.storeDirty = true;
      await this.persistAll().catch(() => undefined);
    }
    if (conflicts.length > 0) throw new ConflictError(conflicts);
  }

  /**
   * The local values of the ids before a write, and a function that puts them back. It puts back
   * only the ids that no later write changed.
   */
  private async snapshot(ids: string[] | "*", origin: string | undefined): Promise<() => Promise<void>> {
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
        if (value === undefined) await this.localDelete(id, origin);
        else await this.localSet(id, value, origin);
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
   * This method resolves when the queue store holds the operations that the queue has at the call
   * (roadmap CLI-25): the loaded queue, the captured changes and the queued writes. It sends
   * nothing to the remote. A failed write of the store resolves it too, and the status keeps the
   * failure. A `TabCoordinator` acknowledges the batches of another tab after it.
   *
   * @throws The error of the load, when the storage could not load its queue
   */
  async whenQueued(): Promise<void> {
    await this.loaded;
    if (this.loadError) throw this.loadError;
    await this.storeChain;
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
        if (this.mode === "write-through" || this.mode === "write-back") await this.pullThrough("pull", NO_HINTS);
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
    this.updateFeed();
    this.stopCapture?.();

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
      // The last changes of the sync state reach its store
      this.saveState();
      while (this.stateSaving) await this.stateSaving;

      // Close remote storage (an ApiStorage leaves the caller's client open)
      try {
        await this.remote.close();
      } finally {
        await this.local.close();
      }
    } finally {
      this.statusListeners.clear();
      this.observers.clear();
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
      // A remote write or a read of the remote changes the bases
      this.saveState();
    }
  }

  /** A promise that resolves when no operation runs. */
  private idle(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  /** This method loads the queue, and puts its writes in the local copy. */
  private async loadQueue(): Promise<void> {
    // The sync state first: its bases are newer than the bases of the queued operations
    const cursor = await this.loadState();
    let ops: QueuedOperation[];
    try {
      ops = await this.queueStore.load();
    } catch (error) {
      // The storage refuses each operation. The status shows the failure.
      this.loadError = new QueueStoreError("load", error);
      this.fail("load", this.loadError);
      this.captured = undefined;
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
        await this.applyToLocal(op, this.syncOrigin);
      }
      // The cursor belongs to a durable local copy with items. Else the first pull reads all items.
      if (cursor !== undefined && this.localGiven && (await this.local.size()) > 0) this.cursor = cursor;
      await this.flushCaptured();
    } catch (error) {
      this.loadError = new Error("The local copy could not take the loaded queue: the storage refuses each operation", { cause: error });
      this.fail("load", this.loadError);
      this.captured = undefined;
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

  /** This method applies a queued operation to the local copy. The observers get the origin. */
  private async applyToLocal(op: QueuedOperation, origin: string | undefined): Promise<void> {
    const data = op.data as OperationData<T>;
    switch (op.type) {
      case "set":
        await this.localSet(data.id, data.value, origin);
        break;
      case "delete":
        await this.localDelete(data.id, origin);
        break;
      case "setBatch":
        await this.localSetBatch(data.items, origin);
        break;
      case "deleteBatch":
        await this.localDeleteBatch(data.ids, origin);
        break;
      case "clear":
        await this.localClear(origin);
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

  // The writes of the local copy have the origin of this storage, so the capture does not queue
  // them. The observers get each change with the origin of the caller.

  // A precondition of a caller goes to the local copy, which tests it and writes in one step
  // (roadmap CLI-16).

  private async localSet(id: string, value: T, origin: string | undefined, expected: { expectedVersion?: string | null } = {}): Promise<void> {
    await this.writeLocal(() => [[id, this.recordedVersion(value)]], () => this.local.set(id, value, { ...this.own, ...expected }));
    if (this.observers.size > 0) this.emit([setChange(id, value, origin)]);
  }

  private async localDelete(id: string, origin: string | undefined, expected: { expectedVersion?: string | null } = {}): Promise<boolean> {
    const existed = await this.writeLocal(() => [[id, undefined]], () => this.local.delete(id, { ...this.own, ...expected }));
    if (existed) this.emit([withOrigin<T>({ type: "delete", id }, origin)]);
    return existed;
  }

  private async localSetBatch(items: Array<[string, T]>, origin: string | undefined, expected: StorageBatchWriteOptions = {}): Promise<void> {
    await this.writeLocal(() => items.map(([id, value]) => [id, this.recordedVersion(value)]), () => this.local.setBatch(items, { ...this.own, ...expected }));
    if (this.observers.size > 0) this.emit(items.map(([id, value]) => setChange(id, value, origin)));
  }

  private async localDeleteBatch(ids: string[], origin: string | undefined): Promise<number> {
    // The observers get a delete for each id that existed
    const before = this.observers.size > 0 ? await this.local.getBatch(ids) : undefined;
    const count = await this.writeLocal(() => ids.map((id): [string, undefined] => [id, undefined]), () => this.local.deleteBatch(ids, this.own));
    if (before && count > 0) this.emit([...new Set(ids)].filter((id) => before.has(id)).map((id) => withOrigin<T>({ type: "delete", id }, origin)));
    return count;
  }

  private localClear(origin: string | undefined): Promise<void> {
    this.localClears++;
    this.localVersions.clear();
    if (this.observers.size === 0) return this.local.clear(this.own);
    return this.observedClear(origin);
  }

  /** A clear of the local copy with observers: they get the change when the copy had items. */
  private async observedClear(origin: string | undefined): Promise<void> {
    const had = (await this.local.size()) > 0;
    await this.local.clear(this.own);
    if (had) this.emit([withOrigin<T>({ type: "clear" }, origin)]);
  }

  /** The ids that a delete of the `remote-only` mode finds, for its batch. */
  private async remoteExisting(op: QueuedOperation): Promise<ReadonlySet<string> | boolean | undefined> {
    if (op.type === "deleteBatch") {
      const ids = [...new Set((op.data as OperationData<T>).ids)];
      return new Set((await this.remote.getBatch(ids)).keys());
    }
    if (op.type === "clear") return (await this.remote.size()) > 0;
    return undefined;
  }

  /**
   * One pull. `full`: ask for all items (after the local copy was dropped).
   *
   * - The versions of the local writes at the start: a write during the pull keeps its value.
   * - The cursor moves only after a pull without conflicts, so a conflict of the "error" policy
   *   comes again at the next pull.
   */
  private async pullRemote(full: boolean): Promise<void> {
    // A local write after this mark keeps its value: the remote value is older
    const mark = this.writeSeq;

    let changes: PulledChanges<T>;
    try {
      changes = await this.fetchChanges(full);
    } catch (error) {
      if (!(error instanceof MissingKeysError)) this.isOnline = false;
      throw error;
    }
    await this.applyChanges(changes, (id) => this.changedSince(mark, id));
  }

  /**
   * This method applies remote changes to the local copy: the changes of a pull, or a delta of
   * the feed. `changedLocally` tells the ids that a local write changed after the changes left the
   * remote: they keep their local values. The cursor moves only without conflicts.
   */
  private async applyChanges(changes: PulledChanges<T>, changedLocally: (id: string) => boolean): Promise<void> {
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
    // The echo of an older own write: a newer own write of the id, or its delete (a tombstone),
    // waits for its echo (roadmap CLI-21)
    const print = this.echoes ? this.echoPrint(item) : undefined;
    if (print !== undefined && this.echoes?.isStale(id, print)) return false;
    // An own write of the id waits for the remote: the remote value can be older (roadmap CLI-21)
    if (this.deferIfInFlight(id, item)) return false;
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
      if (knownVersion !== remoteVersion) await this.localSet(id, item, this.syncOrigin);
      this.bases.set(id, remoteVersion!);
      return false;
    }

    const localItem = await this.readLocal(id);
    if (changedLocally(id)) return false;
    const localVersion = localItem === undefined ? undefined : this.versionOfItem(localItem);
    if (localItem === undefined) {
      await this.localSet(id, item, this.syncOrigin);
    } else if (remoteVersion !== undefined && localVersion !== undefined) {
      // Only the remote changed: it is not a conflict
      if (localVersion !== remoteVersion) await this.localSet(id, item, this.syncOrigin);
    } else if (JSON.stringify(localItem) !== JSON.stringify(item)) {
      // Conflict - resolve according to strategy
      if (this.options.conflictResolution === "error") {
        this.stats.conflicts++;
        conflicts.push(id);
        return false;
      }
      const resolved = this.resolveConflict(localItem, item);
      await this.localSet(id, resolved, this.syncOrigin);
      this.stats.conflicts++;
    }
    if (remoteVersion !== undefined) this.bases.set(id, remoteVersion);
    return false;
  }

  /** This method applies one remote delete. It gives true when the queue changed. */
  private async pullDelete(id: string, changedLocally: (id: string) => boolean, conflicts: string[]): Promise<boolean> {
    if (changedLocally(id)) return false;
    // The echo of an older own delete: a newer own write of the id waits for its echo (roadmap CLI-21)
    if (this.echoes?.isStale(id, null)) return false;
    // An own write of the id waits for the remote: the remote delete can be older (roadmap CLI-21)
    if (this.deferIfInFlight(id, undefined)) return false;
    if (!this.hasPendingOp(id)) {
      await this.localDelete(id, this.syncOrigin);
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
        await this.localDelete(id, this.syncOrigin);
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
        await this.localSet(id, remoteItem, this.syncOrigin);
        this.bases.set(id, remoteVersion);
        return true;
      case "merge": {
        if (localItem === undefined) break;
        const merged = this.resolveConflict(localItem, remoteItem);
        if (!this.dropQueued(id)) break;
        await this.localSet(id, merged, this.syncOrigin);
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
    // The operations whose conflicts this push resolved once (roadmap CLI-16)
    const resolved = new Set<QueuedOperation>();
    try {
      while (this.offlineOps.length > 0) {
        const op = this.offlineOps[0]!;
        if (this.unpersisted.has(op)) {
          // The write of this operation waits for the queue store
          await this.storeChain;
          continue;
        }
        try {
          this.echoSent(op);
          await this.executeOperation(op);
        } catch (error) {
          // The remote refused a base version: the conflict policy decides, then the push goes on
          const conflicts = this.sendsBaseVersions() ? versionConflictsOf(error) : undefined;
          if (conflicts !== undefined && conflicts.length > 0 && !resolved.has(op)) {
            resolved.add(op);
            this.isOnline = true;
            await this.resolvePushConflicts(op, conflicts);
            continue;
          }
          // This operation and the later ones stay queued
          if (conflicts === undefined) this.isOnline = false;
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
    this.lastWrite.set(id, ++this.writeSeq);
  }

  /** A local clear: each id changed. */
  private bumpClear(): void {
    this.clearVersion++;
    this.lastClear = ++this.writeSeq;
  }

  /** True when a local write changed the id after the mark, a value of `writeSeq`. */
  private changedSince(mark: number, id: string): boolean {
    return this.lastClear > mark || (this.lastWrite.get(id) ?? 0) > mark;
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
        await this.remote.set(data.id, data.value, this.withBase(data.id));
        break;

      case "delete":
        await this.remote.delete(data.id, this.withBase(data.id));
        break;

      case "setBatch":
        await this.remote.setBatch(data.items, this.withBases(data.items));
        break;

      case "deleteBatch":
        await this.remote.deleteBatch(data.ids, this.own);
        break;

      case "clear":
        await this.remote.clear(this.own);
        break;
    }
  }

  //
  // ═══ The base versions as preconditions (roadmap CLI-16) ═══
  //

  /** True when a push sends the base versions of its operations as expected versions. */
  private sendsBaseVersions(): boolean {
    return this.options.sendBaseVersions && this.options.versionOf !== undefined;
  }

  /**
   * The options of the push of a set or a delete of one id: the base version of the id as its
   * expected version. The first queued operation of an id changes the remote version in `bases`.
   * An id without a known base version gets no precondition: the queued write wins, as before.
   */
  private withBase(id: string): StorageItemWriteOptions {
    if (!this.sendsBaseVersions()) return this.own;
    const base = this.bases.get(id);
    return base === undefined ? this.own : { ...this.own, expectedVersion: base };
  }

  /** The options of the push of a batch: the base version of each id that has one. */
  private withBases(items: Array<[string, T]>): StorageBatchWriteOptions {
    if (!this.sendsBaseVersions()) return this.own;
    const expectedVersions: Array<[string, string | null]> = [];
    for (const id of new Set(items.map(([id]) => id))) {
      const base = this.bases.get(id);
      if (base !== undefined) expectedVersions.push([id, base]);
    }
    return expectedVersions.length === 0 ? this.own : { ...this.own, expectedVersions };
  }

  /**
   * The value that a queued operation writes for an id: the value of the last item of the id, or
   * `null` for a delete. Undefined when the operation does not write the id.
   */
  private writtenValue(op: QueuedOperation, id: string): { value: T } | null | undefined {
    const data = op.data as OperationData<T>;
    switch (op.type) {
      case "set":
        return data.id === id ? { value: data.value } : undefined;
      case "setBatch": {
        const item = data.items.findLast(([itemId]) => itemId === id);
        return item ? { value: item[1] } : undefined;
      }
      case "delete":
        return data.id === id ? null : undefined;
      default:
        return undefined;
    }
  }

  /**
   * This method applies the conflicts of a push that the remote refused (`VERSION_CONFLICT`). Each
   * conflict goes to `conflictResolution`, as a conflict of a pull does:
   *
   * - The remote item is the value of the operation itself: an earlier send of it reached the
   *   remote, and its answer was lost. The base becomes the current version, and the push sends
   *   the operation again.
   * - `remote`: the remote item replaces the local item, and the queued writes of the id go.
   * - `merge`: the merged item replaces the local item, and a new queued write sends it.
   * - `local`: the base becomes the current version, so the next send replaces the remote item.
   * - `error`: the queue keeps the operation, and the push throws `ConflictError` with the ids.
   */
  private async resolvePushConflicts(op: QueuedOperation, conflicts: readonly VersionConflict[]): Promise<void> {
    const ids: string[] = [];
    let queueChanged = false;
    for (const conflict of conflicts) {
      const { id } = conflict;
      const written = this.writtenValue(op, id);
      if (written === undefined) continue;
      if (conflict.found) {
        const remoteItem = conflict.value as T;
        const remoteVersion = conflict.version ?? this.versionOfItem(remoteItem);
        // The echo of this operation, or a remote item without a version: the queued write wins
        if (remoteVersion === undefined || (written !== null && sameJson(written.value, remoteItem))) {
          if (remoteVersion === undefined) this.bases.delete(id);
          else this.bases.set(id, remoteVersion);
          continue;
        }
        const localItem = await this.readLocal(id);
        if (await this.resolvePending(id, localItem, remoteItem, remoteVersion, ids)) queueChanged = true;
        continue;
      }
      // The remote has no item: the echo of a delete, or a delete of another writer
      if (written === null) {
        this.bases.set(id, null);
        continue;
      }
      if (await this.resolveRemoteDelete(id, ids)) queueChanged = true;
    }
    if (queueChanged) {
      this.storeDirty = true;
      // The status gets the failure of the queue store. A later direct write repairs the store first.
      await this.persistAll().catch(() => undefined);
    }
    if (ids.length > 0) throw new ConflictError(ids);
  }

  /**
   * A queued write of an id that the remote deleted: a conflict, and the policy decides, as for
   * a delete of a pull. True when the queue changed.
   */
  private async resolveRemoteDelete(id: string, conflicts: string[]): Promise<boolean> {
    this.stats.conflicts++;
    switch (this.options.conflictResolution) {
      case "remote":
        if (!this.dropQueued(id)) break;
        await this.localDelete(id, this.syncOrigin);
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
