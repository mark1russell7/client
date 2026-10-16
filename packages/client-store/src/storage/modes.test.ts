/**
 * The mode switch of HybridStorage (roadmap R28): the four modes, `setMode`, the durable queue,
 * the delta sync, the versions and their conflicts, the periodic pull, the drain of
 * `ProcedureServer.useStorage`, and the synced registry that switches the mode.
 *
 * The model test of all modes with switches at random times is in `hybrid.test.ts`.
 */

import { describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryStorage, type CollectionStorage, type StorageChanges } from "@procedures/collections";
import {
  Client,
  LocalTransport,
  ProcedureRegistry,
  ProcedureServer,
  createCollectionProcedures,
  defineProcedure,
  invokeProcedure,
  ms,
  outputSchema,
  outputValue,
} from "@procedures/client";
import type { RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import {
  ConflictError,
  HybridStorage,
  ModeSwitchError,
  PendingWriteError,
  QueueFullError,
  QueueStoreError,
  type HybridMode,
  type HybridStorageOptions,
} from "./hybrid.js";
import { MemoryQueueStore, type QueuedOperation, type QueueStore } from "./queue.js";
import { FileQueueStore } from "./file-queue.js";
import { createSyncedRegistry } from "./factory.js";
import type { SerializedProcedure } from "./types.js";

type Item = { n: number; rev?: string };

const downError = (): Error => Object.assign(new Error("the remote is down"), { retryable: true });

/**
 * A remote storage that records its calls and can be down. `gate` makes the next sync read
 * wait. Without `withChanges`, it has no `getChangesSince`.
 */
class Remote implements CollectionStorage<Item> {
  readonly data = new InMemoryStorage<Item>();
  readonly calls: string[] = [];
  down = false;
  gate: Promise<void> | undefined;
  getChangesSince?: (since?: string) => Promise<StorageChanges<Item>>;

  constructor(withChanges = true) {
    if (withChanges) {
      this.getChangesSince = (since) =>
        this.call(`changes:${since ?? "-"}`, async () => {
          await this.gate;
          return this.data.getChangesSince(since);
        });
    }
  }

  private call<R>(name: string, run: () => Promise<R>): Promise<R> {
    this.calls.push(name);
    return this.down ? Promise.reject(downError()) : run();
  }

  get = (id: string) => this.call("get", () => this.data.get(id));
  getAll = () => this.call("getAll", () => this.data.getAll());
  getEntries = () =>
    this.call("entries", async () => {
      await this.gate;
      return this.data.getEntries();
    });
  find = (predicate: (item: Item) => boolean) => this.call("find", () => this.data.find(predicate));
  has = (id: string) => this.call("has", () => this.data.has(id));
  size = () => this.call("size", () => this.data.size());
  set = (id: string, value: Item) => this.call("set", () => this.data.set(id, value));
  delete = (id: string) => this.call("delete", () => this.data.delete(id));
  clear = () => this.call("clear", () => this.data.clear());
  setBatch = (items: Array<[string, Item]>) => this.call("setBatch", () => this.data.setBatch(items));
  deleteBatch = (ids: string[]) => this.call("deleteBatch", () => this.data.deleteBatch(ids));
  getBatch = (ids: string[]) => this.call("getBatch", () => this.data.getBatch(ids));
  close = async () => undefined;
}

async function entriesOf(storage: CollectionStorage<Item>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [id, item] of await storage.getEntries!()) out[id] = item.n;
  return out;
}

function hybridOf(remote: CollectionStorage<Item>, options: HybridStorageOptions = {}): HybridStorage<Item> {
  return new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(0), ...options });
}

/** A server side: the core collection procedures of one collection, with in-memory storage. */
function collectionServer<T>(collection: string, without: string[] = []): { transport: LocalTransport; storage: InMemoryStorage<T>; calls: string[] } {
  const storage = new InMemoryStorage<T>();
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  const calls: string[] = [];
  const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {};
  for (const procedure of createCollectionProcedures(collection)) {
    if (without.includes(procedure.path[2]!)) continue;
    handlers[procedure.path.join(".")] = async (payload) => {
      calls.push(procedure.path[2]!);
      return outputValue(await invokeProcedure(procedure, payload, { repository }), procedure.path);
    };
  }
  return { transport: new LocalTransport({ handlers }), storage, calls };
}

