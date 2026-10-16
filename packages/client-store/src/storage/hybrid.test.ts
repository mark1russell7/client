/**
 * HybridStorage cannot lose data (roadmap R2).
 *
 * - A sync needs the ids of the remote items. A remote list without ids stopped nothing before:
 *   the sync skipped the items and then emptied the local cache.
 * - A write-through that the remote cannot take waits in the queue, and a timer sends it. A
 *   write that the remote refuses is undone. A full queue refuses a write.
 * - The reads wait for the first sync.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { Client, LocalTransport, createCollectionProcedures, invokeProcedure, outputValue } from "@procedures/client";
import type { RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage, MissingKeysError, PendingWriteError, QueueFullError } from "./hybrid.js";
import { ms } from "@procedures/client";

type Item = { n: number };

const unavailable = (): Error => Object.assign(new Error("the remote is down"), { retryable: true });
const refused = (): Error => Object.assign(new Error("invalid item"), { code: "VALIDATION_ERROR", retryable: false });

/**
 * A remote storage that can fail. `down` makes each call fail as unavailable, and `refuse`
 * makes each write fail as a refusal. Without `withEntries`, it has no `getEntries`.
 */
class FlakyRemote implements CollectionStorage<Item> {
  readonly data = new InMemoryStorage<Item>();
  down = false;
  refuse = false;
  constructor(withEntries = true) {
    if (!withEntries) (this as { getEntries?: unknown }).getEntries = undefined;
  }
  private check(write: boolean): void {
    if (this.down) throw unavailable();
    if (write && this.refuse) throw refused();
  }
  async get(id: string) { this.check(false); return this.data.get(id); }
  async getAll() { this.check(false); return this.data.getAll(); }
  async getEntries(): Promise<Array<[string, Item]>> { this.check(false); return this.data.getEntries(); }
  async find(predicate: (item: Item) => boolean) { this.check(false); return this.data.find(predicate); }
  async has(id: string) { this.check(false); return this.data.has(id); }
  async size() { this.check(false); return this.data.size(); }
  async set(id: string, value: Item) { this.check(true); return this.data.set(id, value); }
  async delete(id: string) { this.check(true); return this.data.delete(id); }
  async clear() { this.check(true); return this.data.clear(); }
  async setBatch(items: Array<[string, Item]>) { this.check(true); return this.data.setBatch(items); }
  async deleteBatch(ids: string[]) { this.check(true); return this.data.deleteBatch(ids); }
  async getBatch(ids: string[]) { this.check(false); return this.data.getBatch(ids); }
  async close() {}
}

async function snapshot(storage: CollectionStorage<Item>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [id, item] of await storage.getEntries!()) out[id] = item.n;
  return out;
}

describe("the sync needs ids (R2)", () => {
  it("stops before any change when the remote items have no key", async () => {
    const remote = new FlakyRemote(false);
    await remote.data.set("a", { n: 1 });
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false });
    await hybrid.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    await expect(hybrid.syncFromRemote()).rejects.toBeInstanceOf(MissingKeysError);
    expect(await snapshot(hybrid)).toEqual({ a: 1, b: 2 });
    expect(hybrid.isRemoteOnline()).toBe(true);
  });

  it("gets the ids from the entries procedure, so items without an id field sync", async () => {
    const storage = new InMemoryStorage<Item>();
    const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
    const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {};
    for (const procedure of createCollectionProcedures("things")) {
      handlers[procedure.path.join(".")] = async (payload) => outputValue(await invokeProcedure(procedure, payload, { repository }), procedure.path);
    }
    await storage.setBatch([["x", { n: 1 }], ["y", { n: 2 }]]);
    const api = new ApiStorage<Item>(new Client(new LocalTransport({ handlers })), { collection: "things" });
    expect(await api.getEntries()).toEqual([["x", { n: 1 }], ["y", { n: 2 }]]);
    const hybrid = new HybridStorage<Item>(api);
    expect(await snapshot(hybrid)).toEqual({ x: 1, y: 2 });
    await hybrid.syncFromRemote();
    expect(await snapshot(hybrid)).toEqual({ x: 1, y: 2 });
  });
});

