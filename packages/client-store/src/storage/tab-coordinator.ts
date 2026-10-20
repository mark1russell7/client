/**
 * The coordinator of the tabs of a browser (roadmap CLI-25, server stack D9).
 *
 * Each tab of a page has a local copy of a collection. Without a coordinator, each tab runs its own
 * `HybridStorage`: each tab pulls, each tab pushes, and the tabs share one queue store. A
 * `TabCoordinator` lets one leader tab run the sync, and the other tabs copy its changes.
 *
 * - The election uses the Web Locks API: the tab that holds the lock of the coordinator is the
 *   leader. When the leader closes, or the browser closes its tab, the lock goes to the next tab.
 * - Only the leader makes a `HybridStorage`, with `capture: "observe"` on the local copy. The
 *   followers make no remote call, and they run no timer of a sync.
 * - The tabs send the change batches of their local copies on a `BroadcastChannel`. A tab gives the
 *   batches of the other tabs to its observers, with their origins.
 * - The leader captures the batches of the followers: its `HybridStorage` queues them and pushes
 *   them. Only the leader writes to the queue store, so the tabs can share it by its name.
 * - A follower keeps each own batch until the leader acknowledges it. The leader acknowledges a
 *   batch when its queue store holds it. A new leader gets the batches that no leader
 *   acknowledged.
 * - Without the Web Locks API or `BroadcastChannel`, the coordinator is in the single mode: the tab
 *   is the leader at once, and it opens no channel.
 * - A tab becomes the leader only after its `HybridStorage` loaded the queue. When the setup fails
 *   (the function `remote` throws, or the load of the queue fails), the tab reports the error and
 *   releases the lock. It stays a follower, and it asks for the lock again after a backoff (roadmap
 *   CLI-67). Thus a failure that goes away does not leave the browser without a sync.
 * - The leader sends the status of its sync to the followers: at each change, and in answer to a
 *   hello. `getStatus()` and `onStatus()` give the status in each tab (roadmap CLI-65).
 *
 * The limits:
 * - When the leader stops during a push, the next leader sends the operation again: the delivery to
 *   the remote is at least once.
 * - With a shared local copy, a pull of the leader can come between the write of a follower and its
 *   capture. The tabs agree again after the push and the next pull.
 * - The load of the queue in a new leader writes the queued operations to the local copy again, and
 *   the observers get them again with the origin `syncOrigin`.
 *
 * Nothing in this module reads a global value when it loads: Node can import it. The coordinator
 * reads `navigator.locks` and `BroadcastChannel` when it starts, and a test gives its own.
 */

import type {
  CollectionStorage,
  StorageChangeBatch,
  StorageChangeEvent,
  StorageObserver,
  StorageWriteOptions,
} from "@procedures/collections";
import { StorageListeners, reportListenerError, type ListenerErrorHandler } from "@procedures/collections";
import { optionalMs, realClock, type Cancel, type Clock, type Duration } from "@procedures/client/browser";
import { backoffDelay, type Backoff } from "@mark1russell7/service/backoff";
import { HybridStorage, type HybridStorageOptions, type LocalCopyStorage } from "./hybrid.js";
import type { SyncError, SyncStatus } from "./types.js";

/** The signal that stops a lock request that waits. The `AbortSignal` of a browser fits it. */
export interface TabAbortSignalLike {
  readonly aborted: boolean;
}

/**
 * The part of the Web Locks API that the coordinator uses: `navigator.locks` of a browser. The
 * lock is exclusive. The manager calls `callback` when the tab gets the lock, and it holds the lock
 * until the promise of `callback` settles. A test gives a lock manager in memory.
 */
export interface TabLockManagerLike {
  request(name: string, options: { readonly signal?: TabAbortSignalLike }, callback: (lock: unknown) => Promise<void>): Promise<unknown>;
}

/**
 * A channel to the other tabs of the same origin: a `BroadcastChannel` of a browser. A message goes
 * to each other channel of the same name, as a structured clone. The channel does not get its own
 * messages.
 */
export interface TabChannelLike {
  postMessage(message: unknown): void;
  // The handler takes `any`: the handler of the DOM takes a `MessageEvent`
  onmessage: ((event: any) => void) | null;
  close(): void;
}

/** The function that opens a channel with a name. The default opens a `BroadcastChannel`. */
export type TabChannelFactory = (name: string) => TabChannelLike;

/**
 * The role of a tab.
 *
 * - `follower`: the tab waits for the lock. It copies the changes of the other tabs, and it sends
 *   its own changes to the leader. A tab whose setup failed is a follower until its next try.
 * - `leader`: the tab holds the lock, and its `HybridStorage` runs the sync.
 * - `single`: the browser has no Web Locks API or no `BroadcastChannel`. The tab runs the sync
 *   alone, and it opens no channel.
 * - `closed`: after `close()`.
 */
export type TabRole = "follower" | "leader" | "single" | "closed";

/** The options of a `TabCoordinator`. */
export interface TabCoordinatorOptions<T> {
  /**
   * The name of the coordinator: one name for each collection, the same in each tab. The lock and
   * the channel get it. Give a name for each tenant too.
   */
  name: string;

  /** The local copy of this tab. It must have `observe()`. The application reads it and writes to it. */
  local: LocalCopyStorage<T>;

  /**
   * The kind of the local copy.
   *
   * - `"shared"`: the tabs open the same durable local copy, for example an `IndexedDbStorage` of
   *   one database. A tab does not write the batches of another tab, because they are in the copy.
   * - `"tab"`: each tab has its own local copy, for example a SignalDB collection or an
   *   `InMemoryStorage`. A tab writes the batches of the other tabs to its copy.
   */
  copy: "shared" | "tab";

