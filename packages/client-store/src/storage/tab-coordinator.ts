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
import { HybridStorage, type HybridStorageOptions, type LocalCopyStorage } from "./hybrid.js";

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
 *   its own changes to the leader.
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

  /** The function that makes the remote of the `HybridStorage`. Only the leader calls it. */
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
   * The function that gets the errors: of the lock, of the channel, of a write to the local copy,
   * of the `HybridStorage` and of the observers. The default throws the error again in a microtask.
   */
  onError?: ListenerErrorHandler;
}

/** A change batch of a tab, with its number. */
interface SentBatch<T> {
  readonly seq: number;
  readonly changes: StorageChangeBatch<T>;
}

/** The version of the messages. A tab ignores a message of another version. */
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
 */
type TabMessage<T> =
  | { readonly v: typeof PROTOCOL; readonly type: "changes"; readonly from: string; readonly seq: number; readonly changes: StorageChangeBatch<T> }
  | { readonly v: typeof PROTOCOL; readonly type: "hello"; readonly from: string; readonly seq: number; readonly pending: ReadonlyArray<SentBatch<T>> }
  | { readonly v: typeof PROTOCOL; readonly type: "leader"; readonly from: string }
  | { readonly v: typeof PROTOCOL; readonly type: "ack"; readonly from: string; readonly to: string; readonly seq: number };

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
  /** The observers that the `HybridStorage` of the leader adds to its local copy: the capture */
  private readonly captures: StorageListeners<StorageChangeBatch<T>>;
  private currentRole: TabRole = "follower";
  private channel: TabChannelLike | undefined;
  private hybrid: HybridStorage<T> | undefined;
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
    this.captures = new StorageListeners<StorageChangeBatch<T>>(this.onError);

    const locks = options.locks === undefined ? globalLocks() : (options.locks ?? undefined);
    const openChannel = options.channel === undefined ? globalChannelFactory() : (options.channel ?? undefined);
    if (!locks || !openChannel) {
      this.lead("single");
      return;
    }
    try {
      this.channel = openChannel(this.lockName);
    } catch (error) {
      this.onError(error);
      this.lead("single");
      return;
    }
    this.channel.onmessage = (event: { data?: unknown } | undefined) => this.receive(event?.data);
    this.stopTap = this.local.observe!((batch) => this.onFollowerBatch(batch));
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
   * The `HybridStorage` of the sync while this tab runs it, or else undefined. Its `getStatus()`
   * gives the state of the sync. Write to the local copy, not to this storage: each tab then writes
   * in the same way.
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
   * This method closes the coordinator.
   *
   * - A follower stops its lock request. It does not become the leader.
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
    this.setRole("closed");
    const hybrid = this.hybrid;
    this.hybrid = undefined;
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
        // A HybridStorage that cannot start releases the lock: another tab tries
        if (!this.lead("leader")) return;
        await held;
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
      this.lead("single");
    });
  }

  /**
   * This method makes the `HybridStorage` of the sync: the tab becomes the leader, or the single
   * tab. The capture of the storage gets the batches of this tab that no leader acknowledged.
   *
   * @returns False when the storage could not start
   */
  private lead(role: "leader" | "single"): boolean {
    if (this.closed) return false;
    let hybrid: HybridStorage<T>;
    try {
      hybrid = new HybridStorage<T>(this.makeRemote(), {
        ...this.hybridOptions,
        local: this.captureCopy(),
        capture: "observe",
        origin: this.tag,
      });
    } catch (error) {
      this.onError(error);
      return false;
    }
    this.hybrid = hybrid;
    // The new observer starts before the old one stops: no change of the local copy goes between them
    const stopFollower = this.stopTap;
    this.stopTap = hybrid.observe((batch) => this.onLeaderBatch(batch));
    stopFollower?.();
    for (const batch of this.outbox.splice(0)) this.capture(batch.changes);
    this.setRole(role);
    if (role === "leader") this.post({ v: PROTOCOL, type: "leader", from: this.id });
    return true;
  }

  /**
   * The local copy for the `HybridStorage` of the leader. Its `observe()` gives the changes of the
   * local copy and the batches of the other tabs, so the capture queues both. Its `close()` does
   * nothing: the application owns the local copy.
   */
  private captureCopy(): LocalCopyStorage<T> {
    const captures = this.captures;
    const observe = (observer: StorageObserver<T>): (() => void) => {
      const stopLocal = this.local.observe!(observer);
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

  /** This method gives a batch of this tab to its observers and to the other tabs. A follower keeps it for the leader. */
  private share(changes: StorageChangeBatch<T>, keep: boolean): void {
    const seq = ++this.seq;
    this.observers.emit(changes);
    const sent = this.post({ v: PROTOCOL, type: "changes", from: this.id, seq, changes });
    if (sent && keep) this.outbox.push({ seq, changes });
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
   * batch of the tab after `seq`. Each tab copies the batches that it did not see.
   */
  private onHello(from: string, seq: number, pending: ReadonlyArray<SentBatch<T>>): void {
    if (this.hybrid && this.currentRole === "leader") {
      const known = this.captured.get(from);
      for (const batch of pending) if (known === undefined || batch.seq > known) this.capture(batch.changes);
      this.captured.set(from, Math.max(known ?? 0, seq));
      if (pending.length > 0) this.acknowledge(from, seq);
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

/** True when a value is a message of the channel, of this version. */
function isTabMessage<T>(value: unknown): value is TabMessage<T> {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { v?: unknown; type?: unknown; from?: unknown; to?: unknown; seq?: unknown; changes?: unknown; pending?: unknown };
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
    default:
      return false;
  }
}
