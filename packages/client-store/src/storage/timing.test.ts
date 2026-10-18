/**
 * The storages of this package on the service clock and backoff (roadmap CLI-13). The timers of
 * `HybridStorage` and of the synced registry, and the retries and the timeout of `ApiStorage`, run
 * on `fakeClock` of `@mark1russell7/service/testing`, so the times are exact. A failure goes to
 * the status of the storage, not to the console.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { fakeClock } from "@mark1russell7/service/testing";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { Client, ProcedureRegistry, defineProcedure, ms, outputSchema, seconds, type Message, type ResponseItem, type Transport } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage, PendingWriteError, QueueStoreError } from "./hybrid.js";
import { MemoryQueueStore, type QueueStore } from "./queue.js";
import { SyncedProcedureRegistry } from "./synced-registry.js";
import type { SerializedProcedure, SyncStatus } from "./types.js";

type Item = { n: number };

const downError = (): Error => Object.assign(new Error("the remote is down"), { retryable: true });

/** A remote in memory that counts its writes, and fails each call while it is down. */
class Remote implements CollectionStorage<Item> {
  readonly data = new InMemoryStorage<Item>();
  readonly calls: string[] = [];
  down = false;

  private call<R>(name: string, run: () => Promise<R>): Promise<R> {
    this.calls.push(name);
    return this.down ? Promise.reject(downError()) : run();
  }

  get = (id: string) => this.call("get", () => this.data.get(id));
  getAll = () => this.call("getAll", () => this.data.getAll());
  getEntries = () => this.call("entries", () => this.data.getEntries());
  getChangesSince = (since?: string) => this.call("changes", () => this.data.getChangesSince(since));
  find = (predicate: (item: Item) => boolean) => this.call("find", () => this.data.find(predicate));
  has = (id: string) => this.call("has", () => this.data.has(id));
  size = () => this.call("size", () => this.data.size());
  set = (id: string, value: Item) => this.call("set", () => this.data.set(id, value));
  delete = (id: string) => this.call("delete", () => this.data.delete(id));
  clear = () => this.call("clear", () => this.data.clear());
  setBatch = (items: Array<[string, Item]>) => this.call("setBatch", () => this.data.setBatch(items));
  deleteBatch = (ids: string[]) => this.call("deleteBatch", () => this.data.deleteBatch(ids));
  getBatch = (ids: string[]) => this.call("getBatch", () => this.data.getBatch(ids));
  close = async () => undefined;
}

/** The count of the calls of one name. */
const count = (calls: string[], name: string): number => calls.filter((call) => call === name).length;

