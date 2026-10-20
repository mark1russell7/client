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
 * A `TabGroup` runs the sync of many collections with one lock and one channel (roadmap CLI-64),
 * for example all the collections of a tenant.
 *
 * - The leader of the group runs one `HybridStorage` for each collection. Each message has the
 *   field `collection`, and each collection has its own batches, acknowledgements and status.
 * - Each collection leads when its own queue loaded. A collection whose setup fails tries again
 *   alone after its backoff, and the other collections keep their sync.
 * - When no collection can lead, the tab releases the lock and asks for it again after the backoff
 *   of the group, as a `TabCoordinator` does.
 * - The lock and the channel of a group have the prefix `@procedures/store/tabs:`. A
 *   `TabCoordinator` has the prefix `@procedures/store/tab:`. Thus a group and a coordinator never
 *   share a lock or a channel, also with the same name.
 * - With the option `open`, the leader makes a collection that another tab has and that this tab
 *   does not have. Thus the tabs can open different collections.
 *
 * A snapshot for a new tab (roadmap CLI-66): with `copy: "tab"` and the option `snapshot`, a new
 * tab asks the leader for the entries of its local copy.
 *
 * - The leader reads the entries of its copy, and it sends them in chunks of `snapshot.chunk`
 *   entries. Each chunk has the numbers of the last batches that the copy holds, one for each tab.
 * - The new tab keeps the batches of the other tabs until the last chunk comes. It writes the
 *   entries to its copy, and then it writes the batches with a number after the snapshot.
 * - The new tab keeps the values of its own writes after the snapshot.
 * - When the leader changes before the last chunk, the tab asks the new leader. When no chunk comes
 *   in the time `snapshot.timeout`, the tab reports an error and continues without the snapshot.
 *
 * The limits:
 * - When the leader stops during a push, the next leader sends the operation again: the delivery to
 *   the remote is at least once.
 * - With a shared local copy, a pull of the leader can come between the write of a follower and its
 *   capture. The tabs agree again after the push and the next pull.
 * - The load of the queue in a new leader writes the queued operations to the local copy again, and
 *   the observers get them again with the origin `syncOrigin`.
 * - The leader reads all the entries of a snapshot at one time, and the new tab keeps all the chunks
 *   until the last one. Thus a snapshot is for a local copy that fits in the memory of a tab.
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
 * The role of a tab, or of a collection of a `TabGroup` in a tab.
 *
 * - `follower`: the tab waits for the lock. It copies the changes of the other tabs, and it sends
 *   its own changes to the leader. A tab whose setup failed is a follower until its next try.
 * - `leader`: the tab holds the lock, and its `HybridStorage` runs the sync.
 * - `single`: the browser has no Web Locks API or no `BroadcastChannel`. The tab runs the sync
 *   alone, and it opens no channel.
 * - `closed`: after `close()`.
 *
 * A `TabGroup` is `leader` when it holds the lock. Each collection of the group is `leader` only
 * when its own `HybridStorage` runs.
 */
export type TabRole = "follower" | "leader" | "single" | "closed";

/** The options of a `TabCoordinator`. */
export interface TabCoordinatorOptions<T> {
  /**
   * The name of the coordinator: one name for each collection, the same in each tab. The lock and
   * the channel get it. Give a name for each tenant too. For many collections, use a `TabGroup`.
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
   * The snapshot for a new tab (roadmap CLI-66). Only `copy: "tab"` takes it. With it, a new tab
   * asks the leader for the entries of its local copy. Give it to a local copy that starts empty.
   * @default false
   */
  snapshot?: boolean | TabSnapshotOptions;

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
   * The clock of the wait of `retry` and of `snapshot.timeout`. A test gives `fakeClock` of
   * `@mark1russell7/service/testing`.
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
   * of the `HybridStorage`, of a failed setup, of a snapshot and of the observers. The default
   * throws the error again in a microtask.
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

/** The options of the snapshot for a new tab (roadmap CLI-66). */
export interface TabSnapshotOptions {
  /**
   * The largest number of entries in one message of the snapshot, 1 or more. The leader uses its
   * own value when it sends a snapshot.
   * @default 500
   */
  chunk?: number;

  /**
   * The longest wait for the next message of the snapshot, for example `seconds(10)`. After it, the
   * tab gives an error to `onError`, and it copies the batches of the other tabs without a snapshot.
   * @default 10 seconds
   */
  timeout?: Duration;
}

/** The options of one collection of a `TabGroup` (roadmap CLI-64). */
export interface TabCollectionOptions<T> {
  /** The local copy of the collection in this tab. It must have `observe()`. */
  local: LocalCopyStorage<T>;

  /** The kind of the local copy: `"shared"` or `"tab"`, as the option `copy` of a `TabCoordinator`. */
  copy: "shared" | "tab";

  /** The function that makes the remote of the collection. Only the leader calls it. */
  remote: () => CollectionStorage<T>;

  /**
   * The options of the `HybridStorage` of the collection in the leader. Give a `queueStore` for each
   * collection, the same in each tab.
   */
  hybrid?: Omit<HybridStorageOptions, "local" | "capture">;

  /** The snapshot for a new tab (roadmap CLI-66), as the option `snapshot` of a `TabCoordinator`. @default false */
  snapshot?: boolean | TabSnapshotOptions;
}

/** The options of a `TabGroup` (roadmap CLI-64). */
export interface TabGroupOptions {
  /**
   * The name of the group, the same in each tab, for example the name of a tenant. The lock and the
   * channel get it.
   */
  name: string;

  /**
   * The function that gives the options of a collection with its name. `collection(name)` uses it
   * without options. The leader also uses it for a collection that only another tab opened. It
   * gives `undefined` for a collection without a sync.
   */
  // The collections of a group have different item types
  open?: (collection: string) => TabCollectionOptions<any> | undefined;

