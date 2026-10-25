/**
 * The sync engine of `HybridStorage` (roadmap CLI-21, decision D9): the batches of `observe()`,
 * the capture of the writes of the application to the local copy, the sync state after a reload,
 * the push feed, and the two rules of the store of Graph:
 *
 * - A pull never erases a live change that arrived during the pull (the LiveLog replay of Graph).
 * - The echo of an older own write never writes over a newer local write (the EchoLedger of Graph).
 *
 * The last tests cover the hook `aroundRemoteApply` around each apply of the remote changes (graph W8).
 */

import { describe, it, expect, vi } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { InMemoryStorage, type CollectionStorage, type StorageChangeBatch } from "@procedures/collections";
import { ms } from "@procedures/client";
import {
  HybridStorage,
  QueueStoreError,
  RemoteApplyHookError,
  SyncStateError,
  type HybridStorageOptions,
  type RemoteApplyCause,
  type RemoteApplyHook,
} from "./hybrid.js";
import { MemoryQueueStore, type QueuedOperation, type QueueStore } from "./queue.js";
import { MemorySyncStateStore, type SyncState, type SyncStateChange, type SyncStateStore } from "./sync-state.js";
import type { RemoteChangeFeed, RemoteChangeHint, RemoteChangeListener, RemoteChanges } from "./feed.js";

type Item = { n: number; rev?: string };
const versionOf = (item: Item): string | undefined => item.rev;

/** A local copy that keeps its items after close(), as a durable storage does. */
class DurableLocal extends InMemoryStorage<Item> {
  override close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * A remote in memory that counts its calls, keeps the `since` of each `getChangesSince`, and can
 * hold the answer of `getChangesSince`: the answer is the state at the call, and it resolves later.
 */
function remoteOf() {
  const data = new InMemoryStorage<Item>();
  const calls: string[] = [];
  const sinces: Array<string | undefined> = [];
  const hold = { on: false, release: [] as Array<() => void>, waiting: 0 };
  /** A hold of the writes: a held write reaches the data when the test lands it, or fails */
  const writes = {
    on: false,
    waiting: [] as Array<{ land: () => void; fail: (error: unknown) => void }>,
    landAll(): void {
      writes.on = false;
      for (const write of writes.waiting.splice(0)) write.land();
    },
    failAll(error: unknown): void {
      writes.on = false;
      for (const write of writes.waiting.splice(0)) write.fail(error);
    },
  };
  const storage = new Proxy(data, {
    get(target, property, receiver) {
      if (property === "close") return () => Promise.resolve();
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push(String(property));
        if (writes.on && ["set", "delete", "setBatch", "deleteBatch", "clear"].includes(String(property))) {
          return new Promise((resolve, reject) =>
            writes.waiting.push({ land: () => resolve((value as (...a: unknown[]) => unknown).apply(target, args)), fail: reject }),
          );
        }
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (property !== "getChangesSince") return result;
        sinces.push(args[0] as string | undefined);
        if (!hold.on) return result;
        hold.waiting++;
        return new Promise((resolve) => hold.release.push(() => resolve(result)));
      };
    },
  }) as CollectionStorage<Item>;
  const count = (name: string): number => calls.filter((call) => call === name).length;
  return { storage, data, calls, sinces, hold, writes, count };
}

/** The reads of the remote: a pull or a read of an item. */
const reads = (calls: string[]): string[] => calls.filter((call) => ["get", "getChangesSince", "getEntries", "getAll", "getBatch", "getIds"].includes(call));

/** A feed that the test drives. */
class TestFeed implements RemoteChangeFeed<Item> {
  readonly listeners = new Set<RemoteChangeListener<Item>>();
  subscribes = 0;
  subscribe(listener: RemoteChangeListener<Item>): () => void {
    this.subscribes++;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  push(changes: RemoteChanges<Item>): void {
    for (const listener of [...this.listeners]) listener.onChanges(changes);
  }
  gap(): void {
    for (const listener of [...this.listeners]) listener.onGap();
  }
  hint(hint: RemoteChangeHint): void {
    for (const listener of [...this.listeners]) listener.onHint?.(hint);
  }
  fail(error: unknown): void {
    for (const listener of [...this.listeners]) listener.onError?.(error);
  }
}

/** The delta of the remote data since a version, as a feed pushes it. */
async function deltaOf(data: InMemoryStorage<Item>, since: string, origin?: string): Promise<RemoteChanges<Item>> {
  const changes = await data.getChangesSince(since);
  return { ...changes, since, ...(origin !== undefined && { origin }) };
}

/** The version of the remote data now. */
async function versionNow(data: InMemoryStorage<Item>): Promise<string> {
  return (await data.getChangesSince()).version;
}

const base: HybridStorageOptions = { syncInterval: ms(0) };

describe("HybridStorage.observe() (CLI-21)", () => {
  it("gives the batches of the own writes with their origins, and the changes of a pull with syncOrigin", async () => {
    const remote = remoteOf();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, syncOrigin: "server" });
    await hybrid.getAll();
    const batches: StorageChangeBatch<Item>[] = [];
    const stop = hybrid.observe((batch) => void batches.push(batch));
    await hybrid.set("a", { n: 1 }, { origin: "ui" });
    await remote.data.set("b", { n: 2 });
    await hybrid.syncFromRemote();
    stop();
    await hybrid.set("c", { n: 3 });
    expect(batches).toEqual([
      [{ type: "set", id: "a", value: { n: 1 }, origin: "ui" }],
      [{ type: "set", id: "b", value: { n: 2 }, origin: "server" }],
    ]);
    await hybrid.close();
    expect(() => hybrid.observe(() => undefined)).toThrow(/closed/);
  });

