/**
 * `TabCoordinator` (roadmap CLI-25), in a browser in memory: a lock manager and the channels of its
 * tabs, and `fake-indexeddb` for the shared local copy and the shared queue store. The tests cover
 * the election, the failover, the followers that never sync, the way of a write of a follower to
 * the remote, the batches in the other tabs, the echoes, the single mode and `close()`. They also
 * cover the new try after a failed setup (CLI-67) and the status of the leader in each tab (CLI-65).
 * The last tests cover `TabGroup`, many collections with one lock and one channel (CLI-64), and the
 * snapshot for a new tab (CLI-66).
 */

import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryStorage, type CollectionStorage, type StorageChangeBatch } from "@procedures/collections";
import { ms, type Clock } from "@procedures/client";
import { fakeClock } from "@mark1russell7/service/testing";
import { IndexedDbQueueStore, IndexedDbStorage } from "../indexeddb.js";
import { QueueStoreError, type HybridMode, type LocalCopyStorage } from "./hybrid.js";
import { MemoryQueueStore, type QueuedOperation, type QueueStore } from "./queue.js";
import {
  TabCoordinator,
  TabGroup,
  type TabChannelFactory,
  type TabChannelLike,
  type TabCollectionOptions,
  type TabLockManagerLike,
  type TabRetryOptions,
  type TabRole,
  type TabSnapshotOptions,
} from "./tab-coordinator.js";
import type { SyncStatus } from "./types.js";

type Item = { n: number };

/** The name of the coordinators, of their lock and of their channel. */
const NAME = "notes";
const CHANNEL = `@procedures/store/tab:${NAME}`;

/** A lock request of a tab that waits for the lock or holds it. */
interface LockRequest {
  readonly tab: FakeTab;
  readonly callback: (lock: unknown) => Promise<void>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

/**
 * A browser in memory: the exclusive locks of the Web Locks API, the broadcast channels, and one
 * IndexedDB for all its tabs. A channel delivers each message to the other channels of its name in
 * a later task, as a structured clone, in the order of the messages.
 */
class FakeBrowser {
  readonly indexedDB = new IDBFactory();
  /** Each message that a tab sent, in its order, and the name of its channel at the same index */
  readonly sent: Array<{
    type?: string;
    from?: string;
    to?: string;
    seq?: number;
    collection?: string;
    request?: number;
    part?: number;
    parts?: number;
    entries?: unknown[];
  }> = [];
  readonly via: string[] = [];
  /** A message for which this function gives true goes to no tab: a lost message, or a tab that ignores it */
  drop: ((message: FakeBrowser["sent"][number]) => boolean) | undefined;
  /** True: the lock manager grants no lock until `resume()` */
  paused = false;
  private readonly channels = new Map<string, Set<FakeChannel>>();
  private readonly holders = new Map<string, LockRequest>();
  private readonly queues = new Map<string, LockRequest[]>();

  join(channel: FakeChannel): void {
    const members = this.channels.get(channel.name) ?? new Set<FakeChannel>();
    members.add(channel);
    this.channels.set(channel.name, members);
  }

  leave(channel: FakeChannel): void {
    this.channels.get(channel.name)?.delete(channel);
  }

  deliver(sender: FakeChannel, message: unknown): void {
    const data = structuredClone(message);
    this.sent.push(data as FakeBrowser["sent"][number]);
    this.via.push(sender.name);
    if (this.drop?.(data as FakeBrowser["sent"][number])) return;
    for (const other of this.channels.get(sender.name) ?? []) {
      if (other === sender) continue;
      setTimeout(() => other.receive(structuredClone(data)), 0);
    }
  }

  request(tab: FakeTab, name: string, options: { readonly signal?: unknown }, callback: (lock: unknown) => Promise<void>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const signal = options.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        reject(new DOMException("The request was aborted", "AbortError"));
        return;
      }
      const request: LockRequest = { tab, callback, resolve, reject };
      const queue = this.queues.get(name) ?? [];
      this.queues.set(name, queue);
      queue.push(request);
      signal?.addEventListener("abort", () => {
        const at = queue.indexOf(request);
        // A lock that the tab holds stays: an abort after the grant does nothing
        if (at < 0) return;
        queue.splice(at, 1);
        reject(new DOMException("The request was aborted", "AbortError"));
      });
      queueMicrotask(() => this.grant(name));
    });
  }

  /** This method grants the lock again after `paused`. */
  resume(): void {
    this.paused = false;
    for (const name of this.queues.keys()) this.grant(name);
  }

  /** The tab that holds the lock of a name. */
  holder(name: string): FakeTab | undefined {
    return this.holders.get(name)?.tab;
  }

  /** A tab dies: the browser releases its lock and drops its requests, and its channels get and send nothing. */
  kill(tab: FakeTab): void {
    for (const [name, holder] of [...this.holders]) if (holder.tab === tab) this.release(name, holder);
    for (const queue of this.queues.values()) {
      for (let at = queue.length - 1; at >= 0; at--) if (queue[at]!.tab === tab) queue.splice(at, 1);
    }
    for (const channel of tab.channels) this.leave(channel);
  }

  private grant(name: string): void {
    if (this.paused || this.holders.has(name)) return;
    const request = this.queues.get(name)?.shift();
    if (!request) return;
    this.holders.set(name, request);
    void Promise.resolve()
      .then(() => request.callback({ name }))
      .then(request.resolve, request.reject)
      .finally(() => this.release(name, request));
  }

  private release(name: string, request: LockRequest): void {
    if (this.holders.get(name) !== request) return;
    this.holders.delete(name);
    this.grant(name);
  }
}

/** A tab of the browser: its lock manager and its channel factory. */
class FakeTab {
  dead = false;
  /** The number of the lock requests of the tab */
  requests = 0;
  readonly channels: FakeChannel[] = [];
  readonly locks: TabLockManagerLike;
  readonly channel: TabChannelFactory;

  constructor(readonly browser: FakeBrowser) {
    this.locks = {
      request: (name, options, callback) => {
        this.requests++;
        return this.browser.request(this, name, options, callback);
      },
    };
    this.channel = (name) => {
      const channel = new FakeChannel(name, this);
      this.channels.push(channel);
      return channel;
    };
  }

  kill(): void {
    this.dead = true;
    this.browser.kill(this);
  }
}

class FakeChannel implements TabChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(
    readonly name: string,
    readonly tab: FakeTab,
  ) {
    tab.browser.join(this);
  }

  postMessage(message: unknown): void {
    // A closed BroadcastChannel throws InvalidStateError
    if (this.closed) throw new Error("The channel is closed");
    if (!this.tab.dead) this.tab.browser.deliver(this, message);
  }

  receive(data: unknown): void {
    if (!this.closed && !this.tab.dead) this.onmessage?.({ data });
  }

  close(): void {
    this.closed = true;
    this.tab.browser.leave(this);
  }
}

/** The methods of a remote that write. */
const WRITES: ReadonlySet<string> = new Set(["set", "setBatch", "delete", "deleteBatch", "clear"]);

/**
 * The remote in memory. Each tab opens its own view, which records its calls. The close of a view
 * leaves the data open. `writes` has each change of the data, in its order. While `down.failure`
 * has a value, each write rejects with it.
 */