  /** The lock manager. `null` sets the single mode. @default `navigator.locks`, when the browser has it */
  locks?: TabLockManagerLike | null;

  /** The function that opens the channel. `null` sets the single mode. @default a `BroadcastChannel`, when the browser has it */
  channel?: TabChannelFactory | null;

  /**
   * The backoff of a new try after a failed setup (roadmap CLI-67). The group and each collection
   * count their failures. A collection whose setup fails in the leader tries again alone.
   */
  retry?: TabRetryOptions;

  /** The clock of the waits. @default the clock of the platform (`realClock` of `@procedures/client`) */
  clock?: Clock;

  /** The random numbers of the jitter of `retry`, from 0 up to 1. @default `Math.random` */
  random?: () => number;

  /** The function that gets the errors of the group and of its collections. The default throws the error again in a microtask. */
  onError?: ListenerErrorHandler;
}

/**
 * One collection of a `TabGroup` in this tab (roadmap CLI-64). It has the methods of a
 * `TabCoordinator` for one collection, except `close()`: `close()` of the group closes it.
 */
export interface TabCollection<T> {
  /** The name of the collection in the group. */
  readonly name: string;
  /** The role of this collection in this tab: `leader` or `single` only while its `HybridStorage` runs. */
  readonly role: TabRole;
  /** True when this tab runs the sync of this collection. */
  readonly isLeader: boolean;
  /** The `HybridStorage` of the collection while this tab runs its sync, or else undefined. */
  readonly syncStorage: HybridStorage<T> | undefined;
  /** This method starts to send the change batches of the collection to an observer, as `TabCoordinator.observe()`. */
  observe(observer: StorageObserver<T>): () => void;
  /** This method starts to send the role of the collection to a listener at each change. */
  onRole(listener: (role: TabRole) => void): () => void;
  /** The status of the sync of the collection (roadmap CLI-65), as `TabCoordinator.getStatus()`. */
  getStatus(): SyncStatus | undefined;
  /** This method starts to send the status of the sync of the collection to a listener at each change. */
  onStatus(listener: (status: SyncStatus) => void): () => void;
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

/** The entries of a snapshot, and the number of the last batch of each tab that they hold. */
type SnapshotEntries<T> = ReadonlyArray<readonly [string, T]>;
type SnapshotSeqs = ReadonlyArray<readonly [string, number]>;

/** A snapshot that a follower waits for (roadmap CLI-66). */
interface PendingSnapshot<T> {
  /** The number of the last request of this tab */
  readonly request: number;
  /** The tab that sent the first chunk, the number of the chunks and the numbers of the batches */
  from?: string;
  parts?: number;
  seqs?: SnapshotSeqs;
  readonly chunks: Array<SnapshotEntries<T> | undefined>;
  received: number;
}

/**
 * The version of the messages. A tab ignores a message of another version, and a message of a type
 * that it does not know. Thus a new type of message (`status`, roadmap CLI-65, and `snapshot`,
 * roadmap CLI-66) keeps the version 1: a tab of an older release ignores it, and it still copies
 * and sends the batches. A new version stops the batches between the tabs of two releases, so only
 * a change of a known message needs it.
 */
const PROTOCOL = 1;

/** The prefixes of the lock and of the channel: of a `TabCoordinator`, and of a `TabGroup`. */
const COORDINATOR_PREFIX = "@procedures/store/tab:";
const GROUP_PREFIX = "@procedures/store/tabs:";

/** The defaults of the snapshot (roadmap CLI-66). */
const SNAPSHOT_CHUNK = 500;
const SNAPSHOT_TIMEOUT = 10_000;

/** The fields of each message. A message of a `TabGroup` has `collection`, except `leader` for all the collections. */
interface MessageBase {
  readonly v: typeof PROTOCOL;
  readonly from: string;
  readonly collection?: string;
}

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
 * - `snapshot-request`: the tab `from` asks the leader for the entries of its copy (roadmap CLI-66).
 *   A new request of a tab has a larger number.
 * - `snapshot`: one chunk of the answer of the leader to the request `request` of the tab `to`.
 *   `seqs` has the number of the last batch of each tab that the entries hold.
 */
type TabMessage<T> =
  | (MessageBase & { readonly type: "changes"; readonly seq: number; readonly changes: StorageChangeBatch<T> })
  | (MessageBase & { readonly type: "hello"; readonly seq: number; readonly pending: ReadonlyArray<SentBatch<T>> })
  | (MessageBase & { readonly type: "leader" })
  | (MessageBase & { readonly type: "ack"; readonly to: string; readonly seq: number })
  | (MessageBase & { readonly type: "status"; readonly seq: number; readonly status: PortableStatus })
  | (MessageBase & { readonly type: "snapshot-request"; readonly request: number })
  | (MessageBase & {
      readonly type: "snapshot";
      readonly to: string;
      readonly request: number;
      readonly part: number;
      readonly parts: number;
      readonly seqs: SnapshotSeqs;
      readonly entries: SnapshotEntries<T>;
    });

type SnapshotMessage<T> = Extract<TabMessage<T>, { readonly type: "snapshot" }>;

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

  private readonly group: GroupEngine;
  private readonly collection: CollectionSync<T>;

  constructor(options: TabCoordinatorOptions<T>) {
    if (typeof options?.name !== "string" || options.name === "") throw new TypeError("TabCoordinator needs a name");
    const settings = collectionSettings(options, "TabCoordinator");
    const hybrid = options.hybrid ?? {};
    this.group = new GroupEngine({
      prefix: COORDINATOR_PREFIX,
      name: options.name,
      single: true,
      open: undefined,
      backoff: retryBackoff(options.retry),
      clock: options.clock ?? hybrid.clock ?? realClock,
      random: options.random ?? hybrid.random ?? Math.random,
      onError: options.onError ?? reportListenerError,
    });
    this.id = this.group.id;
    this.lockName = this.group.lockName;
    this.collection = this.group.add(options.name, options, settings);
    this.group.start(options.locks, options.channel);
  }

