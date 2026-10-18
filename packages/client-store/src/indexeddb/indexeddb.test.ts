/**
 * The IndexedDB stores (roadmap R45), with `fake-indexeddb` in Node. The contract of the program
 * stores runs for `IndexedDbProgramStore` in `program-store/backends.test.ts`. This file tests
 * what is particular to IndexedDB: the data after a new connection, the records that a store does
 * not trust, the errors of the open, and the queue store under a `HybridStorage` restart.
 */

import { describe, it, expect } from "vitest";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";

/** The instances of the classes of fake-indexeddb: the package exports the classes as values. */
type FakeFactory = InstanceType<typeof IDBFactory>;
type FakeDatabase = InstanceType<typeof IDBDatabase>;
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage } from "../storage/hybrid.js";
import type { QueuedOperation } from "../storage/queue.js";
import type { StoredProgram } from "../program-store/types.js";
import {
  DEFAULT_PROGRAM_DATABASE,
  IndexedDbProgramStore,
  IndexedDbQueueStore,
  IndexedDbSyncStateStore,
  MemoryProgramStore,
  MemoryQueueStore,
  MemorySyncStateStore,
  hasIndexedDb,
  type IdbFactoryLike,
} from "../indexeddb.js";

/**
 * A connection to a remote that outlives the storage: its `close()` leaves the remote open, as the
 * close of an `ApiStorage` leaves the server. `HybridStorage.close()` closes its remote.
 */