function remoteOf() {
  const data = new InMemoryStorage<Item>();
  const calls: string[] = [];
  const opened: string[] = [];
  const writes: string[] = [];
  const down: { failure?: unknown } = {};
  data.observe((batch) => void writes.push(...batch.map((change) => (change.type === "clear" ? "clear" : `${change.type}:${change.id}`))));
  const open = (tab: string): CollectionStorage<Item> => {
    opened.push(tab);
    return new Proxy(data, {
      get(target, property) {
        if (property === "close") return () => Promise.resolve();
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls.push(`${tab}:${String(property)}`);
          if (down.failure !== undefined && WRITES.has(String(property))) return Promise.reject(down.failure);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  };
  return { data, calls, opened, writes, down, open };
}

/** A queue store in memory whose loads wait for `open()`. */
class GatedQueueStore extends MemoryQueueStore {
  loads = 0;
  open: () => void = () => undefined;
  private readonly opened = new Promise<void>((resolve) => (this.open = resolve));

  override async load(): Promise<QueuedOperation[]> {
    this.loads++;
    await this.opened;
    return super.load();
  }
}

/** A queue store in memory whose first loads fail. */
class FlakyQueueStore extends MemoryQueueStore {
  constructor(private failures: number) {
    super();
  }

  override load(): Promise<QueuedOperation[]> {
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error("The queue store is blocked"));
    }
    return super.load();
  }
}

type Remote = ReturnType<typeof remoteOf>;

interface TabOptions {
  readonly copy: "shared" | "tab";
  readonly mode?: HybridMode;
  /** The function `remote` of the tab. The default opens a view of the remote in memory. */
  readonly remote?: () => CollectionStorage<Item>;
  /** The default is the shared `IndexedDbQueueStore` of the browser. */
  readonly queueStore?: QueueStore;
  readonly clock?: Clock;
  readonly retry?: TabRetryOptions;
  readonly snapshot?: boolean | TabSnapshotOptions;
}

/** A tab of the app: its local copy, its coordinator, the batches of its observer and its errors. */
function openTab(browser: FakeBrowser, remote: Remote, name: string, options: TabOptions) {
  const tab = new FakeTab(browser);
  const local = options.copy === "shared" ? new IndexedDbStorage<Item>(NAME, { indexedDB: browser.indexedDB }) : new InMemoryStorage<Item>();
  const errors: unknown[] = [];
  const coordinator = new TabCoordinator<Item>({
    name: NAME,
    local,
    copy: options.copy,
    remote: options.remote ?? (() => remote.open(name)),
    hybrid: {
      mode: options.mode ?? "write-back",
      syncInterval: ms(0),
      queueStore: options.queueStore ?? new IndexedDbQueueStore(`${NAME}-queue`, { indexedDB: browser.indexedDB }),
    },
    locks: tab.locks,
    channel: tab.channel,
    ...(options.clock && { clock: options.clock }),
    ...(options.retry && { retry: options.retry }),
    ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
    // No jitter: each wait is the backoff
    random: () => 0,
    onError: (error) => void errors.push(error),
  });
  const batches: StorageChangeBatch<Item>[] = [];
  coordinator.observe((batch) => void batches.push(batch));
  return { name, tab, local, coordinator, batches, errors };
}

type AppTab = ReturnType<typeof openTab>;

/** Some tasks, so the messages and the grants that wait arrive. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) await new Promise((resolve) => setTimeout(resolve, 5));
}

/** The leader is ready: its first sync ended, and each follower said hello to it. */
async function leaderReady(browser: FakeBrowser, leader: AppTab, followers: number): Promise<void> {
  await vi.waitFor(() => expect(leader.coordinator.role).toBe("leader"));
  await leader.coordinator.syncStorage!.getAll();
  await vi.waitFor(() => {
    const leaderAt = browser.sent.findIndex((message) => message.type === "leader" && message.from === leader.coordinator.id);
    expect(leaderAt).toBeGreaterThanOrEqual(0);
    expect(browser.sent.slice(leaderAt).filter((message) => message.type === "hello")).toHaveLength(followers);
  });
  await settle();
}

describe("TabCoordinator: the election (CLI-25)", () => {
  it("one tab is the leader, and the followers make no remote call and no HybridStorage", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    await remote.data.set("old", { n: 0 });
    const a = openTab(browser, remote, "A", { copy: "shared" });
    const b = openTab(browser, remote, "B", { copy: "shared" });
    const c = openTab(browser, remote, "C", { copy: "shared" });
    const roles: TabRole[] = [];
    a.coordinator.onRole((role) => void roles.push(role));
    await leaderReady(browser, a, 2);

    expect([a.coordinator.role, b.coordinator.role, c.coordinator.role]).toEqual(["leader", "follower", "follower"]);
    expect(roles).toEqual(["leader"]);
    expect(a.coordinator.isLeader).toBe(true);
    expect(b.coordinator.isLeader).toBe(false);
    expect(b.coordinator.syncStorage).toBeUndefined();
    expect(c.coordinator.syncStorage).toBeUndefined();
    expect(browser.holder(a.coordinator.lockName)).toBe(a.tab);
    // Only the leader made a remote, and only it called the remote
    expect(remote.opened).toEqual(["A"]);
    expect(remote.calls.length).toBeGreaterThan(0);
    expect(remote.calls.every((call) => call.startsWith("A:"))).toBe(true);
    // The first sync of the leader wrote the remote item to the shared local copy
    expect(await c.local.get("old")).toEqual({ n: 0 });
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  });

  it("when the leader closes, the next tab becomes the leader and pushes the writes of the followers", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "shared" });
    const b = openTab(browser, remote, "B", { copy: "shared" });
    const c = openTab(browser, remote, "C", { copy: "shared" });
    await leaderReady(browser, a, 2);

    await c.local.set("x", { n: 1 });
    await vi.waitFor(() => expect(a.coordinator.syncStorage!.getPendingOpsCount()).toBe(1));
    // The close of the leader sends its queue, and then it releases the lock
    await a.coordinator.close();
    expect(await remote.data.get("x")).toEqual({ n: 1 });
    expect(a.coordinator.role).toBe("closed");
    await leaderReady(browser, b, 1);
    expect(c.coordinator.role).toBe("follower");
    expect(remote.opened).toEqual(["A", "B"]);

    await c.local.set("y", { n: 2 });
    await vi.waitFor(() => expect(b.coordinator.syncStorage!.getPendingOpsCount()).toBe(1));
    await b.coordinator.syncStorage!.flush();
    expect(await remote.data.get("y")).toEqual({ n: 2 });
    // Each write reached the remote one time
    expect(remote.writes).toEqual(["set:x", "set:y"]);
    expect(remote.calls.some((call) => call.startsWith("C:"))).toBe(false);
    await b.coordinator.close();
    await c.coordinator.close();
  });

  it("when the leader dies, the next leader pushes the shared queue, and a batch without an acknowledgement comes in the hello", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "shared" });
    const b = openTab(browser, remote, "B", { copy: "shared" });
    const c = openTab(browser, remote, "C", { copy: "shared" });
    await leaderReady(browser, a, 2);

    // The leader captures the write of C, and its queue store holds it: the leader acknowledges it
    await c.local.set("x", { n: 1 });
    await vi.waitFor(() => expect(browser.sent.some((message) => message.type === "ack" && message.to === c.coordinator.id)).toBe(true));
    // The leader dies before it pushes: no close, and the browser releases its lock
    browser.paused = true;
    a.tab.kill();
    // No tab leads now: the write of C waits in its outbox
    await c.local.set("y", { n: 2 });
    await settle();
    expect(b.coordinator.role).toBe("follower");
    browser.resume();

    await vi.waitFor(() => expect(b.coordinator.role).toBe("leader"));
    // The first sync of the new leader pushes the queue that the dead leader kept in the shared store
    await b.coordinator.syncStorage!.getAll();
    expect(await remote.data.get("x")).toEqual({ n: 1 });
    // The hello of C gives the write that no leader acknowledged
    await vi.waitFor(async () => {
      await b.coordinator.syncStorage!.flush();
      expect(await remote.data.get("y")).toEqual({ n: 2 });
    });
    expect(remote.writes).toEqual(["set:x", "set:y"]);
    expect(remote.calls.some((call) => call.startsWith("C:"))).toBe(false);
    expect(b.errors).toEqual([]);
    expect(c.errors).toEqual([]);
    await b.coordinator.close();
    await c.coordinator.close();
  });

  it("a follower that becomes the leader captures its own batches that no leader acknowledged", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    await leaderReady(browser, a, 1);

    browser.paused = true;
    a.tab.kill();
    await b.local.set("z", { n: 3 });
    browser.resume();
    await vi.waitFor(() => expect(b.coordinator.role).toBe("leader"));
    await b.coordinator.syncStorage!.flush();
    expect(await remote.data.get("z")).toEqual({ n: 3 });
    expect(remote.writes).toEqual(["set:z"]);
    // The observer of B got its own write first. The load of the queue gives it again, as a change of the sync.
    expect(b.batches[0]).toEqual([{ type: "set", id: "z", value: { n: 3 } }]);
    await b.coordinator.close();
  });
});