  /** The role of this tab now. */
  get role(): TabRole {
    return this.collection.role;
  }

  /** True when this tab runs the sync: the leader, or a tab in the single mode. */
  get isLeader(): boolean {
    return this.collection.isLeader;
  }

  /**
   * The `HybridStorage` of the sync while this tab runs it, or else undefined. `getStatus()` of the
   * coordinator gives the state of the sync in each tab. Write to the local copy, not to this
   * storage: each tab then writes in the same way.
   */
  get syncStorage(): HybridStorage<T> | undefined {
    return this.collection.syncStorage;
  }

  /**
   * This method starts to send the change batches to an observer: the batches of the local copy of
   * this tab, and the batches of the other tabs. Each batch comes one time, with the origin of each
   * change. In the leader, the batches of the sync have the origin `syncOrigin` of the
   * `HybridStorage`. A batch of another tab comes after the local copy of this tab has it. The
   * entries of a snapshot come in one batch of sets, with the origin `syncOrigin`.
   *
   * @returns The function that stops the batches. A second use of it does nothing.
   * @throws Error after `close()`
   */
  observe(observer: StorageObserver<T>): () => void {
    return this.collection.observe(observer);
  }

  /**
   * This method starts to send the role of this tab to a listener at each change.
   *
   * @returns The function that stops the roles. A second use of it does nothing.
   * @throws Error after `close()`
   */
  onRole(listener: (role: TabRole) => void): () => void {
    return this.collection.onRole(listener);
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
    return this.collection.getStatus();
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
    return this.collection.onStatus(listener);
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
    return this.group.close();
  }
}

/**
 * One leader tab runs the sync of many collections, with one lock and one channel (roadmap CLI-64).
 * The other tabs copy the changes of each collection.
 *
 * @example
 * ```typescript
 * import { ApiStorage, IndexedDbQueueStore, TabGroup } from "@procedures/store/browser";
 *
 * const tenant = new TabGroup({
 *   name: tenantId,
 *   open: (collection) => ({
 *     local: localCopyOf(collection),
 *     copy: "tab",
 *     remote: () => new ApiStorage(client, { collection }),
 *     hybrid: { queueStore: new IndexedDbQueueStore(`${tenantId}-${collection}-queue`) },
 *     snapshot: true,
 *   }),
 * });
 *
 * const notes = tenant.collection<Note>("notes");
 * notes.observe((batch) => render(batch));
 * notes.onStatus((status) => showSync("notes", status));
 * ```
 */
export class TabGroup {
  /** The id of this tab: a new random id for each group. */
  readonly id: string;
  /** The name of the lock and of the channel. */
  readonly lockName: string;

  private readonly group: GroupEngine;

  constructor(options: TabGroupOptions) {
    if (typeof options?.name !== "string" || options.name === "") throw new TypeError("TabGroup needs a name");
    if (options.open !== undefined && typeof options.open !== "function") throw new TypeError("The option open of a TabGroup must be a function");
    this.group = new GroupEngine({
      prefix: GROUP_PREFIX,
      name: options.name,
      single: false,
      open: options.open,
      backoff: retryBackoff(options.retry),
      clock: options.clock ?? realClock,
      random: options.random ?? Math.random,
      onError: options.onError ?? reportListenerError,
    });
    this.id = this.group.id;
    this.lockName = this.group.lockName;
    this.group.start(options.locks, options.channel);
  }

  /** The role of this tab in the group. A collection has its own role too. */
  get role(): TabRole {
    return this.group.role;
  }

  /** True when this tab holds the lock of the group, or runs in the single mode. */
  get isLeader(): boolean {
    return this.group.role === "leader" || this.group.role === "single";
  }

  /** The names of the collections of the group in this tab. */
  get collections(): string[] {
    return [...this.group.members.keys()];
  }

  /**
   * This method gives a collection of the group. It adds the collection at its first use. When the
   * group has the collection, the method gives it and ignores `options`.
   *
   * @param options The options of a new collection. The default is the result of `open(name)`.
   * @throws TypeError for a new collection without options, or with options of a wrong shape
   * @throws Error after `close()`
   */
  collection<T>(name: string, options?: TabCollectionOptions<T>): TabCollection<T> {
    return this.group.collection(name, options);
  }

  /**
   * This method starts to send the role of this tab in the group to a listener at each change.
   *
   * @returns The function that stops the roles. A second use of it does nothing.
   * @throws Error after `close()`
   */
  onRole(listener: (role: TabRole) => void): () => void {
    if (this.group.closed) throw new Error("The TabGroup is closed");
    return this.group.roleListeners.add(listener);
  }

  /**
   * This method closes the group and each of its collections, as `TabCoordinator.close()` does.
   * The leader closes each `HybridStorage`, and then it releases the lock.
   */
  close(): Promise<void> {
    return this.group.close();
  }
}

/** The settings of a collection that the options give. */
interface CollectionSettings {
  /** The longest number of entries in a chunk, and the wait for a chunk. `want` is true with the option `snapshot`. */
  readonly snapshot: { readonly want: boolean; readonly chunk: number; readonly timeout: number };
}

/** The options of the engine of a group. */
interface EngineOptions {
  readonly prefix: string;
  readonly name: string;
  /** True for a `TabCoordinator`: one collection, and messages without the field `collection` */
  readonly single: boolean;
  readonly open: ((collection: string) => TabCollectionOptions<any> | undefined) | undefined;
  readonly backoff: Backoff;
  readonly clock: Clock;
  readonly random: () => number;
  readonly onError: ListenerErrorHandler;
}

/**
 * The lock, the channel and the collections of a tab. A `TabCoordinator` is a group with one
 * collection, whose messages have no field `collection`: thus it talks with a tab of an older release.
 */
class GroupEngine {
  readonly id: string;
  readonly lockName: string;
  /** True for a `TabCoordinator` */
  readonly legacy: boolean;
  readonly backoff: Backoff;
  readonly clock: Clock;
  readonly random: () => number;
  readonly onError: ListenerErrorHandler;
  readonly roleListeners: StorageListeners<TabRole>;
  /** The collections of this tab, by name */
  readonly members = new Map<string, CollectionSync<any>>();
  /** An object for each time that this tab holds the lock. A collection leads only with the lease of now. */
  lease: object | undefined;
  /** True in the single mode */
  alone = false;
  closed = false;