  /**
   * The function that makes the remote of the `HybridStorage`. Only a tab that got the lock calls
   * it. When it throws, the tab releases the lock and tries again after the backoff of `retry`.
   */
  remote: () => CollectionStorage<T>;

  /**
   * The options of the `HybridStorage` of the leader. The coordinator sets `local` and
   * `capture: "observe"`. Give the same `queueStore` and `syncState` in each tab, for example an
   * `IndexedDbQueueStore` of one database: a new leader loads the queue of the last leader.
   */
  hybrid?: Omit<HybridStorageOptions, "local" | "capture">;

  /**
   * The lock manager. `null` sets the single mode.
   * @default `navigator.locks`, when the browser has it
   */
  locks?: TabLockManagerLike | null;

  /**
   * The function that opens the channel. `null` sets the single mode.
   * @default a function that opens a `BroadcastChannel`, when the browser has it
   */
  channel?: TabChannelFactory | null;

  /**
   * The wait before a new try after a failed setup of the sync (roadmap CLI-67). A setup fails when
   * the function `remote` throws, when the `HybridStorage` cannot start, or when it cannot load its
   * queue. The tab releases the lock, stays a follower, and asks for the lock again after the wait.
   * In the single mode, the tab tries the setup again after the wait.
   *
   * After `n` failed setups in a row, the wait is `delay × factor^(n − 1)`, at most `maxDelay`. The
   * random part `jitter` makes the wait shorter by up to this fraction. A setup that succeeds sets
   * the wait back to `delay`.
   */
  retry?: TabRetryOptions;

  /**
   * The clock of the wait of `retry`. A test gives `fakeClock` of `@mark1russell7/service/testing`.
   * @default the `clock` of `hybrid`, or else the clock of the platform (`realClock` of `@procedures/client`)
   */
  clock?: Clock;

  /**
   * The random numbers of the jitter of `retry`, from 0 up to 1. A test gives a fixed generator.
   * @default the `random` of `hybrid`, or else `Math.random`
   */
  random?: () => number;

  /**
   * The function that gets the errors: of the lock, of the channel, of a write to the local copy,
   * of the `HybridStorage`, of a failed setup and of the observers. The default throws the error
   * again in a microtask.
   */
  onError?: ListenerErrorHandler;
}

/** The backoff of a new try after a failed setup of the sync (roadmap CLI-67). */
export interface TabRetryOptions {
  /** The wait after the first failure, for example `seconds(1)`. It must be more than zero. @default 1 second */
  delay?: Duration;
  /** The number that multiplies the wait after each failure, 1 or more. @default 2 */
  factor?: number;
  /** The longest wait, for example `minutes(1)`. A `delay` that is longer is the longest wait. @default 1 minute */
  maxDelay?: Duration;
  /** The random part of each wait, from 0 to 1. The wait is from `(1 − jitter) ×` the backoff up to the backoff. @default 0.5 */
  jitter?: number;
}

/** The storage of a tab that got the lock, before the tab becomes the leader. */
interface Candidate<T> {
  readonly hybrid: HybridStorage<T>;
  /** False until the tab leads: the capture of the storage ignores the local copy */
  readonly gate: { open: boolean };
  /** The stop of the observer of the storage */
  readonly stop: () => void;
}

/**
 * The status of the sync in a message: only values that a structured clone keeps. The error of the
 * leader becomes its name, its message and its code. The follower makes an `Error` of them again.
 */
interface PortableStatus {
  readonly connected: boolean;
  readonly pendingChanges: number;
  readonly syncing: boolean;
  readonly endpoint?: string;
  readonly lastSync?: number;
  readonly mode?: NonNullable<SyncStatus["mode"]>;
  readonly error?: PortableSyncError;
}

interface PortableSyncError {
  readonly operation: SyncError["operation"];
  readonly name: string;
  readonly message: string;
  readonly code?: string | number;
}

/** A change batch of a tab, with its number. */
interface SentBatch<T> {
  readonly seq: number;
  readonly changes: StorageChangeBatch<T>;
}

/**
 * The version of the messages. A tab ignores a message of another version, and a message of a type
 * that it does not know. Thus a new type of message (`status`, roadmap CLI-65) keeps the version 1:
 * a tab of an older release ignores it, and it still copies and sends the batches. A new version
 * stops the batches between the tabs of two releases, so only a change of a known message needs it.
 */
const PROTOCOL = 1;

/**
 * A message of the channel.
 *
 * - `changes`: a change batch of the local copy of the tab `from`. The numbers of the batches of a
 *   tab increase by one.
 * - `hello`: the tab `from` tells the leader its last number, and the batches that no leader
 *   acknowledged. A tab sends it when it starts, and when a new leader starts.
 * - `leader`: the tab `from` is the new leader.
 * - `ack`: the queue store of the leader holds the batches of the tab `to`, up to `seq`.
 * - `status`: the status of the sync of the leader `from` (roadmap CLI-65). The leader sends it at
 *   each change, and in answer to a hello. The numbers of the statuses of a leader increase by one,
 *   and the answer to a hello sends the last number again: a tab ignores a number that it has.
 */