const spyConsole = () => vi.spyOn(console, "error");
let consoleError: ReturnType<typeof spyConsole>;
beforeEach(() => {
  consoleError = spyConsole();
});
afterEach(() => {
  // No storage of this package writes to the console (roadmap CLI-13)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe("HybridStorage on the clock (CLI-13)", () => {
  it("the push timer of write-back sends the queue after syncInterval, and again after each interval", async () => {
    const clock = fakeClock();
    const remote = new Remote();
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncOnInit: false, syncInterval: ms(100), clock });
    await hybrid.set("a", { n: 1 });
    await clock.advance(99);
    expect(count(remote.calls, "set")).toBe(0);
    await clock.advance(1);
    await vi.waitFor(() => expect(count(remote.calls, "set")).toBe(1));
    await hybrid.set("b", { n: 2 });
    await clock.advance(100);
    await vi.waitFor(() => expect(count(remote.calls, "set")).toBe(2));
    await vi.waitFor(() => expect(hybrid.getStatus()).toMatchObject({ connected: true, pendingChanges: 0, syncing: false, mode: "write-back" }));
    await hybrid.close();
    expect(clock.pending).toBe(0);
  });

  it("after a failed push, the delay grows with the backoff, and a push that succeeds sets it back", async () => {
    const clock = fakeClock();
    const remote = new Remote();
    const statuses: SyncStatus[] = [];
    const hybrid = new HybridStorage<Item>(remote, {
      mode: "write-back",
      syncOnInit: false,
      syncInterval: ms(100),
      backoff: { factor: 2, maxDelay: ms(350), jitter: 0 },
      clock,
    });
    const stop = hybrid.onStatus((status) => statuses.push(status));
    await hybrid.set("a", { n: 1 });
    remote.down = true;
    // The runs: 100 (fails), then 100 + 200 (fails), then + 350 at most (fails), then + 350
    const setsAt = async (time: number): Promise<number> => {
      await clock.advance(time - clock.now());
      return count(remote.calls, "set");
    };
    expect(await setsAt(100)).toBe(1);
    await vi.waitFor(() => expect(hybrid.getStatus().error).toMatchObject({ operation: "push" }));
    expect((hybrid.getStatus().error?.error as Error).message).toBe("the remote is down");
    expect(hybrid.getStatus()).toMatchObject({ connected: false, pendingChanges: 1 });
    expect(await setsAt(299)).toBe(1);
    expect(await setsAt(300)).toBe(2);
    expect(await setsAt(649)).toBe(2);
    expect(await setsAt(650)).toBe(3);
    remote.down = false;
    expect(await setsAt(1000)).toBe(4);
    await vi.waitFor(() => expect(hybrid.getStatus()).toMatchObject({ connected: true, pendingChanges: 0 }));
    expect(hybrid.getStatus().error).toBeUndefined();
    // Back to the interval after the success
    await hybrid.set("b", { n: 2 });
    expect(await setsAt(1100)).toBe(5);
    await vi.waitFor(() => expect(hybrid.getStatus()).toMatchObject({ pendingChanges: 0, syncing: false }));
    stop();
    expect(statuses.some((status) => status.error?.operation === "push")).toBe(true);
    expect(statuses.some((status) => status.syncing)).toBe(true);
    expect(statuses.at(-1)).toMatchObject({ connected: true, syncing: false });
    await hybrid.close();
  });

  it("the jitter takes a random part of each delay after a failure", async () => {
    const clock = fakeClock();
    const remote = new Remote();
    const hybrid = new HybridStorage<Item>(remote, {
      mode: "write-back",
      syncOnInit: false,
      syncInterval: ms(100),
      backoff: { jitter: 0.5 },
      random: () => 1,
      clock,
    });
    await hybrid.set("a", { n: 1 });
    remote.down = true;
    await clock.advance(100);
    expect(count(remote.calls, "set")).toBe(1);
    // The backoff after one failure is 200, and the jitter takes 0.5 × 1 of it: 100
    await clock.advance(99);
    expect(count(remote.calls, "set")).toBe(1);
    await clock.advance(1);
    expect(count(remote.calls, "set")).toBe(2);
    await hybrid.close();
  });

  it("the periodic pull reports its failure in the status, and the next pull that succeeds clears it", async () => {
    const clock = fakeClock();
    const remote = new Remote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(0), pullInterval: ms(50), backoff: { jitter: 0 }, clock });
    await remote.data.set("a", { n: 1 });
    remote.down = true;
    await clock.advance(50);
    await vi.waitFor(() => expect(hybrid.getStatus().error).toMatchObject({ operation: "pull" }));
    expect(hybrid.getStatus().lastSync).toBeUndefined();
    remote.down = false;
    // The backoff after one failure: 100
    await clock.advance(100);
    await vi.waitFor(() => expect(hybrid.getStatus().error).toBeUndefined());
    expect(await hybrid.get("a")).toEqual({ n: 1 });
    expect(typeof hybrid.getStatus().lastSync).toBe("number");
    await hybrid.close();
  });

  it("write-through: the send of the queue after a failure backs off, and stops when the queue is empty", async () => {
    const clock = fakeClock();
    const remote = new Remote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(40), backoff: { jitter: 0 }, clock });
    remote.down = true;
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(PendingWriteError);
    expect(hybrid.getStatus()).toMatchObject({ connected: false, pendingChanges: 1 });
    expect(clock.pending).toBe(1);
    await clock.advance(40);
    expect(count(remote.calls, "set")).toBe(2);
    // After the failed send: 80
    await clock.advance(79);
    expect(count(remote.calls, "set")).toBe(2);
    remote.down = false;
    await clock.advance(1);
    await vi.waitFor(() => expect(hybrid.getPendingOpsCount()).toBe(0));
    expect(await remote.data.get("a")).toEqual({ n: 1 });
    expect(clock.pending).toBe(0);
    expect(hybrid.getStatus()).toMatchObject({ connected: true, pendingChanges: 0 });
    await hybrid.close();
  });

  it("a write that fails during a send of the queue gets its own send", async () => {
    const clock = fakeClock();
    const remote = new Remote();
    const hybrid = new HybridStorage<Item>(remote, { syncOnInit: false, syncInterval: ms(10), backoff: { jitter: 0 }, clock });
    remote.down = true;
    await expect(hybrid.set("a", { n: 1 })).rejects.toBeInstanceOf(PendingWriteError);
    // The next send of a waits at a gate, and the remote takes it then. Each other write fails while the remote is down.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const set = remote.set;
    remote.set = async (id, value) => {
      if (id !== "a") return set(id, value);
      await gate;
      return remote.data.set(id, value);
    };
    await clock.advance(10);
    // The write waits for the send, then the remote refuses it: it goes in the queue
    const failing = hybrid.set("b", { n: 2 });
    release();
    await expect(failing).rejects.toBeInstanceOf(PendingWriteError);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    remote.down = false;
    await clock.advance(10);
    await vi.waitFor(() => expect(hybrid.getPendingOpsCount()).toBe(0));
    expect(await remote.data.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
    await hybrid.close();
  });

  it("a queue store that cannot load or keep the queue is a failure in the status", async () => {
    const broken: QueueStore = {
      load: () => Promise.reject(new Error("no access")),
      append: () => Promise.resolve(),
      replace: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const hybrid = new HybridStorage<Item>(new Remote(), { mode: "write-back", queueStore: broken, syncInterval: ms(0) });
    await expect(hybrid.get("a")).rejects.toBeInstanceOf(QueueStoreError);
    expect(hybrid.getStatus().error).toMatchObject({ operation: "load" });
    expect(hybrid.getStatus().error?.error).toBeInstanceOf(QueueStoreError);
    await hybrid.close();

    const inner = new MemoryQueueStore();
    let full = true;
    const flaky: QueueStore = {
      load: () => inner.load(),
      append: (op) => (full ? Promise.reject(new Error("the disk is full")) : inner.append(op)),
      replace: (ops) => (full ? Promise.reject(new Error("the disk is full")) : inner.replace(ops)),
      clear: () => inner.clear(),
    };
    const other = new HybridStorage<Item>(new Remote(), { mode: "write-back", queueStore: flaky, syncInterval: ms(0) });
    await expect(other.set("a", { n: 1 })).rejects.toBeInstanceOf(QueueStoreError);
    expect(other.getStatus().error).toMatchObject({ operation: "store" });
    full = false;
    await other.set("b", { n: 2 });
    expect(other.getStatus().error).toBeUndefined();
    await other.close();
  });

  it("onStatus() sends each change once, its function stops it, and close() stops each listener", async () => {
    const remote = new Remote();
    const hybrid = new HybridStorage<Item>(remote, { mode: "local-only", syncOnInit: false, syncInterval: ms(0) });
    const statuses: SyncStatus[] = [];
    const stop = hybrid.onStatus((status) => statuses.push(status));
    await hybrid.set("a", { n: 1 });
    await hybrid.get("a");
    expect(statuses).toEqual([{ connected: true, lastSync: undefined, pendingChanges: 1, syncing: false, mode: "local-only" }]);
    await hybrid.setMode("write-through");
    expect(statuses.at(-1)).toMatchObject({ pendingChanges: 0, mode: "write-through", syncing: false });
    stop();
    const seen = statuses.length;
    await hybrid.set("b", { n: 2 });
    expect(statuses.length).toBe(seen);
    const late: SyncStatus[] = [];
    hybrid.onStatus((status) => late.push(status));
    await hybrid.close();
    expect(() => hybrid.onStatus(() => undefined)).toThrow("closed");
  });

  it("the error of a status listener goes to onListenerError, and the storage goes on", async () => {
    const errors: unknown[] = [];
    const hybrid = new HybridStorage<Item>(new Remote(), {
      mode: "local-only",
      syncOnInit: false,
      syncInterval: ms(0),
      onListenerError: (error) => errors.push(error),
    });
    hybrid.onStatus(() => {
      throw new Error("the listener failed");
    });
    await hybrid.set("a", { n: 1 });
    expect(await hybrid.get("a")).toEqual({ n: 1 });
    expect((errors[0] as Error).message).toBe("the listener failed");
    await hybrid.close();
  });

  it("refuses a backoff that the timers cannot use", () => {
    expect(() => new HybridStorage<Item>(new Remote(), { backoff: { factor: 0.5 } })).toThrow(RangeError);
    expect(() => new HybridStorage<Item>(new Remote(), { backoff: { jitter: 2 } })).toThrow(RangeError);
  });
});