  it("gives the remote and the local copy the origin of the storage", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const origins: unknown[] = [];
    remote.data.observe((batch) => void origins.push(...batch.map((change) => ["remote", change.origin])));
    local.observe((batch) => void origins.push(...batch.map((change) => ["local", change.origin])));
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, local, origin: "tab-7" });
    await hybrid.getAll();
    await hybrid.set("a", { n: 1 }, { origin: "ui" });
    await hybrid.delete("a");
    expect(origins).toEqual([
      ["local", "tab-7"],
      ["remote", "tab-7"],
      ["local", "tab-7"],
      ["remote", "tab-7"],
    ]);
    await hybrid.close();
  });

  it("gives the undo of a refused write of write-through mode, and a delete only for an id that existed", async () => {
    const remote = remoteOf();
    const hybrid = new HybridStorage<Item>(remote.storage, base);
    await hybrid.getAll();
    await hybrid.set("a", { n: 1 });
    const batches: unknown[] = [];
    hybrid.observe((batch) => void batches.push(batch.map((change) => [change.type, "id" in change ? change.id : "*", change.origin])));
    // The remote refuses the write: an error with a code is not "not available"
    remote.data.set = () => Promise.reject(Object.assign(new Error("refused"), { code: "FORBIDDEN" }));
    await expect(hybrid.set("a", { n: 2 }, { origin: "ui" })).rejects.toThrow("refused");
    await hybrid.deleteBatch(["a", "missing", "a"], { origin: "ui" });
    await hybrid.clear({ origin: "ui" });
    expect(batches).toEqual([
      [["set", "a", "ui"]],
      [["set", "a", "ui"]],
      [["delete", "a", "ui"]],
    ]);
    expect(await hybrid.getAll()).toEqual([]);
    await hybrid.close();
  });
});

describe("HybridStorage capture: \"observe\" (CLI-21)", () => {
  it("queues a direct write of the application to the local copy, and write-through sends it at once", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, local, capture: "observe", origin: "tab-1" });
    await hybrid.getAll();
    const batches: StorageChangeBatch<Item>[] = [];
    hybrid.observe((batch) => void batches.push(batch));
    const remoteOrigins: Array<string | undefined> = [];
    remote.data.observe((batch) => void remoteOrigins.push(...batch.map((change) => change.origin)));
    // The synchronous write of an application to its local copy
    await local.set("a", { n: 1 }, { origin: "app" });
    await vi.waitFor(async () => expect(await remote.data.get("a")).toEqual({ n: 1 }));
    expect(remoteOrigins).toEqual(["tab-1"]);
    // The observers of the storage see the change of the application
    expect(batches).toEqual([[{ type: "set", id: "a", value: { n: 1 }, origin: "app" }]]);
    // An own write is not captured a second time
    await hybrid.set("b", { n: 2 });
    await vi.waitFor(() => expect(hybrid.getStatus()).toMatchObject({ pendingChanges: 0, syncing: false }));
    expect(remote.count("set")).toBe(2);
    await hybrid.close();
  });

  it("in write-back mode, queues the sets, the deletes and the clears of the application in their order", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const queueStore = new MemoryQueueStore();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, mode: "write-back", local, queueStore, capture: "observe" });
    await hybrid.getAll();
    await local.setBatch([
      ["a", { n: 1 }],
      ["b", { n: 2 }],
    ]);
    await local.delete("a");
    await local.deleteBatch(["b", "missing"]);
    await local.set("c", { n: 3 });
    await local.set("c", { n: 4 });
    expect(hybrid.getPendingOpsCount()).toBe(4);
    await vi.waitFor(() => expect(queueStore.size).toBe(4));
    const queued = (await queueStore.load()).map((op: QueuedOperation) => op.type);
    expect(queued).toEqual(["setBatch", "delete", "delete", "set"]);
    await hybrid.flush();
    expect(await remote.data.getEntries()).toEqual([["c", { n: 4 }]]);
    await local.clear();
    await hybrid.flush();
    expect(await remote.data.size()).toBe(0);
    await hybrid.close();
  });

  it("keeps the change of the application during the load of the queue, and the local copy keeps its value", async () => {
    const remote = remoteOf();
    const local = new DurableLocal();
    let release!: () => void;
    let called!: () => void;
    const loading = new Promise<void>((resolve) => (called = resolve));
    const slow: QueueStore = new MemoryQueueStore();
    await slow.append({ type: "set", data: { id: "a", value: { n: 1 } }, timestamp: 1 });
    const load = slow.load.bind(slow);
    slow.load = () =>
      new Promise((resolve) => {
        release = () => resolve(load());
        called();
      });
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, mode: "local-only", local, queueStore: slow, capture: "observe" });
    // The application writes before the queue is loaded: the replay of the queue writes the older value
    await local.set("a", { n: 2 });
    await loading;
    release();
    expect(await hybrid.get("a")).toEqual({ n: 2 });
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.setMode("write-through");
    expect(await remote.data.get("a")).toEqual({ n: 2 });
    await hybrid.close();
  });

  it("a captured write keeps its value in a pull that runs, and the storage knows its version", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, mode: "write-back", local, capture: "observe", versionOf });
    await hybrid.getAll();
    await remote.data.set("a", { n: 1, rev: "r1" });
    remote.hold.on = true;
    const pulling = hybrid.syncFromRemote();
    await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
    await local.set("a", { n: 2, rev: "local" });
    remote.hold.on = false;
    remote.hold.release.splice(0).forEach((resolve) => resolve());
    await pulling;
    expect(await local.get("a")).toEqual({ n: 2, rev: "local" });
    await hybrid.close();
  });

  it("needs a local copy with observe(), and refuses an unknown capture", () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const withoutObserve = Object.assign(Object.create(local) as InMemoryStorage<Item>, { observe: undefined });
    expect(() => new HybridStorage<Item>(remote.storage, { local: withoutObserve, capture: "observe" })).toThrow(TypeError);
    expect(() => new HybridStorage<Item>(remote.storage, { capture: "everything" as never })).toThrow(/Unknown capture/);
  });

  it("whenQueued() resolves when the queue store holds the captured changes, and sends nothing (CLI-25)", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const store = new MemoryQueueStore();
    const append = store.append.bind(store);
    let release: (() => void) | undefined;
    store.append = (op) => new Promise<void>((resolve) => (release = () => resolve(append(op))));
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, mode: "write-back", local, queueStore: store, capture: "observe" });
    await hybrid.getAll();
    await local.set("a", { n: 1 });
    let queued = false;
    const waiting = hybrid.whenQueued().then(() => void (queued = true));
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(queued).toBe(false);
    expect(store.size).toBe(0);
    release!();
    await waiting;
    expect(store.size).toBe(1);
    expect(remote.count("set")).toBe(0);
    await hybrid.close();
  });

  it("whenQueued() rejects with the error of the load when the queue store could not load", async () => {
    const remote = remoteOf();
    const broken = new MemoryQueueStore();
    broken.load = () => Promise.reject(new Error("The disk is gone"));
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, queueStore: broken });
    await expect(hybrid.whenQueued()).rejects.toBeInstanceOf(QueueStoreError);
    await hybrid.close();
  });
});

