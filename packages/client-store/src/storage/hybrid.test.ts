/**
 * HybridStorage cannot lose data (roadmap R2), and its mode switches (roadmap R28).
 *
 * - A sync needs the ids of the remote items. A remote list without ids stopped nothing before:
 *   the sync skipped the items and then emptied the local cache.
 * - A write-through that the remote cannot take waits in the queue, and a timer sends it. A
 *   write that the remote refuses is undone. A full queue refuses a write.
 * - The reads wait for the first sync.
 * - The model: the four modes, switches at random times, restarts with the same queue store, a
 *   remote that goes down and up, a full or a delta sync, and versions with the "remote" policy.
 * - A pull reads a local item only when the result depends on it.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { InMemoryStorage, type CollectionStorage, type StorageChanges } from "@procedures/collections";
import { Client, LocalTransport, createCollectionProcedures, invokeProcedure, outputValue } from "@procedures/client";
import type { RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage, MissingKeysError, ModeSwitchError, PendingWriteError, QueueFullError, type HybridMode } from "./hybrid.js";
import { MemoryQueueStore, type QueuedOperation, type QueueStore } from "./queue.js";
import { ms } from "@procedures/client";

type Item = { n: number; v?: string };

const unavailable = (): Error => Object.assign(new Error("the remote is down"), { retryable: true });
const refused = (): Error => Object.assign(new Error("invalid item"), { code: "VALIDATION_ERROR", retryable: false });

/**
 * A remote storage that can fail. `down` makes each call fail as unavailable, and `refuse`
 * makes each write fail as a refusal. Without `withEntries`, it has no `getEntries`. With
 * `withChanges`, it has `getChangesSince` (roadmap R28).
 */
class FlakyRemote implements CollectionStorage<Item> {
  readonly data = new InMemoryStorage<Item>();
  down = false;
  refuse = false;
  constructor(withEntries = true, withChanges = false) {
    if (!withEntries) (this as { getEntries?: unknown }).getEntries = undefined;
    if (!withChanges) (this as { getChangesSince?: unknown }).getChangesSince = undefined;
  }
  private check(write: boolean): void {
    if (this.down) throw unavailable();
    if (write && this.refuse) throw refused();
  }
  async get(id: string) { this.check(false); return this.data.get(id); }
  async getAll() { this.check(false); return this.data.getAll(); }
  async getEntries(): Promise<Array<[string, Item]>> { this.check(false); return this.data.getEntries(); }
  async getChangesSince(since?: string): Promise<StorageChanges<Item>> { this.check(false); return this.data.getChangesSince(since); }
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

