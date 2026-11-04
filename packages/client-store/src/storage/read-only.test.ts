/**
 * The mode `read-only` of HybridStorage (roadmap CLI-89): a write is refused at once, with no change
 * of the local copy, the queue or the remote. Reads, pulls and the feed work as in `write-through`.
 */

import { describe, it, expect, vi } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import type { RemoteChangeFeed, RemoteChangeListener } from "./feed.js";
import { HybridStorage, ModeSwitchError, ReadOnlyError, type HybridStorageOptions } from "./hybrid.js";
import { MemoryQueueStore } from "./queue.js";

type Item = { n: number };

const WRITES = new Set(["set", "delete", "clear", "setBatch", "deleteBatch"]);

/** A remote storage that records the name of each call, and that can be down. */
function remoteOf(): { data: InMemoryStorage<Item>; storage: CollectionStorage<Item>; calls: string[]; setDown(down: boolean): void } {
  const data = new InMemoryStorage<Item>();
  const calls: string[] = [];
  let down = false;
  const storage = new Proxy(data, {
    get(target, key) {
      // A close of the hybrid storage closes its remote: the data of the test stays open
      if (key === "close") return () => Promise.resolve();
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push(String(key));
        if (down) return Promise.reject(Object.assign(new Error("the remote is down"), { retryable: true }));
        return (value as (...values: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { data, storage, calls, setDown: (next) => (down = next) };
}

const hybridOf = (remote: CollectionStorage<Item>, options: HybridStorageOptions = {}): HybridStorage<Item> =>
  new HybridStorage<Item>(remote, { mode: "read-only", syncOnInit: false, syncInterval: ms(0), ...options });

const writesOf = (calls: readonly string[]): string[] => calls.filter((call) => WRITES.has(call));

/** Each write of the storage, by the name of its operation. */
const WRITE_CALLS: ReadonlyArray<readonly [string, (hybrid: HybridStorage<Item>) => Promise<unknown>]> = [
  ["set", (hybrid) => hybrid.set("a", { n: 1 })],
  ["delete", (hybrid) => hybrid.delete("x")],
  ["clear", (hybrid) => hybrid.clear()],
  ["setBatch", (hybrid) => hybrid.setBatch([["a", { n: 1 }]])],
  ["deleteBatch", (hybrid) => hybrid.deleteBatch(["x"])],
];

describe("read-only refuses each write (CLI-89)", () => {
  it.each(WRITE_CALLS)("%s throws ReadOnlyError with 0 remote calls and no change", async (name, write) => {
    const remote = remoteOf();
    await remote.data.set("x", { n: 9 });
    const hybrid = hybridOf(remote.storage);
    await hybrid.syncFromRemote();
    const batches: unknown[] = [];
    hybrid.observe((batch) => void batches.push(batch));
    remote.calls.length = 0;

    const error = await write(hybrid).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ReadOnlyError);
    expect(error).toMatchObject({ code: "READ_ONLY", operation: name });
    expect(remote.calls).toEqual([]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await hybrid.getEntries()).toEqual([["x", { n: 9 }]]);
    expect(batches).toEqual([]);
    expect(await remote.data.getEntries()).toEqual([["x", { n: 9 }]]);
    await hybrid.close();
  });
});

describe("read-only reads as write-through does (CLI-89)", () => {
  it("reads the remote on a miss and keeps the item", async () => {
    const remote = remoteOf();
    await remote.data.set("x", { n: 9 });
    const hybrid = hybridOf(remote.storage);
    expect(await hybrid.get("x")).toEqual({ n: 9 });
    remote.calls.length = 0;
    expect(await hybrid.get("x")).toEqual({ n: 9 });
    expect(remote.calls).toEqual([]);
    await hybrid.close();
  });

  it("a first sync and a later sync read the changes of another writer", async () => {
    const remote = remoteOf();
    await remote.data.set("x", { n: 9 });
    const hybrid = new HybridStorage<Item>(remote.storage, { mode: "read-only", syncInterval: ms(0) });
    expect(await hybrid.getEntries()).toEqual([["x", { n: 9 }]]);
    await remote.data.set("y", { n: 2 });
    await hybrid.sync();
    expect(await hybrid.get("y")).toEqual({ n: 2 });
    expect(writesOf(remote.calls)).toEqual([]);
    await hybrid.close();
  });

  it("runs the periodic pull", async () => {
    const clock = fakeClock();
    const hybrid = hybridOf(remoteOf().storage, { pullInterval: ms(5), clock });
    await hybrid.getIds();
    expect(clock.pending).toBe(1);
    await hybrid.setMode("local-only");
    expect(clock.pending).toBe(0);
    await hybrid.setMode("read-only");
    expect(clock.pending).toBe(1);
    await hybrid.close();
  });

  it("subscribes to the feed and applies its changes", async () => {
    const remote = remoteOf();
    const listeners = new Set<RemoteChangeListener<Item>>();
    const feed: RemoteChangeFeed<Item> = {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const hybrid = hybridOf(remote.storage, { feed });
    await hybrid.getIds();
    expect(listeners.size).toBe(1);
    await remote.data.set("x", { n: 9 });
    for (const listener of listeners) listener.onGap();
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["x", { n: 9 }]]));
    await hybrid.close();
    expect(listeners.size).toBe(0);
  });
});

describe("the switches of read-only (CLI-89)", () => {
  it("a switch into the mode sends the queue first", async () => {
    const remote = remoteOf();
    const hybrid = hybridOf(remote.storage, { mode: "write-back" });
    await hybrid.set("a", { n: 1 });
    await hybrid.setMode("read-only");
    expect(hybrid.getMode()).toBe("read-only");
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await expect(hybrid.set("b", { n: 2 })).rejects.toBeInstanceOf(ReadOnlyError);
    await hybrid.close();
  });

  it("a failed send keeps the old mode and the queued write", async () => {
    const remote = remoteOf();
    const hybrid = hybridOf(remote.storage, { mode: "write-back" });
    await hybrid.set("a", { n: 1 });
    remote.setDown(true);
    await expect(hybrid.setMode("read-only")).rejects.toBeInstanceOf(ModeSwitchError);
    expect(hybrid.getMode()).toBe("write-back");
    expect(hybrid.getPendingOpsCount()).toBe(1);
    remote.setDown(false);
    await hybrid.close();
    expect(await remote.data.get("a")).toEqual({ n: 1 });
  });

  it("a switch out of the mode takes writes again", async () => {
    const remote = remoteOf();
    const hybrid = hybridOf(remote.storage);
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(ReadOnlyError);
    await hybrid.setMode("write-through");
    await hybrid.set("a", { n: 1 });
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
  });

  it("a queue that the store loads waits for a mode that writes: no sync, flush or close sends it", async () => {
    const remote = remoteOf();
    const store = new MemoryQueueStore();
    const first = hybridOf(remote.storage, { mode: "local-only", queueStore: store });
    await first.set("a", { n: 1 });
    await first.close();

    const second = new HybridStorage<Item>(remote.storage, { mode: "read-only", syncInterval: ms(0), queueStore: store });
    await second.getIds();
    expect(second.getPendingOpsCount()).toBe(1);
    await second.sync();
    await second.flush();
    expect(writesOf(remote.calls)).toEqual([]);
    await second.close();
    expect(writesOf(remote.calls)).toEqual([]);
    expect(await store.load()).toHaveLength(1);

    const third = hybridOf(remote.storage, { mode: "read-only", queueStore: store });
    await third.getIds();
    await third.setMode("write-through");
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    expect(third.getPendingOpsCount()).toBe(0);
    await third.close();
  });

  it("a captured change of the application waits in the queue", async () => {
    const remote = remoteOf();
    const local = new InMemoryStorage<Item>();
    const hybrid = hybridOf(remote.storage, { local, capture: "observe" });
    await hybrid.getIds();
    await local.set("a", { n: 1 }, { origin: "app" });
    await vi.waitFor(() => expect(hybrid.getPendingOpsCount()).toBe(1));
    await hybrid.flush();
    expect(writesOf(remote.calls)).toEqual([]);
    await hybrid.setMode("write-through");
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
  });
});
