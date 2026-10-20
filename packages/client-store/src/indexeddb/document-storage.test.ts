/**
 * `IndexedDbStorage` (roadmap CLI-22), with `fake-indexeddb` in Node. The file runs the contract of
 * `CollectionStorage` for the storage, and for a `HybridStorage` whose local copy is in IndexedDB.
 * Then it tests what is particular to IndexedDB: the items, the order and the versions after a new
 * connection, two connections of one database (two tabs), the records that the storage does not
 * trust, the errors of the open, and a `HybridStorage` through a reload of the page.
 */

import { describe, it, expect, vi } from "vitest";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import { InMemoryStorage, type CollectionStorage, type StorageChangeBatch } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { ms } from "@procedures/client";
import { HybridStorage } from "../storage/hybrid.js";
import { IndexedDbQueueStore, IndexedDbStorage, IndexedDbSyncStateStore, type IdbFactoryLike } from "../indexeddb.js";

/** The instances of the classes of fake-indexeddb: the package exports the classes as values. */
type FakeFactory = InstanceType<typeof IDBFactory>;
type FakeDatabase = InstanceType<typeof IDBDatabase>;

type Item = { id?: string; n: number; rev?: string; tags?: string[] };

describeCollectionStorageContract(
  "IndexedDbStorage",
  {
    create: () => new IndexedDbStorage<ContractItem>("contract", { indexedDB: new IDBFactory() }),
    createWithMaxTombstones: (max) => new IndexedDbStorage<ContractItem>("contract", { indexedDB: new IDBFactory(), maxTombstones: max }),
    createWithQueryPolicy: (policy) => new IndexedDbStorage<ContractItem>("contract", { indexedDB: new IDBFactory(), queryPolicy: policy }),
    createWithVersions: (versionOf) => new IndexedDbStorage<ContractItem>("contract", { indexedDB: new IDBFactory(), versionOf }),
  },
  { describe, it },
);

// The local copy of a HybridStorage in IndexedDB: the local copy and the remote have the same versionOf (roadmap CLI-16)
for (const mode of ["write-back", "local-only"] as const) {
  describeCollectionStorageContract(
    `HybridStorage (${mode}, a local copy in IndexedDB)`,
    {
      create: () =>
        new HybridStorage<ContractItem>(new InMemoryStorage<ContractItem>(), {
          mode,
          syncInterval: ms(0),
          local: new IndexedDbStorage<ContractItem>("contract-local", { indexedDB: new IDBFactory() }),
        }),
      createWithVersions: (versionOf) =>
        new HybridStorage<ContractItem>(new InMemoryStorage<ContractItem>({ versionOf }), {
          mode,
          syncInterval: ms(0),
          versionOf,
          local: new IndexedDbStorage<ContractItem>("contract-local", { indexedDB: new IDBFactory(), versionOf }),
        }),
    },
    { describe, it },
  );
}

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