  it("keeps a write that timed out in the queue, and a timer sends it (O68)", async () => {
    const remote = new FlakyRemote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(10) });
    const set = remote.set.bind(remote);
    remote.set = () => Promise.reject(Object.assign(new Error("timed out"), { code: "TIMEOUT", retryable: false }));
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(PendingWriteError);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    expect(await hybrid.get("a")).toEqual({ n: 1 });
    remote.set = set;
    await vi.waitFor(() => expect(hybrid.getPendingOpsCount()).toBe(0));
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
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

const forbidden = (): Error => Object.assign(new Error("not allowed"), { code: "FORBIDDEN" });

/** A remote that refuses each write of the ids in `refused`. */
class PickyRemote extends FlakyRemote {
  readonly refused = new Set<string>();
  private guard(ids: string[]): void {
    if (ids.some((id) => this.refused.has(id))) throw forbidden();
  }
  override async set(id: string, value: Item) { this.guard([id]); return super.set(id, value); }
  override async delete(id: string) { this.guard([id]); return super.delete(id); }
  override async setBatch(items: Array<[string, Item]>) { this.guard(items.map(([id]) => id)); return super.setBatch(items); }
  override async deleteBatch(ids: string[]) { this.guard(ids); return super.deleteBatch(ids); }
}

describe("a queued write that the remote refuses leaves the queue (O67)", () => {
  it("sends the next writes, restores the remote value and calls onRefused", async () => {
    const remote = new PickyRemote();
    await remote.data.set("bad", { n: 0 });
    const onRefused = vi.fn();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: ms(0), onRefused });
    remote.refused.add("bad");
    await hybrid.set("bad", { n: 9 });
    await hybrid.set("b", { n: 2 });
    await hybrid.flush();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await remote.data.get("b")).toEqual({ n: 2 });
    expect(await remote.data.get("bad")).toEqual({ n: 0 });
    expect(await hybrid.get("bad")).toEqual({ n: 0 });
    expect(onRefused).toHaveBeenCalledTimes(1);
    const refusal = onRefused.mock.calls[0]![0];
    expect(refusal).toMatchObject({ ids: ["bad"], restored: true, operation: { type: "set" } });
    expect((refusal.error as { code?: string }).code).toBe("FORBIDDEN");
    await hybrid.close();
  });

  it("restores an item whose queued delete the remote refuses", async () => {
    const remote = new PickyRemote();
    await remote.data.set("a", { n: 1 });
    const hybrid = new HybridStorage<Item>(remote, { writeStrategy: "write-back", syncInterval: ms(0) });
    expect(await hybrid.get("a")).toEqual({ n: 1 });
    remote.refused.add("a");
    await hybrid.delete("a");
    expect(await hybrid.get("a")).toBeUndefined();
    await hybrid.flush();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await hybrid.get("a")).toEqual({ n: 1 });
    await hybrid.close();
  });

  it("keeps a write that the remote cannot take now, and calls no hook", async () => {
    const remote = new PickyRemote();
    const onRefused = vi.fn();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: ms(0), onRefused });
    await hybrid.set("a", { n: 1 });
    remote.down = true;
    await expect(hybrid.flush()).rejects.toThrow("the remote is down");
    expect(hybrid.getPendingOpsCount()).toBe(1);
    expect(onRefused).not.toHaveBeenCalled();
    remote.down = false;
    await hybrid.flush();
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
  });

  it("keeps a write after an error that is not a refusal, such as a timeout", async () => {
    const remote = new FlakyRemote();
    const onRefused = vi.fn();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: ms(0), onRefused });
    await hybrid.set("a", { n: 1 });
    const set = remote.set.bind(remote);
    remote.set = () => Promise.reject(Object.assign(new Error("timed out"), { code: "TIMEOUT", retryable: false }));
    await expect(hybrid.flush()).rejects.toThrow("timed out");
    expect(hybrid.getPendingOpsCount()).toBe(1);
    expect(onRefused).not.toHaveBeenCalled();
    remote.set = set;
    await hybrid.flush();
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
  });

  it("takes the refusals from isRefusal", async () => {
    const remote = new FlakyRemote();
    const isRefusal = (error: unknown): boolean => (error as { code?: string }).code === "UNAUTHORIZED";
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: ms(0), isRefusal });
    await hybrid.set("a", { n: 1 });
    remote.set = () => Promise.reject(Object.assign(new Error("no token"), { code: "UNAUTHORIZED" }));
    await hybrid.flush();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await hybrid.get("a")).toBeUndefined();
    await hybrid.close();
  });

  it("goes on when the hook fails", async () => {
    const remote = new PickyRemote();
    const hybrid = new HybridStorage<Item>(remote, {
      syncOnInit: false,
      writeStrategy: "write-back",
      syncInterval: ms(0),
      onRefused: () => {
        throw new Error("the hook failed");
      },
    });
    remote.refused.add("bad");
    await hybrid.set("bad", { n: 9 });
    await hybrid.set("b", { n: 2 });
    await hybrid.flush();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await remote.data.get("b")).toEqual({ n: 2 });
    expect(await hybrid.get("bad")).toBeUndefined();
    await hybrid.close();
  });

  it("does not fail a new write-through after an older queued write that the remote refuses", async () => {
    const remote = new PickyRemote();
    const onRefused = vi.fn();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(0), onRefused });
    remote.down = true;
    await expect(hybrid.set("bad", { n: 9 })).rejects.toBeInstanceOf(PendingWriteError);
    remote.down = false;
    remote.refused.add("bad");
    await hybrid.set("ok", { n: 1 });
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await remote.data.get("ok")).toEqual({ n: 1 });
    expect(await hybrid.get("bad")).toBeUndefined();
    expect(onRefused).toHaveBeenCalledTimes(1);
    await hybrid.close();
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

/** A process that can stop: after `dead`, its remote and its queue store refuse each call. */
interface Life {
  dead: boolean;
}

const deadError = (): Error => Object.assign(new Error("the process stopped"), { retryable: true });