describe("the four modes (R28)", () => {
  it.each([
    ["local-only", { remote: {}, local: { a: 1 }, pending: 1 }],
    ["write-through", { remote: { a: 1 }, local: { a: 1 }, pending: 0 }],
    ["write-back", { remote: {}, local: { a: 1 }, pending: 1 }],
    ["remote-only", { remote: { a: 1 }, local: {}, pending: 0 }],
  ] as const)("%s puts a write where the table of the modes says", async (mode, expected) => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { mode });
    await hybrid.set("a", { n: 1 });
    expect(await entriesOf(remote.data as unknown as CollectionStorage<Item>)).toEqual(expected.remote);
    expect((await hybrid.getMetadata()).size).toBe(Object.keys(expected.local).length);
    expect(hybrid.getPendingOpsCount()).toBe(expected.pending);
    expect(hybrid.getMode()).toBe(mode);
    expect((await hybrid.getMetadata()).stats?.["mode"]).toBe(mode);
    await hybrid.close();
  });

  it("local-only makes no remote call: no read on a miss, no sync, no timer", async () => {
    const remote = new Remote();
    await remote.data.set("x", { n: 9 });
    const hybrid = new HybridStorage<Item>(remote, { mode: "local-only", syncInterval: ms(5), pullInterval: ms(5) });
    await hybrid.set("a", { n: 1 });
    await hybrid.delete("x");
    expect(await hybrid.get("x")).toBeUndefined();
    expect(await hybrid.get("missing")).toBeUndefined();
    expect(await entriesOf(hybrid)).toEqual({ a: 1 });
    await hybrid.sync();
    await hybrid.flush();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await hybrid.close();
    expect(remote.calls).toEqual([]);
    // The queue waits for a remote mode
    expect(hybrid.getPendingOpsCount()).toBe(2);
  });

  it("local-only keeps its queue in the bounds of maxOfflineOps", async () => {
    const hybrid = hybridOf(new Remote(), { mode: "local-only", maxOfflineOps: 2 });
    await hybrid.set("a", { n: 1 });
    await hybrid.set("b", { n: 2 });
    await expect(hybrid.set("c", { n: 3 })).rejects.toBeInstanceOf(QueueFullError);
    // A write of a queued id replaces its operation
    await hybrid.set("a", { n: 5 });
    expect(await entriesOf(hybrid)).toEqual({ a: 5, b: 2 });
  });

  it("remote-only reads the remote: a change of another writer shows at once, and an error passes through", async () => {
    const remote = new Remote();
    await remote.data.set("a", { n: 1 });
    const hybrid = hybridOf(remote, { mode: "remote-only" });
    expect(await hybrid.get("a")).toEqual({ n: 1 });
    await remote.data.set("a", { n: 2 });
    await remote.data.set("b", { n: 3 });
    expect(await hybrid.get("a")).toEqual({ n: 2 });
    expect(await hybrid.has("b")).toBe(true);
    expect(await hybrid.size()).toBe(2);
    expect((await hybrid.getAll()).map((item) => item.n).sort()).toEqual([2, 3]);
    expect((await hybrid.find((item) => item.n > 2)).map((item) => item.n)).toEqual([3]);
    expect([...(await hybrid.getBatch(["a", "z"])).keys()]).toEqual(["a"]);
    expect(await hybrid.delete("b")).toBe(true);
    expect(await hybrid.deleteBatch(["a", "z"])).toBe(1);
    remote.down = true;
    await expect(hybrid.get("a")).rejects.toThrow("the remote is down");
    // A failed write is not queued: the caller gets the error of the remote
    await expect(hybrid.set("c", { n: 4 })).rejects.toThrow("the remote is down");
    expect(hybrid.getPendingOpsCount()).toBe(0);
  });
});