/** A transport that answers each call with the next answer of the script: an error code or a value. */
function scripted(script: Array<{ error: string; retryable: boolean } | { value: unknown } | "hang">): {
  transport: Transport;
  sends: () => number;
} {
  let sent = 0;
  const transport = {
    name: "scripted",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      const step = script[Math.min(sent, script.length - 1)]!;
      sent++;
      if (step === "hang") {
        await new Promise<void>((resolve) => message.signal?.addEventListener("abort", () => resolve(), { once: true }));
        return;
      }
      if ("error" in step) {
        yield {
          id: message.id,
          status: { type: "error", code: step.error, message: step.error, retryable: step.retryable },
          payload: null as TRes,
          metadata: {},
        } as ResponseItem<TRes>;
        return;
      }
      yield { id: message.id, status: { type: "success", code: 200 }, payload: step.value as TRes, metadata: {} } as ResponseItem<TRes>;
    },
    close: async () => undefined,
  } as Transport;
  return { transport, sends: () => sent };
}

describe("ApiStorage on the clock and the backoff (CLI-13)", () => {
  it("waits backoffDelay between the attempts, on the clock of the options", async () => {
    const clock = fakeClock();
    const { transport, sends } = scripted([
      { error: "UNAVAILABLE", retryable: true },
      { error: "UNAVAILABLE", retryable: true },
      { value: 7 },
    ]);
    const api = new ApiStorage(new Client(transport), { collection: "x", retry: 3, retryDelay: ms(100), retryJitter: 0, clock });
    const size = api.size();
    await clock.advance(0);
    expect(sends()).toBe(1);
    await clock.advance(99);
    expect(sends()).toBe(1);
    await clock.advance(1);
    expect(sends()).toBe(2);
    // The second wait is two times longer
    await clock.advance(199);
    expect(sends()).toBe(2);
    await clock.advance(1);
    expect(await size).toBe(7);
    expect(sends()).toBe(3);
  });

  it("the full jitter waits a random part of the backoff, and maxRetryDelay limits the backoff", async () => {
    const clock = fakeClock();
    const { transport, sends } = scripted([{ error: "UNAVAILABLE", retryable: true }, { error: "UNAVAILABLE", retryable: true }, { value: 1 }]);
    const api = new ApiStorage(new Client(transport), {
      collection: "x",
      retryDelay: ms(1000),
      retryFactor: 10,
      maxRetryDelay: ms(2000),
      random: () => 0.75,
      clock,
    });
    const size = api.size();
    await clock.advance(0);
    // The first backoff is 1000: the wait is 1000 × (1 − 0.75)
    await clock.advance(249);
    expect(sends()).toBe(1);
    await clock.advance(1);
    expect(sends()).toBe(2);
    // The second backoff is 10000, at most 2000: the wait is 500
    await clock.advance(499);
    expect(sends()).toBe(2);
    await clock.advance(1);
    expect(await size).toBe(1);
  });

  it("an error that asks for a longer wait gets it", async () => {
    const clock = fakeClock();
    const busy = Object.assign(new Error("busy"), { retryable: true, retryAfterMs: 1500 });
    let calls = 0;
    const client = { call: async () => (++calls === 1 ? Promise.reject(busy) : 3) } as unknown as Client;
    const api = new ApiStorage(client, { collection: "x", retryDelay: ms(10), retryJitter: 0, clock });
    const size = api.size();
    await clock.advance(0);
    await clock.advance(1499);
    expect(calls).toBe(1);
    await clock.advance(1);
    expect(await size).toBe(3);
  });

  it("the timeout of a call runs on the clock", async () => {
    const clock = fakeClock();
    const { transport } = scripted(["hang"]);
    const api = new ApiStorage(new Client(transport), { collection: "x", retry: false, timeout: seconds(2), clock });
    const size = api.size();
    const failed = expect(size).rejects.toThrow("collections.x.size timed out after 2000 ms");
    await clock.advance(1999);
    expect(clock.pending).toBe(1);
    await clock.advance(1);
    await failed;
    expect(clock.pending).toBe(0);
  });

  it("an abort during a wait stops the wait and its timer", async () => {
    const clock = fakeClock();
    const controller = new AbortController();
    const { transport, sends } = scripted([{ error: "UNAVAILABLE", retryable: true }]);
    const api = new ApiStorage(new Client(transport), { collection: "x", retryDelay: ms(100), retryJitter: 0, timeout: ms(0), signal: controller.signal, clock });
    const size = api.size();
    const failed = expect(size).rejects.toThrow("UNAVAILABLE");
    await clock.advance(10);
    expect(clock.pending).toBe(1);
    controller.abort();
    await failed;
    expect(clock.pending).toBe(0);
    expect(sends()).toBe(1);
  });

  it("refuses a jitter or a factor that the backoff cannot use", () => {
    const client = {} as Client;
    expect(() => new ApiStorage(client, { collection: "x", retryJitter: -0.1 })).toThrow(RangeError);
    expect(() => new ApiStorage(client, { collection: "x", retryFactor: 0.5 })).toThrow(RangeError);
  });
});