/** The remote of one process. */
function remoteOf(remote: FlakyRemote, life: Life): CollectionStorage<Item> {
  const wrapped: CollectionStorage<Item> = {
    get: (id) => (life.dead ? Promise.reject(deadError()) : remote.get(id)),
    getAll: () => (life.dead ? Promise.reject(deadError()) : remote.getAll()),
    getEntries: () => (life.dead ? Promise.reject(deadError()) : remote.getEntries()),
    find: (predicate) => (life.dead ? Promise.reject(deadError()) : remote.find(predicate)),
    has: (id) => (life.dead ? Promise.reject(deadError()) : remote.has(id)),
    size: () => (life.dead ? Promise.reject(deadError()) : remote.size()),
    set: (id, value) => (life.dead ? Promise.reject(deadError()) : remote.set(id, value)),
    delete: (id) => (life.dead ? Promise.reject(deadError()) : remote.delete(id)),
    clear: () => (life.dead ? Promise.reject(deadError()) : remote.clear()),
    setBatch: (items) => (life.dead ? Promise.reject(deadError()) : remote.setBatch(items)),
    deleteBatch: (ids) => (life.dead ? Promise.reject(deadError()) : remote.deleteBatch(ids)),
    getBatch: (ids) => (life.dead ? Promise.reject(deadError()) : remote.getBatch(ids)),
    close: async () => undefined,
  };
  if (remote.getChangesSince) {
    wrapped.getChangesSince = (since) => (life.dead ? Promise.reject(deadError()) : remote.getChangesSince(since));
  }
  return wrapped;
}

/** The queue store of one process. */
function queueOf(store: QueueStore, life: Life): QueueStore {
  return {
    load: () => (life.dead ? Promise.reject(deadError()) : store.load()),
    append: (op: QueuedOperation) => (life.dead ? Promise.reject(deadError()) : store.append(op)),
    replace: (ops: QueuedOperation[]) => (life.dead ? Promise.reject(deadError()) : store.replace(ops)),
    clear: () => (life.dead ? Promise.reject(deadError()) : store.clear()),
  };
}

const MODES: HybridMode[] = ["local-only", "write-through", "write-back", "remote-only"];

