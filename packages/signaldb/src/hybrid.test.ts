/**
 * A `HybridStorage` whose local copy is a SignalDB collection (roadmap CLI-23, server stack D9).
 * The file runs the contract of `CollectionStorage` for the hybrid storage in the modes
 * `write-back` and `local-only`. Then it tests the sync over the collection of an app: the capture
 * of the writes that the app makes directly on the collection, the changes of the sync that the
 * capture does not send back, and the live cursors of the app.
 */

import { describe, it, expect, vi } from "vitest";
import { Collection } from "@signaldb/core";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { ms } from "@procedures/client";
import { HybridStorage, MemoryQueueStore } from "@procedures/store";
import { SignalDbStorage } from "./index.js";

type Doc = { id: string; title: string; done?: boolean; rev?: string };

// The local copy and the remote have the same versionOf (roadmap CLI-16)
for (const mode of ["write-back", "local-only"] as const) {
  describeCollectionStorageContract(
    `HybridStorage (${mode}, a local copy in a SignalDB collection)`,
    {
      create: () =>
        new HybridStorage<ContractItem>(new InMemoryStorage<ContractItem>(), {
          mode,
          syncInterval: ms(0),
          local: new SignalDbStorage<ContractItem>(new Collection()),
        }),
      createWithVersions: (versionOf) =>
        new HybridStorage<ContractItem>(new InMemoryStorage<ContractItem>({ versionOf }), {
          mode,
          syncInterval: ms(0),
          versionOf,
          local: new SignalDbStorage<ContractItem>(new Collection(), { versionOf }),
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

/** A remote in memory that counts the writes that reach it. */
function remoteOf(): { data: InMemoryStorage<Doc>; storage: CollectionStorage<Doc>; writes: string[] } {
  const data = new InMemoryStorage<Doc>();
  const writes: string[] = [];
  data.observe((batch) => {
    for (const change of batch) writes.push(change.type === "clear" ? "clear" : `${change.type} ${change.id}`);
  });
  return { data, storage: connectionTo(data), writes };
}

describe("HybridStorage over SignalDbStorage: the collection of the app is the local copy (CLI-23)", () => {
  it('capture: "observe" queues the direct writes of the app in write-back mode, and flush() sends them', async () => {
    const remote = remoteOf();
    const collection = new Collection<Doc>();
    const queueStore = new MemoryQueueStore();
    const hybrid = new HybridStorage<Doc>(remote.storage, {
      mode: "write-back",
      syncInterval: ms(0),
      local: new SignalDbStorage<Doc>(collection),
      queueStore,
      capture: "observe",
      origin: "tab-1",
    });
    await hybrid.getAll();
    // The app writes to its collection directly, as Graph does
    collection.insert({ id: "a", title: "Write" });
    collection.insert({ id: "b", title: "Test" });
    collection.updateOne({ id: "a" }, { $set: { done: true } });
    collection.removeOne({ id: "b" });
    expect(hybrid.getPendingOpsCount()).toBeGreaterThan(0);
    expect(remote.writes).toEqual([]);
    await hybrid.flush();
    expect(await remote.data.getEntries()).toEqual([["a", { id: "a", title: "Write", done: true }]]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    // A write of the storage goes to the collection, and the capture does not queue it a second time
    await hybrid.set("c", { id: "c", title: "Ship" });
    expect(collection.findOne({ id: "c" })?.title).toBe("Ship");
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.flush();
    expect(remote.writes.filter((write) => write === "set c")).toHaveLength(1);
    await hybrid.close();
  });

  it("in write-through mode, sends a direct write of the app at once", async () => {
    const remote = remoteOf();
    const collection = new Collection<Doc>();
    const hybrid = new HybridStorage<Doc>(remote.storage, {
      syncInterval: ms(0),
      local: new SignalDbStorage<Doc>(collection),
      capture: "observe",
    });
    await hybrid.getAll();
    collection.insert({ id: "a", title: "Write" });
    await vi.waitFor(async () => expect(await remote.data.get("a")).toEqual({ id: "a", title: "Write" }));
    await vi.waitFor(() => expect(hybrid.getStatus()).toMatchObject({ pendingChanges: 0, syncing: false }));
    await hybrid.close();
  });

  it("does not send back the changes that the sync writes to the collection: the pulls have the origin of the storage", async () => {
    const remote = remoteOf();
    const collection = new Collection<Doc>();
    await remote.data.setBatch([
      ["a", { id: "a", title: "From the server" }],
      ["b", { id: "b", title: "Also from the server" }],
    ]);
    const hybrid = new HybridStorage<Doc>(remote.storage, {
      mode: "write-back",
      syncInterval: ms(0),
      local: new SignalDbStorage<Doc>(collection),
      capture: "observe",
    });
    // The first sync fills the collection
    expect(await hybrid.getAll()).toHaveLength(2);
    expect(collection.find({}).count()).toBe(2);
    remote.writes.length = 0;
    // A later change on the server reaches the collection through a pull
    await remote.data.set("a", { id: "a", title: "Changed on the server" });
    await remote.data.delete("b");
    remote.writes.length = 0;
    await hybrid.syncFromRemote();
    expect(collection.findOne({ id: "a" })?.title).toBe("Changed on the server");
    expect(collection.findOne({ id: "b" })).toBeUndefined();
    // No echo: the queue is empty, and the flush sends nothing to the server
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.flush();
    expect(remote.writes).toEqual([]);
    await hybrid.close();
  });

  it("in local-only mode, keeps the direct writes of the app in the queue, and a switch to write-through sends them", async () => {
    const remote = remoteOf();
    const collection = new Collection<Doc>();
    const hybrid = new HybridStorage<Doc>(remote.storage, {
      mode: "local-only",
      syncOnInit: false,
      syncInterval: ms(0),
      local: new SignalDbStorage<Doc>(collection),
      capture: "observe",
    });
    await hybrid.getAll();
    collection.insert({ id: "a", title: "Offline" });
    collection.insert({ id: "b", title: "Also offline" });
    collection.removeOne({ id: "b" });
    expect(remote.writes).toEqual([]);
    await hybrid.setMode("write-through");
    expect(await remote.data.getEntries()).toEqual([["a", { id: "a", title: "Offline" }]]);
    await hybrid.close();
  });

  it("the observers of the hybrid storage see the writes of the app, and the live cursors of the app see the pulls", async () => {
    const remote = remoteOf();
    const collection = new Collection<Doc>();
    const hybrid = new HybridStorage<Doc>(remote.storage, {
      mode: "write-back",
      syncInterval: ms(0),
      local: new SignalDbStorage<Doc>(collection),
      capture: "observe",
    });
    await hybrid.getAll();
    const changes: string[] = [];
    hybrid.observe((batch) => {
      for (const change of batch) changes.push(change.type === "clear" ? "clear" : `${change.type} ${change.id} ${change.origin ?? "-"}`);
    });
    const live: string[][] = [];
    const cursor = collection.find({ done: true });
    cursor.observeChanges({ added: () => live.push(cursor.fetch().map((doc) => doc.id)) }, true);
    collection.insert({ id: "a", title: "Done by the app", done: true });
    await remote.data.set("b", { id: "b", title: "Done on the server", done: true });
    await hybrid.syncFromRemote();
    await vi.waitFor(() => expect(live.at(-1)).toEqual(["a", "b"]));
    expect(changes).toEqual(["set a -", "set b sync"]);
    cursor.cleanup();
    await hybrid.close();
  });

  it("close() of the hybrid storage closes the SignalDbStorage, and the collection keeps its items", async () => {
    const remote = remoteOf();
    const collection = new Collection<Doc>();
    const local = new SignalDbStorage<Doc>(collection);
    const hybrid = new HybridStorage<Doc>(remote.storage, { mode: "local-only", syncInterval: ms(0), local, capture: "observe" });
    await hybrid.set("a", { id: "a", title: "Keep" });
    await hybrid.close();
    await expect(local.get("a")).rejects.toThrow(/closed/);
    expect(collection.findOne({ id: "a" })?.title).toBe("Keep");
    // The capture stopped: a write of the app reaches no queue
    collection.insert({ id: "b", title: "After the close" });
    expect(hybrid.getPendingOpsCount()).toBe(1);
  });

  it("the precondition of a caller goes to the collection: the local copy tests it", async () => {
    const versionOf = (doc: Doc): string | undefined => doc.rev;
    const remote = new InMemoryStorage<Doc>({ versionOf });
    const collection = new Collection<Doc>();
    const hybrid = new HybridStorage<Doc>(connectionTo(remote), {
      mode: "write-back",
      syncInterval: ms(0),
      versionOf,
      local: new SignalDbStorage<Doc>(collection, { versionOf }),
    });
    await hybrid.set("a", { id: "a", title: "First", rev: "r1" });
    await expect(hybrid.set("a", { id: "a", title: "Stale", rev: "r9" }, { expectedVersion: "r0" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(collection.findOne({ id: "a" })?.title).toBe("First");
    await hybrid.close();
  });
});
