/**
 * The option `local` of HybridStorage (roadmap R45): the application gives the storage of the
 * local copy. A durable one keeps the local copy after a restart, which fixes the open point of
 * R28 "the local copy is not durable". `@procedures/sqlite` tests the same with `SqliteStorage`
 * and a file. Here a storage in memory that keeps its items after `close()` plays the durable one.
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage, type HybridStorageOptions } from "./hybrid.js";
import { MemoryQueueStore } from "./queue.js";

type Item = { n: number };

/** A local copy that keeps its items after close(), as a file does. */
class DurableLocal extends InMemoryStorage<Item> {
  closes = 0;
  override close(): Promise<void> {
    this.closes++;
    return Promise.resolve();
  }
}

/**
 * A remote that counts its calls and can be down. Its close() does nothing: the remote of a real
 * application keeps its items when a client closes.
 */
function remoteOf(): { storage: CollectionStorage<Item>; data: InMemoryStorage<Item>; calls: string[]; down: { value: boolean } } {
  const data = new InMemoryStorage<Item>();
  const calls: string[] = [];
  const down = { value: false };
  const storage = new Proxy(data, {
    get(target, property, receiver) {
      if (property === "close") return () => Promise.resolve();
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push(String(property));
        if (down.value) return Promise.reject(Object.assign(new Error("the remote is down"), { retryable: true }));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { storage, data, calls, down };
}

const base: HybridStorageOptions = { syncOnInit: true, syncInterval: ms(0) };

describe("HybridStorage with a local copy that the application gives (roadmap R45)", () => {
  it("writes the local copy into the given storage, and close() closes it", async () => {
    const remote = remoteOf();
    const local = new DurableLocal();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, local });
    await hybrid.set("a", { n: 1 });
    expect(await local.get("a")).toEqual({ n: 1 });
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
    expect(local.closes).toBe(1);
  });

  it("a durable local copy keeps the synced items: a restart in local-only mode reads them without the remote", async () => {
    const remote = remoteOf();
    await remote.data.set("x", { n: 9 });
    const local = new DurableLocal();
    const queueStore = new MemoryQueueStore();

    const first = new HybridStorage<Item>(remote.storage, { ...base, local, queueStore });
    expect(await first.get("x")).toEqual({ n: 9 });
    await first.set("a", { n: 1 });
    await first.close();

    // A restart while the remote is down. The queue is empty: only the local copy has x and a.
    remote.down.value = true;
    remote.calls.length = 0;
    const second = new HybridStorage<Item>(remote.storage, { ...base, mode: "local-only", local, queueStore });
    expect(await second.getEntries()).toEqual([["x", { n: 9 }], ["a", { n: 1 }]]);
    expect(remote.calls).toEqual([]);
    await second.close();

    // Before R45, the local copy was a new InMemoryStorage: the restart had no items
    const withoutLocal = new HybridStorage<Item>(remote.storage, { ...base, mode: "local-only", queueStore });
    expect(await withoutLocal.getEntries()).toEqual([]);
    await withoutLocal.close();
  });

  it("the first sync after a restart removes the items that the remote deleted, and keeps the queued writes", async () => {
    const remote = remoteOf();
    await remote.data.setBatch([["x", { n: 1 }], ["y", { n: 2 }]]);
    const local = new DurableLocal();
    const queueStore = new MemoryQueueStore();

    const first = new HybridStorage<Item>(remote.storage, { ...base, local, queueStore });
    expect(await first.size()).toBe(2);
    await first.setMode("local-only");
    await first.set("z", { n: 3 });
    await first.close();

    // While the storage was closed, the remote deleted x
    await remote.data.delete("x");
    const second = new HybridStorage<Item>(remote.storage, { ...base, local, queueStore });
    expect(await second.getEntries()).toEqual([["y", { n: 2 }], ["z", { n: 3 }]]);
    expect(await remote.data.get("z")).toEqual({ n: 3 });
    await second.close();
  });

  it("a switch to remote-only empties the durable local copy, and a switch back fills it again", async () => {
    const remote = remoteOf();
    await remote.data.set("x", { n: 1 });
    const local = new DurableLocal();
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, local });
    expect(await hybrid.get("x")).toEqual({ n: 1 });
    await hybrid.setMode("remote-only");
    expect(await local.size()).toBe(0);
    await hybrid.setMode("write-back");
    expect(await local.getEntries()).toEqual([["x", { n: 1 }]]);
    await hybrid.close();
  });

  it("a local copy that cannot take the loaded queue makes the storage refuse each operation", async () => {
    const remote = remoteOf();
    const queueStore = new MemoryQueueStore();
    await queueStore.append({ type: "set", data: { id: "a", value: { n: 1 } }, timestamp: 1 });
    const local = new DurableLocal();
    local.set = () => Promise.reject(new Error("the disk is full"));
    const hybrid = new HybridStorage<Item>(remote.storage, { ...base, local, queueStore });
    await expect(hybrid.get("a")).rejects.toThrow("The local copy could not take the loaded queue");
    await expect(hybrid.set("b", { n: 2 })).rejects.toThrow("The local copy could not take the loaded queue");
    await hybrid.close();
  });
});