describe.each(
  MODES.flatMap((mode) => [
    { mode, sync: "entries", versions: false },
    { mode, sync: "entries", versions: true },
    { mode, sync: "changes", versions: false },
    { mode, sync: "changes", versions: true },
  ]),
)("a model that starts in $mode, with a $sync sync, versions: $versions (R2, R28)", ({ mode: startMode, sync, versions }) => {
  type Op =
    | { kind: "set"; id: string; n: number }
    | { kind: "delete"; id: string }
    | { kind: "down" }
    | { kind: "up" }
    | { kind: "push" }
    | { kind: "pull" }
    | { kind: "mode"; mode: HybridMode }
    | { kind: "restart"; mode: HybridMode };
  const id = fc.constantFrom("a", "b");
  const op: fc.Arbitrary<Op> = fc.oneof(
    { arbitrary: fc.record({ kind: fc.constant("set" as const), id, n: fc.integer({ min: 0, max: 9 }) }), weight: 4 },
    { arbitrary: fc.record({ kind: fc.constant("delete" as const), id }), weight: 2 },
    { arbitrary: fc.constant({ kind: "down" as const }), weight: 1 },
    { arbitrary: fc.constant({ kind: "up" as const }), weight: 1 },
    { arbitrary: fc.constant({ kind: "push" as const }), weight: 1 },
    { arbitrary: fc.constant({ kind: "pull" as const }), weight: 2 },
    { arbitrary: fc.record({ kind: fc.constant("mode" as const), mode: fc.constantFrom(...MODES) }), weight: 2 },
    // A restart can start the next process in another mode
    { arbitrary: fc.record({ kind: fc.constant("restart" as const), mode: fc.constantFrom(...MODES) }), weight: 2 },
  );

  it("loses no acknowledged write while the mode switches, the process restarts and the remote fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await fc.assert(
        fc.asyncProperty(fc.array(op, { maxLength: 40 }), async (ops) => {
          const remote = new FlakyRemote(true, sync === "changes");
          const durable = new MemoryQueueStore();
          let life: Life = { dead: false };
          let revision = 0;
          const make = (mode: HybridMode): HybridStorage<Item> =>
            new HybridStorage<Item>(remoteOf(remote, life), {
              syncOnInit: false,
              syncInterval: ms(0),
              mode,
              queueStore: queueOf(durable, life),
              ...(versions && { versionOf: (item: Item) => item.v, conflictResolution: "remote" as const }),
            });
          let hybrid = make(startMode);
          let mode = startMode;
          // True when the local copy has each item: false after a restart, until a sync
          let complete = true;
          // The model: the last write that the caller made, also a write that waits in the queue
          const model = new Map<string, number>();
          const expectModel = async (): Promise<void> => {
            expect(hybrid.getMode()).toBe(mode);
            if (mode === "remote-only") {
              if (remote.down) await expect(hybrid.getEntries()).rejects.toThrow();
              else expect(await snapshot(hybrid)).toEqual(Object.fromEntries(model));
            } else if (complete) {
              // The local copy agrees with the model
              expect(await snapshot(hybrid)).toEqual(Object.fromEntries(model));
            }
          };

          for (const step of ops) {
            switch (step.kind) {
              case "set":
              case "delete": {
                const write = step.kind === "set" ? hybrid.set(step.id, { n: step.n, v: `r${++revision}` }) : hybrid.delete(step.id);
                let acknowledged = true;
                try {
                  await write;
                } catch (error) {
                  if (mode === "remote-only") {
                    // A write of the remote-only mode that fails is not acknowledged
                    expect(error).not.toBeInstanceOf(PendingWriteError);
                    acknowledged = false;
                  } else {
                    expect(mode).toBe("write-through");
                    expect(error).toBeInstanceOf(PendingWriteError);
                  }
                }
                if (acknowledged) {
                  if (step.kind === "set") model.set(step.id, step.n);
                  else model.delete(step.id);
                }
                break;
              }
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
                await hybrid.syncFromRemote().then(
                  () => {
                    if (mode === "write-through" || mode === "write-back") complete = true;
                  },
                  () => undefined,
                );
                break;
              case "mode": {
                const from = mode;
                try {
                  await hybrid.setMode(step.mode);
                  mode = step.mode;
                  // A switch to a remote mode empties the queue first
                  if (from !== step.mode && step.mode !== "local-only") expect(hybrid.getPendingOpsCount()).toBe(0);
                  // A switch from a mode without a fresh local copy syncs it
                  if (from !== step.mode && step.mode !== "remote-only" && (from === "local-only" || from === "remote-only")) complete = true;
                } catch (error) {
                  expect(error).toBeInstanceOf(ModeSwitchError);
                  expect(remote.down).toBe(true);
                }
                break;
              }
              case "restart": {
                // The process stops without a close: only the queue store keeps its state
                life.dead = true;
                await hybrid.close().catch(() => undefined);
                life = { dead: false };
                hybrid = make(step.mode);
                mode = step.mode;
                complete = false;
                break;
              }
            }
            await expectModel();
          }

          // The remote comes back, and a final sync sends each write
          remote.down = false;
          if (mode === "local-only") {
            await hybrid.setMode("write-back");
            mode = "write-back";
          }
          await hybrid.sync();
          complete = true;
          expect(hybrid.getPendingOpsCount()).toBe(0);
          expect(durable.size).toBe(0);
          expect(await snapshot(remote.data as unknown as CollectionStorage<Item>)).toEqual(Object.fromEntries(model));
          await expectModel();
          await hybrid.close();
        }),
        { numRuns: Number(process.env["MODEL_RUNS"] ?? 150) },
      );
    } finally {
      quiet.mockRestore();
    }
  });
});

describe("HybridStorage: the copies and close() of the CollectionStorage contract", () => {
  it("takes a copy at each write: a change of the value after set() does not change the queued write", async () => {
    const remote = new FlakyRemote();
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncInterval: ms(0) });
    const value: Item = { n: 1 };
    await hybrid.set("a", value);
    const batch: Item = { n: 2 };
    await hybrid.setBatch([["b", batch]]);
    value.n = 10;
    batch.n = 20;
    await hybrid.flush();
    expect(await remote.data.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    await hybrid.close();
  });

  it("waits at close() for the operations that run, closes the remote and the local copy one time, and refuses each later call", async () => {
    const closes: string[] = [];
    const remote = new FlakyRemote();
    remote.close = async () => {
      closes.push("remote");
    };
    const local = new InMemoryStorage<Item>();
    const closeLocal = local.close.bind(local);
    local.close = async () => {
      closes.push("local");
      await closeLocal();
    };
    let release: (() => void) | undefined;
    const slowSet = remote.set.bind(remote);
    remote.set = async (id, item) => {
      await new Promise<void>((resolve) => (release = resolve));
      return slowSet(id, item);
    };
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-through", syncInterval: ms(0), local });
    await hybrid.get("warm");
    const write = hybrid.set("a", { n: 1 });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const closing = hybrid.close();
    // close() waits for the write that runs, and a call after close() rejects at once
    await expect(hybrid.get("a")).rejects.toThrow(/closed/);
    await expect(hybrid.setMode("local-only")).rejects.toThrow(/closed/);
    await expect(hybrid.sync()).rejects.toThrow(/closed/);
    expect(closes).toEqual([]);
    release!();
    await write;
    await closing;
    expect(closes).toEqual(["remote", "local"]);
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    await hybrid.close();
    expect(closes).toEqual(["remote", "local"]);
  });

  it("makes no remote call when close() comes before the first sync", async () => {
    const remote = new FlakyRemote();
    const reads = vi.spyOn(remote, "getEntries");
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-through", syncInterval: ms(0) });
    await hybrid.close();
    expect(reads).not.toHaveBeenCalled();
  });
});

