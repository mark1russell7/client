/**
 * SqliteStorage as the local copy of HybridStorage (roadmap R45). A file keeps the local copy, and
 * `FileQueueStore` keeps the queue, so a restart keeps both. This fixes the open point of R28
 * "the local copy is not durable": a new storage in `local-only` mode reads the items of the last
 * run without the remote.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage, type HybridMode } from "@procedures/store";
import { FileQueueStore } from "@procedures/store/file-queue";
import { SqliteStorage } from "./storage.js";

type Item = { n: number };

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A remote whose items stay when a client closes it, and that can be down. */
class Remote extends InMemoryStorage<Item> {
  down = false;
  calls = 0;
  override get(id: string): Promise<Item | undefined> {
    return this.guard(() => super.get(id));
  }
  override set(id: string, value: Item): Promise<void> {
    return this.guard(() => super.set(id, value));
  }
  override getChangesSince(since?: string) {
    return this.guard(() => super.getChangesSince(since));
  }
  override close(): Promise<void> {
    return Promise.resolve();
  }
  private guard<R>(run: () => Promise<R>): Promise<R> {
    this.calls++;
    return this.down ? Promise.reject(Object.assign(new Error("the remote is down"), { retryable: true })) : run();
  }
}

describe("SqliteStorage as the durable local copy of HybridStorage (roadmap R45)", () => {
  it("keeps the local copy and the queue through restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "client-sqlite-hybrid-"));
    dirs.push(dir);
    const remote = new Remote();
    await remote.set("x", { n: 9 });
    const start = (mode: HybridMode): HybridStorage<Item> =>
      new HybridStorage<Item>(remote, {
        mode,
        syncInterval: ms(0),
        local: new SqliteStorage<Item>({ path: join(dir, "local.db"), table: "items" }),
        queueStore: new FileQueueStore(join(dir, "items.queue.jsonl")),
      });

    // Run 1, online: the first sync copies x into the file, and a write goes to both sides
    const first = start("write-through");
    expect(await first.get("x")).toEqual({ n: 9 });
    await first.set("a", { n: 1 });
    await first.close();

    // Run 2, offline: the file has the local copy, and the storage makes no remote call
    remote.down = true;
    remote.calls = 0;
    const second = start("local-only");
    expect(await second.getEntries()).toEqual([["x", { n: 9 }], ["a", { n: 1 }]]);
    await second.set("b", { n: 2 });
    expect(second.getPendingOpsCount()).toBe(1);
    await second.close();
    expect(remote.calls).toBe(0);

    // Meanwhile the remote changed x
    remote.down = false;
    await remote.set("x", { n: 10 });

    // Run 3, online again: the queue goes to the remote, and the sync brings the new x
    const third = start("write-through");
    expect(await third.getEntries()).toEqual([["x", { n: 10 }], ["a", { n: 1 }], ["b", { n: 2 }]]);
    expect(await remote.get("b")).toEqual({ n: 2 });
    expect(third.getPendingOpsCount()).toBe(0);
    await third.close();

    // The file holds the synced copy: a direct storage of the file reads it
    const file = new SqliteStorage<Item>({ path: join(dir, "local.db"), table: "items" });
    expect(await file.getEntries()).toEqual([["x", { n: 10 }], ["a", { n: 1 }], ["b", { n: 2 }]]);
    await file.close();
  });

  it("a SqliteStorage remote gives a delta to the sync, also after the remote restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "client-sqlite-hybrid-"));
    dirs.push(dir);
    const path = join(dir, "remote.db");
    let remote = new SqliteStorage<Item>({ path, table: "items" });
    await remote.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);

    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(0) });
    await hybrid.syncFromRemote();
    const before = await remote.getChangesSince();
    expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    await hybrid.close();

    // The remote restarts: its versions stay valid, so the next sync of a client is a delta
    remote = new SqliteStorage<Item>({ path, table: "items" });
    await remote.delete("a");
    const delta = await remote.getChangesSince(before.version);
    expect(delta).toMatchObject({ full: false, changed: [], deleted: ["a"] });
    await remote.close();
  });
});