describe("HybridStorage syncState (CLI-21)", () => {
  it("a reload keeps the cursor and the bases: the first pull asks for the changes since the cursor, and a conflict is found", async () => {
    const remote = remoteOf();
    const local = new DurableLocal();
    const syncState = new MemorySyncStateStore();
    const queueStore = new MemoryQueueStore();
    const options: HybridStorageOptions = { ...base, local, syncState, queueStore, versionOf, conflictResolution: "remote" };
    const first = new HybridStorage<Item>(remote.storage, options);
    await first.getAll();
    await first.set("a", { n: 1, rev: "r1" });
    // The pull after the write moves the cursor past it
    await first.syncFromRemote();
    await first.close();
    const saved = await syncState.load();
    expect(saved?.cursor).toBe(await versionNow(remote.data));
    expect(saved?.bases).toEqual([["a", "r1"]]);

    // The reload: the first pull is a delta
    remote.sinces.length = 0;
    const second = new HybridStorage<Item>(remote.storage, { ...options, mode: "write-back" });
    await second.getAll();
    expect(remote.sinces).toEqual([saved?.cursor]);
    // A queued write of a after the reload has the base r1, so a remote change of a is a conflict
    await second.set("a", { n: 2, rev: "local" });
    await remote.data.set("a", { n: 3, rev: "r3" });
    await second.syncFromRemote();
    expect(await second.get("a")).toEqual({ n: 3, rev: "r3" });
    expect(second.getPendingOpsCount()).toBe(0);
    await second.close();
  });

  it("does not use a loaded cursor without a durable local copy with items, so the first pull reads all items", async () => {
    const remote = remoteOf();
    await remote.data.set("a", { n: 1 });
    const syncState = new MemorySyncStateStore();
    await syncState.write({ reset: true, cursor: await versionNow(remote.data), bases: [], forgotten: [] });
    const withDefaultLocal = new HybridStorage<Item>(remote.storage, { ...base, syncState });
    expect(await withDefaultLocal.getAll()).toEqual([{ n: 1 }]);
    expect(remote.sinces).toEqual([undefined]);
    await withDefaultLocal.close();
    const empty = new HybridStorage<Item>(remote.storage, { ...base, syncState, local: new DurableLocal() });
    expect(await empty.getAll()).toEqual([{ n: 1 }]);
    expect(remote.sinces).toEqual([undefined, undefined]);
    await empty.close();
  });

  it("writes only the changes after the first write, and a mode switch to remote-only clears the cursor", async () => {
    const remote = remoteOf();
    const writes: SyncStateChange[] = [];
    const store = new MemorySyncStateStore();
    const write = store.write.bind(store);
    store.write = (change) => {
      writes.push(structuredClone(change));
      return write(change);
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, syncState: store, versionOf, local: new DurableLocal() });
    await hybrid.getAll();
    await hybrid.set("a", { n: 1, rev: "r1" });
    await hybrid.set("b", { n: 2, rev: "r2" });
    await hybrid.delete("a");
    await vi.waitFor(async () => expect((await store.load())?.bases).toEqual(expect.arrayContaining([["a", null], ["b", "r2"]])));
    expect(writes[0]?.reset).toBe(true);
    expect(writes.length).toBeGreaterThan(1);
    // After the first write, a write gives only the changes: never the whole state again
    expect(writes.slice(1).every((change) => !change.reset && change.bases.length <= 2)).toBe(true);
    await hybrid.setMode("remote-only");
    await vi.waitFor(async () => expect((await store.load())?.cursor).toBeUndefined());
    await hybrid.close();
  });

  it("a store that fails goes to the status, and the storage goes on", async () => {
    const remote = remoteOf();
    const failing: SyncStateStore = {
      load: () => Promise.reject(new Error("no state")),
      write: () => Promise.reject(new Error("no room")),
      clear: () => Promise.resolve(),
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, syncState: failing, versionOf });
    await hybrid.getAll();
    await hybrid.set("a", { n: 1, rev: "r1" });
    expect(await hybrid.get("a")).toEqual({ n: 1, rev: "r1" });
    await vi.waitFor(() => expect(hybrid.getStatus().error).toMatchObject({ operation: "store" }));
    expect(hybrid.getStatus().error?.error).toBeInstanceOf(SyncStateError);
    // A later write that succeeds clears the failure, and gives the whole state
    const writes: SyncStateChange[] = [];
    failing.write = (change) => {
      writes.push(change);
      return Promise.resolve();
    };
    await hybrid.set("b", { n: 2, rev: "r2" });
    await vi.waitFor(() => expect(hybrid.getStatus().error).toBeUndefined());
    expect(writes[0]).toMatchObject({ reset: true, forgotten: [] });
    expect(writes[0]?.bases).toEqual(expect.arrayContaining([["a", "r1"], ["b", "r2"]]));
    await hybrid.close();
  });

  it("a store that gives a value that is not a sync state is a failure of the load", async () => {
    const remote = remoteOf();
    const odd: SyncStateStore = {
      load: () => Promise.resolve({ cursor: 7, bases: "x" } as unknown as SyncState),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, syncState: odd });
    const errors: unknown[] = [];
    hybrid.onStatus((status) => {
      if (status.error) errors.push(status.error.error);
    });
    await hybrid.getAll();
    expect((errors[0] as Error).message).toMatch(/could not load the state/);
    await hybrid.close();
  });

  it("MemorySyncStateStore applies a reset, the bases and the forgotten ids, and clear() removes the state", async () => {
    const store = new MemorySyncStateStore();
    expect(await store.load()).toBeUndefined();
    await store.write({ reset: true, cursor: "v1", bases: [["a", "1"], ["b", null]], forgotten: [] });
    await store.write({ reset: false, cursor: "v2", bases: [["c", "3"]], forgotten: ["a"] });
    expect(await store.load()).toEqual({ cursor: "v2", bases: [["b", null], ["c", "3"]] });
    expect(store.size).toBe(2);
    await store.write({ reset: true, cursor: undefined, bases: [["d", "4"]], forgotten: [] });
    expect(await store.load()).toEqual({ bases: [["d", "4"]] });
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });
});

