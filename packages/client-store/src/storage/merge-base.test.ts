/**
 * The base of a three-way merge (roadmap CLI-109). A queued write keeps the remote value that it changed. `mergeFn`
 * gets it as its third argument, also after a restart.
 */

import { describe, it, expect, vi } from "vitest";
import { InMemoryStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage, type HybridStorageOptions } from "./hybrid.js";
import { MemoryQueueStore, singlesOf, type QueuedOperation } from "./queue.js";

type Item = { id: string; n: number; rev: string };
const versionOf = (item: Item): string | undefined => item.rev;
const item = (id: string, n: number, rev: string): Item => ({ id, n, rev });

/** A merge function that records its arguments and adds the changes of both sides to the base. */
function recordingMerge(): { mergeFn: NonNullable<HybridStorageOptions["mergeFn"]>; calls: Array<[unknown, unknown, unknown]> } {
  const calls: Array<[unknown, unknown, unknown]> = [];
  const mergeFn = <T>(local: T, remote: T, base: T | null | undefined): T => {
    calls.push([local, remote, base]);
    const [l, r] = [local as unknown as Item, remote as unknown as Item];
    const b = (base ?? undefined) as Item | undefined;
    return { ...r, n: b === undefined ? l.n + r.n : l.n + r.n - b.n, rev: "M" } as T;
  };
  return { mergeFn, calls };
}

async function serverWith(...items: Item[]): Promise<InMemoryStorage<Item>> {
  const server = new InMemoryStorage<Item>({ versionOf });
  for (const value of items) await server.set(value.id, value);
  return server;
}

/** A view of a storage that a closed `HybridStorage` leaves open, for a restart over the same server and local copy. */
function kept(storage: InMemoryStorage<Item>): InMemoryStorage<Item> {
  return new Proxy(storage, {
    get: (target, key) => (key === "close" ? () => Promise.resolve() : Reflect.get(target, key, target)),
  });
}

function hybridOf(server: InMemoryStorage<Item>, options: HybridStorageOptions = {}): HybridStorage<Item> {
  return new HybridStorage<Item>(server, { mode: "write-back", syncOnInit: false, syncInterval: ms(0), versionOf, ...options });
}