describe("HybridStorage: a full pull reads the local ids without copies", () => {
  // FlakyRemote has no getChangesSince, so each pull is a full pull
  it("reads the local ids with getIds(), and not the local entries", async () => {
    const remote = new FlakyRemote();
    await remote.data.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const local = new InMemoryStorage<Item>();
    const entries = vi.spyOn(local, "getEntries");
    const ids = vi.spyOn(local, "getIds");
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-through", syncInterval: ms(0), local });
    await hybrid.syncFromRemote();
    await remote.data.delete("a");
    await hybrid.syncFromRemote();
    expect(await hybrid.getIds()).toEqual(["b"]);
    expect(ids).toHaveBeenCalled();
    expect(entries).not.toHaveBeenCalled();
    await hybrid.close();
  });

  it("reads the local entries when the local copy has no getIds()", async () => {
    const remote = new FlakyRemote();
    await remote.data.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const local = Object.assign(new InMemoryStorage<Item>(), { getIds: undefined });
    const entries = vi.spyOn(local, "getEntries");
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncInterval: ms(0), local });
    await remote.data.delete("b");
    await hybrid.syncFromRemote();
    expect(await hybrid.getIds()).toEqual(["a"]);
    expect(entries).toHaveBeenCalled();
    await hybrid.close();
  });

  it("gives the ids of the remote in remote-only mode, also from a remote without getIds()", async () => {
    const remote = new FlakyRemote();
    await remote.data.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const hybrid = new HybridStorage<Item>(remote, { mode: "remote-only", syncInterval: ms(0) });
    expect(await hybrid.getIds()).toEqual(["a", "b"]);
    remote.down = true;
    await expect(hybrid.getIds()).rejects.toThrow(/down/);
    expect(hybrid.isRemoteOnline()).toBe(false);
    await hybrid.close();
  });
});