type TabMessage<T> =
  | { readonly v: typeof PROTOCOL; readonly type: "changes"; readonly from: string; readonly seq: number; readonly changes: StorageChangeBatch<T> }
  | { readonly v: typeof PROTOCOL; readonly type: "hello"; readonly from: string; readonly seq: number; readonly pending: ReadonlyArray<SentBatch<T>> }
  | { readonly v: typeof PROTOCOL; readonly type: "leader"; readonly from: string }
  | { readonly v: typeof PROTOCOL; readonly type: "ack"; readonly from: string; readonly to: string; readonly seq: number }
  | { readonly v: typeof PROTOCOL; readonly type: "status"; readonly from: string; readonly seq: number; readonly status: PortableStatus };

/**
 * One leader tab runs the sync of a `HybridStorage`, and the other tabs copy its changes.
 *
 * @example
 * ```typescript
 * import { ApiStorage, IndexedDbQueueStore, IndexedDbStorage, IndexedDbSyncStateStore, TabCoordinator } from "@procedures/store/browser";
 *
 * const local = new IndexedDbStorage<User>("users");
 * const users = new TabCoordinator<User>({
 *   name: "users",
 *   local,
 *   copy: "shared",
 *   remote: () => new ApiStorage(client, { collection: "users" }),
 *   hybrid: {
 *     mode: "write-back",
 *     queueStore: new IndexedDbQueueStore("users-queue"),
 *     syncState: new IndexedDbSyncStateStore("users-sync"),
 *   },
 * });
 *
 * users.observe((batch) => render(batch)); // The changes of this tab and of the other tabs
 * users.onStatus((status) => showSync(status)); // The status of the sync of the leader, in each tab
 * await local.set("1", { name: "Ada" }); // The leader pushes the write
 * ```
 */
export class TabCoordinator<T> {
  /** The id of this tab: a new random id for each coordinator. */
  readonly id: string;
  /** The name of the lock and of the channel. */
  readonly lockName: string;

  private readonly local: LocalCopyStorage<T>;
  private readonly shared: boolean;
  private readonly makeRemote: () => CollectionStorage<T>;
  private readonly hybridOptions: Omit<HybridStorageOptions, "local" | "capture">;
  /** The origin of the `HybridStorage` and of the writes of the coordinator to the local copy. */
  private readonly tag: string;
  private readonly writeOptions: StorageWriteOptions;
  private readonly onError: ListenerErrorHandler;
  private readonly observers: StorageListeners<StorageChangeBatch<T>>;
  private readonly roleListeners: StorageListeners<TabRole>;
  private readonly statusListeners: StorageListeners<SyncStatus>;
  /** The observers that the `HybridStorage` of the leader adds to its local copy: the capture */
  private readonly captures: StorageListeners<StorageChangeBatch<T>>;
  /** The backoff of a new try after a failed setup, its clock and its random numbers */
  private readonly backoff: Backoff;
  private readonly clock: Clock;
  private readonly random: () => number;
  private currentRole: TabRole = "follower";
  /** The lock manager, or undefined in the single mode */
  private locks: TabLockManagerLike | undefined;
  private channel: TabChannelLike | undefined;
  private hybrid: HybridStorage<T> | undefined;
  /** The storage of this tab while it loads its queue, before the tab leads */
  private candidate: Candidate<T> | undefined;
  /** The number of the failed setups in a row */
  private failures = 0;
  /** The stop of the wait before the next try */
  private cancelRetry: Cancel | undefined;
  /** The status of the sync: of the `HybridStorage` of this tab, or of the leader */
  private status: SyncStatus | undefined;
  /** In the leader: the number of its last status. In a follower: the tab and the number of the last status that it got. */
  private statusSeq = 0;
  private statusFrom: string | undefined;
  /** The stop of the status of the `HybridStorage` of this tab */
  private stopStatus: (() => void) | undefined;
  /** The stop of the observer of the changes of this tab: on the local copy, or on the `HybridStorage` of the leader */
  private stopTap: (() => void) | undefined;
  /** True while the leader gives a batch of another tab to the capture of its `HybridStorage` */
  private capturing = false;
  /** The number of the last batch of this tab */
  private seq = 0;
  /** The batches of this tab that no leader acknowledged, the oldest first */
  private outbox: SentBatch<T>[] = [];
  /** The number of the last batch of each other tab that this tab copied */
  private readonly seen = new Map<string, number>();
  /** In the leader: the number of the last batch of each tab that the leader captured. A tab without a hello is not here. */
  private readonly captured = new Map<string, number>();
  /** The batches of the other tabs: they reach the local copy and the observers in their order */
  private incoming: Promise<void> = Promise.resolve();
  private closed = false;
  private closing: Promise<void> | undefined;
  /** The abort of the lock request that waits */
  private abortRequest: (() => void) | undefined;
  /** The release of the lock */
  private releaseLock: (() => void) | undefined;

