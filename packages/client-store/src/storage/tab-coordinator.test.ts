/**
 * `TabCoordinator` (roadmap CLI-25), in a browser in memory: a lock manager and the channels of its
 * tabs, and `fake-indexeddb` for the shared local copy and the shared queue store. The tests cover
 * the election, the failover, the followers that never sync, the way of a write of a follower to
 * the remote, the batches in the other tabs, the echoes, the single mode and `close()`. They also
 * cover the new try after a failed setup (CLI-67) and the status of the leader in each tab (CLI-65).
 */

import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryStorage, type CollectionStorage, type StorageChangeBatch } from "@procedures/collections";
import { ms, type Clock } from "@procedures/client";
import { fakeClock } from "@mark1russell7/service/testing";
import { IndexedDbQueueStore, IndexedDbStorage } from "../indexeddb.js";
import { QueueStoreError, type HybridMode } from "./hybrid.js";
import { MemoryQueueStore, type QueuedOperation, type QueueStore } from "./queue.js";
import {
  TabCoordinator,
  type TabChannelFactory,
  type TabChannelLike,
  type TabLockManagerLike,
  type TabRetryOptions,
  type TabRole,
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
  /** Each message that a tab sent, in its order */
  readonly sent: Array<{ type?: string; from?: string; to?: string; seq?: number }> = [];
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