describe("HybridStorage: a full pull reads only the local items that it needs", () => {
  const versionOf = (item: Item): string | undefined => item.v;

  /** The ids of the local items that the storage reads, and a reset. Each read of values counts. */
  function countReads(local: InMemoryStorage<Item>): { ids: () => string[]; reset: () => void } {
    const get = vi.spyOn(local, "get");
    const others = [vi.spyOn(local, "getBatch"), vi.spyOn(local, "getEntries"), vi.spyOn(local, "getAll"), vi.spyOn(local, "find")];
    return {
      ids: () => {
        for (const other of others) expect(other).not.toHaveBeenCalled();
        return get.mock.calls.map(([id]) => id);
      },
      reset: () => {
        get.mockClear();
        for (const other of others) other.mockClear();
      },
    };
  }

  /** 20 remote items at version 1. FlakyRemote has no getChangesSince: each pull is a full pull. */
  async function remoteOf20(): Promise<FlakyRemote> {
    const remote = new FlakyRemote();
    await remote.data.setBatch(Array.from({ length: 20 }, (_, index): [string, Item] => [`k${index}`, { n: index, v: "1" }]));
    return remote;
  }

  it("with versionOf, reads no item whose version it knows, and an item with a queued write only for a conflict", async () => {
    const remote = await remoteOf20();
    const local = new InMemoryStorage<Item>();
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncOnInit: false, syncInterval: ms(0), local, versionOf });
    const reads = countReads(local);

    // The first pull does not know the local copy: it reads each id one time
    await hybrid.syncFromRemote();
    expect(reads.ids()).toHaveLength(20);
    reads.reset();

    // No remote change: the pull reads no local item
    await hybrid.syncFromRemote();
    expect(reads.ids()).toEqual([]);

    // Two remote changes: the pull writes them, and it reads no local item
    await remote.data.set("k1", { n: 100, v: "2" });
    await remote.data.set("k2", { n: 200, v: "2" });
    await hybrid.syncFromRemote();
    expect(reads.ids()).toEqual([]);

    // Two queued writes. The remote changed k3 only: the conflict reads k3, and nothing else.
    await hybrid.set("k3", { n: 3, v: "L" });
    await hybrid.set("k4", { n: 4, v: "L" });
    await remote.data.set("k3", { n: 300, v: "2" });
    reads.reset();
    await hybrid.syncFromRemote();
    expect(reads.ids()).toEqual(["k3"]);

    // The results are the results of a pull that reads each item
    const entries = new Map(await hybrid.getEntries());
    expect(entries.get("k1")).toEqual({ n: 100, v: "2" });
    expect(entries.get("k3")).toEqual({ n: 300, v: "2" });
    expect(entries.get("k4")).toEqual({ n: 4, v: "L" });
    expect(entries.size).toBe(20);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.close();
  });

  it("with versionOf, reads a durable local copy one time after a restart, and keeps an equal version", async () => {
    const remote = await remoteOf20();
    // The local copy of the last run: k0 has the remote version with other content
    const local = new InMemoryStorage<Item>();
    await local.setBatch((await remote.data.getEntries()).map(([id, item]): [string, Item] => [id, id === "k0" ? { n: -1, v: "1" } : item]));
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-through", syncOnInit: false, syncInterval: ms(0), local, versionOf });
    const reads = countReads(local);
    await hybrid.syncFromRemote();
    expect(reads.ids()).toHaveLength(20);
    reads.reset();
    await hybrid.syncFromRemote();
    expect(reads.ids()).toEqual([]);
    // An equal version is no change, as when the pull reads the item
    expect(await local.get("k0")).toEqual({ n: -1, v: "1" });
    await hybrid.close();
  });

  it("with versionOf, reads each item again after the local copy was dropped for remote-only", async () => {
    const remote = await remoteOf20();
    const local = new InMemoryStorage<Item>();
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-through", syncOnInit: false, syncInterval: ms(0), local, versionOf });
    await hybrid.syncFromRemote();
    await hybrid.setMode("remote-only");
    await hybrid.set("k5", { n: 50, v: "2" });
    await hybrid.setMode("write-through");
    // The switch back pulled every item into the empty local copy
    expect(await local.size()).toBe(20);
    expect(await local.get("k5")).toEqual({ n: 50, v: "2" });
    expect(await local.get("k6")).toEqual({ n: 6, v: "1" });
    await hybrid.close();
  });

  it("with versionOf, reads an item again after a local write of it failed", async () => {
    const remote = await remoteOf20();
    const local = new InMemoryStorage<Item>();
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncOnInit: false, syncInterval: ms(0), local, versionOf });
    await hybrid.syncFromRemote();
    const set = local.set.bind(local);
    local.set = async () => {
      throw new Error("the disk is full");
    };
    await expect(hybrid.set("k7", { n: 70, v: "L" })).rejects.toThrow("the disk is full");
    local.set = set;
    const reads = countReads(local);
    await hybrid.syncFromRemote();
    expect(reads.ids()).toEqual(["k7"]);
    expect(await local.get("k7")).toEqual({ n: 7, v: "1" });
    await hybrid.close();
  });

  it("without versionOf, reads each local item without a queued write, for the comparison of the JSON", async () => {
    const remote = await remoteOf20();
    const local = new InMemoryStorage<Item>();
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncOnInit: false, syncInterval: ms(0), local });
    await hybrid.syncFromRemote();
    await hybrid.set("k0", { n: 0 });
    await hybrid.set("k1", { n: 1 });
    await hybrid.set("k2", { n: 2 });
    const reads = countReads(local);
    await hybrid.syncFromRemote();
    // A queued write wins without versions: the pull does not read its item. Before, it read 20.
    expect(reads.ids()).toHaveLength(17);
    expect(reads.ids()).not.toContain("k0");
    expect(await local.get("k0")).toEqual({ n: 0 });
    await hybrid.close();
  });
});