describe("SyncedProcedureRegistry on the clock (CLI-13)", () => {
  function procedure(path: string[]) {
    return defineProcedure({
      path,
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<string>(),
      metadata: { description: path.join(".") },
      handler: async () => "x",
    });
  }

  it("the auto-sync runs on the clock, and its failure goes to the status", async () => {
    const clock = fakeClock();
    const storage = new InMemoryStorage<SerializedProcedure>();
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), storage, { writeStrategy: "write-back", syncInterval: ms(100), clock });
    const statuses: SyncStatus[] = [];
    synced.onStatus((status) => statuses.push(status));
    synced.register(procedure(["t", "a"]));
    expect(await storage.size()).toBe(0);
    await clock.advance(100);
    await vi.waitFor(async () => expect(await storage.size()).toBe(1));

    const getAll = storage.getAll.bind(storage);
    storage.getAll = () => Promise.reject(new Error("the storage is down"));
    await clock.advance(100);
    await vi.waitFor(() => expect(synced.getStatus().error).toMatchObject({ operation: "sync" }));
    expect(statuses.at(-1)?.error?.operation).toBe("sync");
    storage.getAll = getAll;
    await clock.advance(100);
    await vi.waitFor(() => expect(synced.getStatus().error).toBeUndefined());
    await synced.close();
    expect(clock.pending).toBe(0);
  });

  it("a write-through write that fails goes to the status", async () => {
    const storage = new InMemoryStorage<SerializedProcedure>();
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), storage, { writeStrategy: "write-through" });
    const setBatch = storage.setBatch.bind(storage);
    storage.setBatch = () => Promise.reject(new Error("the disk is full"));
    synced.register(procedure(["w", "a"]));
    await synced.flushWrites();
    const error = synced.getStatus().error;
    expect(error?.operation).toBe("push");
    expect((error?.error as Error).message).toBe("Failed to persist procedure w.a");
    storage.setBatch = setBatch;
    synced.register(procedure(["w", "b"]));
    await synced.flushWrites();
    expect(synced.getStatus().error).toBeUndefined();
    await synced.close();
  });
});

describe("the timers of the storage layer (CLI-13)", () => {
  it("no file of src/storage starts a timer of the platform: each timer runs on a clock", () => {
    const folder = fileURLToPath(new URL(".", import.meta.url));
    const sources = readdirSync(folder).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThan(5);
    for (const name of sources) {
      const text = readFileSync(join(folder, name), "utf8");
      expect(text, name).not.toMatch(/\b(?:setTimeout|setInterval|clearTimeout|clearInterval|setImmediate)\s*\(/);
      expect(text, name).not.toMatch(/\bconsole\.(?:error|warn|log)\s*\(/);
    }
  });
});