describe("mergeFn gets the remote value that the queued write changed (CLI-109)", () => {
  it("a conflict of a push: the base is the remote item of the last sync", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const { mergeFn, calls } = recordingMerge();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn });
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 5, "L"));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncToRemote();
    expect(calls).toEqual([[item("a", 5, "L"), item("a", 9, "2"), item("a", 1, "1")]]);
    // Both changes stay: 1 + (5 - 1) + (9 - 1)
    expect(await server.get("a")).toEqual(item("a", 13, "M"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("a conflict of a pull: the same base", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const { mergeFn, calls } = recordingMerge();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn });
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 5, "L"));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(calls).toEqual([[item("a", 5, "L"), item("a", 9, "2"), item("a", 1, "1")]]);
    expect(await hybrid.get("a")).toEqual(item("a", 13, "M"));
    await hybrid.close();
  });

  it("an item that the remote deleted, and that both sides write again: the base is null", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const { mergeFn, calls } = recordingMerge();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn });
    await hybrid.syncFromRemote();
    await server.delete("a");
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 5, "L"));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncToRemote();
    expect(calls).toEqual([[item("a", 5, "L"), item("a", 9, "2"), null]]);
    await hybrid.close();
  });

  it("two queued writes of one id: the base is the remote value before the first", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const { mergeFn, calls } = recordingMerge();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn });
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 5, "L"));
    await hybrid.set("b", item("b", 1, "B"));
    await hybrid.set("a", item("a", 6, "L2"));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncToRemote();
    expect(calls).toEqual([[item("a", 6, "L2"), item("a", 9, "2"), item("a", 1, "1")]]);
    await hybrid.close();
  });

  it("a change that the application writes to the local copy: the base is the remote item of the last sync", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const local = new InMemoryStorage<Item>({ versionOf });
    const { mergeFn, calls } = recordingMerge();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn, local, capture: "observe" });
    await hybrid.syncFromRemote();
    await local.set("a", item("a", 5, "L"), { origin: "app" });
    await vi.waitFor(() => expect(hybrid.getPendingOpsCount()).toBe(1));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncToRemote();
    expect(calls).toEqual([[item("a", 5, "L"), item("a", 9, "2"), item("a", 1, "1")]]);
    await hybrid.close();
  });

  it("a restart: the queue store keeps the base value, and the next storage merges with it", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const queueStore = new MemoryQueueStore();
    const local = new InMemoryStorage<Item>({ versionOf });
    const first = hybridOf(kept(server), { conflictResolution: "merge", mergeFn: recordingMerge().mergeFn, queueStore, local: kept(local) });
    await first.syncFromRemote();
    await first.set("a", item("a", 5, "L"));
    await first.setMode("local-only");
    await first.close();
    const [queued] = await queueStore.load();
    expect(queued?.baseValues).toEqual([["a", item("a", 1, "1")]]);

    await server.set("a", item("a", 9, "2"));
    const { mergeFn, calls } = recordingMerge();
    const second = hybridOf(server, { conflictResolution: "merge", mergeFn, queueStore, local });
    await second.syncToRemote();
    expect(calls).toEqual([[item("a", 5, "L"), item("a", 9, "2"), item("a", 1, "1")]]);
    expect(await server.get("a")).toEqual(item("a", 13, "M"));
    await second.close();
  });

  it("an operation that an older version queued has no base value: the merge gets undefined", async () => {
    const server = await serverWith(item("a", 9, "2"));
    const queueStore = new MemoryQueueStore();
    const old: QueuedOperation = { type: "set", data: { id: "a", value: item("a", 5, "L") }, timestamp: 1, base: [["a", "1"]] };
    await queueStore.append(old);
    const local = new InMemoryStorage<Item>({ versionOf });
    const { mergeFn, calls } = recordingMerge();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn, queueStore, local });
    await hybrid.syncToRemote();
    expect(calls).toEqual([[item("a", 5, "L"), item("a", 9, "2"), undefined]]);
    expect(await server.get("a")).toEqual(item("a", 14, "M"));
    await hybrid.close();
  });

  it("the merged write keeps the remote item of the conflict as its base", async () => {
    const server = await serverWith(item("a", 1, "1"));
    const { mergeFn } = recordingMerge();
    const queueStore = new MemoryQueueStore();
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn, queueStore });
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 5, "L"));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    await hybrid.whenQueued();
    const [merged] = await queueStore.load();
    expect(merged).toMatchObject({ base: [["a", "2"]], baseValues: [["a", item("a", 9, "2")]] });
    await hybrid.close();
  });

  it("without capture, the storage keeps no remote values in memory: the base comes from the local copy", async () => {
    const server = await serverWith(item("a", 1, "1"), item("b", 2, "1"));
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn: recordingMerge().mergeFn });
    await hybrid.syncFromRemote();
    expect((hybrid as unknown as { baseValues: Map<string, unknown> }).baseValues.size).toBe(0);
    await hybrid.close();
  });

  it("with capture, the storage keeps the remote value of each id that a sync reads", async () => {
    const server = await serverWith(item("a", 1, "1"), item("b", 2, "1"));
    const local = new InMemoryStorage<Item>({ versionOf });
    const hybrid = hybridOf(server, { conflictResolution: "merge", mergeFn: recordingMerge().mergeFn, local, capture: "observe" });
    await hybrid.syncFromRemote();
    expect((hybrid as unknown as { baseValues: Map<string, unknown> }).baseValues.size).toBe(2);
    await hybrid.close();
  });

  it("the other policies keep no base value", async () => {
    for (const conflictResolution of ["remote", "local", "error"] as const) {
      const server = await serverWith(item("a", 1, "1"));
      const queueStore = new MemoryQueueStore();
      const hybrid = hybridOf(server, { conflictResolution, queueStore });
      await hybrid.syncFromRemote();
      await hybrid.set("a", item("a", 5, "L"));
      await hybrid.whenQueued();
      const [queued] = await queueStore.load();
      expect(queued?.base).toEqual([["a", "1"]]);
      expect(queued?.baseValues).toBeUndefined();
      await hybrid.close().catch(() => undefined);
    }
  });

  it("singlesOf gives each operation of a batch the base value of its id", () => {
    const batch: QueuedOperation = {
      type: "setBatch",
      data: { items: [["a", item("a", 5, "L")], ["b", item("b", 6, "L")]] },
      timestamp: 1,
      base: [["a", "1"], ["b", null]],
      baseValues: [["a", item("a", 1, "1")], ["b", null]],
    };
    expect(singlesOf(batch).map((op) => op.baseValues)).toEqual([[["a", item("a", 1, "1")]], [["b", null]]]);
    const delBatch: QueuedOperation = { type: "deleteBatch", data: { ids: ["a"] }, timestamp: 1, base: [["a", "1"]] };
    expect(singlesOf(delBatch)).toEqual([{ type: "delete", data: { id: "a" }, timestamp: 1, base: [["a", "1"]] }]);
  });
});