describe("HybridStorage feed (CLI-21)", () => {
  it("applies a delta whose since is the cursor without a read of the remote", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, versionOf });
    await hybrid.getAll();
    expect(feed.subscribes).toBe(1);
    const cursor = await versionNow(remote.data);
    const before = reads(remote.calls).length;
    await remote.data.set("a", { n: 1, rev: "r1" });
    feed.push(await deltaOf(remote.data, cursor, "other-tab"));
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1, rev: "r1" }]]));
    // A delete in the next delta
    const next = await versionNow(remote.data);
    await remote.data.delete("a");
    feed.push(await deltaOf(remote.data, next));
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([]));
    expect(reads(remote.calls).length).toBe(before);
    await hybrid.close();
  });

  it("a delta of the version of the cursor changes nothing, and another delta or a gap makes one pull", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    const pulls = remote.count("getChangesSince");
    feed.push({ since: "older", version: cursor, full: false, changed: [["x", { n: 9 }]], deleted: [] });
    await hybrid.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(remote.count("getChangesSince")).toBe(pulls);
    expect(await hybrid.getEntries()).toEqual([]);

    // A delta that does not follow the cursor: the storage reads the changes since its cursor
    await remote.data.set("a", { n: 1 });
    feed.push({ since: "elsewhere", version: "v-unknown", full: false, changed: [["a", { n: 1 }]], deleted: [] });
    await vi.waitFor(() => expect(remote.count("getChangesSince")).toBe(pulls + 1));
    expect(remote.sinces.at(-1)).toBe(cursor);
    expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }]]);

    // Three gaps while a pull waits make one more pull
    remote.hold.on = true;
    feed.gap();
    await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
    feed.gap();
    feed.gap();
    feed.gap();
    remote.hold.on = false;
    remote.hold.release.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(remote.count("getChangesSince")).toBe(pulls + 3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(remote.count("getChangesSince")).toBe(pulls + 3);
    await hybrid.close();
  });

  it("a hint without values makes one pull for the values, and the hints that come while it waits join it", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    const pulls = remote.count("getChangesSince");
    remote.hold.on = true;
    await remote.data.set("a", { n: 1 });
    const first = await versionNow(remote.data);
    feed.hint({ since: cursor, version: first, changed: ["a"], deleted: [] });
    await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
    await remote.data.set("b", { n: 2 });
    const second = await versionNow(remote.data);
    feed.hint({ since: first, version: second, changed: ["b"], deleted: [] });
    feed.hint({ since: second, version: "later", changed: ["c"], deleted: [] });
    remote.hold.on = false;
    remote.hold.release.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]));
    await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
    // The first pull, and one pull for the hints that came while it waited
    expect(remote.count("getChangesSince")).toBe(pulls + 2);
    await hybrid.close();
  });

  it("a hint with only deletes applies without a read, and a hint of the version of the cursor changes nothing", async () => {
    const remote = remoteOf();
    await remote.data.set("a", { n: 1 });
    await remote.data.set("b", { n: 2 });
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    const before = reads(remote.calls).length;
    feed.hint({ since: "older", version: cursor, changed: ["a"], deleted: [] });
    await remote.data.delete("a");
    const next = await versionNow(remote.data);
    feed.hint({ since: cursor, version: next, changed: [], deleted: ["a"] });
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["b", { n: 2 }]]));
    expect(reads(remote.calls).length).toBe(before);
    // A hint of a storage without a change log asks for a pull
    feed.hint({ changed: [], deleted: [] });
    await vi.waitFor(() => expect(reads(remote.calls).length).toBe(before + 1));
    await hybrid.close();
  });

  it("subscribes only in the modes with a local copy and a remote, and stops at close()", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, mode: "local-only" });
    await hybrid.getAll();
    expect(feed.listeners.size).toBe(0);
    await hybrid.setMode("write-back");
    expect(feed.listeners.size).toBe(1);
    await hybrid.setMode("write-through");
    expect(feed.subscribes).toBe(1);
    await hybrid.setMode("remote-only");
    expect(feed.listeners.size).toBe(0);
    await hybrid.setMode("write-through");
    expect(feed.listeners.size).toBe(1);
    // The error that stops the feed goes to the status
    feed.fail(new Error("the feed stopped"));
    expect(hybrid.getStatus().error).toMatchObject({ operation: "pull" });
    await hybrid.close();
    expect(feed.listeners.size).toBe(0);
    expect(feed.subscribes).toBe(2);
  });

  it("a feed whose subscribe() throws goes to the status", async () => {
    const remote = remoteOf();
    const feed: RemoteChangeFeed<Item> = {
      subscribe: () => {
        throw new Error("no connection");
      },
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, syncOnInit: false });
    await hybrid.getAll();
    expect(hybrid.getStatus().error).toMatchObject({ operation: "pull" });
    await hybrid.close();
  });
});