describe("write-through failures (R2)", () => {
  it("keeps a write that the remote cannot take in the queue, and a timer sends it", async () => {
    const remote = new FlakyRemote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(10) });
    remote.down = true;
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(PendingWriteError);
    // A second try of the same write does not queue it two times
    await expect(hybrid.set("a", { n: 2 })).rejects.toBeInstanceOf(PendingWriteError);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    expect(await hybrid.get("a")).toEqual({ n: 2 });
    remote.down = false;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await remote.data.get("a")).toEqual({ n: 2 });
    await hybrid.close();
  });

  it("undoes a write that the remote refuses, and passes the error", async () => {
    const remote = new FlakyRemote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false });
    await hybrid.set("a", { n: 1 });
    remote.refuse = true;
    await expect(hybrid.set("a", { n: 2 })).rejects.toThrow("invalid item");
    await expect(hybrid.set("b", { n: 3 })).rejects.toThrow("invalid item");
    await expect(hybrid.delete("a")).rejects.toThrow("invalid item");
    expect(await snapshot(hybrid)).toEqual({ a: 1 });
    expect(hybrid.getPendingOpsCount()).toBe(0);
  });

  it("undoes a write without the queue, and undoes a clear", async () => {
    const remote = new FlakyRemote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, offlineQueue: false });
    await hybrid.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    remote.down = true;
    await expect(hybrid.clear()).rejects.toThrow("the remote is down");
    await expect(hybrid.deleteBatch(["a"])).rejects.toThrow("the remote is down");
    expect(await snapshot(hybrid)).toEqual({ a: 1, b: 2 });
  });

  it("refuses a write when the queue is full, and changes nothing", async () => {
    const remote = new FlakyRemote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: ms(0), maxOfflineOps: 2 });
    await hybrid.set("a", { n: 1 });
    await hybrid.set("b", { n: 2 });
    await expect(hybrid.set("c", { n: 3 })).rejects.toBeInstanceOf(QueueFullError);
    expect(await snapshot(hybrid)).toEqual({ a: 1, b: 2 });
    // A write of a queued id replaces its operation, so it fits
    await hybrid.set("b", { n: 5 });
    expect(hybrid.getPendingOpsCount()).toBe(2);
  });
});

describe("the reads wait for the first sync (R2)", () => {
  it("gives the remote items to a read right after the construction", async () => {
    const remote = new FlakyRemote();
    await remote.data.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const slow = Object.assign(Object.create(remote) as FlakyRemote, {
      getEntries: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return remote.data.getEntries();
      },
    });
    const hybrid = new HybridStorage<Item>(slow);
    expect(await hybrid.size()).toBe(2);
    expect((await hybrid.getAll()).map((item) => item.n).sort()).toEqual([1, 2]);
  });
});

describe.each(["write-through", "write-back"] as const)("a model of the %s mode (R2)", (writeStrategy) => {
  type Op =
    | { kind: "set"; id: string; n: number }
    | { kind: "delete"; id: string }
    | { kind: "down" }
    | { kind: "up" }
    | { kind: "push" }
    | { kind: "pull" };
  const id = fc.constantFrom("a", "b", "c");
  const op: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ kind: fc.constant("set" as const), id, n: fc.integer({ min: 0, max: 9 }) }),
    fc.record({ kind: fc.constant("delete" as const), id }),
    fc.constant({ kind: "down" as const }),
    fc.constant({ kind: "up" as const }),
    fc.constant({ kind: "push" as const }),
    fc.constant({ kind: "pull" as const }),
  );

  it("loses no write: after the remote comes back, the local cache and the remote agree with the model", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { maxLength: 40 }), async (ops) => {
        const remote = new FlakyRemote();
        const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(0), writeStrategy });
        // The model: the last write that the caller made, also a write that waits in the queue
        const model = new Map<string, number>();
        for (const step of ops) {
          switch (step.kind) {
            case "set":
              try {
                await hybrid.set(step.id, { n: step.n });
              } catch (error) {
                expect(error).toBeInstanceOf(PendingWriteError);
              }
              model.set(step.id, step.n);
              break;
            case "delete":
              try {
                await hybrid.delete(step.id);
              } catch (error) {
                expect(error).toBeInstanceOf(PendingWriteError);
              }
              model.delete(step.id);
              break;
            case "down":
              remote.down = true;
              break;
            case "up":
              remote.down = false;
              break;
            case "push":
              await hybrid.syncToRemote().catch(() => undefined);
              break;
            case "pull":
              await hybrid.syncFromRemote().catch(() => undefined);
              break;
          }
          // The local cache always agrees with the model
          expect(await snapshot(hybrid)).toEqual(Object.fromEntries(model));
        }
        remote.down = false;
        await hybrid.sync();
        expect(hybrid.getPendingOpsCount()).toBe(0);
        expect(await snapshot(remote.data as unknown as CollectionStorage<Item>)).toEqual(Object.fromEntries(model));
        expect(await snapshot(hybrid)).toEqual(Object.fromEntries(model));
        await hybrid.close();
      }),
      { numRuns: 200 },
    );
  });
});