describe("TabCoordinator: the writes and the batches (CLI-25)", () => {
  it("a write of a follower reaches the remote one time, through the leader in write-through mode", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "shared", mode: "write-through" });
    const b = openTab(browser, remote, "B", { copy: "shared", mode: "write-through" });
    await leaderReady(browser, a, 1);

    await b.local.set("a", { n: 1 }, { origin: "ui" });
    await vi.waitFor(async () => expect(await remote.data.get("a")).toEqual({ n: 1 }));
    await settle();
    expect(remote.writes).toEqual(["set:a"]);
    expect(remote.calls.filter((call) => call.endsWith(":set"))).toEqual(["A:set"]);
    expect(remote.opened).toEqual(["A"]);
    // The queue store of the leader holds the write, so the leader acknowledged it
    expect(browser.sent.filter((message) => message.type === "ack")).toEqual([expect.objectContaining({ to: b.coordinator.id, seq: 1 })]);
    await b.coordinator.close();
    await a.coordinator.close();
    expect(remote.writes).toEqual(["set:a"]);
  });

  it("the observers of each tab get each batch one time, with its origin (a shared local copy)", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "shared" });
    const b = openTab(browser, remote, "B", { copy: "shared" });
    const c = openTab(browser, remote, "C", { copy: "shared" });
    await leaderReady(browser, a, 2);

    // A write of a follower
    await b.local.set("a", { n: 1 }, { origin: "ui" });
    const write = [{ type: "set", id: "a", value: { n: 1 }, origin: "ui" }];
    await vi.waitFor(() => expect(c.batches).toEqual([write]));
    await vi.waitFor(() => expect(a.batches).toEqual([write]));
    expect(b.batches).toEqual([write]);

    // A write of the application in the leader tab
    await a.local.delete("a", { origin: "ui" });
    const deleted = [{ type: "delete", id: "a", origin: "ui" }];
    await vi.waitFor(() => expect(b.batches).toEqual([write, deleted]));
    await vi.waitFor(() => expect(c.batches).toEqual([write, deleted]));

    // A change of the sync of the leader
    await remote.data.set("r", { n: 9 });
    await a.coordinator.syncStorage!.syncFromRemote();
    const pulled = [{ type: "set", id: "r", value: { n: 9 }, origin: "sync" }];
    await vi.waitFor(() => expect(b.batches).toEqual([write, deleted, pulled]));
    await vi.waitFor(() => expect(c.batches).toEqual([write, deleted, pulled]));
    await settle();
    expect(a.batches).toEqual([write, deleted, pulled]);
    expect(b.batches).toHaveLength(3);
    expect(c.batches).toHaveLength(3);
    // The followers read the change of the sync in the shared local copy
    expect(await c.local.get("r")).toEqual({ n: 9 });
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  });

  it("a local copy for each tab gets the batches of the other tabs, and no tab sends a batch again", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab", mode: "write-through" });
    const b = openTab(browser, remote, "B", { copy: "tab", mode: "write-through" });
    const c = openTab(browser, remote, "C", { copy: "tab", mode: "write-through" });
    await leaderReady(browser, a, 2);
    const before = browser.sent.length;

    await b.local.setBatch(
      [
        ["a", { n: 1 }],
        ["b", { n: 2 }],
      ],
      { origin: "ui" },
    );
    await vi.waitFor(async () => expect(await remote.data.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]));
    await vi.waitFor(async () => expect(await c.local.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]));
    expect(await a.local.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    await settle();
    // One message of changes: the tabs that got the batch did not send it again
    const changes = browser.sent.slice(before).filter((message) => message.type === "changes");
    expect(changes).toEqual([expect.objectContaining({ from: b.coordinator.id })]);
    const batch = [
      { type: "set", id: "a", value: { n: 1 }, origin: "ui" },
      { type: "set", id: "b", value: { n: 2 }, origin: "ui" },
    ];
    expect(a.batches).toEqual([batch]);
    expect(b.batches).toEqual([batch]);
    expect(c.batches).toEqual([batch]);
    expect(remote.writes).toEqual(["set:a", "set:b"]);

    // A change of the sync of the leader reaches the copy of each follower
    await remote.data.delete("a");
    await a.coordinator.syncStorage!.syncFromRemote();
    await vi.waitFor(async () => expect(await b.local.has("a")).toBe(false));
    await vi.waitFor(async () => expect(await c.local.has("a")).toBe(false));
    await settle();
    expect(c.batches).toEqual([batch, [{ type: "delete", id: "a", origin: "sync" }]]);
    expect(browser.sent.slice(before).filter((message) => message.type === "changes")).toHaveLength(2);
    expect(remote.writes).toEqual(["set:a", "set:b", "delete:a"]);
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  });

  it("ignores a message of another version or of another shape", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    await leaderReady(browser, a, 1);
    const stranger = new FakeTab(browser).channel(CHANNEL);
    stranger.postMessage({ v: 2, type: "changes", from: "x", seq: 1, changes: [{ type: "set", id: "a", value: { n: 1 } }] });
    stranger.postMessage({ v: 1, type: "changes", from: "x", seq: 1, changes: [{ type: "set", id: 7 }] });
    stranger.postMessage({ v: 1, type: "hello", from: "x", seq: 1, pending: "none" });
    stranger.postMessage("text");
    // A type of a later release, and statuses of a wrong shape (CLI-65)
    stranger.postMessage({ v: 1, type: "future", from: "x", seq: 1 });
    stranger.postMessage({ v: 1, type: "status", from: "x", seq: 9, status: { connected: "yes", syncing: false, pendingChanges: 0 } });
    stranger.postMessage({
      v: 1,
      type: "status",
      from: "x",
      seq: 9,
      status: { connected: true, syncing: false, pendingChanges: 0, error: { operation: "explode", name: "Error", message: "m" } },
    });
    await settle();
    expect(b.coordinator.getStatus()).toEqual(a.coordinator.getStatus());
    expect(a.batches).toEqual([]);
    expect(b.batches).toEqual([]);
    expect(await b.local.size()).toBe(0);
    expect(a.coordinator.syncStorage!.getPendingOpsCount()).toBe(0);
    expect([...a.errors, ...b.errors]).toEqual([]);
  });
});

describe("TabCoordinator: close() and the single mode (CLI-25)", () => {
  it("a closed follower does not become the leader, and gets and sends nothing", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    const c = openTab(browser, remote, "C", { copy: "tab" });
    await leaderReady(browser, a, 2);

    const closing = b.coordinator.close();
    expect(b.coordinator.close()).toBe(closing);
    await closing;
    expect(b.coordinator.role).toBe("closed");
    expect(() => b.coordinator.observe(() => undefined)).toThrow(/closed/);
    expect(() => b.coordinator.onRole(() => undefined)).toThrow(/closed/);
    expect(b.tab.channels[0]!.closed).toBe(true);

    // A write in the closed tab does not go out
    const sent = browser.sent.length;
    await b.local.set("b", { n: 2 });
    await settle();
    expect(browser.sent.length).toBe(sent);

    // The lock goes to C, not to the closed tab
    await a.coordinator.close();
    await vi.waitFor(() => expect(c.coordinator.role).toBe("leader"));
    expect(b.coordinator.role).toBe("closed");
    expect(remote.opened).toEqual(["A", "C"]);
    await c.local.set("c", { n: 3 });
    await settle();
    expect(b.batches).toEqual([]);
    expect(await b.local.has("c")).toBe(false);
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
    await c.coordinator.close();
  });

  it("without a lock manager, the tab runs the sync alone and opens no channel", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const channel = vi.fn<TabChannelFactory>();
    const coordinator = new TabCoordinator<Item>({
      name: NAME,
      local,
      copy: "tab",
      remote: () => remote.open("single"),
      hybrid: { mode: "write-through", syncInterval: ms(0) },
      locks: null,
      channel,
    });
    expect(coordinator.role).toBe("single");
    expect(coordinator.isLeader).toBe(true);
    expect(channel).not.toHaveBeenCalled();
    const batches: StorageChangeBatch<Item>[] = [];
    coordinator.observe((batch) => void batches.push(batch));
    await coordinator.syncStorage!.getAll();
    await local.set("a", { n: 1 }, { origin: "ui" });
    await vi.waitFor(async () => expect(await remote.data.get("a")).toEqual({ n: 1 }));
    expect(batches).toEqual([[{ type: "set", id: "a", value: { n: 1 }, origin: "ui" }]]);
    await coordinator.close();
    expect(coordinator.role).toBe("closed");
    // The coordinator does not close the local copy of the application
    expect(await local.get("a")).toEqual({ n: 1 });
  });

  it("a lock manager that refuses the request gives the error and the single mode", async () => {
    const remote = remoteOf();
    const errors: unknown[] = [];
    const browser = new FakeBrowser();
    const tab = new FakeTab(browser);
    const refused = new Error("SecurityError");
    const coordinator = new TabCoordinator<Item>({
      name: NAME,
      local: new InMemoryStorage<Item>(),
      copy: "tab",
      remote: () => remote.open("refused"),
      hybrid: { syncInterval: ms(0), queueStore: new MemoryQueueStore() },
      locks: { request: () => Promise.reject(refused) },
      channel: tab.channel,
      onError: (error) => void errors.push(error),
    });
    expect(coordinator.role).toBe("follower");
    await vi.waitFor(() => expect(coordinator.role).toBe("single"));
    expect(errors).toEqual([refused]);
    expect(tab.channels[0]!.closed).toBe(true);
    expect(coordinator.syncStorage).toBeDefined();
    await coordinator.close();
  });

  it("refuses options without a name, a local copy with observe(), a kind of copy or a remote", () => {
    const local = new InMemoryStorage<Item>();
    const remote = () => new InMemoryStorage<Item>();
    const base = { name: NAME, local, copy: "tab" as const, remote, locks: null };
    expect(() => new TabCoordinator<Item>({ ...base, name: "" })).toThrow(/name/);
    const withoutObserve = Object.assign(Object.create(local) as InMemoryStorage<Item>, { observe: undefined });
    expect(() => new TabCoordinator<Item>({ ...base, local: withoutObserve })).toThrow(/observe/);
    expect(() => new TabCoordinator<Item>({ ...base, copy: "both" as never })).toThrow(/Unknown copy/);
    expect(() => new TabCoordinator<Item>({ ...base, remote: undefined as never })).toThrow(/remote/);
    // The backoff of a new try (CLI-67)
    expect(() => new TabCoordinator<Item>({ ...base, retry: { delay: ms(0) } })).toThrow(RangeError);
    expect(() => new TabCoordinator<Item>({ ...base, retry: { factor: 0.5 } })).toThrow(/retry.factor/);
    expect(() => new TabCoordinator<Item>({ ...base, retry: { jitter: 2 } })).toThrow(/retry.jitter/);
    expect(() => new TabCoordinator<Item>({ ...base, retry: { delay: 100 as never } })).toThrow(TypeError);
    // The snapshot for a new tab (CLI-66)
    expect(() => new TabCoordinator<Item>({ ...base, copy: "shared", snapshot: true })).toThrow(/snapshot needs copy/);
    expect(() => new TabCoordinator<Item>({ ...base, snapshot: { chunk: 0 } })).toThrow(RangeError);
    expect(() => new TabCoordinator<Item>({ ...base, snapshot: { chunk: 1.5 } })).toThrow(/snapshot.chunk/);
    expect(() => new TabCoordinator<Item>({ ...base, snapshot: { timeout: ms(0) } })).toThrow(/snapshot.timeout/);
  });
});