describe("The rules of the store of Graph (CLI-21)", () => {
  it("a pull never erases a live change that arrived during the pull: the delta applies after it", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, syncOnInit: false });
    await hybrid.getAll();
    // A full pull starts: its answer is the remote before the live change
    remote.hold.on = true;
    const pulling = hybrid.syncFromRemote();
    await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
    const before = await versionNow(remote.data);
    await remote.data.set("live", { n: 1 });
    feed.push(await deltaOf(remote.data, before));
    // The delta waits for the pull. If it applied first, the full answer would delete "live".
    remote.hold.on = false;
    remote.hold.release.splice(0).forEach((resolve) => resolve());
    await pulling;
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["live", { n: 1 }]]));
    // The delta followed the cursor of the pull: no second pull
    expect(remote.count("getChangesSince")).toBe(1);
    await hybrid.close();
  });

  it("a delta that the answer of the pull holds already changes nothing after the pull", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, syncOnInit: false });
    await hybrid.getAll();
    const before = await versionNow(remote.data);
    await remote.data.set("live", { n: 1 });
    remote.hold.on = true;
    const pulling = hybrid.syncFromRemote();
    await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
    feed.push(await deltaOf(remote.data, before));
    remote.hold.on = false;
    remote.hold.release.splice(0).forEach((resolve) => resolve());
    await pulling;
    await hybrid.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await hybrid.getEntries()).toEqual([["live", { n: 1 }]]);
    expect(remote.count("getChangesSince")).toBe(1);
    await hybrid.close();
  });

  it("the echo of an older own write never writes over a newer local write", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, versionOf });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    await hybrid.set("a", { n: 1, rev: "r1" });
    await hybrid.set("a", { n: 2, rev: "r2" });
    const local = async (): Promise<unknown> => (await hybrid.getEntries()).find(([id]) => id === "a")?.[1];
    // The echo of r1 comes after r2 is local: it is stale
    feed.push({ since: cursor, version: "e1", full: false, changed: [["a", { n: 1, rev: "r1" }]], deleted: [] });
    feed.push({ since: "e1", version: "e2", full: false, changed: [["a", { n: 2, rev: "r2" }]], deleted: [] });
    // A write of another writer applies
    feed.push({ since: "e2", version: "e3", full: false, changed: [["a", { n: 3, rev: "r3" }]], deleted: [] });
    await vi.waitFor(async () => expect(await local()).toEqual({ n: 3, rev: "r3" }));

    // A stale echo of a delete: the newer write stays
    await hybrid.delete("a");
    await hybrid.set("a", { n: 4, rev: "r4" });
    feed.push({ since: "e3", version: "e4", full: false, changed: [], deleted: ["a"] });
    feed.push({ since: "e4", version: "e5", full: false, changed: [["b", { n: 1, rev: "b1" }]], deleted: [] });
    await vi.waitFor(async () => expect((await hybrid.getEntries()).map(([id]) => id).sort()).toEqual(["a", "b"]));
    expect(await local()).toEqual({ n: 4, rev: "r4" });
    expect(reads(remote.calls).filter((call) => call === "getChangesSince")).toHaveLength(1);
    await hybrid.close();
  });

  it("a remote delta and a full sync never run at the same time: a fresh local insert survives both, locally and on the remote (Graph R18)", async () => {
    const data = new InMemoryStorage<Item>();
    await data.set("a", { n: 1 });
    await data.set("r", { n: 1 });
    const calls: string[] = [];
    const late: { on: boolean; release: (() => void) | undefined } = { on: false, release: undefined };
    // A remote without a change log: each pull reads all entries, as the pull of SignalDB does.
    // The held answer is the state of the remote at the call.
    const remote = new Proxy(data, {
      get(target, property, receiver) {
        if (property === "close") return () => Promise.resolve();
        if (property === "getChangesSince") return undefined;
        const value = Reflect.get(target, property, receiver) as unknown;
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls.push(String(property));
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          if (property !== "getEntries" || !late.on) return result;
          late.on = false;
          return new Promise((resolve) => (late.release = () => resolve(result)));
        };
      },
    }) as CollectionStorage<Item>;
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote, { ...base, mode: "write-back", feed });
    await hybrid.getAll();
    // 1. A pending local change, then a remote delta. Its pull answers late, with the older state.
    await hybrid.set("x", { n: 1 });
    late.on = true;
    feed.push({ since: "elsewhere", version: "v2", full: false, changed: [["r", { n: 2 }]], deleted: [] });
    await vi.waitFor(() => expect(late.release).toBeDefined());
    // 2. A fresh local insert, and a full sync that pushes it: the sync waits for the delta
    await hybrid.set("m", { n: 1 });
    const syncing = hybrid.sync();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.filter((call) => call === "set" || call === "setBatch")).toEqual([]);
    // 3. The delta finishes with its older data, then the sync runs
    late.release!();
    await syncing;
    await hybrid.sync();
    expect(await data.get("m")).toEqual({ n: 1 });
    expect(await data.get("x")).toEqual({ n: 1 });
    expect((await hybrid.getEntries()).map(([id]) => id).sort()).toEqual(["a", "m", "r", "x"]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("a delta that waits behind a pull is decided when it applies: a local delete made during the wait stays", async () => {
    for (const versions of [false, true]) {
      const remote = remoteOf();
      await remote.data.set("a", { n: 1, rev: "r1" });
      const feed = new TestFeed();
      const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, ...(versions && { versionOf }) });
      await hybrid.getAll();
      const cursor = await versionNow(remote.data);
      // A pull runs, and a remote update of a waits behind it in the chain of the syncs
      remote.hold.on = true;
      const pulling = hybrid.syncFromRemote();
      await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
      await remote.data.set("a", { n: 2, rev: "r2" });
      feed.push(await deltaOf(remote.data, cursor));
      // A local delete while the delta waits
      await hybrid.delete("a");
      remote.hold.on = false;
      remote.hold.release.splice(0).forEach((resolve) => resolve());
      await pulling;
      await vi.waitFor(async () => expect((await hybrid.getMetadata()).stats?.["syncCount"]).toBe(3));
      expect(await hybrid.getEntries()).toEqual([]);
      expect(await remote.data.get("a")).toBeUndefined();
      await hybrid.close();
    }
  });

  it("a local delete is a tombstone in the echo ledger: an older echo does not bring the item back", async () => {
    for (const versions of [false, true]) {
      const remote = remoteOf();
      const feed = new TestFeed();
      const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, ...(versions && { versionOf }) });
      await hybrid.getAll();
      const cursor = await versionNow(remote.data);
      const applied: string[] = [];
      hybrid.observe((batch) => {
        for (const change of batch) if (change.origin === "sync") applied.push(`${change.type} ${"id" in change ? change.id : "*"}`);
      });
      await hybrid.set("a", { n: 1, rev: "r1" });
      await hybrid.delete("a");
      // The echo of the set comes after the delete, then the echo of the delete
      feed.push({ since: cursor, version: "e1", full: false, changed: [["a", { n: 1, rev: "r1" }]], deleted: [] });
      feed.push({ since: "e1", version: "e2", full: false, changed: [], deleted: ["a"] });
      feed.push({ since: "e2", version: "e3", full: false, changed: [["b", { n: 1, rev: "b1" }]], deleted: [] });
      await vi.waitFor(async () => expect((await hybrid.getEntries()).map(([id]) => id)).toEqual(["b"]));
      // The item a did not come back at any time
      expect(applied).toEqual(["set b"]);
      expect(remote.count("getChangesSince")).toBe(1);
      await hybrid.close();
    }
  });

  it("an echo expires after echoWindow, and then a change with its version applies", async () => {
    const clock = fakeClock();
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, versionOf, clock, echoWindow: ms(100) });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    await hybrid.set("a", { n: 1, rev: "r1" });
    await hybrid.set("a", { n: 2, rev: "r2" });
    await clock.advance(100);
    feed.push({ since: cursor, version: "e1", full: false, changed: [["a", { n: 1, rev: "r1" }]], deleted: [] });
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1, rev: "r1" }]]));
    await hybrid.close();
  });

  it("an own clear makes the echo of an older write of each id stale", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, versionOf });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    await hybrid.set("a", { n: 1, rev: "r1" });
    await hybrid.clear();
    await hybrid.set("b", { n: 1, rev: "b1" });
    feed.push({ since: cursor, version: "e1", full: false, changed: [["a", { n: 1, rev: "r1" }], ["b", { n: 1, rev: "b1" }]], deleted: [] });
    feed.push({ since: "e1", version: "e2", full: false, changed: [["c", { n: 1, rev: "c1" }]], deleted: [] });
    await vi.waitFor(async () => expect((await hybrid.getEntries()).map(([id]) => id)).toEqual(["b", "c"]));
    await hybrid.close();
  });
});