describe("setMode (R28)", () => {
  it("sends the queue to the remote before it changes the mode", async () => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { mode: "write-back" });
    await hybrid.set("a", { n: 1 });
    await hybrid.set("b", { n: 2 });
    expect(await remote.data.size()).toBe(0);
    await hybrid.setMode("write-through");
    expect(hybrid.getMode()).toBe("write-through");
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await entriesOf(remote.data as unknown as CollectionStorage<Item>)).toEqual({ a: 1, b: 2 });
  });

  it("drops the local copy for remote-only only after the flush, and a failed flush changes nothing", async () => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { mode: "write-back" });
    await hybrid.set("a", { n: 1 });
    remote.down = true;
    const failed = await hybrid.setMode("remote-only").catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(ModeSwitchError);
    expect(failed).toMatchObject({ from: "write-back", to: "remote-only", code: "MODE_SWITCH_FAILED" });
    expect(hybrid.getMode()).toBe("write-back");
    expect(await entriesOf(hybrid)).toEqual({ a: 1 });
    expect(hybrid.getPendingOpsCount()).toBe(1);

    remote.down = false;
    await hybrid.setMode("remote-only");
    expect((await hybrid.getMetadata()).size).toBe(0);
    expect(await hybrid.get("a")).toEqual({ n: 1 });
  });

  it("a switch to local-only makes no remote call, and keeps the queue", async () => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { mode: "write-through" });
    remote.down = true;
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(PendingWriteError);
    const calls = remote.calls.length;
    await hybrid.setMode("local-only");
    expect(remote.calls.length).toBe(calls);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    remote.down = false;
    await hybrid.setMode("write-through");
    expect(await entriesOf(remote.data as unknown as CollectionStorage<Item>)).toEqual({ a: 1 });
  });

  it("a switch from remote-only syncs the local copy, and the reads wait for the sync", async () => {
    const remote = new Remote();
    await remote.data.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const hybrid = hybridOf(remote, { mode: "remote-only" });

    remote.down = true;
    await expect(hybrid.setMode("write-back")).rejects.toBeInstanceOf(ModeSwitchError);
    expect(hybrid.getMode()).toBe("remote-only");
    remote.down = false;

    let release!: () => void;
    remote.gate = new Promise<void>((resolve) => (release = resolve));
    const switching = hybrid.setMode("write-back");
    const reading = hybrid.getAll();
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    expect((await reading).map((item) => item.n).sort()).toEqual([1, 2]);
    await switching;
    expect((await hybrid.getMetadata()).size).toBe(2);
    // The sync after remote-only asks for all items
    expect(remote.calls).toContain("changes:-");
  });

  it("waits for the operations that run, and the operations that start later wait for the switch", async () => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { mode: "write-through" });
    const events: string[] = [];
    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));
    const original = remote.set;
    remote.set = async (id, value) => {
      await slow;
      events.push(`remote set ${id}`);
      return original(id, value);
    };

    const writing = hybrid.set("a", { n: 1 }).then(() => events.push("write a done"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const switching = hybrid.setMode("remote-only").then(() => events.push("switch done"));
    const reading = hybrid.get("a").then((value) => {
      events.push(`read a ${value?.n}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events).toEqual([]);
    release();
    await Promise.all([writing, switching, reading]);
    expect(events).toEqual(["remote set a", "write a done", "switch done", "read a 1"]);
    expect(remote.calls.at(-1)).toBe("get");
  });

  it("refuses an unknown mode", async () => {
    const hybrid = hybridOf(new Remote());
    await expect(hybrid.setMode("offline" as HybridMode)).rejects.toThrow(TypeError);
    expect(() => hybridOf(new Remote(), { mode: "sometimes" as HybridMode })).toThrow(TypeError);
  });

  it("takes the old option writeStrategy as the first mode", () => {
    expect(hybridOf(new Remote(), { writeStrategy: "write-back" }).getMode()).toBe("write-back");
    expect(hybridOf(new Remote(), { writeStrategy: "write-back", mode: "local-only" }).getMode()).toBe("local-only");
  });
});

describe("the durable queue (R28)", () => {
  it("a new storage with the same queue store shows the queued writes and sends them", async () => {
    const remote = new Remote();
    await remote.data.set("x", { n: 9 });
    const store = new MemoryQueueStore();
    const first = hybridOf(remote, { mode: "write-back", queueStore: store });
    await first.set("a", { n: 1 });
    await first.setBatch([["b", { n: 2 }], ["c", { n: 3 }]]);
    await first.delete("x");
    // The process stops without a close
    expect(store.size).toBe(3);

    const second = new HybridStorage<Item>(remote, { mode: "write-back", syncInterval: ms(0), queueStore: store });
    expect(second.getPendingOpsCount()).toBe(0);
    // The reads wait for the load and the first sync: it sends the queue, then reads the remote
    expect(await entriesOf(second)).toEqual({ a: 1, b: 2, c: 3 });
    expect(second.getPendingOpsCount()).toBe(0);
    expect(store.size).toBe(0);
    expect(await entriesOf(remote.data as unknown as CollectionStorage<Item>)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("a write that the queue store cannot keep is undone and not acknowledged", async () => {
    const inner = new MemoryQueueStore();
    let failNext = true;
    const store: QueueStore = {
      load: () => inner.load(),
      append: (op) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("the disk is full"));
        }
        return inner.append(op);
      },
      replace: (ops) => inner.replace(ops),
      clear: () => inner.clear(),
    };
    const hybrid = hybridOf(new Remote(), { mode: "write-back", queueStore: store });
    const error = await hybrid.set("a", { n: 1 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueueStoreError);
    expect((error as Error).cause).toMatchObject({ message: "the disk is full" });
    expect(await entriesOf(hybrid)).toEqual({});
    expect(hybrid.getPendingOpsCount()).toBe(0);

    await hybrid.set("b", { n: 2 });
    expect((await inner.load()).map((op) => op.type)).toEqual(["set"]);
  });

  it("a storage whose queue store cannot load refuses each operation", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store: QueueStore = {
      load: () => Promise.reject(new Error("no access")),
      append: () => Promise.resolve(),
      replace: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const hybrid = hybridOf(new Remote(), { mode: "write-back", queueStore: store });
    await expect(hybrid.get("a")).rejects.toBeInstanceOf(QueueStoreError);
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(QueueStoreError);
    await expect(hybrid.setMode("local-only")).rejects.toBeInstanceOf(QueueStoreError);
    await expect(hybrid.sync()).rejects.toBeInstanceOf(QueueStoreError);
    quiet.mockRestore();
  });
});

describe("FileQueueStore (R28)", () => {
  const op = (id: string, n: number): QueuedOperation => ({ type: "set", data: { id, value: { n } }, timestamp: 1 });

  it("keeps the queue in a JSON Lines file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-queue-"));
    try {
      const path = join(dir, "queues", "items.jsonl");
      const store = new FileQueueStore(path);
      expect(await store.load()).toEqual([]);
      await store.append(op("a", 1));
      await store.append(op("b", 2));
      expect(await new FileQueueStore(path).load()).toEqual([op("a", 1), op("b", 2)]);
      await store.replace([op("b", 2)]);
      expect(await new FileQueueStore(path).load()).toEqual([op("b", 2)]);
      await store.clear();
      expect(await new FileQueueStore(path).load()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("drops a part of a line at the end, and refuses a bad line in the middle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-queue-"));
    try {
      const path = join(dir, "items.jsonl");
      await writeFile(path, `${JSON.stringify(op("a", 1))}\n{"type":"set","da`, "utf8");
      expect(await new FileQueueStore(path).load()).toEqual([op("a", 1)]);
      // The load wrote the file again, so the next append starts on a new line
      expect(await readFile(path, "utf8")).toBe(`${JSON.stringify(op("a", 1))}\n`);

      await writeFile(path, `not json\n${JSON.stringify(op("a", 1))}\n`, "utf8");
      await expect(new FileQueueStore(path).load()).rejects.toThrow("not JSON (line 1)");
      await writeFile(path, `{"type":"rename"}\n`, "utf8");
      await expect(new FileQueueStore(path).load()).rejects.toThrow("not a queued operation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gives a HybridStorage a queue that survives a restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-queue-"));
    try {
      const path = join(dir, "items.jsonl");
      const remote = new Remote();
      const first = hybridOf(remote, { mode: "local-only", queueStore: new FileQueueStore(path) });
      await first.set("a", { n: 1 });
      await first.set("a", { n: 2 });
      await first.set("b", { n: 3 });
      await first.delete("b");
      await first.close();

      const second = hybridOf(remote, { mode: "local-only", queueStore: new FileQueueStore(path) });
      expect(await entriesOf(second)).toEqual({ a: 2 });
      expect(second.getPendingOpsCount()).toBe(2);
      await second.setMode("write-through");
      expect(await entriesOf(remote.data as unknown as CollectionStorage<Item>)).toEqual({ a: 2 });
      expect(await new FileQueueStore(path).load()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the delta sync (R28)", () => {
  it("asks for the changes since the version of the last sync", async () => {
    const remote = new Remote();
    await remote.data.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const hybrid = hybridOf(remote);
    await hybrid.syncFromRemote();
    expect(await entriesOf(hybrid)).toEqual({ a: 1, b: 2 });

    await remote.data.set("c", { n: 3 });
    await remote.data.delete("a");
    await hybrid.syncFromRemote();
    expect(await entriesOf(hybrid)).toEqual({ b: 2, c: 3 });

    const syncs = remote.calls.filter((call) => call.startsWith("changes:"));
    expect(syncs).toHaveLength(2);
    expect(syncs[0]).toBe("changes:-");
    expect(syncs[1]).not.toBe("changes:-");
    expect(remote.calls).not.toContain("entries");
  });

  it("ApiStorage uses the changes procedure, and falls back to the entries of an older server", async () => {
    const current = collectionServer<Item>("items");
    await current.storage.setBatch([["a", { n: 1 }]]);
    const hybrid = hybridOf(new ApiStorage<Item>(new Client(current.transport), { collection: "items" }));
    await hybrid.syncFromRemote();
    await current.storage.set("b", { n: 2 });
    await hybrid.syncFromRemote();
    expect(await entriesOf(hybrid)).toEqual({ a: 1, b: 2 });
    expect(current.calls).toEqual(["changes", "changes"]);

    const older = collectionServer<Item>("items", ["changes"]);
    await older.storage.setBatch([["a", { n: 1 }]]);
    const fallback = hybridOf(new ApiStorage<Item>(new Client(older.transport), { collection: "items", retry: false }));
    await fallback.syncFromRemote();
    await older.storage.set("b", { n: 2 });
    await fallback.syncFromRemote();
    expect(await entriesOf(fallback)).toEqual({ a: 1, b: 2 });
    // The first sync found no changes procedure: each sync reads the entries
    expect(older.calls).toEqual(["entries", "entries"]);
  });
});

describe("versions and conflicts (R28)", () => {
  const versionOf = (item: Item): string | undefined => item.rev;

  /** A storage that synced "a" at rev 1, with a queued local write of "a" at rev L. */
  async function queuedWrite(options: HybridStorageOptions): Promise<{ remote: Remote; hybrid: HybridStorage<Item> }> {
    const remote = new Remote();
    await remote.data.set("a", { n: 1, rev: "1" });
    const hybrid = hybridOf(remote, { mode: "write-back", versionOf, ...options });
    await hybrid.syncFromRemote();
    await hybrid.set("a", { n: 5, rev: "L" });
    return { remote, hybrid };
  }

  it("a remote change of an id without a queued write is not a conflict", async () => {
    const remote = new Remote();
    await remote.data.set("a", { n: 1, rev: "1" });
    const hybrid = hybridOf(remote, { versionOf, conflictResolution: "local" });
    await hybrid.syncFromRemote();
    await remote.data.set("a", { n: 2, rev: "2" });
    await hybrid.syncFromRemote();
    expect(await hybrid.get("a")).toEqual({ n: 2, rev: "2" });
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(0);

    // Without versions, the JSON differs and the "local" policy keeps the local value, as before
    const old = hybridOf(remote, { conflictResolution: "local" });
    await old.syncFromRemote();
    await remote.data.set("a", { n: 3, rev: "3" });
    await old.syncFromRemote();
    expect(await old.get("a")).toEqual({ n: 2, rev: "2" });
    expect((await old.getMetadata()).stats?.["conflicts"]).toBe(1);
  });

  it("an equal version is no change, also when the JSON differs", async () => {
    const remote = new Remote();
    await remote.data.set("a", { n: 1, rev: "1" });
    const hybrid = hybridOf(remote, { versionOf });
    await hybrid.syncFromRemote();
    await remote.data.set("a", { n: 7, rev: "1" });
    await hybrid.syncFromRemote();
    expect(await hybrid.get("a")).toEqual({ n: 1, rev: "1" });
  });

  it("remote: the remote version replaces the queued write", async () => {
    const { remote, hybrid } = await queuedWrite({ conflictResolution: "remote" });
    await remote.data.set("a", { n: 9, rev: "2" });
    await hybrid.syncFromRemote();
    expect(await hybrid.get("a")).toEqual({ n: 9, rev: "2" });
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.syncToRemote();
    expect(await remote.data.get("a")).toEqual({ n: 9, rev: "2" });
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(1);
  });

  it("local: the queued write wins and replaces the remote version", async () => {
    const { remote, hybrid } = await queuedWrite({ conflictResolution: "local" });
    await remote.data.set("a", { n: 9, rev: "2" });
    await hybrid.syncFromRemote();
    expect(await hybrid.get("a")).toEqual({ n: 5, rev: "L" });
    await hybrid.syncToRemote();
    expect(await remote.data.get("a")).toEqual({ n: 5, rev: "L" });
    // The next sync sees the version that the push wrote: no new conflict
    await hybrid.syncFromRemote();
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(1);
  });

  it("merge: mergeFn gives the value, and the merged value waits in the queue", async () => {
    const mergeFn = <T>(local: T, remote: T): T => ({ n: (local as Item).n + (remote as Item).n, rev: "M" }) as T;
    const { remote, hybrid } = await queuedWrite({ conflictResolution: "merge", mergeFn });
    await remote.data.set("a", { n: 9, rev: "2" });
    await hybrid.syncFromRemote();
    expect(await hybrid.get("a")).toEqual({ n: 14, rev: "M" });
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.syncToRemote();
    expect(await remote.data.get("a")).toEqual({ n: 14, rev: "M" });
  });

  it("error: the sync throws ConflictError with the ids, and the local write stays", async () => {
    const { remote, hybrid } = await queuedWrite({ conflictResolution: "error" });
    await remote.data.set("a", { n: 9, rev: "2" });
    await remote.data.set("b", { n: 1, rev: "1" });
    const error = await hybrid.syncFromRemote().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ ids: ["a"], code: "SYNC_CONFLICT" });
    expect(await hybrid.get("a")).toEqual({ n: 5, rev: "L" });
    // The other changes of the sync apply
    expect(await hybrid.get("b")).toEqual({ n: 1, rev: "1" });
    expect(hybrid.getPendingOpsCount()).toBe(1);
    // The next sync finds the conflict again
    await expect(hybrid.syncFromRemote()).rejects.toBeInstanceOf(ConflictError);
  });

  it("a remote delete of an id with a queued write is a conflict", async () => {
    const { remote, hybrid } = await queuedWrite({ conflictResolution: "remote" });
    await remote.data.delete("a");
    await hybrid.syncFromRemote();
    expect(await hybrid.has("a")).toBe(false);
    expect(hybrid.getPendingOpsCount()).toBe(0);
  });

  it("the queue keeps the version that a write changed, so a restart finds the conflict", async () => {
    const store = new MemoryQueueStore();
    const { remote } = await queuedWrite({ conflictResolution: "remote", queueStore: store });
    await remote.data.set("a", { n: 9, rev: "2" });
    const restarted = hybridOf(remote, { mode: "write-back", versionOf, conflictResolution: "remote", queueStore: store });
    await restarted.syncFromRemote();
    expect(await restarted.get("a")).toEqual({ n: 9, rev: "2" });
    expect(restarted.getPendingOpsCount()).toBe(0);
  });

  it("a queued write of an id without a known remote version wins", async () => {
    const remote = new Remote();
    await remote.data.set("a", { n: 1, rev: "1" });
    // A new process: it never saw "a"
    const hybrid = hybridOf(remote, { mode: "write-back", versionOf, conflictResolution: "remote" });
    await hybrid.set("a", { n: 2, rev: "x" });
    await hybrid.syncFromRemote();
    expect(await hybrid.get("a")).toEqual({ n: 2, rev: "x" });
    await hybrid.syncToRemote();
    expect(await remote.data.get("a")).toEqual({ n: 2, rev: "x" });
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(0);
  });
});

describe("the periodic pull (R28)", () => {
  it("keeps the local copy fresh, does not keep the process alive, and stops at close()", async () => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { pullInterval: ms(10) });
    const timer = (hybrid as unknown as { pullTimer: { hasRef?: () => boolean } }).pullTimer;
    expect(timer.hasRef?.()).toBe(false);
    await remote.data.set("b", { n: 2 });
    await vi.waitFor(async () => expect(await hybrid.has("b")).toBe(true), { timeout: 1000, interval: 5 });

    await hybrid.close();
    const pulls = remote.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(remote.calls.length).toBe(pulls);
  });

  it("starts and stops with the modes that have a local copy and a remote", async () => {
    const remote = new Remote();
    const hybrid = hybridOf(remote, { mode: "remote-only", pullInterval: ms(5) });
    const timerOf = (): unknown => (hybrid as unknown as { pullTimer: unknown }).pullTimer;
    expect(timerOf()).toBeNull();
    await hybrid.setMode("write-back");
    expect(timerOf()).not.toBeNull();
    await hybrid.setMode("local-only");
    expect(timerOf()).toBeNull();
    await hybrid.close();
  });
});

describe("ProcedureServer.useStorage drains a HybridStorage (R28)", () => {
  it("sends the queue of the old storage before the change, and keeps the old storage when the remote is down", async () => {
    const remote = new Remote();
    const old = hybridOf(remote, { mode: "write-back" });
    await old.set("a", { n: 1 });
    const server = new ProcedureServer({ collections: { things: old as CollectionStorage<unknown> } });
    const next = new InMemoryStorage<Item>();

    remote.down = true;
    await expect(server.useStorage("things", next, { drain: true, close: true })).rejects.toThrow("the remote is down");
    expect(server.getStorage("things")).toBe(old);

    remote.down = false;
    await server.useStorage("things", next, { drain: true, close: true });
    expect(server.getStorage("things")).toBe(next);
    expect(await entriesOf(remote.data as unknown as CollectionStorage<Item>)).toEqual({ a: 1 });
    expect(old.getPendingOpsCount()).toBe(0);
  });
});

describe("the synced registry switches the mode (R28)", () => {
  const procedure = defineProcedure({
    path: ["math", "one"],
    input: outputSchema<Record<string, never>>(),
    output: outputSchema<number>(),
    metadata: { description: "one" },
    handler: async () => 1,
  });

  it("createSyncedRegistry takes the mode, and setMode sends the queued records", async () => {
    const server = collectionServer<SerializedProcedure>("procedures");
    const registry = createSyncedRegistry({
      type: "hybrid",
      client: new Client(server.transport),
      mode: "local-only",
      baseRegistry: new ProcedureRegistry(),
      hybridOptions: { syncInterval: ms(0) },
    });
    expect(registry.getMode()).toBe("local-only");
    registry.register(procedure);
    await registry.flushWrites();
    expect(await server.storage.size()).toBe(0);
    expect(server.calls).toEqual([]);

    await registry.setMode("write-through");
    expect(registry.getStatus().mode).toBe("write-through");
    expect([...server.storage.keys()]).toEqual(["math.one"]);

    await registry.setMode("remote-only");
    await server.storage.delete("math.one");
    expect(await registry.getAdapter().listPaths()).toEqual([]);
    await registry.close();
  });

  it("refuses a mode for a storage without modes", async () => {
    expect(() => createSyncedRegistry({ type: "memory", mode: "local-only", baseRegistry: new ProcedureRegistry() })).toThrow(
      'Only the storage type "hybrid" has modes',
    );
    const registry = createSyncedRegistry({ type: "memory", baseRegistry: new ProcedureRegistry() });
    expect(registry.getMode()).toBeUndefined();
    await expect(registry.setMode("local-only")).rejects.toThrow("has no modes");
    await registry.close();
  });
});