describe("TabCoordinator: a new try after a failed setup (CLI-67)", () => {
  it("a tab whose remote fails asks for the lock again after a backoff that grows up to its cap, and then it leads", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const clock = fakeClock();
    const refused = new Error("The remote is not ready");
    let failures = 3;
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", {
      copy: "tab",
      clock,
      retry: { delay: ms(100), maxDelay: ms(250) },
      remote: () => {
        if (failures > 0) {
          failures--;
          throw refused;
        }
        return remote.open("B");
      },
    });
    const roles: TabRole[] = [];
    b.coordinator.onRole((role) => void roles.push(role));
    await leaderReady(browser, a, 1);
    expect(b.tab.requests).toBe(1);

    // The leader closes: B gets the lock, its setup fails, and it releases the lock
    await a.coordinator.close();
    await vi.waitFor(() => expect(b.errors).toEqual([refused]));
    await settle();
    expect(b.coordinator.role).toBe("follower");
    expect(b.coordinator.syncStorage).toBeUndefined();
    expect(browser.holder(b.coordinator.lockName)).toBeUndefined();
    expect(clock.pending).toBe(1);
    // A write during the wait stays in the outbox of B
    await b.local.set("w", { n: 1 });

    // The first wait is 100 ms
    await clock.advance(99);
    await settle();
    expect(b.tab.requests).toBe(1);
    await clock.advance(1);
    await vi.waitFor(() => expect(b.errors).toHaveLength(2));
    expect(b.tab.requests).toBe(2);
    // The second wait is 200 ms
    await clock.advance(199);
    await settle();
    expect(b.tab.requests).toBe(2);
    await clock.advance(1);
    await vi.waitFor(() => expect(b.errors).toHaveLength(3));
    expect(b.tab.requests).toBe(3);
    // The third wait is the cap of 250 ms, not 400 ms
    await clock.advance(249);
    await settle();
    expect(b.tab.requests).toBe(3);
    expect(b.coordinator.role).toBe("follower");
    await clock.advance(1);
    await vi.waitFor(() => expect(b.coordinator.role).toBe("leader"));

    expect(b.tab.requests).toBe(4);
    expect(roles).toEqual(["leader"]);
    expect(b.errors).toEqual([refused, refused, refused]);
    expect(clock.pending).toBe(0);
    // The write of the wait reaches the remote through the new leader
    await b.coordinator.syncStorage!.flush();
    expect(await remote.data.get("w")).toEqual({ n: 1 });
    expect(remote.opened).toEqual(["A", "B"]);
    await b.coordinator.close();
  });

  it("a failed load of the queue releases the lock: the tab leads only after a load that succeeds", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const clock = fakeClock();
    const b = openTab(browser, remote, "B", { copy: "tab", clock, queueStore: new FlakyQueueStore(1) });
    const roles: TabRole[] = [];
    b.coordinator.onRole((role) => void roles.push(role));

    await vi.waitFor(() => expect(b.errors).toHaveLength(1));
    expect(b.errors[0]).toBeInstanceOf(QueueStoreError);
    await settle();
    // The tab did not lead with a storage that refuses each operation
    expect(b.coordinator.role).toBe("follower");
    expect(b.coordinator.syncStorage).toBeUndefined();
    expect(roles).toEqual([]);
    expect(browser.sent.some((message) => message.type === "leader")).toBe(false);
    expect(browser.holder(b.coordinator.lockName)).toBeUndefined();
    await b.local.set("w", { n: 1 });

    // The default first wait is 1 second
    await clock.advance(999);
    await settle();
    expect(b.tab.requests).toBe(1);
    await clock.advance(1);
    await vi.waitFor(() => expect(b.coordinator.role).toBe("leader"));
    expect(roles).toEqual(["leader"]);
    await b.coordinator.syncStorage!.flush();
    expect(await remote.data.get("w")).toEqual({ n: 1 });
    // The storage that failed opened a remote too
    expect(remote.opened).toEqual(["B", "B"]);
    expect(b.errors).toHaveLength(1);
    await b.coordinator.close();
  });

  it("a tab that got the lock is a follower until its queue loaded, and a write of that time goes out one time", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const queueStore = new GatedQueueStore();
    const b = openTab(browser, remote, "B", { copy: "tab", queueStore });
    await vi.waitFor(() => expect(queueStore.loads).toBe(1));
    expect(browser.holder(b.coordinator.lockName)).toBe(b.tab);
    expect(b.coordinator.role).toBe("follower");
    expect(b.coordinator.syncStorage).toBeUndefined();

    // The capture of the storage ignores the local copy during the load: the write goes to the outbox only
    await b.local.set("w", { n: 1 }, { origin: "ui" });
    await settle();
    queueStore.open();
    await vi.waitFor(() => expect(b.coordinator.role).toBe("leader"));
    await b.coordinator.syncStorage!.flush();
    expect(remote.writes).toEqual(["set:w"]);
    expect(b.batches).toEqual([[{ type: "set", id: "w", value: { n: 1 }, origin: "ui" }]]);
    expect(browser.sent.filter((message) => message.type === "changes")).toHaveLength(1);
    expect(b.errors).toEqual([]);
    await b.coordinator.close();
  });

  it("close() during the load of the queue releases the lock, and the tab does not lead", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const queueStore = new GatedQueueStore();
    const b = openTab(browser, remote, "B", { copy: "tab", queueStore });
    await vi.waitFor(() => expect(queueStore.loads).toBe(1));
    expect(browser.holder(b.coordinator.lockName)).toBe(b.tab);

    // The close of the storage waits for its load
    const closing = b.coordinator.close();
    queueStore.open();
    await closing;
    await settle();
    expect(b.coordinator.role).toBe("closed");
    expect(browser.sent.some((message) => message.type === "leader")).toBe(false);
    expect(browser.holder(b.coordinator.lockName)).toBeUndefined();
    expect(b.tab.requests).toBe(1);
    expect(b.errors).toEqual([]);
  });

  it("close() during the wait stops the next try", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const clock = fakeClock();
    const refused = new Error("The remote is not ready");
    const b = openTab(browser, remote, "B", {
      copy: "tab",
      clock,
      remote: () => {
        throw refused;
      },
    });
    await vi.waitFor(() => expect(b.errors).toEqual([refused]));
    await settle();
    expect(clock.pending).toBe(1);

    await b.coordinator.close();
    expect(clock.pending).toBe(0);
    await clock.advance(60_000);
    await settle();
    expect(b.tab.requests).toBe(1);
    expect(b.coordinator.role).toBe("closed");
    expect(browser.holder(b.coordinator.lockName)).toBeUndefined();
    expect(b.errors).toEqual([refused]);
  });

  it("in the single mode, a tab whose setup failed tries again after the wait, with its writes of the wait", async () => {
    const remote = remoteOf();
    const clock = fakeClock();
    const local = new InMemoryStorage<Item>();
    const refused = new Error("The remote is not ready");
    const errors: unknown[] = [];
    let failures = 1;
    const coordinator = new TabCoordinator<Item>({
      name: NAME,
      local,
      copy: "tab",
      remote: () => {
        if (failures > 0) {
          failures--;
          throw refused;
        }
        return remote.open("single");
      },
      hybrid: { mode: "write-back", syncInterval: ms(0) },
      locks: null,
      clock,
      // The jitter of 0.5 at its most: the wait is half of the backoff
      random: () => 1,
      onError: (error) => void errors.push(error),
    });
    expect(coordinator.role).toBe("follower");
    expect(coordinator.syncStorage).toBeUndefined();
    expect(errors).toEqual([refused]);
    await local.set("w", { n: 1 }, { origin: "ui" });

    await clock.advance(499);
    expect(coordinator.role).toBe("follower");
    await clock.advance(1);
    expect(coordinator.role).toBe("single");
    await coordinator.syncStorage!.flush();
    expect(await remote.data.get("w")).toEqual({ n: 1 });
    expect(errors).toEqual([refused]);
    await coordinator.close();
  });
});