describe("An own write that waits for the remote (CLI-21)", () => {
  /** The local item of an id. */
  const localOf = async (hybrid: HybridStorage<Item>, id: string): Promise<Item | undefined> => (await hybrid.getEntries()).find(([key]) => key === id)?.[1];

  it("a pull that answers before an own set lands keeps the local value, and a read after the write decides", async () => {
    const remote = remoteOf();
    await remote.data.set("a", { n: 1, rev: "r1" });
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, versionOf });
    await hybrid.getAll();
    // A write of another writer reaches the remote before the own write
    await remote.data.set("a", { n: 5, rev: "f1" });
    remote.writes.on = true;
    const writing = hybrid.set("a", { n: 2, rev: "r2" });
    await vi.waitFor(() => expect(remote.writes.waiting).toHaveLength(1));
    await hybrid.syncFromRemote();
    expect(await localOf(hybrid, "a")).toEqual({ n: 2, rev: "r2" });
    remote.writes.landAll();
    await writing;
    // The storage reads the id again after the write: the remote has the own write
    await vi.waitFor(() => expect(remote.count("get")).toBe(1));
    await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
    expect(await localOf(hybrid, "a")).toEqual({ n: 2, rev: "r2" });
    expect(await remote.data.get("a")).toEqual({ n: 2, rev: "r2" });
    await hybrid.close();
  });

  it("when the remote refuses the own set, the local copy gets the value of the remote after the undo", async () => {
    const remote = remoteOf();
    await remote.data.set("a", { n: 1, rev: "r1" });
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, versionOf });
    await hybrid.getAll();
    await remote.data.set("a", { n: 5, rev: "f1" });
    remote.writes.on = true;
    const writing = hybrid.set("a", { n: 2, rev: "r2" });
    await vi.waitFor(() => expect(remote.writes.waiting).toHaveLength(1));
    await hybrid.syncFromRemote();
    expect(await localOf(hybrid, "a")).toEqual({ n: 2, rev: "r2" });
    remote.writes.failAll(Object.assign(new Error("refused"), { code: "FORBIDDEN" }));
    await expect(writing).rejects.toThrow("refused");
    await vi.waitFor(async () => expect(await localOf(hybrid, "a")).toEqual({ n: 5, rev: "f1" }));
    await hybrid.close();
  });

  it("a pull that answers before an own delete lands does not bring the item back, and a full pull keeps a new id", async () => {
    const remote = remoteOf();
    await remote.data.set("a", { n: 1 });
    const hybrid = new HybridStorage<Item>(remote.storage, base);
    await hybrid.getAll();
    await remote.data.set("a", { n: 5 });
    remote.writes.on = true;
    const deleting = hybrid.delete("a");
    await vi.waitFor(() => expect(remote.writes.waiting).toHaveLength(1));
    await hybrid.syncFromRemote();
    expect(await localOf(hybrid, "a")).toBeUndefined();
    // A read of the id does not bring it back from the remote either
    expect(await hybrid.get("a")).toBeUndefined();
    remote.writes.landAll();
    await deleting;
    await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
    expect(await hybrid.getEntries()).toEqual([]);

    // A new id waits for the remote, and a full pull does not delete it
    const fresh = new HybridStorage<Item>(remote.storage, { ...base, syncOnInit: false });
    await fresh.getAll();
    remote.writes.on = true;
    const setting = fresh.set("n", { n: 1 });
    await vi.waitFor(() => expect(remote.writes.waiting).toHaveLength(1));
    await fresh.syncFromRemote();
    expect(await localOf(fresh, "n")).toEqual({ n: 1 });
    remote.writes.landAll();
    await setting;
    await vi.waitFor(() => expect(fresh.getStatus().syncing).toBe(false));
    expect(await localOf(fresh, "n")).toEqual({ n: 1 });
    await hybrid.close();
    await fresh.close();
  });

  it("the echo of the own write that waits applies without a deferral and without a read", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, versionOf });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    remote.writes.on = true;
    const writing = hybrid.set("a", { n: 2, rev: "r2" });
    await vi.waitFor(() => expect(remote.writes.waiting).toHaveLength(1));
    // The server publishes the event before its answer: the echo comes while the write waits
    feed.push({ since: cursor, version: "e1", full: false, changed: [["a", { n: 2, rev: "r2" }]], deleted: [] });
    // The delta applied while the write waited: the first pull and the delta
    await vi.waitFor(async () => expect((await hybrid.getMetadata()).stats?.["syncCount"]).toBe(2));
    remote.writes.landAll();
    await writing;
    await hybrid.flush();
    expect(remote.count("get")).toBe(0);
    expect(await localOf(hybrid, "a")).toEqual({ n: 2, rev: "r2" });
    await hybrid.close();
  });
});

describe("HybridStorage in remote-only mode (CLI-21)", () => {
  it("gives the batches of its writes to the remote, with a delete only for an id that existed", async () => {
    const remote = remoteOf();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, mode: "remote-only" });
    const batches: unknown[] = [];
    hybrid.observe((batch) => void batches.push(batch.map((change) => [change.type, "id" in change ? change.id : "*"])));
    await hybrid.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    await hybrid.deleteBatch(["a", "missing"]);
    await hybrid.delete("missing");
    await hybrid.clear();
    await hybrid.clear();
    expect(batches).toEqual([[["set", "a"], ["set", "b"]], [["delete", "a"]], [["clear", "*"]]]);
    await hybrid.close();
  });
});