  private readonly open: EngineOptions["open"];
  /** The names for which `open` gave no options */
  private readonly refused = new Set<string>();
  private currentRole: TabRole = "follower";
  private started = false;
  /** The lock manager, or undefined in the single mode */
  private locks: TabLockManagerLike | undefined;
  private channel: TabChannelLike | undefined;
  /** The number of the failed setups of the group in a row: each setup where no collection could lead */
  private failures = 0;
  /** The stop of the wait before the next try */
  private cancelRetry: Cancel | undefined;
  private closing: Promise<void> | undefined;
  /** The abort of the lock request that waits */
  private abortRequest: (() => void) | undefined;
  /** The release of the lock */
  private releaseLock: (() => void) | undefined;

  constructor(options: EngineOptions) {
    this.id = randomId();
    this.lockName = `${options.prefix}${options.name}`;
    this.legacy = options.single;
    this.open = options.open;
    this.backoff = options.backoff;
    this.clock = options.clock;
    this.random = options.random;
    this.onError = options.onError;
    this.roleListeners = new StorageListeners<TabRole>(this.onError);
  }

  get role(): TabRole {
    return this.currentRole;
  }

  /** True while the tab has a channel. */
  get hasChannel(): boolean {
    return this.channel !== undefined;
  }

  /** The name of the coordinator or of the group, for the messages of the errors. */
  get kind(): string {
    return this.legacy ? "TabCoordinator" : "TabGroup";
  }

  /** This method opens the channel and asks for the lock, or starts the single mode. */
  start(locksOption: TabLockManagerLike | null | undefined, channelOption: TabChannelFactory | null | undefined): void {
    this.started = true;
    const locks = locksOption === undefined ? globalLocks() : (locksOption ?? undefined);
    const openChannel = channelOption === undefined ? globalChannelFactory() : (channelOption ?? undefined);
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
    for (const member of this.members.values()) member.begin();
    this.elect(locks);
  }

  /** This method gives a collection of a `TabGroup`, and adds it at its first use. */
  collection<T>(name: string, options: TabCollectionOptions<T> | undefined): CollectionSync<T> {
    if (this.closed) throw new Error("The TabGroup is closed");
    if (typeof name !== "string" || name === "") throw new TypeError("A collection of a TabGroup needs a name");
    const known = this.members.get(name);
    if (known) return known as CollectionSync<T>;
    const resolved = options ?? (this.open?.(name) as TabCollectionOptions<T> | undefined);
    if (!resolved) throw new TypeError(`The TabGroup has no options for the collection ${JSON.stringify(name)}: give options or the function open`);
    return this.add(name, resolved, collectionSettings(resolved, "A collection of a TabGroup"));
  }

  /** This method adds a collection. After the start, the collection says hello, and it leads when the tab holds the lock. */
  add<T>(name: string, options: TabCollectionOptions<T>, settings: CollectionSettings): CollectionSync<T> {
    const member = new CollectionSync<T>(this, name, options, settings);
    this.members.set(name, member);
    this.refused.delete(name);
    if (!this.started) return member;
    if (this.alone) {
      member.startSingle();
      return member;
    }
    member.begin();
    if (this.lease) member.startLead(this.lease, true);
    return member;
  }

