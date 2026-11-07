/**
 * The overlaps of a merge (roadmap CLI-109). `mergeFn` reports the paths where it kept only one side, and the hook
 * `onDropped` gets each report with the reason `overlap`.
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage, type DroppedWrite, type HybridStorageOptions, type MergeContext } from "./hybrid.js";
import { MemoryQueueStore, type QueuedOperation } from "./queue.js";

type Item = { id: string; n: number; title: string; rev: string };
const versionOf = (item: Item): string | undefined => item.rev;
const item = (n: number, title: string, rev: string): Item => ({ id: "a", n, title, rev });

type Merge = NonNullable<HybridStorageOptions["mergeFn"]>;

/** A merge that keeps the remote title and the local number, and reports each path that both sides changed. */
const fieldMerge = <T>(local: T, remote: T, base: T | null | undefined, context: MergeContext): T => {
  const [l, r, b] = [local as unknown as Item, remote as unknown as Item, (base ?? undefined) as Item | undefined];
  if (b === undefined || (l.n !== b.n && r.n !== b.n)) context.overlap(["n"]);
  if (b === undefined || (l.title !== b.title && r.title !== b.title)) context.overlap(["title"]);
  return { ...r, n: l.n, rev: "M" } as T;
};

async function conflict(
  mergeFn: Merge,
  local: Item,
  remote: Item,
  options: HybridStorageOptions = {},
): Promise<{ server: InMemoryStorage<Item>; hybrid: HybridStorage<Item>; drops: DroppedWrite[] }> {
  const server = new InMemoryStorage<Item>({ versionOf });
  await server.set("a", item(1, "base", "1"));
  const drops: DroppedWrite[] = [];
  const hybrid = new HybridStorage<Item>(server, {
    mode: "write-back",
    syncOnInit: false,
    syncInterval: ms(0),
    versionOf,
    conflictResolution: "merge",
    mergeFn,
    onDropped: (drop) => {
      drops.push(drop);
    },
    ...options,
  });
  await hybrid.syncFromRemote();
  await hybrid.set("a", local);
  await server.set("a", remote);
  return { server, hybrid, drops };
}

describe("mergeFn reports its overlaps to onDropped (CLI-109)", () => {
  it("a merge that reports two overlaps gives two reports with their paths", async () => {
    const { hybrid, drops } = await conflict(fieldMerge, item(5, "local", "L"), item(9, "remote", "2"));
    await hybrid.syncToRemote();
    expect(drops).toEqual([
      { id: "a", value: item(5, "local", "L"), reason: "overlap", during: "push", remote: item(9, "remote", "2"), base: item(1, "base", "1"), merged: item(5, "remote", "M"), paths: ["n"] },
      { id: "a", value: item(5, "local", "L"), reason: "overlap", during: "push", remote: item(9, "remote", "2"), base: item(1, "base", "1"), merged: item(5, "remote", "M"), paths: ["title"] },
    ]);
    const stats = (await hybrid.getMetadata()).stats;
    expect(stats?.["overlaps"]).toBe(2);
    expect(stats?.["dropped"]).toBe(0);
    // The merged write stays in the queue, and the push sends it
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("a merge that reports no overlap gives no report", async () => {
    // Only the local side changed the number, and only the remote side changed the title
    const { hybrid, drops } = await conflict(fieldMerge, item(5, "base", "L"), item(1, "remote", "2"));
    await hybrid.syncToRemote();
    expect(drops).toEqual([]);
    expect((await hybrid.getMetadata()).stats?.["overlaps"]).toBe(0);
    await hybrid.close();
  });

  it("a pull conflict reports with during pull", async () => {
    const { hybrid, drops } = await conflict(fieldMerge, item(5, "local", "L"), item(9, "base", "2"));
    await hybrid.syncFromRemote();
    expect(drops.map((drop) => [drop.during, drop.paths])).toEqual([["pull", ["n"]]]);
    await hybrid.close();
  });

  it("an old queued operation with no base value gives base undefined in the report", async () => {
    const server = new InMemoryStorage<Item>({ versionOf });
    await server.set("a", item(9, "remote", "2"));
    const queueStore = new MemoryQueueStore();
    const old: QueuedOperation = { type: "set", data: { id: "a", value: item(5, "local", "L") }, timestamp: 1, base: [["a", "1"]] };
    await queueStore.append(old);
    const drops: DroppedWrite[] = [];
    const hybrid = new HybridStorage<Item>(server, {
      mode: "write-back",
      syncOnInit: false,
      syncInterval: ms(0),
      versionOf,
      conflictResolution: "merge",
      mergeFn: fieldMerge,
      queueStore,
      local: new InMemoryStorage<Item>({ versionOf }),
      onDropped: (drop) => {
        drops.push(drop);
      },
    });
    await hybrid.syncToRemote();
    expect(drops).toHaveLength(2);
    for (const drop of drops) {
      expect(drop.reason).toBe("overlap");
      expect(drop.base).toBeUndefined();
    }
    await hybrid.close();
  });

  it("a call of overlap after the merge returns gives no report", async () => {
    let late: MergeContext | undefined;
    const mergeFn = <T>(_local: T, remote: T, _base: T | null | undefined, context: MergeContext): T => {
      late = context;
      return remote;
    };
    const { hybrid, drops } = await conflict(mergeFn, item(5, "local", "L"), item(9, "remote", "2"));
    await hybrid.syncToRemote();
    late?.overlap(["n"]);
    await hybrid.syncToRemote();
    expect(drops).toEqual([]);
    await hybrid.close();
  });

  it("an error of the hook does not stop the sync", async () => {
    const { server, hybrid } = await conflict(fieldMerge, item(5, "local", "L"), item(9, "remote", "2"), {
      onDropped: () => {
        throw new Error("hook");
      },
    });
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item(5, "remote", "M"));
    await hybrid.close();
  });
});