  constructor(options: TabCoordinatorOptions<T>) {
    if (typeof options?.name !== "string" || options.name === "") throw new TypeError("TabCoordinator needs a name");
    if (typeof options.local?.observe !== "function") throw new TypeError("TabCoordinator needs a local copy with observe()");
    if (options.copy !== "shared" && options.copy !== "tab") {
      throw new TypeError(`Unknown copy ${JSON.stringify(options.copy)}: use shared or tab`);
    }
    if (typeof options.remote !== "function") throw new TypeError("TabCoordinator needs the function remote");
    this.backoff = retryBackoff(options.retry);
    this.id = randomId();
    this.lockName = `@procedures/store/tab:${options.name}`;
    this.local = options.local;
    this.shared = options.copy === "shared";
    this.makeRemote = options.remote;
    this.hybridOptions = options.hybrid ?? {};
    this.tag = this.hybridOptions.origin ?? `tab-${this.id}`;
    this.writeOptions = { origin: this.tag };
    this.onError = options.onError ?? reportListenerError;
    this.observers = new StorageListeners<StorageChangeBatch<T>>(this.onError);
    this.roleListeners = new StorageListeners<TabRole>(this.onError);
    this.statusListeners = new StorageListeners<SyncStatus>(this.onError);
    this.captures = new StorageListeners<StorageChangeBatch<T>>(this.onError);
    this.clock = options.clock ?? this.hybridOptions.clock ?? realClock;
    this.random = options.random ?? this.hybridOptions.random ?? Math.random;

    // The observer of a follower. A tab that leads stops it. A single tab whose setup failed keeps its batches with it.
    this.stopTap = this.local.observe!((batch) => this.onFollowerBatch(batch));
    const locks = options.locks === undefined ? globalLocks() : (options.locks ?? undefined);
    const openChannel = options.channel === undefined ? globalChannelFactory() : (options.channel ?? undefined);
    if (!locks || !openChannel) {
      this.startSingle();
      return;
    }
    try {
      this.channel = openChannel(this.lockName);
    } catch (error) {
      this.onError(error);
      this.startSingle();
      return;
    }
    this.locks = locks;
    this.channel.onmessage = (event: { data?: unknown } | undefined) => this.receive(event?.data);
    this.hello();
    this.elect(locks);
  }

  /** The role of this tab now. */
  get role(): TabRole {
    return this.currentRole;
  }

  /** True when this tab runs the sync: the leader, or a tab in the single mode. */
  get isLeader(): boolean {
    return this.currentRole === "leader" || this.currentRole === "single";
  }

  /**
   * The `HybridStorage` of the sync while this tab runs it, or else undefined. `getStatus()` of the
   * coordinator gives the state of the sync in each tab. Write to the local copy, not to this
   * storage: each tab then writes in the same way.
   */
  get syncStorage(): HybridStorage<T> | undefined {
    return this.hybrid;
  }

  /**
   * This method starts to send the change batches to an observer: the batches of the local copy of
   * this tab, and the batches of the other tabs. Each batch comes one time, with the origin of each
   * change. In the leader, the batches of the sync have the origin `syncOrigin` of the
   * `HybridStorage`. A batch of another tab comes after the local copy of this tab has it.
   *
   * @returns The function that stops the batches. A second use of it does nothing.
   * @throws Error after `close()`
   */
  observe(observer: StorageObserver<T>): () => void {
    if (this.closed) throw new Error("The TabCoordinator is closed");
    return this.observers.add(observer);
  }

  /**
   * This method starts to send the role of this tab to a listener at each change.
   *
   * @returns The function that stops the roles. A second use of it does nothing.
   * @throws Error after `close()`
   */
  onRole(listener: (role: TabRole) => void): () => void {
    if (this.closed) throw new Error("The TabCoordinator is closed");
    return this.roleListeners.add(listener);
  }

  /**
   * The status of the sync (roadmap CLI-65), or undefined before the first status and after
   * `close()`.
   *
   * - In the leader and in the single mode, it is the status of the `HybridStorage` of this tab.
   * - In a follower, it is the last status that the leader sent. A new tab gets it in the answer to
   *   its hello. After a change of the leader, a follower keeps the last status until the new
   *   leader sends its status.
   * - In a follower, `error.error` is a copy of the error of the leader: an `Error` with its `name`,
   *   its `message` and its `code`. The copy has no `cause`.
   */
  getStatus(): SyncStatus | undefined {
    return this.status;
  }

  /**
   * This method starts to send the status of the sync to a listener at each change (roadmap
   * CLI-65): in the leader, each status of its `HybridStorage`, and in a follower, each status that
   * the leader sends. The listener gets each status one time. When the tab becomes the leader, the
   * listener gets the status of its own `HybridStorage`.
   *
   * @returns The function that stops the statuses. A second use of it does nothing.
   * @throws Error after `close()`
   */
  onStatus(listener: (status: SyncStatus) => void): () => void {
    if (this.closed) throw new Error("The TabCoordinator is closed");
    return this.statusListeners.add(listener);
  }

  /**
   * This method closes the coordinator.
   *
   * - A follower stops its lock request, or its wait before a new try. It does not become the leader.
   * - A tab that loads its queue to become the leader closes its `HybridStorage`, and releases the lock.
   * - The leader closes its `HybridStorage`: it sends the queue, and the queue store keeps the
   *   operations that the remote did not take. Then the leader releases the lock, and the next
   *   tab becomes the leader.
   * - The coordinator closes its channel. It does not close the local copy: the application owns it.
   * - After it, the coordinator sends and copies nothing. A second `close()` gives the promise of
   *   the first one.
   */
  close(): Promise<void> {
    if (!this.closing) this.closing = this.shutDown();
    return this.closing;
  }

  private async shutDown(): Promise<void> {
    this.closed = true;
    this.stopTap?.();
    this.stopTap = undefined;
    this.abortRequest?.();
    this.abortRequest = undefined;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    this.stopStatus?.();
    this.stopStatus = undefined;
    this.setRole("closed");
    const candidate = this.candidate;
    this.candidate = undefined;
    candidate?.stop();
    const hybrid = this.hybrid ?? candidate?.hybrid;
    this.hybrid = undefined;
    this.status = undefined;
    try {
      // The leader holds the lock until its queue reached the remote or its queue store
      if (hybrid) await hybrid.close();
    } catch (error) {
      this.onError(error);
    } finally {
      this.releaseLock?.();
      this.releaseLock = undefined;
      // The acknowledgements of the close of the HybridStorage went out before
      try {
        this.channel?.close();
      } catch {
        // The channel is closed already
      }
      this.channel = undefined;
      this.observers.clear();
      this.roleListeners.clear();
      this.statusListeners.clear();
      this.captures.clear();
    }
  }

