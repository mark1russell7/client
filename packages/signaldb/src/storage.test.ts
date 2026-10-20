/**
 * `SignalDbStorage` (roadmap CLI-23). The file runs the contract of `CollectionStorage` for the
 * storage over a SignalDB collection in memory. Then it tests what is particular to SignalDB: the
 * form of the items, the changes that the app makes directly on the collection, the load of the
 * persistence, the validators of the collection, the items that the storage does not trust and
 * the close.
 */

import { describe, it, expect, vi } from "vitest";
import { Collection, createPersistenceAdapter } from "@signaldb/core";
import type { StorageChangeBatch } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { SignalDbStorage, VALUE_FIELD, documentCodec, type SignalDbItem, type SignalDbItemCodec } from "./index.js";

type Doc = { id: string; title: string; done?: boolean; rev?: string };

describeCollectionStorageContract(
  "SignalDbStorage",
  {
    create: () => new SignalDbStorage<ContractItem>(new Collection()),
    createWithQueryPolicy: (policy) => new SignalDbStorage<ContractItem>(new Collection(), { queryPolicy: policy }),
    createWithVersions: (versionOf) => new SignalDbStorage<ContractItem>(new Collection(), { versionOf }),
  },
  { describe, it },
);

/** The items of the collection as SignalDB keeps them. */
function itemsOf(collection: Collection<any, any>): unknown[] {
  return collection.find({}, { reactive: false }).fetch();
}

describe("SignalDbStorage: the form of the items (CLI-23)", () => {
  it("keeps a document whose id is its key as the item, so the cursors and the selectors of the app read it", async () => {
    const collection = new Collection<Doc>();
    const storage = new SignalDbStorage<Doc>(collection);
    await storage.set("a", { id: "a", title: "Write", done: false });
    await storage.setBatch([["b", { id: "b", title: "Test", done: true }]]);
    expect(itemsOf(collection)).toEqual([
      { id: "a", title: "Write", done: false },
      { id: "b", title: "Test", done: true },
    ]);
    expect(collection.find({ done: true }).fetch()).toEqual([{ id: "b", title: "Test", done: true }]);
    expect(collection.findOne({ id: "a" })?.title).toBe("Write");
    await storage.close();
  });

  it("puts each other value into an envelope, and each value comes back as it was", async () => {
    const collection = new Collection<any>();
    const storage = new SignalDbStorage<unknown>(collection);
    const values: Array<[string, unknown]> = [
      ["no-id", { title: "no id" }],
      ["other-id", { id: "x", title: "another id" }],
      ["reserved", { id: "reserved", [VALUE_FIELD]: 1 }],
      ["list", [1, 2]],
      ["null", null],
      ["text", "plain"],
    ];
    await storage.setBatch(values);
    expect(itemsOf(collection)).toEqual(values.map(([id, value]) => ({ id, [VALUE_FIELD]: value })));
    expect(await storage.getEntries()).toEqual(values);
    await storage.close();
  });

  it("documentCodec() takes another field for the envelope, and refuses the field id", () => {
    const codec = documentCodec<unknown>("$v");
    expect(codec.toItem("a", 5)).toEqual({ id: "a", $v: 5 });
    expect(codec.fromItem({ id: "a", $v: 5 })).toBe(5);
    expect(() => documentCodec("id")).toThrow(TypeError);
    expect(() => documentCodec("")).toThrow(TypeError);
  });

  it("takes the codec of the app: Mongo documents with _id in the items of SignalDB with id", async () => {
    type Public = { _id: string; title: string };
    const codec: SignalDbItemCodec<Public> = {
      toItem: (id, { _id, ...rest }) => ({ ...rest, id: _id ?? id }),
      fromItem: ({ id, ...rest }) => ({ _id: id, ...(rest as { title: string }) }),
    };
    const collection = new Collection<any>();
    const storage = new SignalDbStorage<Public>(collection, { codec });
    await storage.set("a", { _id: "a", title: "Write" });
    expect(itemsOf(collection)).toEqual([{ id: "a", title: "Write" }]);
    collection.insert({ id: "b", title: "Test" });
    expect(await storage.getAll()).toEqual([
      { _id: "a", title: "Write" },
      { _id: "b", title: "Test" },
    ]);
    // An item whose id is not the key of the entry would break the collection
    await expect(storage.set("c", { _id: "d", title: "Wrong" })).rejects.toThrow(/gave no item with the id "c"/);
    expect(await storage.has("c")).toBe(false);
    await storage.close();
  });

  it("refuses an item of the collection without a string id", async () => {
    const collection = new Collection<any>();
    collection.insert({ id: 7, title: "a number" });
    const storage = new SignalDbStorage<unknown>(collection);
    await expect(storage.getAll()).rejects.toThrow(/without a string id/);
    await storage.close();
  });

  it("refuses a value that is not a collection", () => {
    expect(() => new SignalDbStorage({} as never)).toThrow(TypeError);
  });
});