/** This function opens a database at version 1 without the storage, as another application does. */
async function openRaw(factory: FakeFactory, database: string, upgrade?: (db: FakeDatabase) => void): Promise<FakeDatabase> {
  return new Promise<FakeDatabase>((resolve, reject) => {
    const request = factory.open(database, 1);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** This function writes raw records in an object store of an existing database, as another application or an old version does. */
async function putRaw(factory: FakeFactory, database: string, store: string, records: Array<{ value: unknown; key?: string }>): Promise<void> {
  const db = await openRaw(factory, database);
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    for (const { value, key } of records) {
      if (key === undefined) transaction.objectStore(store).put(value);
      else transaction.objectStore(store).put(value, key);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

describe("IndexedDbStorage (CLI-22)", () => {
  it("keeps the items, their order and the versions for a new connection to the same database", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbStorage<Item>("users", { indexedDB: factory });
    expect(first.name).toBe("users");
    await first.setBatch([["c", { n: 3 }], ["a", { n: 1 }], ["b", { n: 2 }]]);
    await first.set("a", { n: 10 });
    await first.delete("c");
    await first.set("c", { n: 30 });
    expect(await first.patch("b", { tags: ["x"] })).toEqual({ n: 2, tags: ["x"] });
    const version = (await first.getChangesSince()).version;
    await first.close();

    // A reload of the page: a new storage and a new connection to the same database
    const second = new IndexedDbStorage<Item>("users", { indexedDB: factory });
    const entries = [["a", { n: 10 }], ["b", { n: 2, tags: ["x"] }], ["c", { n: 30 }]];
    expect(await second.getEntries()).toEqual(entries);
    expect(await second.getIds()).toEqual(["a", "b", "c"]);
    expect(await second.size()).toBe(3);
    // The version of the first connection stays valid: a delta, not every item
    const quiet = await second.getChangesSince(version);
    expect(quiet).toEqual({ version, full: false, changed: [], deleted: [] });
    await second.delete("a");
    await second.set("d", { n: 4 });
    const delta = await second.getChangesSince(version);
    expect({ full: delta.full, changed: delta.changed, deleted: delta.deleted }).toEqual({ full: false, changed: [["d", { n: 4 }]], deleted: ["a"] });
    expect(await second.getMetadata()).toEqual({ type: "custom", size: 3, stats: { backend: "indexeddb", database: "users" } });
    await second.close();

    // Another database of the same browser has other items, and another epoch
    const other = new IndexedDbStorage<Item>("orders", { indexedDB: factory });
    expect(await other.getAll()).toEqual([]);
    expect((await other.getChangesSince(version)).full).toBe(true);
    await other.close();
  });

  it("keeps the dropped deletes of the change log through a new connection", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbStorage<Item>("log", { indexedDB: factory, maxTombstones: 1 });
    await first.setBatch([["a", { n: 1 }], ["b", { n: 2 }], ["c", { n: 3 }]]);
    const start = (await first.getChangesSince()).version;
    await first.delete("a");
    await first.close();
    const second = new IndexedDbStorage<Item>("log", { indexedDB: factory, maxTombstones: 1 });
    expect((await second.getChangesSince(start)).deleted).toEqual(["a"]);
    // The second delete drops the first one: the start version gives every item now
    await second.delete("b");
    expect(await second.getChangesSince(start)).toMatchObject({ full: true, changed: [["c", { n: 3 }]], deleted: [] });
    await second.close();
  });

  it("two connections of one database share the items, the order and the change log, as two tabs do", async () => {
    const factory = new IDBFactory();
    const tab1 = new IndexedDbStorage<Item>("shared", { indexedDB: factory });
    const tab2 = new IndexedDbStorage<Item>("shared", { indexedDB: factory });
    const batches: Array<StorageChangeBatch<Item>> = [];
    tab1.observe((batch) => batches.push(batch));
    await tab1.set("a", { n: 1 });
    const version = (await tab1.getChangesSince()).version;
    await tab2.set("b", { n: 2 });
    await tab1.set("c", { n: 3 });
    await tab2.set("a", { n: 10 });
    await Promise.all([tab1.patch("b", { x: 1 }), tab2.patch("b", { y: 2 })]);
    expect(await tab1.getEntries()).toEqual([["a", { n: 10 }], ["b", { n: 2, x: 1, y: 2 }], ["c", { n: 3 }]]);
    expect((await tab2.getChangesSince(version)).changed.map(([id]) => id)).toEqual(["c", "a", "b"]);
    // observe() tells only the writes of its own storage
    expect(batches.flatMap((batch) => batch.map((change) => change.type === "set" && change.id))).toEqual(["a", "c", "b"]);
    await tab1.close();
    await tab2.close();
  });

  it("a write that fails changes nothing: a value without a copy, a patch that cannot apply, and a closed storage", async () => {
    const factory = new IDBFactory();
    const storage = new IndexedDbStorage<unknown>("atomic", { indexedDB: factory });
    await storage.setBatch([["a", { n: 1, tags: ["x"] }]]);
    await expect(storage.setBatch([["b", { n: 2 }], ["c", { f: () => 1 }]])).rejects.toThrow();
    await expect(storage.patch("a", { $set: { "n.deep": 1 } })).rejects.toThrow();
    await expect(storage.patch("a", { $insert: { "tags.5": "y" } })).rejects.toThrow();
    expect(await storage.getEntries()).toEqual([["a", { n: 1, tags: ["x"] }]]);
    await expect(storage.set(7 as unknown as string, 1)).rejects.toThrow(TypeError);
    await storage.close();
    await expect(storage.get("a")).rejects.toThrow("is closed");
    expect(() => storage.observe(() => undefined)).toThrow("is closed");
    expect(await new IndexedDbStorage("atomic", { indexedDB: factory }).getEntries()).toEqual([["a", { n: 1, tags: ["x"] }]]);
  });

  it("checks each record that it reads", async () => {
    const factory = new IDBFactory();
    const storage = new IndexedDbStorage<Item>("odd", { indexedDB: factory });
    await storage.set("ok", { n: 1 });
    await storage.close();
    await putRaw(factory, "odd", "items", [
      // An item without a place in the order
      { value: { id: "no-order", value: { n: 2 } } },
      // An item and a tombstone at the same time
      { value: { id: "both", order: 100, at: 100, deletedAt: 101, value: { n: 3 } } },
    ]);
    const again = new IndexedDbStorage<Item>("odd", { indexedDB: factory });
    await expect(again.get("no-order")).rejects.toThrow('a record that is not an item of an IndexedDbStorage (id "no-order")');
    await expect(again.getAll()).rejects.toThrow("not an item of an IndexedDbStorage (record 2)");
    await expect(again.has("both")).rejects.toThrow("not an item");
    expect(await again.get("ok")).toEqual({ n: 1 });
    await again.close();

    // A counter of another form: the reads of the items work, and the writes and the change log refuse it
    await putRaw(factory, "odd", "log", [{ value: { epoch: 7, seq: 1 }, key: "counter" }]);
    const third = new IndexedDbStorage<Item>("odd", { indexedDB: factory });
    await expect(third.set("x", { n: 1 })).rejects.toThrow("no counter of an IndexedDbStorage");
    await expect(third.getChangesSince()).rejects.toThrow("no counter of an IndexedDbStorage");
    expect(await third.get("ok")).toEqual({ n: 1 });
    expect(await third.has("x")).toBe(false);
    await third.close();
  });

  it("refuses a database of the same name without its object stores, a name that is empty, and a browser without IndexedDB", async () => {
    const factory = new IDBFactory();
    // The database of a queue store has the object store operations only
    const db = await openRaw(factory, "taken", (raw) => raw.createObjectStore("operations", { autoIncrement: true }));
    db.close();
    await expect(new IndexedDbStorage("taken", { indexedDB: factory }).getAll()).rejects.toThrow("has no object store items");
    expect(() => new IndexedDbStorage("")).toThrow(TypeError);
    // Node has no indexedDB in its global scope
    await expect(new IndexedDbStorage("users").size()).rejects.toThrow("IndexedDB is not available");

    // A failed open tries again at the next operation
    let tries = 0;
    const flaky: IdbFactoryLike = {
      open: (name, version) => {
        tries++;
        if (tries === 1) throw new Error("the browser refuses IndexedDB now");
        return factory.open(name, version);
      },
    };
    const storage = new IndexedDbStorage<Item>("flaky", { indexedDB: flaky });
    await expect(storage.set("a", { n: 1 })).rejects.toThrow("refuses IndexedDB");
    await storage.set("a", { n: 1 });
    expect(await storage.get("a")).toEqual({ n: 1 });
    await storage.close();
  });
});

describe("HybridStorage over IndexedDbStorage: a reload of the page (CLI-22)", () => {
  it("a new storage in local-only mode reads the items of the last run, and sends the queue later", async () => {
    const factory = new IDBFactory();
    const remote = new InMemoryStorage<Item>();
    const options = { syncOnInit: false, syncInterval: ms(0) } as const;
    const first = new HybridStorage<Item>(connectionTo(remote), {
      ...options,
      mode: "local-only",
      local: new IndexedDbStorage<Item>("items", { indexedDB: factory }),
      queueStore: new IndexedDbQueueStore("items-queue", { indexedDB: factory }),
    });
    await first.set("a", { n: 1 });
    await first.setBatch([["b", { n: 2 }], ["c", { n: 3 }]]);
    await first.delete("c");
    await first.close();

    const second = new HybridStorage<Item>(connectionTo(remote), {
      ...options,
      mode: "local-only",
      local: new IndexedDbStorage<Item>("items", { indexedDB: factory }),
      queueStore: new IndexedDbQueueStore("items-queue", { indexedDB: factory }),
    });
    expect(await second.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    expect(await second.query({ n: { $gt: 1 } })).toEqual([["b", { n: 2 }]]);
    expect(await remote.size()).toBe(0);
    await second.setMode("write-through");
    expect(await remote.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    await second.close();
    expect(await new IndexedDbStorage<Item>("items", { indexedDB: factory }).getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
  });

  it("keeps the local copy and the sync state: the first pull after the reload asks only for the changes", async () => {
    const factory = new IDBFactory();
    const data = new InMemoryStorage<Item>({ versionOf: (item) => item.rev });
    const sinces: Array<string | undefined> = [];
    const remote = connectionTo(data);
    const getChangesSince = remote.getChangesSince!.bind(remote);
    remote.getChangesSince = (since?: string) => {
      sinces.push(since);
      return getChangesSince(since);
    };
    const versionOf = (item: Item): string | undefined => item.rev;
    const open = (): HybridStorage<Item> =>
      new HybridStorage<Item>(remote, {
        syncInterval: ms(0),
        versionOf,
        local: new IndexedDbStorage<Item>("docs", { indexedDB: factory, versionOf }),
        queueStore: new IndexedDbQueueStore("docs-queue", { indexedDB: factory }),
        syncState: new IndexedDbSyncStateStore("docs-sync", { indexedDB: factory }),
      });
    await data.set("r", { n: 0, rev: "r0" });
    const first = open();
    expect(await first.getEntries()).toEqual([["r", { n: 0, rev: "r0" }]]);
    await first.set("a", { n: 1, rev: "r1" });
    await first.syncFromRemote();
    await first.close();
    const cursor = (await data.getChangesSince()).version;

    sinces.length = 0;
    await data.set("b", { n: 2, rev: "r2" });
    const second = open();
    expect(await second.getEntries()).toEqual([["r", { n: 0, rev: "r0" }], ["a", { n: 1, rev: "r1" }], ["b", { n: 2, rev: "r2" }]]);
    expect(sinces).toEqual([cursor]);
    // The precondition of a caller goes to the local copy in IndexedDB (roadmap CLI-16)
    await expect(second.set("a", { n: 9, rev: "r9" }, { expectedVersion: "r0" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await second.close();
  });

  it('capture: "observe" queues the writes of the application to the IndexedDbStorage, and sends them', async () => {
    const factory = new IDBFactory();
    const remote = new InMemoryStorage<Item>();
    const local = new IndexedDbStorage<Item>("app", { indexedDB: factory });
    const hybrid = new HybridStorage<Item>(connectionTo(remote), { syncInterval: ms(0), local, capture: "observe", origin: "tab-1" });
    await hybrid.getAll();
    const origins: Array<string | undefined> = [];
    remote.observe((batch) => origins.push(...batch.map((change) => change.origin)));
    // The application writes to its local copy directly
    await local.set("a", { n: 1 }, { origin: "app" });
    await local.patch("a", { n: 2 }, { origin: "app" });
    await vi.waitFor(async () => expect(await remote.get("a")).toEqual({ n: 2 }));
    await vi.waitFor(() => expect(hybrid.getStatus()).toMatchObject({ pendingChanges: 0, syncing: false }));
    expect(origins.every((origin) => origin === "tab-1")).toBe(true);
    // An own write of the storage is not captured a second time
    await hybrid.set("b", { n: 3 });
    expect(await remote.getEntries()).toEqual([["a", { n: 2 }], ["b", { n: 3 }]]);
    await hybrid.close();
  });
});