  //
  // ═══ The election ═══
  //

  /** This method asks for the lock. The tab becomes the leader when it gets the lock. */
  private elect(locks: TabLockManagerLike): void {
    const Controller = globalAbortController();
    const controller = Controller ? new Controller() : undefined;
    this.abortRequest = controller ? () => controller.abort() : undefined;
    const held = new Promise<void>((resolve) => (this.releaseLock = resolve));
    let request: Promise<unknown>;
    try {
      request = locks.request(this.lockName, controller ? { signal: controller.signal } : {}, async () => {
        // A lock after close(): the tab releases it at once
        if (this.closed) return;
        this.abortRequest = undefined;
        if (await this.takeLead()) {
          await held;
          return;
        }
        // A failed setup releases the lock: another tab tries, and this tab tries again after the backoff
        this.retryLater();
      });
    } catch (error) {
      request = Promise.reject(error);
    }
    request.then(undefined, (error: unknown) => {
      // The abort of close(), or a tab that leads already
      if (this.closed || this.hybrid) return;
      // The lock manager refused the request: this tab runs the sync alone
      this.onError(error);
      this.stopChannel();
      this.locks = undefined;
      this.startSingle();
    });
  }

  /**
   * This method makes the `HybridStorage` of a tab that got the lock, and waits for the load of its
   * queue. Then the tab becomes the leader. Until then, the tab is a follower: its own batches go to
   * the other tabs and to its outbox, and the capture of the storage ignores the local copy.
   *
   * @returns False when the setup failed (the error went to `onError`), or after `close()`
   */
  private async takeLead(): Promise<boolean> {
    const candidate = this.makeCandidate();
    if (!candidate) return false;
    this.candidate = candidate;
    let failed = false;
    let failure: unknown;
    try {
      // A storage whose load failed refuses each operation: it cannot lead
      await candidate.hybrid.whenQueued();
    } catch (error) {
      failed = true;
      failure = error;
    }
    // close() took the storage
    if (this.candidate !== candidate) return false;
    this.candidate = undefined;
    if (!failed) {
      this.promote(candidate, "leader");
      return true;
    }
    this.onError(failure);
    candidate.stop();
    try {
      await candidate.hybrid.close();
    } catch (error) {
      this.onError(error);
    }
    return false;
  }

  /** This method makes the `HybridStorage` of the single mode. The tab tries again after the backoff when it fails. */
  private startSingle(): void {
    const candidate = this.makeCandidate();
    if (candidate) this.promote(candidate, "single");
    else this.retryLater();
  }

  /**
   * This method makes the `HybridStorage` of the sync, with its observer. Its capture ignores the
   * local copy until the tab leads.
   *
   * @returns Undefined when the remote or the storage could not start (the error went to `onError`), or after `close()`
   */
  private makeCandidate(): Candidate<T> | undefined {
    if (this.closed) return undefined;
    let remote: CollectionStorage<T>;
    try {
      remote = this.makeRemote();
    } catch (error) {
      this.onError(error);
      return undefined;
    }
    const gate = { open: false };
    let hybrid: HybridStorage<T>;
    try {
      hybrid = new HybridStorage<T>(remote, {
        ...this.hybridOptions,
        local: this.captureCopy(gate),
        capture: "observe",
        origin: this.tag,
      });
    } catch (error) {
      this.onError(error);
      // The remote of a storage that did not start stays open otherwise
      Promise.resolve()
        .then(() => remote.close())
        .catch((closeError: unknown) => this.onError(closeError));
      return undefined;
    }
    // The observer starts at once: the other tabs get the changes of the load and of the first sync
    const stop = hybrid.observe((batch) => this.onLeaderBatch(batch));
    return { hybrid, gate, stop };
  }

  /**
   * This method makes this tab the leader, or the single tab, with the storage of a candidate. The
   * capture of the storage gets the batches of this tab that no leader acknowledged.
   */
  private promote(candidate: Candidate<T>, role: "leader" | "single"): void {
    const { hybrid, gate, stop } = candidate;
    this.hybrid = hybrid;
    this.failures = 0;
    // The capture starts and the observer of the follower stops in one step: no change of the local copy goes between them
    gate.open = true;
    const stopFollower = this.stopTap;
    this.stopTap = stop;
    stopFollower?.();
    for (const batch of this.outbox.splice(0)) this.capture(batch.changes);
    this.setRole(role);
    if (role === "leader") this.post({ v: PROTOCOL, type: "leader", from: this.id });
    // The status of this tab is now the status of its storage, also when it has the values of the last status of the old leader. The followers get it.
    this.status = undefined;
    this.statusFrom = undefined;
    this.stopStatus = hybrid.onStatus((status) => this.onOwnStatus(hybrid, status));
    this.onOwnStatus(hybrid, hybrid.getStatus());
  }

  /** This method asks for the lock again, or tries the single mode again, after the backoff (roadmap CLI-67). */
  private retryLater(): void {
    if (this.closed) return;
    this.failures++;
    const wait = backoffDelay(this.backoff, this.failures, this.random);
    const cancel = this.clock.after(wait, () => {
      this.cancelRetry = undefined;
      if (this.closed) return;
      if (this.locks) this.elect(this.locks);
      else this.startSingle();
    });
    // The wait must not keep a Node process alive
    cancel.unref?.();
    this.cancelRetry = cancel;
  }