describe("TabCoordinator: the status of the sync in each tab (CLI-65)", () => {
  it("the followers get each status change of the leader one time", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    const c = openTab(browser, remote, "C", { copy: "tab" });
    await leaderReady(browser, a, 2);
    // The answers to the hellos gave the status of the leader to each follower
    expect(a.coordinator.getStatus()).toEqual(a.coordinator.syncStorage!.getStatus());
    expect(b.coordinator.getStatus()).toEqual(a.coordinator.getStatus());
    expect(c.coordinator.getStatus()).toEqual(a.coordinator.getStatus());

    const leader: SyncStatus[] = [];
    const seenB: SyncStatus[] = [];
    const seenC: SyncStatus[] = [];
    a.coordinator.onStatus((status) => void leader.push(status));
    b.coordinator.onStatus((status) => void seenB.push(status));
    c.coordinator.onStatus((status) => void seenC.push(status));

    // A write of a follower goes in the queue of the leader, and the push empties the queue
    await c.local.set("x", { n: 1 });
    await vi.waitFor(() => expect(b.coordinator.getStatus()?.pendingChanges).toBe(1));
    await a.coordinator.syncStorage!.flush();
    await vi.waitFor(() => expect(b.coordinator.getStatus()?.pendingChanges).toBe(0));
    await settle();

    expect(leader.map((status) => status.pendingChanges)).toContain(1);
    expect(leader.at(-1)).toMatchObject({ pendingChanges: 0, syncing: false, connected: true });
    // Each status of the leader one time, in its order
    expect(seenB).toEqual(leader);
    expect(seenC).toEqual(leader);
    expect(b.coordinator.getStatus()).toEqual(a.coordinator.getStatus());
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
    await Promise.all([a.coordinator.close(), b.coordinator.close(), c.coordinator.close()]);
    expect(a.coordinator.getStatus()).toBeUndefined();
    expect(b.coordinator.getStatus()).toBeUndefined();
    expect(() => b.coordinator.onStatus(() => undefined)).toThrow(/closed/);
  });

  it("a new tab gets the current status in the answer to its hello, and the other followers do not get it again", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    await leaderReady(browser, a, 1);
    // A write in the leader tab waits in the queue of the write-back mode
    await a.local.set("x", { n: 1 });
    await vi.waitFor(() => expect(b.coordinator.getStatus()?.pendingChanges).toBe(1));
    await settle();
    const seenB: SyncStatus[] = [];
    b.coordinator.onStatus((status) => void seenB.push(status));
    const statuses = browser.sent.filter((message) => message.type === "status").length;

    const d = openTab(browser, remote, "D", { copy: "tab" });
    expect(d.coordinator.getStatus()).toBeUndefined();
    await vi.waitFor(() => expect(d.coordinator.getStatus()).toEqual(a.coordinator.getStatus()));
    await settle();
    expect(d.coordinator.getStatus()).toMatchObject({ pendingChanges: 1, mode: "write-back" });
    // One answer to the hello of D, with the number of the last status: B ignores it
    expect(browser.sent.filter((message) => message.type === "status")).toHaveLength(statuses + 1);
    expect(seenB).toEqual([]);
    expect([...a.errors, ...b.errors, ...d.errors]).toEqual([]);
  });

  it("the status follows a failover: the new leader gives the status of its own storage, and the followers get it", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    const c = openTab(browser, remote, "C", { copy: "tab" });
    await leaderReady(browser, a, 2);
    const seenB: SyncStatus[] = [];
    const seenC: SyncStatus[] = [];
    b.coordinator.onStatus((status) => void seenB.push(status));
    c.coordinator.onStatus((status) => void seenC.push(status));

    await a.coordinator.close();
    await leaderReady(browser, b, 1);
    // B gives the status of its own storage. C got each status of B one time.
    expect(seenB.length).toBeGreaterThan(0);
    expect(b.coordinator.getStatus()).toEqual(b.coordinator.syncStorage!.getStatus());
    await vi.waitFor(() => expect(c.coordinator.getStatus()).toEqual(b.coordinator.getStatus()));
    expect(seenC).toEqual(seenB);
    const fromB = browser.sent.filter((message) => message.type === "status" && message.from === b.coordinator.id);
    expect(fromB.length).toBeGreaterThan(0);

    // A write of C reaches the queue of B, and the status of C shows it
    await c.local.set("y", { n: 2 });
    await vi.waitFor(() => expect(c.coordinator.getStatus()?.pendingChanges).toBe(1));
    expect(b.coordinator.getStatus()?.pendingChanges).toBe(1);
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
    await b.coordinator.close();
    await c.coordinator.close();
  });

  it("an error of the leader reaches the followers as an Error with its name, message and code, also when it does not clone", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    const b = openTab(browser, remote, "B", { copy: "tab" });
    await leaderReady(browser, a, 1);
    // A function does not clone: postMessage refuses this value
    const failure = { name: "NetworkError", message: "The server is down", code: 503, retry: () => undefined };
    expect(() => structuredClone(failure)).toThrow();
    remote.down.failure = failure;

    await b.local.set("x", { n: 1 });
    await vi.waitFor(() => expect(a.coordinator.getStatus()?.pendingChanges).toBe(1));
    await expect(a.coordinator.syncStorage!.flush()).rejects.toBe(failure);
    await vi.waitFor(() => expect(b.coordinator.getStatus()?.error).toBeDefined());

    // The leader keeps its own error. The follower gets a copy.
    expect(a.coordinator.getStatus()!.error).toEqual({ operation: "push", error: failure });
    const status = b.coordinator.getStatus()!;
    expect(status).toMatchObject({ connected: false, pendingChanges: 1, syncing: false });
    expect(status.error!.operation).toBe("push");
    expect(status.error!.error).toBeInstanceOf(Error);
    expect(status.error!.error).toMatchObject({ name: "NetworkError", message: "The server is down", code: 503 });
    // No clone error went to onError
    expect([...a.errors, ...b.errors]).toEqual([]);

    // The next push succeeds: the error goes from the status of the follower too
    delete remote.down.failure;
    await a.coordinator.syncStorage!.flush();
    await vi.waitFor(() => expect(b.coordinator.getStatus()?.error).toBeUndefined());
    expect(b.coordinator.getStatus()).toMatchObject({ connected: true, pendingChanges: 0 });
    await a.coordinator.close();
    await b.coordinator.close();
  });
});

//
// ═══ TabGroup: many collections with one lock and one channel (CLI-64) ═══
//

/** The name of the groups, and the collections of a tab of a group. */
const GROUP = "tenant";
const COLLECTIONS: readonly string[] = ["notes", "tasks"];

interface GroupTabOptions {
  readonly copy: "shared" | "tab";
  /** The name of the group. @default GROUP */
  readonly group?: string;
  readonly collections?: readonly string[];
  readonly mode?: HybridMode;
  /** The function `remote` of a collection. The default opens a view of the remote of the collection. */
  readonly remote?: (collection: string) => CollectionStorage<Item>;
  /** True: the group gets the function `open` */
  readonly open?: boolean;
  readonly snapshot?: boolean | TabSnapshotOptions;
  readonly clock?: Clock;
  readonly retry?: TabRetryOptions;
}

/** A tab of the app with a group: a local copy for each collection, the batches of each collection and the errors. */
function openGroupTab(browser: FakeBrowser, remotes: Record<string, Remote>, name: string, options: GroupTabOptions) {
  const tab = new FakeTab(browser);
  const group = options.group ?? GROUP;
  const errors: unknown[] = [];
  const locals = new Map<string, LocalCopyStorage<Item>>();
  const batches = new Map<string, StorageChangeBatch<Item>[]>();
  const optionsOf = (collection: string): TabCollectionOptions<Item> => {
    const local =
      locals.get(collection) ??
      (options.copy === "shared" ? new IndexedDbStorage<Item>(`${group}-${collection}`, { indexedDB: browser.indexedDB }) : new InMemoryStorage<Item>());
    locals.set(collection, local);
    return {
      local,
      copy: options.copy,
      remote: () => (options.remote ? options.remote(collection) : remotes[collection]!.open(name)),
      hybrid: {
        mode: options.mode ?? "write-back",
        syncInterval: ms(0),
        queueStore: new IndexedDbQueueStore(`${group}-${collection}-queue`, { indexedDB: browser.indexedDB }),
      },
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
    };
  };
  const tabs = new TabGroup({
    name: group,
    locks: tab.locks,
    channel: tab.channel,
    ...(options.open && { open: optionsOf }),
    ...(options.clock && { clock: options.clock }),
    ...(options.retry && { retry: options.retry }),
    random: () => 0,
    onError: (error) => void errors.push(error),
  });
  for (const collection of options.collections ?? COLLECTIONS) {
    const list: StorageChangeBatch<Item>[] = [];
    batches.set(collection, list);
    tabs.collection<Item>(collection, optionsOf(collection)).observe((batch) => void list.push(batch));
  }
  return {
    name,
    tab,
    group: tabs,
    batches,
    errors,
    local: (collection: string) => locals.get(collection)!,
    handle: (collection: string) => tabs.collection<Item>(collection),
  };
}