  /** @returns False when the message did not go out: no channel, or a value that the channel cannot clone */
  post(collection: string | undefined, message: TabMessage<unknown>): boolean {
    const channel = this.channel;
    if (!channel) return false;
    try {
      channel.postMessage(this.legacy || collection === undefined ? message : { ...message, collection });
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  close(): Promise<void> {
    if (!this.closing) this.closing = this.shutDown();
    return this.closing;
  }

  private async shutDown(): Promise<void> {
    this.closed = true;
    this.abortRequest?.();
    this.abortRequest = undefined;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    this.lease = undefined;
    this.setRole("closed");
    const members = [...this.members.values()];
    try {
      // The leader holds the lock until each queue reached the remote or its queue store
      await Promise.all(members.map((member) => member.shutDown()));
    } finally {
      this.releaseLock?.();
      this.releaseLock = undefined;
      // The acknowledgements of the close of the storages went out before
      try {
        this.channel?.close();
      } catch {
        // The channel is closed already
      }
      this.channel = undefined;
      for (const member of members) member.clearListeners();
      this.roleListeners.clear();
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
        if (await this.lead()) {
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
      if (this.closed || this.lease) return;
      // The lock manager refused the request: this tab runs the sync alone
      this.onError(error);
      this.stopChannel();
      this.locks = undefined;
      this.startSingle();
    });
  }

  /**
   * This method runs in a tab that got the lock. Each collection makes its `HybridStorage` and
   * loads its queue, and it leads at the end of its load. When no collection can lead, the tab
   * releases the lock. Else the collections whose setup failed try again alone after their backoff.
   *
   * @returns False when the tab must release the lock: no collection could lead, or `close()`
   */
  private async lead(): Promise<boolean> {
    const lease = {};
    this.lease = lease;
    const members = [...this.members.values()];
    // A coordinator tells its new role at once, as before. A group tells it one time for all its collections.
    const results = await Promise.all(members.map((member) => member.takeLead(lease, this.legacy)));
    if (this.lease !== lease) return false;
    if (members.length > 0 && ![...this.members.values()].some((member) => member.leads)) {
      this.lease = undefined;
      return false;
    }
    this.failures = 0;
    this.setRole("leader");
    // Each follower says hello for each of its collections: the leader gets their batches, and makes the collections that it does not have
    if (!this.legacy) this.post(undefined, { v: PROTOCOL, type: "leader", from: this.id });
    members.forEach((member, at) => {
      if (!results[at]) member.retryInLeader();
    });
    return true;
  }

  /** This method starts the single mode: each collection runs its sync alone. */
  private startSingle(): void {
    this.alone = true;
    this.setRole("single");
    for (const member of [...this.members.values()]) member.startSingle();
  }

  /** This method asks for the lock again after the backoff (roadmap CLI-67). */
  private retryLater(): void {
    if (this.closed) return;
    this.failures++;
    const wait = backoffDelay(this.backoff, this.failures, this.random);
    const cancel = this.clock.after(wait, () => {
      this.cancelRetry = undefined;
      if (this.closed || !this.locks) return;
      this.elect(this.locks);
    });
    // The wait must not keep a Node process alive
    cancel.unref?.();
    this.cancelRetry = cancel;
  }

  private setRole(role: TabRole): void {
    if (this.currentRole === role) return;
    this.currentRole = role;
    this.roleListeners.emit(role);
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
  // ═══ The messages of the other tabs ═══
  //

  private receive(data: unknown): void {
    if (this.closed || !isTabMessage<unknown>(data) || data.from === this.id) return;
    if (this.legacy) {
      for (const member of this.members.values()) member.receive(data);
      return;
    }
    const name = data.collection;
    if (name === undefined) {
      // A new leader of the group: each collection of this tab says hello
      if (data.type === "leader") for (const member of [...this.members.values()]) member.receive(data);
      return;
    }
    const member = this.members.get(name) ?? this.adopt(name, data.type);
    member?.receive(data);
  }

  /**
   * The leader makes a collection that another tab has, with the function `open`. Thus the leader
   * runs the sync of each collection of each tab.
   */
  private adopt(name: string, type: TabMessage<unknown>["type"]): CollectionSync<unknown> | undefined {
    if ((type !== "hello" && type !== "changes") || this.currentRole !== "leader" || !this.open || this.refused.has(name)) return undefined;
    try {
      const options = this.open(name);
      if (options) return this.add(name, options, collectionSettings(options, "A collection of a TabGroup"));
    } catch (error) {
      this.onError(error);
    }
    this.refused.add(name);
    return undefined;
  }
}

/**
 * The sync of one collection in a tab: the leader runs its `HybridStorage`, and a follower copies
 * the batches of the other tabs. The group gives the lock and the channel.
 */
class CollectionSync<T> implements TabCollection<T> {
  readonly name: string;

  private readonly group: GroupEngine;
  private readonly local: LocalCopyStorage<T>;
  private readonly shared: boolean;
  private readonly makeRemote: () => CollectionStorage<T>;
  private readonly hybridOptions: Omit<HybridStorageOptions, "local" | "capture">;
  private readonly settings: CollectionSettings;
  /** The origin of the `HybridStorage` and of the writes of the coordinator to the local copy. */
  private readonly tag: string;
  private readonly writeOptions: StorageWriteOptions;
  private readonly observers: StorageListeners<StorageChangeBatch<T>>;
  private readonly roleListeners: StorageListeners<TabRole>;
  private readonly statusListeners: StorageListeners<SyncStatus>;
  /** The observers that the `HybridStorage` of the leader adds to its local copy: the capture */
  private readonly captures: StorageListeners<StorageChangeBatch<T>>;
  private currentRole: TabRole = "follower";
  private hybrid: HybridStorage<T> | undefined;
  /** The storage of this tab while it loads its queue, before the tab leads */
  private candidate: Candidate<T> | undefined;
  /** The number of the failed setups of this collection in a row, when the group leads or is single */
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
  /** The number of the last batch of each other tab that the local copy of this tab holds (roadmap CLI-66) */
  private readonly applied = new Map<string, number>();
  /** In the leader: the number of the last batch of each tab that the leader captured. A tab without a hello is not here. */
  private readonly captured = new Map<string, number>();
  /** The batches of the other tabs: they reach the local copy and the observers in their order */
  private incoming: Promise<void> = Promise.resolve();
  private closed = false;
  /** The snapshot that this tab waits for, and the number of its last request (roadmap CLI-66) */
  private snapshot: PendingSnapshot<T> | undefined;
  private requests = 0;
  /** The batches of the other tabs that wait for the snapshot, in their order */
  private held: Array<{ readonly from: string; readonly batch: SentBatch<T> }> = [];
  /** The own writes while the snapshot waits: the number of the last own batch of each id, and of the last clear */
  private readonly ownWrites = new Map<string, number>();
  private ownClear = 0;
  /** The stop of the wait for the next chunk */
  private cancelSnapshotWait: Cancel | undefined;

  constructor(group: GroupEngine, name: string, options: TabCollectionOptions<T>, settings: CollectionSettings) {
    this.group = group;
    this.name = name;
    this.local = options.local;
    this.shared = options.copy === "shared";
    this.makeRemote = options.remote;
    this.hybridOptions = options.hybrid ?? {};
    this.settings = settings;
    this.tag = this.hybridOptions.origin ?? `tab-${group.id}`;
    this.writeOptions = { origin: this.tag };
    this.observers = new StorageListeners<StorageChangeBatch<T>>(group.onError);
    this.roleListeners = new StorageListeners<TabRole>(group.onError);
    this.statusListeners = new StorageListeners<SyncStatus>(group.onError);
    this.captures = new StorageListeners<StorageChangeBatch<T>>(group.onError);
    // The observer of a follower. A tab that leads stops it. A single tab whose setup failed keeps its batches with it.
    this.stopTap = this.local.observe!((batch) => this.onFollowerBatch(batch));
  }

  get role(): TabRole {
    return this.currentRole;
  }

  get isLeader(): boolean {
    return this.currentRole === "leader" || this.currentRole === "single";
  }

  get syncStorage(): HybridStorage<T> | undefined {
    return this.hybrid;
  }

  /** True while the `HybridStorage` of this tab runs the sync of the collection. */
  get leads(): boolean {
    return this.hybrid !== undefined;
  }

  observe(observer: StorageObserver<T>): () => void {
    if (this.closed) throw new Error(`The ${this.group.kind} is closed`);
    return this.observers.add(observer);
  }

  onRole(listener: (role: TabRole) => void): () => void {
    if (this.closed) throw new Error(`The ${this.group.kind} is closed`);
    return this.roleListeners.add(listener);
  }

  getStatus(): SyncStatus | undefined {
    return this.status;
  }

  onStatus(listener: (status: SyncStatus) => void): () => void {
    if (this.closed) throw new Error(`The ${this.group.kind} is closed`);
    return this.statusListeners.add(listener);
  }

  /** This method starts the collection on the channel: it says hello, and it asks for a snapshot. */
  begin(): void {
    if (this.settings.snapshot.want) this.snapshot = { request: 0, chunks: [], received: 0 };
    this.hello();
    this.requestSnapshot();
  }

  /** This method closes the storage of the collection. The group then releases the lock and closes the channel. */
  async shutDown(): Promise<void> {
    this.closed = true;
    this.stopTap?.();
    this.stopTap = undefined;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    this.cancelSnapshotWait?.();
    this.cancelSnapshotWait = undefined;
    this.snapshot = undefined;
    this.held = [];
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
      if (hybrid) await hybrid.close();
    } catch (error) {
      this.group.onError(error);
    }
  }

  clearListeners(): void {
    this.observers.clear();
    this.roleListeners.clear();
    this.statusListeners.clear();
    this.captures.clear();
  }

  //
  // ═══ The setup of the sync ═══
  //

  /** This method sets up the sync in a tab that holds the lock. A failure tries again after the backoff, while the tab holds the lock. */
  startLead(lease: object, announce: boolean): void {
    void this.takeLead(lease, announce).then((led) => {
      if (!led && !this.closed && this.group.lease === lease) this.retryInLeader();
    });
  }

  /**
   * This method runs after a failed setup in a tab that keeps the lock. No other tab leads the
   * collection, so no snapshot comes: the batches that waited reach the local copy now.
   */
  retryInLeader(): void {
    this.endSnapshot();
    this.retryLater();
  }

  /**
   * This method makes the `HybridStorage` of a tab that got the lock, and waits for the load of its
   * queue. Then the collection leads. Until then, it is a follower: its own batches go to the other
   * tabs and to its outbox, and the capture of the storage ignores the local copy.
   *
   * @param announce True: the collection tells the other tabs that it leads. Else the group tells it.
   * @returns False when the setup failed (the error went to `onError`), after `close()`, or when the tab lost the lease
   */
  async takeLead(lease: object, announce: boolean): Promise<boolean> {
    if (this.hybrid) return true;
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
    if (!failed && this.group.lease === lease) {
      this.promote(candidate, "leader", announce);
      return true;
    }
    if (failed) this.group.onError(failure);
    candidate.stop();
    try {
      await candidate.hybrid.close();
    } catch (error) {
      this.group.onError(error);
    }
    return false;
  }

  /** This method makes the `HybridStorage` of the single mode. The collection tries again after the backoff when it fails. */
  startSingle(): void {
    if (this.closed || this.hybrid) return;
    // No other tab sends a snapshot
    this.endSnapshot();
    const candidate = this.makeCandidate();
    if (candidate) this.promote(candidate, "single", false);
    else this.retryLater();
  }

  /** This method tries the setup again after the backoff of the collection (roadmap CLI-67). */
  retryLater(): void {
    if (this.closed) return;
    this.cancelRetry?.();
    this.failures++;
    const wait = backoffDelay(this.group.backoff, this.failures, this.group.random);
    const cancel = this.group.clock.after(wait, () => {
      this.cancelRetry = undefined;
      if (this.closed || this.hybrid) return;
      if (this.group.alone) this.startSingle();
      else if (this.group.lease) this.startLead(this.group.lease, true);
    });
    // The wait must not keep a Node process alive
    cancel.unref?.();
    this.cancelRetry = cancel;
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
      this.group.onError(error);
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
      this.group.onError(error);
      // The remote of a storage that did not start stays open otherwise
      Promise.resolve()
        .then(() => remote.close())
        .catch((closeError: unknown) => this.group.onError(closeError));
      return undefined;
    }
    // The observer starts at once: the other tabs get the changes of the load and of the first sync
    const stop = hybrid.observe((batch) => this.onLeaderBatch(batch));
    return { hybrid, gate, stop };
  }

  /**
   * This method makes this tab the leader of the collection, or the single tab, with the storage of
   * a candidate. The capture of the storage gets the batches of this tab that no leader acknowledged.
   */
  private promote(candidate: Candidate<T>, role: "leader" | "single", announce: boolean): void {
    const { hybrid, gate, stop } = candidate;
    this.hybrid = hybrid;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    this.failures = 0;
    // The capture starts and the observer of the follower stops in one step: no change of the local copy goes between them
    gate.open = true;
    const stopFollower = this.stopTap;
    this.stopTap = stop;
    stopFollower?.();
    for (const batch of this.outbox.splice(0)) this.capture(batch.changes);
    // The copy of this tab is now the copy that the other tabs get: a snapshot that waits ends without entries
    this.endSnapshot();
    this.setRole(role);
    if (announce) this.post({ v: PROTOCOL, type: "leader", from: this.group.id });
    // The status of this tab is now the status of its storage, also when it has the values of the last status of the old leader. The followers get it.
    this.status = undefined;
    this.statusFrom = undefined;
    this.stopStatus = hybrid.onStatus((status) => this.onOwnStatus(hybrid, status));
    this.onOwnStatus(hybrid, hybrid.getStatus());
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
    this.post({ v: PROTOCOL, type: "status", from: this.group.id, seq: this.statusSeq, status: portableStatus(this.status) });
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
    if (this.snapshot) this.noteOwn(changes, seq);
    this.observers.emit(changes);
    const sent = this.post({ v: PROTOCOL, type: "changes", from: this.group.id, seq, changes });
    if (keep && (sent || !this.group.hasChannel)) this.outbox.push({ seq, changes });
  }

  /** This method tells the leader the batches of this tab that no leader acknowledged. */
  private hello(): void {
    this.post({ v: PROTOCOL, type: "hello", from: this.group.id, seq: this.seq, pending: this.outbox });
  }

  /** @returns False when the message did not go out */
  private post(message: TabMessage<T>): boolean {
    return this.group.post(this.name, message);
  }

  //
  // ═══ The batches of the other tabs ═══
  //

  /** A message of another tab for this collection. */
  receive(data: TabMessage<unknown>): void {
    if (this.closed) return;
    const message = data as TabMessage<T>;
    switch (message.type) {
      case "changes":
        this.onChanges(message.from, { seq: message.seq, changes: message.changes });
        break;
      case "hello":
        this.onHello(message.from, message.seq, message.pending);
        break;
      case "leader":
        // The new leader gets the batches that no leader acknowledged, and the snapshot that waits
        if (this.currentRole === "follower") {
          this.hello();
          this.requestSnapshot();
        }
        break;
      case "ack":
        if (message.to === this.group.id) this.outbox = this.outbox.filter((batch) => batch.seq > message.seq);
        break;
      case "status":
        this.onLeaderStatus(message.from, message.seq, message.status);
        break;
      case "snapshot-request":
        this.sendSnapshot(message.from, message.request);
        break;
      case "snapshot":
        this.onSnapshot(message);
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
   * tab, and then to the observers. The batches go in their order. While a snapshot waits, the
   * batch waits for it.
   */
  private copy(from: string, batch: SentBatch<T>): void {
    if (batch.seq <= (this.seen.get(from) ?? 0)) return;
    this.seen.set(from, batch.seq);
    if (this.snapshot) this.held.push({ from, batch });
    else this.apply(from, batch);
  }

  /** This method writes a batch of another tab to the local copy, and then gives it to the observers. */
  private apply(from: string, batch: SentBatch<T>): void {
    this.incoming = this.incoming
      .then(async () => {
        if (this.closed) return;
        if (!this.shared) await this.write(batch.changes);
        this.applied.set(from, Math.max(this.applied.get(from) ?? 0, batch.seq));
        if (!this.closed) this.observers.emit(batch.changes);
      })
      .catch((error: unknown) => this.group.onError(error));
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
      () => void this.post({ v: PROTOCOL, type: "ack", from: this.group.id, to, seq }),
      (error: unknown) => this.group.onError(error),
    );
  }

  //
  // ═══ The snapshot for a new tab (roadmap CLI-66) ═══
  //

  /** This method asks the leader for a snapshot, while the snapshot waits. A new request replaces the last one. */
  private requestSnapshot(): void {
    if (!this.snapshot) return;
    const request = ++this.requests;
    this.snapshot = { request, chunks: [], received: 0 };
    this.post({ v: PROTOCOL, type: "snapshot-request", from: this.group.id, request });
    this.waitSnapshot();
  }

  /** This method starts the wait for the next chunk again. At its end, the tab continues without the snapshot. */
  private waitSnapshot(): void {
    this.cancelSnapshotWait?.();
    const cancel = this.group.clock.after(this.settings.snapshot.timeout, () => {
      this.cancelSnapshotWait = undefined;
      if (this.closed || !this.snapshot) return;
      this.group.onError(new Error(`No leader sent the snapshot of the collection ${JSON.stringify(this.name)} in time`));
      this.endSnapshot();
    });
    // The wait must not keep a Node process alive
    cancel.unref?.();
    this.cancelSnapshotWait = cancel;
  }

  /**
   * The leader sends the entries of its local copy to the tab `to`, in chunks. The numbers come
   * before the read of the entries: thus the entries hold each batch up to the numbers. A batch
   * after them can be in the entries too, and the new tab writes it again with the same values.
   */
  private sendSnapshot(to: string, request: number): void {
    if (!this.hybrid || this.currentRole !== "leader") return;
    const chunk = this.settings.snapshot.chunk;
    // The batches of the other tabs that this tab got before the request reach the local copy first
    this.incoming = this.incoming
      .then(async () => {
        if (this.closed || this.currentRole !== "leader") return;
        const seqs: Array<[string, number]> = [[this.group.id, this.seq], ...this.applied];
        const entries = await this.local.getEntries();
        if (this.closed) return;
        const parts = Math.max(1, Math.ceil(entries.length / chunk));
        for (let part = 0; part < parts; part++) {
          const slice = entries.slice(part * chunk, (part + 1) * chunk);
          if (!this.post({ v: PROTOCOL, type: "snapshot", from: this.group.id, to, request, part, parts, seqs, entries: slice })) return;
        }
      })
      .catch((error: unknown) => this.group.onError(error));
  }

  /** A chunk of a snapshot. The tab keeps the chunks of its last request from one leader, and applies them after the last one. */
  private onSnapshot(message: SnapshotMessage<T>): void {
    const pending = this.snapshot;
    if (!pending || message.to !== this.group.id || message.request !== pending.request) return;
    if (pending.from === undefined) {
      pending.from = message.from;
      pending.parts = message.parts;
      pending.seqs = message.seqs;
    } else if (message.from !== pending.from || message.parts !== pending.parts) {
      return;
    }
    if (pending.chunks[message.part] !== undefined) return;
    pending.chunks[message.part] = message.entries;
    pending.received++;
    if (pending.received < message.parts) this.waitSnapshot();
    else this.applySnapshot(pending);
  }

  /**
   * This method writes the entries of a snapshot to the local copy, and then the batches that
   * waited. It skips the batches that the snapshot holds, and the entries of the ids that this tab
   * wrote after the snapshot.
   */
  private applySnapshot(pending: PendingSnapshot<T>): void {
    this.snapshot = undefined;
    this.cancelSnapshotWait?.();
    this.cancelSnapshotWait = undefined;
    const seqs = new Map<string, number>(pending.seqs ?? []);
    const mine = seqs.get(this.group.id) ?? 0;
    const entries: Array<[string, T]> = [];
    if (this.ownClear <= mine) {
      for (const chunk of pending.chunks) {
        for (const [id, value] of chunk ?? []) if ((this.ownWrites.get(id) ?? 0) <= mine) entries.push([id, value]);
      }
    }
    this.ownWrites.clear();
    this.ownClear = 0;
    seqs.delete(this.group.id);
    // A batch that the snapshot holds and that comes later is not new
    for (const [from, seq] of seqs) if (seq > (this.seen.get(from) ?? 0)) this.seen.set(from, seq);
    const origin = this.hybridOptions.syncOrigin ?? "sync";
    this.incoming = this.incoming
      .then(async () => {
        if (this.closed) return;
        if (entries.length > 0) await this.local.setBatch(entries, this.writeOptions);
        for (const [from, seq] of seqs) this.applied.set(from, Math.max(this.applied.get(from) ?? 0, seq));
        if (!this.closed && entries.length > 0) this.observers.emit(entries.map(([id, value]): StorageChangeEvent<T> => ({ type: "set", id, value, origin })));
      })
      .catch((error: unknown) => this.group.onError(error));
    for (const { from, batch } of this.held.splice(0)) if (batch.seq > (seqs.get(from) ?? 0)) this.apply(from, batch);
  }

  /** This method ends a snapshot that waits, without entries: the batches that waited reach the local copy. */
  private endSnapshot(): void {
    if (!this.snapshot) return;
    this.snapshot = undefined;
    this.cancelSnapshotWait?.();
    this.cancelSnapshotWait = undefined;
    this.ownWrites.clear();
    this.ownClear = 0;
    for (const { from, batch } of this.held.splice(0)) this.apply(from, batch);
  }

  /** This method records the ids of an own batch while the snapshot waits. */
  private noteOwn(changes: StorageChangeBatch<T>, seq: number): void {
    for (const change of changes) {
      if (change.type === "clear") this.ownClear = seq;
      else this.ownWrites.set(change.id, seq);
    }
  }
}

/**
 * The settings of the options of a collection.
 *
 * @throws TypeError for a local copy without `observe()`, an unknown `copy`, no `remote`, or a snapshot of a shared copy
 * @throws RangeError for a `snapshot.chunk` that is not a whole number of 1 or more
 */
function collectionSettings<T>(options: TabCollectionOptions<T>, owner: string): CollectionSettings {
  if (typeof options?.local?.observe !== "function") throw new TypeError(`${owner} needs a local copy with observe()`);
  if (options.copy !== "shared" && options.copy !== "tab") {
    throw new TypeError(`Unknown copy ${JSON.stringify(options.copy)}: use shared or tab`);
  }
  if (typeof options.remote !== "function") throw new TypeError(`${owner} needs the function remote`);
  const snapshot = options.snapshot ?? false;
  const want = snapshot !== false;
  if (want && options.copy !== "tab") throw new TypeError('The option snapshot needs copy: "tab": the tabs of a shared copy have the entries');
  const details = typeof snapshot === "object" && snapshot !== null ? snapshot : {};
  const chunk = details.chunk ?? SNAPSHOT_CHUNK;
  if (!(Number.isSafeInteger(chunk) && chunk >= 1)) throw new RangeError(`snapshot.chunk must be a whole number of 1 or more, not ${chunk}`);
  const timeout = optionalMs(details.timeout, "snapshot.timeout") ?? SNAPSHOT_TIMEOUT;
  if (!(timeout > 0)) throw new RangeError(`snapshot.timeout must be a time of more than zero, not ${timeout} ms`);
  return { snapshot: { want, chunk, timeout } };
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

/** True when a value is a list of pairs whose first value is a string, and whose second value passes `second`. */
function isPairs(value: unknown, second: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every((pair: unknown) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && second(pair[1]));
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
    collection?: unknown;
    seq?: unknown;
    changes?: unknown;
    pending?: unknown;
    status?: unknown;
    request?: unknown;
    part?: unknown;
    parts?: unknown;
    seqs?: unknown;
    entries?: unknown;
  };
  if (message.v !== PROTOCOL || typeof message.from !== "string") return false;
  if (message.collection !== undefined && typeof message.collection !== "string") return false;
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
    case "snapshot-request":
      return isSeq(message.request);
    case "snapshot":
      return (
        typeof message.to === "string" &&
        isSeq(message.request) &&
        isSeq(message.parts) &&
        message.parts >= 1 &&
        isSeq(message.part) &&
        message.part < message.parts &&
        isPairs(message.seqs, isSeq) &&
        isPairs(message.entries, () => true)
      );
    default:
      return false;
  }
}