describe("SignalDbStorage: the changes of the app on the collection (CLI-23)", () => {
  it("observe() gives each change that the app makes directly on the collection, with no origin", async () => {
    const collection = new Collection<Doc>();
    const storage = new SignalDbStorage<Doc>(collection);
    const batches: unknown[] = [];
    const stop = storage.observe((batch) => batches.push(batch));
    collection.insert({ id: "a", title: "Write" });
    collection.insert({ id: "b", title: "Test" });
    collection.updateOne({ id: "a" }, { $set: { done: true } });
    collection.replaceOne({ id: "b" }, { id: "b", title: "Test again" });
    collection.removeOne({ id: "a" });
    expect(batches).toEqual([
      [{ type: "set", id: "a", value: { id: "a", title: "Write" } }],
      [{ type: "set", id: "b", value: { id: "b", title: "Test" } }],
      [{ type: "set", id: "a", value: { id: "a", title: "Write", done: true } }],
      [{ type: "set", id: "b", value: { id: "b", title: "Test again" } }],
      [{ type: "delete", id: "a" }],
    ]);
    // A batch is a copy: an observer cannot change the item of the collection
    storage.observe((batch) => {
      for (const change of batch) if (change.type === "set") change.value.title = "changed by an observer";
    });
    collection.insert({ id: "c", title: "Ship" });
    expect(collection.findOne({ id: "c" })?.title).toBe("Ship");
    stop();
    await storage.close();
  });

  it("observe() gives one batch for each write of the storage, with its origin, and not the events of the write", async () => {
    const collection = new Collection<Doc>();
    const storage = new SignalDbStorage<Doc>(collection);
    const batches: StorageChangeBatch<Doc>[] = [];
    storage.observe((batch) => void batches.push(batch));
    await storage.setBatch(
      [
        ["a", { id: "a", title: "Write" }],
        ["b", { id: "b", title: "Test" }],
      ],
      { origin: "sync" },
    );
    await storage.patch("a", { done: true }, { origin: "app" });
    await storage.clear({ origin: "reset" });
    expect(batches).toEqual([
      [
        { type: "set", id: "a", value: { id: "a", title: "Write" }, origin: "sync" },
        { type: "set", id: "b", value: { id: "b", title: "Test" }, origin: "sync" },
      ],
      [{ type: "set", id: "a", value: { id: "a", title: "Write", done: true }, origin: "app" }],
      [{ type: "clear", origin: "reset" }],
    ]);
    await storage.close();
  });

  it("listens to the collection only while an observer is there", async () => {
    const collection = new Collection<Doc>();
    const before = collection.listenerCount("added");
    const storage = new SignalDbStorage<Doc>(collection);
    expect(collection.listenerCount("added")).toBe(before);
    const stopFirst = storage.observe(() => undefined);
    const stopSecond = storage.observe(() => undefined);
    expect(collection.listenerCount("added")).toBe(before + 1);
    stopFirst();
    stopFirst();
    expect(collection.listenerCount("added")).toBe(before + 1);
    stopSecond();
    expect(collection.listenerCount("added")).toBe(before);
    storage.observe(() => undefined);
    await storage.close();
    expect(collection.listenerCount("added")).toBe(before);
    expect(collection.listenerCount("removed")).toBe(before);
  });

  it("gives a changed item that it cannot read to onObserverError, and the write of the app does not fail", async () => {
    const collection = new Collection<any>();
    const errors: unknown[] = [];
    const storage = new SignalDbStorage<unknown>(collection, { onObserverError: (error) => errors.push(error) });
    const batches: unknown[] = [];
    storage.observe((batch) => batches.push(batch));
    expect(() => collection.insert({ id: 7, title: "a number" })).not.toThrow();
    expect(batches).toEqual([]);
    expect(String(errors[0])).toMatch(/without a string id/);
    await storage.close();
  });
});