type GroupTab = ReturnType<typeof openGroupTab>;

/** The leader of a group is ready: the first sync of each collection ended, and the followers said `hellos` hellos after its message. */
async function groupReady(browser: FakeBrowser, leader: GroupTab, hellos: number): Promise<void> {
  await vi.waitFor(() => expect(leader.group.role).toBe("leader"));
  // A collection whose setup failed has no storage yet
  for (const collection of leader.group.collections) await leader.handle(collection).syncStorage?.getAll();
  await vi.waitFor(() => {
    const at = browser.sent.findIndex((message) => message.type === "leader" && message.from === leader.group.id && message.collection === undefined);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(browser.sent.slice(at).filter((message) => message.type === "hello")).toHaveLength(hellos);
  });
  await settle();
}

function remotesOf(...collections: string[]): Record<string, Remote> {
  return Object.fromEntries(collections.map((collection) => [collection, remoteOf()]));
}

/** The ids of the changes of some batches, in their order. */
function idsOf(batches: ReadonlyArray<StorageChangeBatch<Item>> | undefined): string[] {
  return (batches ?? []).flat().map((change) => (change.type === "clear" ? "clear" : change.id));
}

describe("TabGroup: many collections with one lock and one channel (CLI-64)", () => {
  it("one leader runs the sync of each collection, and a write of a follower reaches the remote of its collection one time", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "tasks");
    await remotes["notes"]!.data.set("n0", { n: 0 });
    const a = openGroupTab(browser, remotes, "A", { copy: "tab" });
    const b = openGroupTab(browser, remotes, "B", { copy: "tab" });
    await groupReady(browser, a, 2);

    // One lock and one channel for each tab, not one for each collection
    const lockName = `@procedures/store/tabs:${GROUP}`;
    expect(a.group.lockName).toBe(lockName);
    expect(a.tab.channels.map((channel) => channel.name)).toEqual([lockName]);
    expect(b.tab.channels.map((channel) => channel.name)).toEqual([lockName]);
    expect(b.tab.requests).toBe(1);
    expect(browser.holder(lockName)).toBe(a.tab);
    expect([a.handle("notes").role, a.handle("tasks").role]).toEqual(["leader", "leader"]);
    expect([b.handle("notes").role, b.handle("tasks").role]).toEqual(["follower", "follower"]);
    expect(b.group.role).toBe("follower");
    expect(b.handle("notes").syncStorage).toBeUndefined();
    expect(remotes["notes"]!.opened).toEqual(["A"]);
    expect(remotes["tasks"]!.opened).toEqual(["A"]);
    // The first sync of the leader reached the copy of the follower
    await vi.waitFor(async () => expect(await b.local("notes").get("n0")).toEqual({ n: 0 }));

    await b.local("notes").set("x", { n: 1 });
    await b.local("tasks").set("y", { n: 2 });
    await vi.waitFor(() => expect(a.handle("notes").syncStorage!.getPendingOpsCount()).toBe(1));
    await vi.waitFor(() => expect(a.handle("tasks").syncStorage!.getPendingOpsCount()).toBe(1));
    await a.handle("notes").syncStorage!.flush();
    await a.handle("tasks").syncStorage!.flush();
    expect(remotes["notes"]!.writes).toEqual(["set:n0", "set:x"]);
    expect(remotes["tasks"]!.writes).toEqual(["set:y"]);
    expect([...remotes["notes"]!.calls, ...remotes["tasks"]!.calls].every((call) => call.startsWith("A:"))).toBe(true);
    // Each batch reached only the copy and the observers of its collection
    expect(await a.local("notes").get("x")).toEqual({ n: 1 });
    expect(await a.local("tasks").has("x")).toBe(false);
    expect(await a.local("notes").has("y")).toBe(false);
    expect(a.batches.get("tasks")).toEqual([[{ type: "set", id: "y", value: { n: 2 } }]]);
    // Each message names its collection, except the message of the new leader of the group
    const messages = browser.sent.filter((message) => message.type !== "leader");
    expect(messages.every((message) => message.collection === "notes" || message.collection === "tasks")).toBe(true);
    expect(browser.sent.filter((message) => message.type === "ack").map((message) => message.collection).sort()).toEqual(["notes", "tasks"]);
    expect([...a.errors, ...b.errors]).toEqual([]);
    await Promise.all([a.group.close(), b.group.close()]);
    expect([a.group.role, b.group.role]).toEqual(["closed", "closed"]);
  });

  it("each collection has its own status in each tab (CLI-65)", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "tasks");
    const a = openGroupTab(browser, remotes, "A", { copy: "tab" });
    const b = openGroupTab(browser, remotes, "B", { copy: "tab" });
    await groupReady(browser, a, 2);
    expect(b.handle("notes").getStatus()).toEqual(a.handle("notes").getStatus());
    expect(b.handle("tasks").getStatus()).toEqual(a.handle("tasks").getStatus());
    const notes: SyncStatus[] = [];
    const tasks: SyncStatus[] = [];
    b.handle("notes").onStatus((status) => void notes.push(status));
    b.handle("tasks").onStatus((status) => void tasks.push(status));

    // A write in the leader waits in the queue of notes: only the status of notes changes
    await a.local("notes").set("x", { n: 1 });
    await vi.waitFor(() => expect(b.handle("notes").getStatus()?.pendingChanges).toBe(1));
    await settle();
    expect(b.handle("tasks").getStatus()?.pendingChanges).toBe(0);
    expect(a.handle("tasks").getStatus()?.pendingChanges).toBe(0);
    expect(notes.at(-1)).toEqual(a.handle("notes").getStatus());
    expect(tasks).toEqual([]);
    const statuses = browser.sent.filter((message) => message.type === "status");
    expect(statuses.every((message) => message.collection === "notes" || message.collection === "tasks")).toBe(true);
    expect([...a.errors, ...b.errors]).toEqual([]);
    await Promise.all([a.group.close(), b.group.close()]);
  });

  it("when the leader dies, the next tab leads each collection: it pushes each shared queue and the writes of the change", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "tasks");
    const a = openGroupTab(browser, remotes, "A", { copy: "shared" });
    const b = openGroupTab(browser, remotes, "B", { copy: "shared" });
    const c = openGroupTab(browser, remotes, "C", { copy: "shared" });
    await groupReady(browser, a, 4);

    // The leader captures a write in each collection, and its queue stores hold them
    await c.local("notes").set("x", { n: 1 });
    await c.local("tasks").set("y", { n: 2 });
    await vi.waitFor(() => expect(browser.sent.filter((message) => message.type === "ack" && message.to === c.group.id)).toHaveLength(2));
    browser.paused = true;
    a.tab.kill();
    // No tab leads now: the writes of C wait in the outboxes of their collections
    await c.local("notes").set("x2", { n: 3 });
    await c.local("tasks").set("y2", { n: 4 });
    await settle();
    browser.resume();

    await vi.waitFor(() => expect(b.group.role).toBe("leader"));
    expect([b.handle("notes").role, b.handle("tasks").role]).toEqual(["leader", "leader"]);
    expect(c.group.role).toBe("follower");
    await b.handle("notes").syncStorage!.getAll();
    await b.handle("tasks").syncStorage!.getAll();
    await vi.waitFor(async () => {
      await b.handle("notes").syncStorage!.flush();
      await b.handle("tasks").syncStorage!.flush();
      expect(await remotes["notes"]!.data.get("x2")).toEqual({ n: 3 });
      expect(await remotes["tasks"]!.data.get("y2")).toEqual({ n: 4 });
    });
    expect(remotes["notes"]!.writes).toEqual(["set:x", "set:x2"]);
    expect(remotes["tasks"]!.writes).toEqual(["set:y", "set:y2"]);
    expect(remotes["notes"]!.opened).toEqual(["A", "B"]);
    expect([...remotes["notes"]!.calls, ...remotes["tasks"]!.calls].some((call) => call.startsWith("C:"))).toBe(false);
    expect([...b.errors, ...c.errors]).toEqual([]);
    await Promise.all([b.group.close(), c.group.close()]);
  });

  it("a collection whose setup fails tries again alone after its backoff, and the other collection keeps its sync (CLI-67)", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "tasks");
    const clock = fakeClock();
    const refused = new Error("The remote of tasks is not ready");
    let failures = 2;
    const a = openGroupTab(browser, remotes, "A", {
      copy: "tab",
      clock,
      retry: { delay: ms(100) },
      remote: (collection) => {
        if (collection === "tasks" && failures > 0) {
          failures--;
          throw refused;
        }
        return remotes[collection]!.open("A");
      },
    });
    const b = openGroupTab(browser, remotes, "B", { copy: "tab" });
    const roles: TabRole[] = [];
    a.handle("tasks").onRole((role) => void roles.push(role));
    await groupReady(browser, a, 2);

    // The tab keeps the lock: notes leads, and tasks waits for its next try
    expect(a.errors).toEqual([refused]);
    expect(browser.holder(a.group.lockName)).toBe(a.tab);
    expect(a.handle("notes").role).toBe("leader");
    expect(a.handle("tasks").role).toBe("follower");
    expect(a.handle("tasks").syncStorage).toBeUndefined();
    expect(clock.pending).toBe(1);
    await b.local("notes").set("n", { n: 1 });
    await b.local("tasks").set("t", { n: 2 });
    await vi.waitFor(() => expect(a.handle("notes").syncStorage!.getPendingOpsCount()).toBe(1));
    await settle();
    expect(remotes["tasks"]!.opened).toEqual([]);

    // The first wait is 100 ms, and the second wait is 200 ms
    await clock.advance(100);
    await vi.waitFor(() => expect(a.errors).toHaveLength(2));
    await settle();
    expect(a.handle("tasks").role).toBe("follower");
    await clock.advance(199);
    await settle();
    expect(remotes["tasks"]!.opened).toEqual([]);
    await clock.advance(1);
    await vi.waitFor(() => expect(a.handle("tasks").role).toBe("leader"));
    expect(roles).toEqual(["leader"]);
    // The collection tells the followers that it leads: B sends its write of tasks again
    expect(browser.sent.some((message) => message.type === "leader" && message.collection === "tasks")).toBe(true);
    await vi.waitFor(() => expect(a.handle("tasks").syncStorage!.getPendingOpsCount()).toBe(1));
    await a.handle("tasks").syncStorage!.flush();
    await a.handle("notes").syncStorage!.flush();
    expect(remotes["tasks"]!.writes).toEqual(["set:t"]);
    expect(remotes["notes"]!.writes).toEqual(["set:n"]);
    // The lock never moved
    expect(a.tab.requests).toBe(1);
    expect(a.errors).toEqual([refused, refused]);
    expect(b.errors).toEqual([]);
    await Promise.all([a.group.close(), b.group.close()]);
  });

  it("when no collection can lead, the tab releases the lock and asks for it again after the backoff of the group", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "tasks");
    const clock = fakeClock();
    const refused = new Error("The remote is not ready");
    let failures = 2;
    const a = openGroupTab(browser, remotes, "A", {
      copy: "tab",
      clock,
      remote: (collection) => {
        if (failures > 0) {
          failures--;
          throw refused;
        }
        return remotes[collection]!.open("A");
      },
    });
    await vi.waitFor(() => expect(a.errors).toEqual([refused, refused]));
    await settle();
    expect(a.group.role).toBe("follower");
    expect(browser.holder(a.group.lockName)).toBeUndefined();
    expect(browser.sent.some((message) => message.type === "leader")).toBe(false);
    // One wait of the group, and no wait of a collection
    expect(clock.pending).toBe(1);

    await clock.advance(1000);
    await vi.waitFor(() => expect(a.group.role).toBe("leader"));
    expect(a.tab.requests).toBe(2);
    expect([a.handle("notes").role, a.handle("tasks").role]).toEqual(["leader", "leader"]);
    await a.group.close();
  });

  it("the leader makes a collection that only a follower opened, with the function open", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "extra");
    const a = openGroupTab(browser, remotes, "A", { copy: "tab", collections: ["notes"], open: true });
    const b = openGroupTab(browser, remotes, "B", { copy: "tab", collections: ["notes", "extra"] });
    await vi.waitFor(() => expect(a.group.role).toBe("leader"));

    await b.local("extra").set("e", { n: 1 });
    await vi.waitFor(() => expect(a.group.collections).toEqual(["notes", "extra"]));
    await vi.waitFor(() => expect(a.handle("extra").role).toBe("leader"));
    await vi.waitFor(() => expect(a.handle("extra").syncStorage!.getPendingOpsCount()).toBe(1));
    await a.handle("extra").syncStorage!.flush();
    expect(remotes["extra"]!.writes).toEqual(["set:e"]);
    expect(remotes["extra"]!.opened).toEqual(["A"]);
    // The follower gets the status of the new collection from the leader
    await vi.waitFor(() => expect(b.handle("extra").getStatus()).toEqual(a.handle("extra").getStatus()));
    expect([...a.errors, ...b.errors]).toEqual([]);
    await Promise.all([a.group.close(), b.group.close()]);
  });

  it("an older single-collection tab and a group of the same name use different locks and channels, and never interfere", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const remotes = remotesOf(NAME);
    const old = openTab(browser, remote, "OLD", { copy: "tab" });
    const group = openGroupTab(browser, remotes, "G", { copy: "tab", group: NAME, collections: [NAME] });
    await vi.waitFor(() => expect(old.coordinator.role).toBe("leader"));
    await vi.waitFor(() => expect(group.handle(NAME).role).toBe("leader"));
    expect(old.coordinator.lockName).toBe(CHANNEL);
    expect(group.group.lockName).toBe(`@procedures/store/tabs:${NAME}`);
    expect(browser.holder(CHANNEL)).toBe(old.tab);
    expect(browser.holder(group.group.lockName)).toBe(group.tab);

    await old.local.set("o", { n: 1 });
    await group.local(NAME).set("g", { n: 2 });
    await old.coordinator.syncStorage!.flush();
    await group.handle(NAME).syncStorage!.flush();
    expect(remote.writes).toEqual(["set:o"]);
    expect(remotes[NAME]!.writes).toEqual(["set:g"]);
    // A message of the old shape on the channel of the group has no collection: the group ignores it
    new FakeTab(browser)
      .channel(group.group.lockName)
      .postMessage({ v: 1, type: "changes", from: "x", seq: 1, changes: [{ type: "set", id: "z", value: { n: 9 } }] });
    await settle();
    expect(await group.local(NAME).has("z")).toBe(false);
    expect(await old.local.has("g")).toBe(false);
    expect(await group.local(NAME).has("o")).toBe(false);
    expect(idsOf(old.batches)).toEqual(["o"]);
    expect(idsOf(group.batches.get(NAME))).toEqual(["g"]);
    // Each message with a collection went on the channel of the group, and the old tab sent none
    browser.sent.forEach((message, at) => {
      if (message.collection !== undefined) expect(browser.via[at]).toBe(group.group.lockName);
      if (message.from === old.coordinator.id) {
        expect(browser.via[at]).toBe(CHANNEL);
        expect(message.collection).toBeUndefined();
      }
    });
    expect([...old.errors, ...group.errors]).toEqual([]);
    await Promise.all([old.coordinator.close(), group.group.close()]);
  });

  it("refuses a group without a name, an open that is not a function, and a new collection without options", async () => {
    expect(() => new TabGroup({ name: "", locks: null })).toThrow(/name/);
    expect(() => new TabGroup({ name: GROUP, locks: null, open: "notes" as never })).toThrow(/open/);
    const group = new TabGroup({ name: GROUP, locks: null });
    expect(group.role).toBe("single");
    expect(() => group.collection<Item>("notes")).toThrow(/no options/);
    const options = () => ({ local: new InMemoryStorage<Item>(), copy: "tab" as const, remote: () => new InMemoryStorage<Item>() });
    expect(() => group.collection<Item>("", options())).toThrow(/name/);
    const notes = group.collection<Item>("notes", options());
    // The second use gives the same collection
    expect(group.collection<Item>("notes")).toBe(notes);
    expect(notes.name).toBe("notes");
    expect(notes.role).toBe("single");
    await group.close();
    expect(notes.role).toBe("closed");
    expect(() => group.collection<Item>("tasks", options())).toThrow(/closed/);
    expect(() => group.onRole(() => undefined)).toThrow(/closed/);
    expect(() => notes.observe(() => undefined)).toThrow(/TabGroup is closed/);
  });
});