function connectionTo<T>(remote: CollectionStorage<T>): CollectionStorage<T> {
  return new Proxy(remote, {
    get(target, key) {
      if (key === "close") return async () => undefined;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

function program(key: string, a = 1): StoredProgram {
  return {
    key,
    path: key.split("."),
    program: { $proc: ["client", "add"], input: { a, b: 2 } },
    metadata: { description: `The program ${key}` },
    storedAt: 1_700_000_000_000,
  };
}

/** This function writes a raw record in an object store, as another application or an old version does. */
async function putRaw(factory: FakeFactory, database: string, store: string, value: unknown, key?: string): Promise<void> {
  const db = await new Promise<FakeDatabase>((resolve, reject) => {
    const request = factory.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store, store === "programs" ? { keyPath: "key" } : { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    if (key === undefined) transaction.objectStore(store).put(value);
    else transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

const operation = (id: string, n: number): QueuedOperation => ({ type: "set", data: { id, value: { n } }, timestamp: n });

describe("IndexedDbProgramStore", () => {
  it("keeps the programs for a new connection to the same database", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbProgramStore("site-programs", { indexedDB: factory });
    await first.put(program("reports.weekly"));
    await first.put(program("reports.daily"));
    await first.close();

    const second = new IndexedDbProgramStore("site-programs", { indexedDB: factory });
    expect(second.name).toBe("site-programs");
    expect(second.kind).toBe("indexeddb");
    expect((await second.list()).map((p) => p.key)).toEqual(["reports.daily", "reports.weekly"]);
    // Another database of the same browser has other programs
    expect(await new IndexedDbProgramStore("other", { indexedDB: factory }).list()).toEqual([]);
    expect(new IndexedDbProgramStore(undefined, { indexedDB: factory }).name).toBe(DEFAULT_PROGRAM_DATABASE);
  });

  it("checks each record that it reads", async () => {
    const factory = new IDBFactory();
    await putRaw(factory, "programs", "programs", { key: "bad.one", path: ["bad", "one"], program: { input: 1 }, storedAt: 1 });
    const store = new IndexedDbProgramStore("programs", { indexedDB: factory });
    await expect(store.get("bad.one")).rejects.toThrow("procedure ref");
    await expect(store.list()).rejects.toThrow("procedure ref");
    expect(await store.delete("bad.one")).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("refuses a database of the same name without its object store", async () => {
    const factory = new IDBFactory();
    await putRaw(factory, "taken", "something-else", { a: 1 }, "k");
    const store = new IndexedDbProgramStore("taken", { indexedDB: factory });
    await expect(store.list()).rejects.toThrow("has no object store programs");
  });

  it("fails each operation without IndexedDB, and opens again after a failed open", async () => {
    // Node has no indexedDB in its global scope
    expect(hasIndexedDb()).toBe(false);
    await expect(new IndexedDbProgramStore().list()).rejects.toThrow("IndexedDB is not available");

    const real = new IDBFactory();
    let tries = 0;
    const flaky: IdbFactoryLike = {
      open: (name, version) => {
        tries++;
        if (tries === 1) throw new Error("the browser refuses IndexedDB now");
        return real.open(name, version);
      },
    };
    const store = new IndexedDbProgramStore("programs", { indexedDB: flaky });
    await expect(store.put(program("a.b"))).rejects.toThrow("refuses IndexedDB");
    await store.put(program("a.b"));
    expect((await store.get("a.b"))?.key).toBe("a.b");
    expect(tries).toBe(2);
  });

  it("throws after close(), and the programs stay", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbProgramStore("programs", { indexedDB: factory });
    await store.put(program("a.b"));
    await store.close();
    await store.close();
    await expect(store.get("a.b")).rejects.toThrow("is closed");
    expect(await new IndexedDbProgramStore("programs", { indexedDB: factory }).get("a.b")).toEqual(program("a.b"));
  });

  it("closes its connection when another connection asks for a new version", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbProgramStore("programs", { indexedDB: factory });
    await store.put(program("a.b"));
    // An upgrade of another tab: the store closes its connection, so the upgrade does not wait
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("programs", 2);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    // The store opens version 1, and the database has version 2 now
    await expect(store.get("a.b")).rejects.toThrow();
  });

  it("the memory stores of the entry are the fallbacks", async () => {
    const store = new MemoryProgramStore();
    await store.put(program("a.b"));
    expect((await store.list()).map((p) => p.key)).toEqual(["a.b"]);
    const queue = new MemoryQueueStore();
    await queue.append(operation("a", 1));
    expect(await queue.load()).toHaveLength(1);
  });
});

describe("IndexedDbQueueStore", () => {
  it("keeps the operations in order: append, replace, clear, and a new connection loads them", async () => {
    const factory = new IDBFactory();
    const queue = new IndexedDbQueueStore("users-queue", { indexedDB: factory });
    expect(queue.name).toBe("users-queue");
    expect(await queue.load()).toEqual([]);
    await queue.append(operation("a", 1));
    await queue.append(operation("b", 2));
    await queue.append(operation("c", 3));
    expect((await queue.load()).map((op) => op.timestamp)).toEqual([1, 2, 3]);

    await queue.replace([operation("c", 3), operation("d", 4)]);
    await queue.append(operation("e", 5));
    await queue.close();

    const again = new IndexedDbQueueStore("users-queue", { indexedDB: factory });
    expect((await again.load()).map((op) => op.timestamp)).toEqual([3, 4, 5]);
    await again.clear();
    expect(await again.load()).toEqual([]);
    await again.replace([]);
    expect(await again.load()).toEqual([]);
  });

  it("refuses a record that is not a queued operation, and a database without a name", async () => {
    const factory = new IDBFactory();
    await putRaw(factory, "queue", "operations", { type: "unknown" });
    await expect(new IndexedDbQueueStore("queue", { indexedDB: factory }).load()).rejects.toThrow("not a queued operation (record 1)");
    expect(() => new IndexedDbQueueStore("")).toThrow(TypeError);
  });

  it("keeps the queue of a HybridStorage through a restart: the writes of local-only reach the remote later", async () => {
    const factory = new IDBFactory();
    const remote = new InMemoryStorage<{ n: number }>();
    const options = { syncOnInit: false, syncInterval: ms(0), queueStore: new IndexedDbQueueStore("items-queue", { indexedDB: factory }) };

    const first = new HybridStorage<{ n: number }>(connectionTo(remote), { ...options, mode: "local-only" });
    await first.set("a", { n: 1 });
    await first.setBatch([["b", { n: 2 }], ["c", { n: 3 }]]);
    await first.delete("c");
    expect(first.getPendingOpsCount()).toBe(3);
    await first.close();
    expect(await remote.size()).toBe(0);

    // A restart: a new storage and a new connection to the same database
    const second = new HybridStorage<{ n: number }>(connectionTo(remote), {
      ...options,
      mode: "local-only",
      queueStore: new IndexedDbQueueStore("items-queue", { indexedDB: factory }),
    });
    expect(await second.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    await second.setMode("write-through");
    expect(await remote.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    expect(second.getPendingOpsCount()).toBe(0);
    await second.close();
    expect(await new IndexedDbQueueStore("items-queue", { indexedDB: factory }).load()).toEqual([]);
  });
});

describe("IndexedDbSyncStateStore (CLI-21)", () => {
  it("keeps the cursor and the bases for a new connection: a reset, the changes and the forgotten ids", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbSyncStateStore("items-sync", { indexedDB: factory });
    expect(first.name).toBe("items-sync");
    expect(await first.load()).toBeUndefined();
    await first.write({ reset: true, cursor: "v1", bases: [["a", "1"], ["b", null]], forgotten: [] });
    await first.write({ reset: false, cursor: "v2", bases: [["c", "3"]], forgotten: ["a"] });
    await first.close();
    const second = new IndexedDbSyncStateStore("items-sync", { indexedDB: factory });
    const state = await second.load();
    expect(state?.cursor).toBe("v2");
    expect([...(state?.bases ?? [])].sort()).toEqual([["b", null], ["c", "3"]]);
    // A reset without a cursor replaces the whole state
    await second.write({ reset: true, cursor: undefined, bases: [["d", "4"]], forgotten: [] });
    expect(await second.load()).toEqual({ bases: [["d", "4"]] });
    await second.clear();
    expect(await second.load()).toBeUndefined();
    await second.close();
  });

  it("refuses a record that is not a sync state, and a database without a name", async () => {
    const factory = new IDBFactory();
    await putRaw(factory, "odd-sync", "state", { kind: "base", id: 7 }, "base:7");
    await expect(new IndexedDbSyncStateStore("odd-sync", { indexedDB: factory }).load()).rejects.toThrow(/not a sync state/);
    expect(() => new IndexedDbSyncStateStore("")).toThrow(TypeError);
    // The memory store is the fallback
    const memory = new MemorySyncStateStore();
    await memory.write({ reset: true, cursor: "v1", bases: [], forgotten: [] });
    expect(await memory.load()).toEqual({ cursor: "v1", bases: [] });
  });

  it("keeps the sync state of a HybridStorage through a reload: the first pull asks only for the changes", async () => {
    const factory = new IDBFactory();
    const data = new InMemoryStorage<{ n: number; rev: string }>();
    const sinces: Array<string | undefined> = [];
    const remote = connectionTo(data);
    const getChangesSince = remote.getChangesSince!.bind(remote);
    remote.getChangesSince = (since?: string) => {
      sinces.push(since);
      return getChangesSince(since);
    };
    // A local copy that keeps its items, as a durable storage does
    const local = new InMemoryStorage<{ n: number; rev: string }>();
    const options = {
      syncInterval: ms(0),
      local: connectionTo(local) as InMemoryStorage<{ n: number; rev: string }>,
      versionOf: (item: { rev: string }) => item.rev,
    };
    const first = new HybridStorage<{ n: number; rev: string }>(remote, { ...options, syncState: new IndexedDbSyncStateStore("items-state", { indexedDB: factory }) });
    await first.getAll();
    await first.set("a", { n: 1, rev: "r1" });
    await first.syncFromRemote();
    await first.close();
    const cursor = (await data.getChangesSince()).version;
    sinces.length = 0;
    const second = new HybridStorage<{ n: number; rev: string }>(remote, { ...options, syncState: new IndexedDbSyncStateStore("items-state", { indexedDB: factory }) });
    expect(await second.getEntries()).toEqual([["a", { n: 1, rev: "r1" }]]);
    expect(sinces).toEqual([cursor]);
    await second.close();
  });
});