describe("SignalDbStorage: the collection of the app (CLI-23)", () => {
  it("waits for the load of the persistence before each operation", async () => {
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    const persistence = createPersistenceAdapter<Doc, string>({
      register: async () => undefined,
      load: async () => {
        await loaded;
        return { items: [{ id: "saved", title: "From the last run" }] };
      },
      save: async () => undefined,
    });
    const collection = new Collection<Doc, string>({ persistence });
    const storage = new SignalDbStorage<Doc>(collection);
    const read = storage.getAll();
    const write = storage.set("new", { id: "new", title: "After the load" });
    let done = false;
    void read.then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);
    release();
    expect(await read).toEqual([{ id: "saved", title: "From the last run" }]);
    await write;
    expect(await storage.getAll()).toEqual([
      { id: "saved", title: "From the last run" },
      { id: "new", title: "After the load" },
    ]);
    await storage.close();
  });

  it("operates in memory after a failed load of the persistence, as the collection does", async () => {
    const persistence = createPersistenceAdapter<Doc, string>({
      register: async () => undefined,
      load: async () => {
        throw new Error("no IndexedDB");
      },
      save: async () => undefined,
    });
    const collection = new Collection<Doc, string>({ persistence });
    collection.on("persistence.error", () => undefined);
    const storage = new SignalDbStorage<Doc>(collection);
    await storage.set("a", { id: "a", title: "In memory" });
    expect(await storage.get("a")).toEqual({ id: "a", title: "In memory" });
    await storage.close();
  });

  it("close() leaves the collection open with its items, and a new storage reads them", async () => {
    const collection = new Collection<Doc>();
    const first = new SignalDbStorage<Doc>(collection);
    await first.set("a", { id: "a", title: "Keep" });
    const batches: unknown[] = [];
    first.observe((batch) => batches.push(batch));
    await first.close();
    collection.insert({ id: "b", title: "After the close" });
    expect(batches).toEqual([]);
    const second = new SignalDbStorage<Doc>(collection);
    expect(await second.getEntries()).toEqual([
      ["a", { id: "a", title: "Keep" }],
      ["b", { id: "b", title: "After the close" }],
    ]);
    await second.close();
  });

  it("a close during the load of the persistence rejects the operations that wait", async () => {
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    const persistence = createPersistenceAdapter<Doc, string>({
      register: async () => undefined,
      load: async () => {
        await loaded;
        return { items: [] };
      },
      save: async () => undefined,
    });
    const storage = new SignalDbStorage<Doc>(new Collection<Doc, string>({ persistence }));
    const write = storage.set("a", { id: "a", title: "Too late" });
    await storage.close();
    release();
    await expect(write).rejects.toThrow(/closed/);
  });

  it("a validator of the collection that refuses one item of setBatch() changes nothing, and the collection still operates", async () => {
    const collection = new Collection<Doc>();
    collection.on("validate", (item) => {
      if (item.title === "") throw new Error("A title is necessary");
    });
    const storage = new SignalDbStorage<Doc>(collection);
    await storage.set("a", { id: "a", title: "Keep" });
    await expect(
      storage.setBatch([
        ["a", { id: "a", title: "Changed" }],
        ["b", { id: "b", title: "" }],
      ]),
    ).rejects.toThrow("A title is necessary");
    expect(await storage.getEntries()).toEqual([["a", { id: "a", title: "Keep" }]]);
    // The batch of the collection ended: the indexes and the cursors operate
    collection.insert({ id: "c", title: "New" });
    expect(collection.findOne({ id: "c" })?.title).toBe("New");
    expect(await storage.getBatch(["a", "c"])).toEqual(
      new Map([
        ["a", { id: "a", title: "Keep" }],
        ["c", { id: "c", title: "New" }],
      ]),
    );
    await storage.close();
  });

  it("an error of a listener of the app in a batch ends the batch of the collection, and the write rejects", async () => {
    const collection = new Collection<Doc>();
    const storage = new SignalDbStorage<Doc>(collection);
    await storage.setBatch([
      ["a", { id: "a", title: "A" }],
      ["b", { id: "b", title: "B" }],
    ]);
    const batches: StorageChangeBatch<Doc>[] = [];
    storage.observe((batch) => void batches.push(batch));
    // A listener of the app that throws in the removal of the second item: SignalDB removed the item before its event
    let removals = 0;
    const failing = (): void => {
      if (++removals === 2) throw new Error("the listener of the app failed");
    };
    collection.on("removed", failing);
    await expect(storage.deleteBatch(["a", "b"])).rejects.toThrow("the listener of the app failed");
    collection.off("removed", failing);
    // The observers get the change before the error
    expect(batches[0]?.[0]).toEqual({ type: "delete", id: "a" });
    collection.insert({ id: "c", title: "C" });
    expect(collection.find({}).count()).toBe(1);
    await storage.close();
  });

  it("the cursor of the app sees the writes of the storage", async () => {
    const collection = new Collection<Doc>();
    const storage = new SignalDbStorage<Doc>(collection);
    const seen: string[] = [];
    const cursor = collection.find({ done: true });
    cursor.observeChanges({ added: (item) => seen.push(item.id) }, true);
    await storage.set("a", { id: "a", title: "Open", done: false });
    await storage.patch("a", { done: true });
    await vi.waitFor(() => expect(seen).toEqual(["a"]));
    cursor.cleanup();
    await storage.close();
  });

  it("gives the name of the collection and the metadata", async () => {
    const collection = new Collection<Doc>({ name: "todos" });
    const storage = new SignalDbStorage<Doc>(collection);
    await storage.set("a", { id: "a", title: "Write" });
    expect(storage.name).toBe("todos");
    expect(await storage.getMetadata()).toEqual({ type: "custom", size: 1, stats: { backend: "signaldb", collection: "todos" } });
    await storage.close();
  });

  it("the items of a codec are SignalDbItem objects", () => {
    const item: SignalDbItem = documentCodec<Doc>().toItem("a", { id: "a", title: "Write" });
    expect(item).toEqual({ id: "a", title: "Write" });
  });
});