  /**
   * The local copy for the `HybridStorage` of the leader. Its `observe()` gives the changes of the
   * local copy and the batches of the other tabs, so the capture queues both. It gives the changes
   * of the local copy only when `gate` is open. Its `close()` does nothing: the application owns
   * the local copy.
   */
  private captureCopy(gate: { readonly open: boolean }): LocalCopyStorage<T> {
    const captures = this.captures;
    const observe = (observer: StorageObserver<T>): (() => void) => {
      const stopLocal = this.local.observe!((batch) => {
        if (gate.open) observer(batch);
      });
      const stopCapture = captures.add(observer);
      return () => {
        stopLocal();
        stopCapture();
      };
    };
    return new Proxy(this.local, {
      get(target, property) {
        if (property === "observe") return observe;
        if (property === "close") return () => Promise.resolve();
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
  }

  /**
   * This method gives a batch of another tab to the capture of the `HybridStorage` of the leader.
   * The storage queues it. Its observers get it at once, and the coordinator ignores it there: the
   * observers of the coordinator get it from the channel.
   */
  private capture(changes: StorageChangeBatch<T>): void {
    if (changes.length === 0) return;
    this.capturing = true;
    try {
      this.captures.emit(changes);
    } finally {
      this.capturing = false;
    }
  }

  private setRole(role: TabRole): void {
    if (this.currentRole === role) return;
    this.currentRole = role;
    this.roleListeners.emit(role);
  }

  //
  // ═══ The status of the sync (roadmap CLI-65) ═══
  //

  /** A status of the `HybridStorage` of this tab. The leader sends each new status to the followers. */
  private onOwnStatus(hybrid: HybridStorage<T>, status: SyncStatus): void {
    if (this.closed || this.hybrid !== hybrid) return;
    if (this.status !== undefined && sameStatus(this.status, status)) return;
    this.status = status;
    this.statusSeq++;
    if (this.currentRole === "leader") this.postStatus();
    this.statusListeners.emit(status);
  }

  /** This method sends the last status of the leader, with its number. */
  private postStatus(): void {
    if (this.status === undefined) return;
    this.post({ v: PROTOCOL, type: "status", from: this.id, seq: this.statusSeq, status: portableStatus(this.status) });
  }

  /** A status of the leader. A tab that runs the sync keeps its own status. */
  private onLeaderStatus(from: string, seq: number, status: PortableStatus): void {
    if (this.hybrid) return;
    // The answer to a hello sends the last status again
    if (from === this.statusFrom && seq <= this.statusSeq) return;
    this.statusFrom = from;
    this.statusSeq = seq;
    this.status = statusOf(status);
    this.statusListeners.emit(this.status);
  }

  //
  // ═══ The batches of this tab ═══
  //

  /**
   * A batch of the local copy of a follower. The writes of the coordinator itself (the batches of
   * the other tabs in a copy of each tab) have the tag of the coordinator, and do not go out again.
   */
  private onFollowerBatch(batch: StorageChangeBatch<T>): void {
    if (this.closed) return;
    const own = batch.filter((change) => change.origin !== this.tag);
    if (own.length > 0) this.share(own, true);
  }

  /**
   * A batch of the `HybridStorage` of the leader: a write of the application to the local copy,
   * a write to the storage, or a change of the sync.
   */
  private onLeaderBatch(batch: StorageChangeBatch<T>): void {
    if (this.closed || this.capturing) return;
    this.share(batch, false);
  }

  /**
   * This method gives a batch of this tab to its observers and to the other tabs. A follower keeps
   * it for the leader. A single tab whose setup failed keeps it for its next try.
   */
  private share(changes: StorageChangeBatch<T>, keep: boolean): void {
    const seq = ++this.seq;
    this.observers.emit(changes);
    const sent = this.post({ v: PROTOCOL, type: "changes", from: this.id, seq, changes });
    if (keep && (sent || !this.channel)) this.outbox.push({ seq, changes });
  }

  /** This method tells the leader the batches of this tab that no leader acknowledged. */
  private hello(): void {
    this.post({ v: PROTOCOL, type: "hello", from: this.id, seq: this.seq, pending: this.outbox });
  }

  /** @returns False when the message did not go out: no channel, or a value that the channel cannot clone */
  private post(message: TabMessage<T>): boolean {
    const channel = this.channel;
    if (!channel) return false;
    try {
      channel.postMessage(message);
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  private stopChannel(): void {
    const channel = this.channel;
    this.channel = undefined;
    if (!channel) return;
    channel.onmessage = null;
    try {
      channel.close();
    } catch {
      // The channel is closed already
    }
  }

  //
  // ═══ The batches of the other tabs ═══
  //

  private receive(data: unknown): void {
    if (this.closed || !isTabMessage<T>(data) || data.from === this.id) return;
    switch (data.type) {
      case "changes":
        this.onChanges(data.from, { seq: data.seq, changes: data.changes });
        break;
      case "hello":
        this.onHello(data.from, data.seq, data.pending);
        break;
      case "leader":
        // The new leader gets the batches that no leader acknowledged
        if (this.currentRole === "follower") this.hello();
        break;
      case "ack":
        if (data.to === this.id) this.outbox = this.outbox.filter((batch) => batch.seq > data.seq);
        break;
      case "status":
        this.onLeaderStatus(data.from, data.seq, data.status);
        break;
    }
  }

  /**
   * A batch of another tab. The leader captures it when the tab said hello to it. Each tab copies
   * it one time.
   */
  private onChanges(from: string, batch: SentBatch<T>): void {
    const known = this.captured.get(from);
    if (this.hybrid && this.currentRole === "leader" && known !== undefined && batch.seq > known) {
      this.capture(batch.changes);
      this.captured.set(from, batch.seq);
      this.acknowledge(from, batch.seq);
    }
    this.copy(from, batch);
  }

  /**
   * The hello of another tab. The leader captures the batches that it did not capture, and then each
   * batch of the tab after `seq`. It answers with its status. Each tab copies the batches that it
   * did not see.
   */
  private onHello(from: string, seq: number, pending: ReadonlyArray<SentBatch<T>>): void {
    if (this.hybrid && this.currentRole === "leader") {
      const known = this.captured.get(from);
      for (const batch of pending) if (known === undefined || batch.seq > known) this.capture(batch.changes);
      this.captured.set(from, Math.max(known ?? 0, seq));
      if (pending.length > 0) this.acknowledge(from, seq);
      // A new tab gets the status now. The other tabs have its number already.
      this.postStatus();
    }
    for (const batch of pending) this.copy(from, batch);
  }

  /**
   * This method copies a batch of another tab that this tab did not see: to the local copy of a
   * tab, and then to the observers. The batches go in their order.
   */
  private copy(from: string, batch: SentBatch<T>): void {
    if (batch.seq <= (this.seen.get(from) ?? 0)) return;
    this.seen.set(from, batch.seq);
    this.incoming = this.incoming
      .then(async () => {
        if (this.closed) return;
        if (!this.shared) await this.write(batch.changes);
        if (!this.closed) this.observers.emit(batch.changes);
      })
      .catch((error: unknown) => this.onError(error));
  }

  /**
   * This method writes a batch of another tab to the local copy of this tab, with the tag of the
   * coordinator: the observer of this tab and the capture of the leader ignore the writes. The sets
   * in a row go in one `setBatch`, and the deletes in a row in one `deleteBatch`.
   */
  private async write(changes: StorageChangeBatch<T>): Promise<void> {
    let index = 0;
    while (index < changes.length) {
      const change = changes[index]!;
      if (change.type === "clear") {
        await this.local.clear(this.writeOptions);
        index++;
      } else if (change.type === "set") {
        const items: Array<[string, T]> = [];
        for (let next = changes[index]; next?.type === "set"; next = changes[++index]) items.push([next.id, next.value]);
        await this.local.setBatch(items, this.writeOptions);
      } else {
        const ids: string[] = [];
        for (let next = changes[index]; next?.type === "delete"; next = changes[++index]) ids.push(next.id);
        await this.local.deleteBatch(ids, this.writeOptions);
      }
    }
  }

  /** This method tells a tab that the queue store of the leader holds its batches up to `seq`. */
  private acknowledge(to: string, seq: number): void {
    const hybrid = this.hybrid;
    if (!hybrid) return;
    hybrid.whenQueued().then(
      () => void this.post({ v: PROTOCOL, type: "ack", from: this.id, to, seq }),
      (error: unknown) => this.onError(error),
    );
  }
}

/**
 * The backoff of the option `retry`.
 *
 * @throws RangeError for a `delay` of zero or less, a `factor` below 1, or a `jitter` outside 0 to 1
 * @throws TypeError for a time that is not a `Duration`
 */
function retryBackoff(retry: TabRetryOptions | undefined): Backoff {
  const delay = optionalMs(retry?.delay, "retry.delay") ?? 1000;
  const maxDelay = optionalMs(retry?.maxDelay, "retry.maxDelay") ?? 60_000;
  const factor = retry?.factor ?? 2;
  const jitter = retry?.jitter ?? 0.5;
  if (!(delay > 0)) throw new RangeError(`retry.delay must be a time of more than zero, not ${delay} ms`);
  if (!(Number.isFinite(factor) && factor >= 1)) throw new RangeError(`retry.factor must be a number of 1 or more, not ${factor}`);
  if (!(jitter >= 0 && jitter <= 1)) throw new RangeError(`retry.jitter must be from 0 to 1, not ${jitter}`);
  return {
    base: delay,
    factor,
    cap: Math.max(maxDelay, delay),
    jitter: jitter > 0 ? { kind: "subtract", fraction: jitter } : { kind: "none" },
  };
}

/** True when two statuses have the same values. The errors are the same object. */
function sameStatus(a: SyncStatus, b: SyncStatus): boolean {
  return (
    a.connected === b.connected &&
    a.endpoint === b.endpoint &&
    a.lastSync === b.lastSync &&
    a.pendingChanges === b.pendingChanges &&
    a.syncing === b.syncing &&
    a.mode === b.mode &&
    a.error === b.error
  );
}

/**
 * The status in a form that a structured clone keeps. The status has numbers, strings and booleans,
 * and they clone. Its error can be any value, for example an error with a function in a property,
 * so the message has only the name, the message and the code of the error.
 */
function portableStatus(status: SyncStatus): PortableStatus {
  return {
    connected: status.connected,
    pendingChanges: status.pendingChanges,
    syncing: status.syncing,
    ...(status.endpoint !== undefined && { endpoint: status.endpoint }),
    ...(status.lastSync !== undefined && { lastSync: status.lastSync }),
    ...(status.mode !== undefined && { mode: status.mode }),
    ...(status.error !== undefined && { error: { operation: status.error.operation, ...portableError(status.error.error) } }),
  };
}

/** The name, the message and the code of an error. A value that is not an error becomes its text. */
function portableError(value: unknown): Omit<PortableSyncError, "operation"> {
  try {
    if (typeof value === "object" && value !== null) {
      const { name, message, code } = value as { name?: unknown; message?: unknown; code?: unknown };
      if (typeof message === "string") {
        return {
          name: typeof name === "string" ? name : "Error",
          message,
          ...((typeof code === "string" || typeof code === "number") && { code }),
        };
      }
    }
    return { name: "Error", message: String(value) };
  } catch {
    // A value without a text, for example an object without a prototype
    return { name: "Error", message: "An error without a text" };
  }
}

/** The status of a message of the leader. Its error becomes an `Error` again. */
function statusOf(status: PortableStatus): SyncStatus {
  const error = status.error;
  return {
    connected: status.connected,
    pendingChanges: status.pendingChanges,
    syncing: status.syncing,
    ...(status.endpoint !== undefined && { endpoint: status.endpoint }),
    ...(status.lastSync !== undefined && { lastSync: status.lastSync }),
    ...(status.mode !== undefined && { mode: status.mode }),
    ...(error !== undefined && {
      error: {
        operation: error.operation,
        error: Object.assign(new Error(error.message), { name: error.name }, error.code !== undefined ? { code: error.code } : {}),
      },
    }),
  };
}

const MODES: ReadonlySet<string> = new Set<NonNullable<SyncStatus["mode"]>>(["local-only", "write-through", "write-back", "remote-only"]);
const OPERATIONS: ReadonlySet<string> = new Set<SyncError["operation"]>(["load", "push", "pull", "sync", "store"]);

/** True when a value is the status of a message. */
function isPortableStatus(value: unknown): value is PortableStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as { connected?: unknown; pendingChanges?: unknown; syncing?: unknown; endpoint?: unknown; lastSync?: unknown; mode?: unknown; error?: unknown };
  if (typeof status.connected !== "boolean" || typeof status.syncing !== "boolean" || !isSeq(status.pendingChanges)) return false;
  if (status.endpoint !== undefined && typeof status.endpoint !== "string") return false;
  if (status.lastSync !== undefined && typeof status.lastSync !== "number") return false;
  if (status.mode !== undefined && !(typeof status.mode === "string" && MODES.has(status.mode))) return false;
  if (status.error === undefined) return true;
  if (typeof status.error !== "object" || status.error === null) return false;
  const { operation, name, message, code } = status.error as { operation?: unknown; name?: unknown; message?: unknown; code?: unknown };
  return (
    typeof operation === "string" &&
    OPERATIONS.has(operation) &&
    typeof name === "string" &&
    typeof message === "string" &&
    (code === undefined || typeof code === "string" || typeof code === "number")
  );
}

/** A new random id. */
function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `navigator.locks` of the global scope, or undefined. */
function globalLocks(): TabLockManagerLike | undefined {
  return (globalThis as { navigator?: { locks?: TabLockManagerLike } }).navigator?.locks ?? undefined;
}

/** A function that opens a `BroadcastChannel` of the global scope, or undefined. */
function globalChannelFactory(): TabChannelFactory | undefined {
  const Channel = (globalThis as { BroadcastChannel?: new (name: string) => TabChannelLike }).BroadcastChannel;
  return typeof Channel === "function" ? (name) => new Channel(name) : undefined;
}

/** The `AbortController` of the global scope, or undefined. */
function globalAbortController(): (new () => { readonly signal: TabAbortSignalLike; abort(): void }) | undefined {
  const Controller = (globalThis as { AbortController?: new () => { readonly signal: TabAbortSignalLike; abort(): void } }).AbortController;
  return typeof Controller === "function" ? Controller : undefined;
}

function isSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** True when a value is a change batch. The value of a message of another tab can be anything. */
function isBatch(value: unknown): value is StorageChangeEvent<unknown>[] {
  if (!Array.isArray(value)) return false;
  return value.every((change: unknown) => {
    if (typeof change !== "object" || change === null) return false;
    const { type, id, origin } = change as { type?: unknown; id?: unknown; origin?: unknown };
    if (origin !== undefined && typeof origin !== "string") return false;
    if (type === "clear") return true;
    if (typeof id !== "string") return false;
    return type === "delete" || (type === "set" && "value" in change);
  });
}

/**
 * True when a value is a message of the channel, of this version. A message of a type that this
 * release does not know is not a message: a tab of an older release ignores a new type.
 */
function isTabMessage<T>(value: unknown): value is TabMessage<T> {
  if (typeof value !== "object" || value === null) return false;
  const message = value as {
    v?: unknown;
    type?: unknown;
    from?: unknown;
    to?: unknown;
    seq?: unknown;
    changes?: unknown;
    pending?: unknown;
    status?: unknown;
  };
  if (message.v !== PROTOCOL || typeof message.from !== "string") return false;
  switch (message.type) {
    case "changes":
      return isSeq(message.seq) && isBatch(message.changes);
    case "hello":
      return (
        isSeq(message.seq) &&
        Array.isArray(message.pending) &&
        message.pending.every((batch: unknown) => {
          if (typeof batch !== "object" || batch === null) return false;
          const { seq, changes } = batch as { seq?: unknown; changes?: unknown };
          return isSeq(seq) && isBatch(changes);
        })
      );
    case "leader":
      return true;
    case "ack":
      return typeof message.to === "string" && isSeq(message.seq);
    case "status":
      return isSeq(message.seq) && isPortableStatus(message.status);
    default:
      return false;
  }
}