/** The `traceparent` of the W3C trace context that a server sends with a change event. */
const TRACE_1 = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const TRACE_2 = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
const TRACE_3 = "00-5c2d1e2a9f0b4c3d8e7f6a5b4c3d2e1f-a1b2c3d4e5f60718-01";

/** One call of the hook: its cause, its hint and the hints of its context. */
interface HookCall {
  readonly cause: RemoteApplyCause;
  readonly hint: RemoteChangeHint | undefined;
  readonly hints: readonly RemoteChangeHint[];
}

/** A hook that records each call and gives the promise of the apply back. */
function recordingHook(): { readonly calls: HookCall[]; readonly hook: RemoteApplyHook } {
  const calls: HookCall[] = [];
  const hook: RemoteApplyHook = (hint, apply, context) => {
    calls.push({ cause: context.cause, hint, hints: context.hints });
    return apply();
  };
  return { calls, hook };
}

/** The error of a promise, or undefined when it resolves. */
const errorOf = (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error);

describe("HybridStorage aroundRemoteApply (graph W8)", () => {
  it("wraps each apply: a delta and a hint give their hint with extra, and a gap and a pull of the storage give no hint", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const { calls, hook } = recordingHook();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, aroundRemoteApply: hook });
    await hybrid.getAll();
    // The first sync is a pull of the storage
    expect(calls).toEqual([{ cause: "pull", hint: undefined, hints: [] }]);

    // A delta with the trace of the server: its hint has the ids, the origin and the extra fields, and no value
    const cursor = await versionNow(remote.data);
    await remote.data.set("a", { n: 1 });
    const delta = { ...(await deltaOf(remote.data, cursor, "tab-b")), extra: { traceparent: TRACE_1 } };
    feed.push(delta);
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }]]));
    const deltaHint = { since: cursor, version: delta.version, changed: ["a"], deleted: [], origin: "tab-b", extra: { traceparent: TRACE_1 } };
    expect(calls[1]).toEqual({ cause: "delta", hint: deltaHint, hints: [deltaHint] });

    // A hint without values: the pull that it asks for gets it
    await remote.data.set("b", { n: 2 });
    const hint = { since: delta.version, version: await versionNow(remote.data), changed: ["b"], deleted: [], extra: { traceparent: TRACE_2 } };
    feed.hint(hint);
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]));
    expect(calls[2]).toEqual({ cause: "hint", hint, hints: [hint] });
    expect(calls[2]!.hint).toBe(hint);

    // A hint with only deletes applies without a read, inside the hook
    await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
    const reading = reads(remote.calls).length;
    await remote.data.delete("a");
    const deletes = { since: hint.version, version: await versionNow(remote.data), changed: [], deleted: ["a"], extra: { traceparent: TRACE_3 } };
    feed.hint(deletes);
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["b", { n: 2 }]]));
    expect(reads(remote.calls).length).toBe(reading);
    expect(calls[3]).toEqual({ cause: "hint", hint: deletes, hints: [deletes] });

    // A gap, and the pulls of the storage
    feed.gap();
    await vi.waitFor(() => expect(calls).toHaveLength(5));
    expect(calls[4]).toEqual({ cause: "gap", hint: undefined, hints: [] });
    await hybrid.syncFromRemote();
    expect(calls[5]).toEqual({ cause: "pull", hint: undefined, hints: [] });
    await hybrid.sync();
    expect(calls.slice(6)).toEqual([{ cause: "pull", hint: undefined, hints: [] }]);
    expect(hybrid.getStatus().error).toBeUndefined();
    await hybrid.close();
  });

  it("a pull of the timer of pullInterval gets no hint and the cause pull", async () => {
    const clock = fakeClock();
    const remote = remoteOf();
    const { calls, hook } = recordingHook();
    const hybrid = new HybridStorage<Item>(remote.storage, { syncInterval: ms(0), syncOnInit: false, pullInterval: ms(50), clock, aroundRemoteApply: hook });
    await hybrid.getAll();
    expect(calls).toEqual([]);
    await remote.data.set("a", { n: 1 });
    await clock.advance(50);
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }]]));
    expect(calls).toEqual([{ cause: "pull", hint: undefined, hints: [] }]);
    await hybrid.close();
  });

  it("the hints that join one pull: the hook gets the last hint, and the context keeps the last 128 in their order", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    const { calls, hook } = recordingHook();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, aroundRemoteApply: hook });
    await hybrid.getAll();
    const cursor = await versionNow(remote.data);
    remote.hold.on = true;
    const first = { since: cursor, version: "v1", changed: ["a"], deleted: [] };
    feed.hint(first);
    await vi.waitFor(() => expect(remote.hold.waiting).toBe(1));
    // The hints that come while the pull waits join one more pull
    const joined = Array.from({ length: 130 }, (_, n) => ({ since: `v${n + 1}`, version: `v${n + 2}`, changed: ["a"], deleted: [], extra: { n } }));
    for (const hint of joined) feed.hint(hint);
    remote.hold.on = false;
    remote.hold.release.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
    expect(calls[1]).toEqual({ cause: "hint", hint: first, hints: [first] });
    expect(calls[2]!.cause).toBe("hint");
    expect(calls[2]!.hint).toBe(joined.at(-1));
    expect(calls[2]!.hints).toEqual(joined.slice(-128));
    // The first sync, the pull of the first hint, and one pull for the 130 hints
    expect(remote.count("getChangesSince")).toBe(3);
    await hybrid.close();
  });

  it("a hook that throws makes the pull fail and the status keeps its error, the changes apply, and the next pull clears it", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    let mode: "throw" | "after" | "ok" = "ok";
    // A hook that is not async: it throws before the apply, or it fails after the apply
    const hook: RemoteApplyHook = (_hint, apply) => {
      if (mode === "throw") throw new Error("the tracer is down");
      return apply().then(() => {
        if (mode === "after") throw new Error("the span did not end");
      });
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, aroundRemoteApply: hook });
    await hybrid.getAll();
    const pulls = remote.count("getChangesSince");

    mode = "throw";
    await remote.data.set("a", { n: 1 });
    await expect(hybrid.syncFromRemote()).rejects.toThrow("the tracer is down");
    expect(hybrid.getStatus().error).toEqual({ operation: "pull", error: expect.objectContaining({ message: "the tracer is down" }) });
    // The storage applied the changes itself, one time
    expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }]]);
    expect(remote.count("getChangesSince")).toBe(pulls + 1);

    mode = "after";
    const cursor = await versionNow(remote.data);
    await remote.data.set("b", { n: 2 });
    feed.push(await deltaOf(remote.data, cursor));
    await vi.waitFor(() => expect(hybrid.getStatus().error?.error).toMatchObject({ message: "the span did not end" }));
    expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    expect(remote.count("getChangesSince")).toBe(pulls + 1);

    // The next pull recovers
    mode = "ok";
    await hybrid.syncFromRemote();
    expect(hybrid.getStatus().error).toBeUndefined();
    await hybrid.close();
  });

  it("an error of apply makes the pull fail with that error, also when the hook hides it or wraps it", async () => {
    const remote = remoteOf();
    const refused = Object.assign(new Error("the remote refused"), { code: "FORBIDDEN" });
    let mode: "hide" | "wrap" = "hide";
    const hook: RemoteApplyHook = async (_hint, apply) => {
      try {
        await apply();
      } catch (error) {
        if (mode === "wrap") throw new Error("the apply failed", { cause: error });
      }
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, aroundRemoteApply: hook });
    await hybrid.getAll();
    remote.data.getChangesSince = () => Promise.reject(refused);

    expect(await errorOf(hybrid.syncFromRemote())).toBe(refused);
    expect(hybrid.getStatus().error).toEqual({ operation: "pull", error: refused });
    mode = "wrap";
    expect(await errorOf(hybrid.syncFromRemote())).toBe(refused);
    expect(hybrid.getStatus().error).toEqual({ operation: "pull", error: refused });

    // The next pull recovers
    delete (remote.data as Partial<InMemoryStorage<Item>>).getChangesSince;
    await remote.data.set("a", { n: 1 });
    await hybrid.syncFromRemote();
    expect(hybrid.getStatus().error).toBeUndefined();
    expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }]]);
    await hybrid.close();
  });

  it("a hook that does not call apply, or calls it twice, makes the pull fail with RemoteApplyHookError, and the changes apply one time", async () => {
    const remote = remoteOf();
    const feed = new TestFeed();
    let mode: "skip" | "twice" | "late" | "once" = "once";
    let late: Promise<void> | undefined;
    let same: boolean | undefined;
    const hook: RemoteApplyHook = async (_hint, apply) => {
      if (mode === "skip") return;
      if (mode === "late") {
        // A call after the hook settled
        late = new Promise((resolve) => setTimeout(resolve, 0)).then(apply);
        return;
      }
      if (mode === "twice") {
        const first = apply();
        const second = apply();
        same = first === second;
        await Promise.all([first, second]);
        return;
      }
      await apply();
    };
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, aroundRemoteApply: hook });
    await hybrid.getAll();
    let pulls = remote.count("getChangesSince");

    for (const [name, count] of [["skip", 0], ["twice", 2], ["late", 0]] as const) {
      mode = name;
      await remote.data.set(name, { n: count });
      const failure = await errorOf(hybrid.syncFromRemote());
      expect(failure, name).toBeInstanceOf(RemoteApplyHookError);
      expect(failure, name).toMatchObject({ name: "RemoteApplyHookError", code: "REMOTE_APPLY_HOOK", calls: count });
      expect(hybrid.getStatus().error, name).toEqual({ operation: "pull", error: failure });
      expect(remote.count("getChangesSince"), name).toBe(++pulls);
      expect(await hybrid.has(name), name).toBe(true);
    }
    expect(same).toBe(true);
    // The late call gets the promise of the apply of the storage: it reads nothing again
    await late;
    expect(remote.count("getChangesSince")).toBe(pulls);

    // A delta of the feed with a hook that does not call apply: the delta applies, and the syncs go on
    mode = "skip";
    const cursor = await versionNow(remote.data);
    await remote.data.set("d", { n: 4 });
    feed.push(await deltaOf(remote.data, cursor));
    await vi.waitFor(async () => expect(await hybrid.has("d")).toBe(true));
    await vi.waitFor(() => expect(hybrid.getStatus().error?.error).toBeInstanceOf(RemoteApplyHookError));

    mode = "once";
    await hybrid.syncFromRemote();
    expect(hybrid.getStatus().error).toBeUndefined();
    await hybrid.close();
  });

  it("without the hook, the storage applies as before: the same batches and remote calls as with a hook that only calls apply", async () => {
    const run = async (aroundRemoteApply?: RemoteApplyHook) => {
      const remote = remoteOf();
      const feed = new TestFeed();
      const hybrid = new HybridStorage<Item>(remote.storage, { ...base, feed, ...(aroundRemoteApply && { aroundRemoteApply }) });
      await hybrid.getAll();
      const batches: StorageChangeBatch<Item>[] = [];
      hybrid.observe((batch) => void batches.push(batch));
      const cursor = await versionNow(remote.data);
      await remote.data.set("a", { n: 1 });
      feed.push(await deltaOf(remote.data, cursor));
      await vi.waitFor(async () => expect(await hybrid.getEntries()).toHaveLength(1));
      const next = await versionNow(remote.data);
      await remote.data.set("b", { n: 2 });
      feed.hint({ since: next, version: await versionNow(remote.data), changed: ["b"], deleted: [] });
      await vi.waitFor(async () => expect(await hybrid.getEntries()).toHaveLength(2));
      await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
      await remote.data.delete("a");
      await hybrid.sync();
      const result = { batches, calls: [...remote.calls], entries: await hybrid.getEntries(), error: hybrid.getStatus().error };
      await hybrid.close();
      return result;
    };
    const plain = await run();
    expect(plain.entries).toEqual([["b", { n: 2 }]]);
    expect(plain.error).toBeUndefined();
    expect(await run((_hint, apply) => apply())).toEqual(plain);
    expect(() => new HybridStorage<Item>(remoteOf().storage, { ...base, aroundRemoteApply: "span" as unknown as RemoteApplyHook })).toThrow(TypeError);
  });
});