//
// ═══ The snapshot for a new tab (CLI-66) ═══
//

/** The changes of a batch, in the order of their ids. */
function sortedChanges(batch: StorageChangeBatch<Item> | undefined) {
  const key = (change: StorageChangeBatch<Item>[number]) => (change.type === "clear" ? "" : change.id);
  return [...(batch ?? [])].sort((x, y) => (key(x) < key(y) ? -1 : 1));
}

describe("TabCoordinator: the snapshot for a new tab (CLI-66)", () => {
  it("a new tab gets the entries of the leader, and then the later batches, each one time", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    await remote.data.set("old", { n: 0 });
    const a = openTab(browser, remote, "A", { copy: "tab", snapshot: true });
    const b = openTab(browser, remote, "B", { copy: "tab", snapshot: true });
    await leaderReady(browser, a, 1);
    await b.local.set("b1", { n: 1 });
    await vi.waitFor(async () => expect(await a.local.get("b1")).toEqual({ n: 1 }));
    await settle();

    const before = browser.sent.length;
    const d = openTab(browser, remote, "D", { copy: "tab", snapshot: true });
    // Writes of the leader and of a follower while the snapshot of D waits
    await a.local.set("a2", { n: 2 });
    await b.local.set("b2", { n: 3 });
    await vi.waitFor(async () => expect(await d.local.size()).toBe(4));
    await settle();

    expect(new Map(await d.local.getEntries())).toEqual(
      new Map([
        ["old", { n: 0 }],
        ["b1", { n: 1 }],
        ["a2", { n: 2 }],
        ["b2", { n: 3 }],
      ]),
    );
    // One chunk: the copy of the leader before the write of b2. The batch of a2 is in it, and D skips that batch.
    const chunks = browser.sent.slice(before).filter((message) => message.type === "snapshot");
    expect(chunks).toEqual([expect.objectContaining({ from: a.coordinator.id, to: d.coordinator.id, part: 0, parts: 1 })]);
    expect(d.batches).toHaveLength(2);
    expect(sortedChanges(d.batches[0])).toEqual([
      { type: "set", id: "a2", value: { n: 2 }, origin: "sync" },
      { type: "set", id: "b1", value: { n: 1 }, origin: "sync" },
      { type: "set", id: "old", value: { n: 0 }, origin: "sync" },
    ]);
    expect(d.batches[1]).toEqual([{ type: "set", id: "b2", value: { n: 3 } }]);
    // D sends no change of the snapshot to the other tabs
    expect(browser.sent.slice(before).some((message) => message.type === "changes" && message.from === d.coordinator.id)).toBe(false);
    expect([...a.errors, ...b.errors, ...d.errors]).toEqual([]);
    await Promise.all([a.coordinator.close(), b.coordinator.close(), d.coordinator.close()]);
  });

  it("the leader sends a large copy in chunks of snapshot.chunk entries", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab", snapshot: { chunk: 3 } });
    await leaderReady(browser, a, 0);
    await a.local.setBatch(Array.from({ length: 7 }, (_, n): [string, Item] => [`k${n}`, { n }]));
    await settle();

    const d = openTab(browser, remote, "D", { copy: "tab", snapshot: { chunk: 3 } });
    await vi.waitFor(async () => expect(await d.local.size()).toBe(7));
    await settle();
    const chunks = browser.sent.filter((message) => message.type === "snapshot");
    expect(chunks.map((message) => [message.part, message.parts, message.entries!.length])).toEqual([
      [0, 3, 3],
      [1, 3, 3],
      [2, 3, 1],
    ]);
    // The observers get the snapshot in one batch, after the last chunk
    expect(d.batches).toHaveLength(1);
    expect(sortedChanges(d.batches[0]).map((change) => (change.type === "set" ? change.value.n : -1))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...a.errors, ...d.errors]).toEqual([]);
    await Promise.all([a.coordinator.close(), d.coordinator.close()]);
  });

  it("when the leader changes during the snapshot, the new tab asks the new leader and applies only its complete snapshot", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab", mode: "write-through", snapshot: { chunk: 2 } });
    const b = openTab(browser, remote, "B", { copy: "tab", mode: "write-through", snapshot: { chunk: 2 } });
    await leaderReady(browser, a, 1);
    await a.local.setBatch(Array.from({ length: 5 }, (_, n): [string, Item] => [`k${n}`, { n }]));
    await vi.waitFor(async () => expect(await b.local.size()).toBe(5));
    await settle();

    // The leader sends its first chunk, and then it dies
    browser.drop = (message) => message.type === "snapshot" && message.from === a.coordinator.id && message.part! > 0;
    const d = openTab(browser, remote, "D", { copy: "tab", mode: "write-through", snapshot: { chunk: 2 } });
    const toD = () => browser.sent.filter((message) => message.type === "snapshot" && message.to === d.coordinator.id);
    await vi.waitFor(() => expect(toD().filter((message) => message.from === a.coordinator.id)).toHaveLength(3));
    await settle();
    expect(await d.local.size()).toBe(0);
    expect(d.batches).toEqual([]);
    a.tab.kill();

    await vi.waitFor(() => expect(b.coordinator.role).toBe("leader"));
    await vi.waitFor(async () => expect(await d.local.size()).toBe(5));
    await settle();
    // The second request of D went to B, and B answered it in three chunks
    const fromB = toD().filter((message) => message.from === b.coordinator.id);
    expect(fromB.map((message) => [message.to, message.request, message.part])).toEqual([
      [d.coordinator.id, 2, 0],
      [d.coordinator.id, 2, 1],
      [d.coordinator.id, 2, 2],
    ]);
    // The first batch of D is the complete snapshot of B, not the chunk of A
    expect(idsOf([sortedChanges(d.batches[0])])).toEqual(["k0", "k1", "k2", "k3", "k4"]);
    expect(new Map(await d.local.getEntries())).toEqual(new Map(await b.local.getEntries()));
    expect([...b.errors, ...d.errors]).toEqual([]);
    await Promise.all([b.coordinator.close(), d.coordinator.close()]);
  });

  it("the own writes of the new tab during the snapshot keep their values", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const a = openTab(browser, remote, "A", { copy: "tab", snapshot: true });
    await leaderReady(browser, a, 0);
    await a.local.setBatch([
      ["x", { n: 1 }],
      ["y", { n: 2 }],
    ]);
    await settle();

    const d = openTab(browser, remote, "D", { copy: "tab", snapshot: true });
    // The write comes before the leader gets it: the snapshot has the old value of x
    await d.local.set("x", { n: 10 }, { origin: "ui" });
    await vi.waitFor(() => expect(browser.sent.some((message) => message.type === "snapshot" && message.to === d.coordinator.id)).toBe(true));
    await vi.waitFor(async () => expect(await d.local.get("y")).toEqual({ n: 2 }));
    await settle();
    expect(await d.local.get("x")).toEqual({ n: 10 });
    expect(await a.local.get("x")).toEqual({ n: 10 });
    expect(d.batches).toEqual([[{ type: "set", id: "x", value: { n: 10 }, origin: "ui" }], [{ type: "set", id: "y", value: { n: 2 }, origin: "sync" }]]);
    expect([...a.errors, ...d.errors]).toEqual([]);
    await Promise.all([a.coordinator.close(), d.coordinator.close()]);
  });

  it("without an answer (a leader of an older release), the tab reports an error after the timeout and copies the later batches", async () => {
    const browser = new FakeBrowser();
    const remote = remoteOf();
    const clock = fakeClock();
    const a = openTab(browser, remote, "A", { copy: "tab" });
    await leaderReady(browser, a, 0);
    await a.local.set("x", { n: 1 });
    await settle();

    // The leader of an older release ignores a request of a snapshot
    browser.drop = (message) => message.type === "snapshot-request";
    const d = openTab(browser, remote, "D", { copy: "tab", clock, snapshot: { timeout: ms(5000) } });
    await vi.waitFor(() => expect(d.coordinator.getStatus()).toEqual(a.coordinator.getStatus()));
    await a.local.set("y", { n: 2 });
    await settle();
    // The batch waits for the snapshot
    expect(await d.local.has("y")).toBe(false);
    expect(d.batches).toEqual([]);

    await clock.advance(4999);
    await settle();
    expect(d.errors).toEqual([]);
    await clock.advance(1);
    await vi.waitFor(async () => expect(await d.local.get("y")).toEqual({ n: 2 }));
    expect(d.errors).toHaveLength(1);
    expect(String(d.errors[0])).toMatch(/snapshot/);
    // Without the snapshot, the tab has only the changes after its start
    expect(await d.local.has("x")).toBe(false);
    expect(d.batches).toEqual([[{ type: "set", id: "y", value: { n: 2 } }]]);
    await Promise.all([a.coordinator.close(), d.coordinator.close()]);
  });

  it("a collection of a group gets its snapshot, with the collection in each message", async () => {
    const browser = new FakeBrowser();
    const remotes = remotesOf("notes", "tasks");
    const a = openGroupTab(browser, remotes, "A", { copy: "tab", snapshot: true });
    await groupReady(browser, a, 0);
    await a.local("notes").set("n", { n: 1 });
    await a.local("tasks").setBatch([
      ["t1", { n: 2 }],
      ["t2", { n: 3 }],
    ]);
    await settle();

    const d = openGroupTab(browser, remotes, "D", { copy: "tab", snapshot: true });
    await vi.waitFor(async () => expect(await d.local("tasks").size()).toBe(2));
    await vi.waitFor(async () => expect(await d.local("notes").get("n")).toEqual({ n: 1 }));
    const chunks = browser.sent.filter((message) => message.type === "snapshot");
    expect(chunks.map((message) => message.collection).sort()).toEqual(["notes", "tasks"]);
    expect(await d.local("notes").has("t1")).toBe(false);
    expect([...a.errors, ...d.errors]).toEqual([]);
    await Promise.all([a.group.close(), d.group.close()]);
  });
});
