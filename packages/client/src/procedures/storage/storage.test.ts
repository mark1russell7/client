/**
 * The storage layer against the core collection procedures, through a real LocalTransport
 * (deep dive CORE-9 / DATA-9), and the synced registry (CORE-8 / DATA-8).
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorage, type CollectionStorage } from "@mark1russell7/client-collections";
import { Client } from "../../client/client.js";
import { LocalTransport } from "../../adapters/local/client/transport.js";
import type { Message, ResponseItem, Transport } from "../../client/types.js";
import { createCollectionProcedures } from "../collection/procedures.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import { ProcedureRegistry } from "../registry.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "../core/schemas.js";
import type { AnyProcedure, RepositoryProvider } from "../types.js";
import { ApiStorage } from "./api.js";
import { HybridStorage } from "./hybrid.js";
import { SyncedProcedureRegistry } from "./synced-registry.js";
import { getSerializedKey } from "./serialization.js";
import type { HandlerLoader, SerializedProcedure } from "./types.js";

/** A server side: the core collection procedures of one collection, with in-memory storage. */
function collectionServer<T>(collection: string): {
  transport: LocalTransport;
  storage: InMemoryStorage<T>;
  calls: string[];
} {
  const storage = new InMemoryStorage<T>();
  const repository: RepositoryProvider = {
    getStorage: <U>() => storage as unknown as CollectionStorage<U>,
    hasCollection: () => true,
  } as unknown as RepositoryProvider;
  const calls: string[] = [];
  const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {};
  for (const procedure of createCollectionProcedures(collection)) {
    handlers[procedure.path.join(".")] = async (payload) => {
      calls.push(procedure.path[2]!);
      return outputValue(await invokeProcedure(procedure, payload, { repository }), procedure.path);
    };
  }
  return { transport: new LocalTransport({ handlers }), storage, calls };
}

describe("ApiStorage against the core collection procedures (deep dive CORE-9, DATA-9)", () => {
  it("reads and writes through collections.<name>.<op>, with raw values", async () => {
    const server = collectionServer<{ n: number }>("things");
    const api = new ApiStorage<{ n: number }>(new Client(server.transport), { collection: "things" });

    await api.set("a", { n: 1 });
    await api.setBatch([
      ["b", { n: 2 }],
      ["c", { n: 3 }],
    ]);
    expect(await api.get("a")).toEqual({ n: 1 });
    expect(await api.get("missing")).toBeUndefined();
    expect(await api.has("b")).toBe(true);
    expect(await api.size()).toBe(3);
    expect((await api.getAll()).map((v) => v.n).sort()).toEqual([1, 2, 3]);
    expect((await api.find((v) => v.n > 1)).length).toBe(2);
    expect([...(await api.getBatch(["a", "c"])).entries()]).toEqual([
      ["a", { n: 1 }],
      ["c", { n: 3 }],
    ]);
    expect(await api.delete("a")).toBe(true);
    expect(await api.deleteBatch(["b", "zzz"])).toBe(1);
    await api.clear();
    expect(await api.size()).toBe(0);
  });

  it("close() leaves the caller's client open, unless closeClient is set", async () => {
    let closed = 0;
    const transport = { name: "t", send: async function* () {}, close: async () => void closed++ } as unknown as Transport;
    await new ApiStorage(new Client(transport), { collection: "x" }).close();
    expect(closed).toBe(0);
    await new ApiStorage(new Client(transport), { collection: "x", closeClient: true }).close();
    expect(closed).toBe(1);
  });

  it("a call that takes longer than the timeout fails", async () => {
    const hanging = new LocalTransport({ handlers: { "collections.x.get": () => new Promise(() => {}) } });
    const api = new ApiStorage(new Client(hanging), { collection: "x", timeout: 20, retry: false });
    await expect(api.get("a")).rejects.toThrow(/timed out/i);
  });

  it("retries a retryable error, and does not retry another error", async () => {
    let sends = 0;
    let retryable = true;
    const flaky: Transport = {
      name: "flaky",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        sends++;
        if (sends === 1) {
          yield {
            id: message.id,
            status: { type: "error", code: "UNAVAILABLE", message: "down", retryable },
            payload: null as TRes,
            metadata: {},
          } as ResponseItem<TRes>;
          return;
        }
        yield { id: message.id, status: { type: "success", code: 200 }, payload: 7 as TRes, metadata: {} } as ResponseItem<TRes>;
      },
      close: async () => {},
    } as Transport;
    const api = new ApiStorage(new Client(flaky), { collection: "x", retry: 3, retryDelay: 0 });
    expect(await api.size()).toBe(7);
    expect(sends).toBe(2);

    sends = 0;
    retryable = false;
    await expect(api.size()).rejects.toThrow("down");
    expect(sends).toBe(1);
  });
});

describe("HybridStorage (deep dive CORE-9, DATA-9)", () => {
  const record = (path: string[], description: string): SerializedProcedure => ({
    path,
    metadata: { description },
    storedAt: Date.now(),
  });

  it("indexes the remote items by keyOf (procedure records have no id)", async () => {
    const server = collectionServer<SerializedProcedure>("procedures");
    await server.storage.set("a.b", record(["a", "b"], "one"));
    const remote = new ApiStorage<SerializedProcedure>(new Client(server.transport), { collection: "procedures" });
    const hybrid = new HybridStorage(remote, { syncOnInit: false, keyOf: getSerializedKey });

    await hybrid.syncFromRemote();
    expect((await hybrid.get("a.b"))?.metadata.description).toBe("one");
    await hybrid.close();
  });

  it("a local miss reads the remote item", async () => {
    const server = collectionServer<{ id: string; v: number }>("items");
    await server.storage.set("k", { id: "k", v: 1 });
    const remote = new ApiStorage<{ id: string; v: number }>(new Client(server.transport), { collection: "items" });
    const hybrid = new HybridStorage(remote, { syncOnInit: false });

    expect(await hybrid.get("k")).toEqual({ id: "k", v: 1 });
    await hybrid.close();
  });

  it("a failed sync keeps only the operations that did not reach the remote", async () => {
    const server = collectionServer<{ id: string }>("items");
    const remote = new ApiStorage<{ id: string }>(new Client(server.transport), { collection: "items", retry: false });
    const hybrid = new HybridStorage(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: 0 });
    await hybrid.set("1", { id: "1" });
    await hybrid.set("2", { id: "2" });
    await hybrid.set("3", { id: "3" });

    // The second remote write fails once
    const original = remote.set.bind(remote);
    let writes = 0;
    remote.set = async (id: string, value: { id: string }) => {
      writes++;
      if (writes === 2) throw new Error("remote down");
      return original(id, value);
    };
    await expect(hybrid.syncToRemote()).rejects.toThrow("remote down");
    expect(hybrid.getPendingOpsCount()).toBe(2);

    await hybrid.syncToRemote();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect((await server.storage.getAll()).map((v) => v.id).sort()).toEqual(["1", "2", "3"]);
    await hybrid.close();
  });

  it("a sync removes the local items that the remote deleted", async () => {
    const server = collectionServer<{ id: string }>("items");
    await server.storage.set("a", { id: "a" });
    await server.storage.set("b", { id: "b" });
    const remote = new ApiStorage<{ id: string }>(new Client(server.transport), { collection: "items" });
    const hybrid = new HybridStorage(remote, { syncOnInit: false });
    await hybrid.syncFromRemote();
    await server.storage.delete("a");

    await hybrid.syncFromRemote();
    expect(await hybrid.has("a")).toBe(false);
    expect(await hybrid.has("b")).toBe(true);
    await hybrid.close();
  });

  it("a local write during a sync is not replaced by the older remote value", async () => {
    const server = collectionServer<{ id: string; v: number }>("items");
    await server.storage.set("k", { id: "k", v: 1 });
    const remote = new ApiStorage<{ id: string; v: number }>(new Client(server.transport), { collection: "items" });
    const hybrid = new HybridStorage(remote, { syncOnInit: false, conflictResolution: "remote" });

    const original = remote.getAll.bind(remote);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    remote.getAll = async () => {
      const all = await original();
      await gate;
      return all;
    };
    const syncing = hybrid.syncFromRemote();
    await new Promise((resolve) => setImmediate(resolve));
    await hybrid.set("k", { id: "k", v: 2 });
    release();
    await syncing;

    expect(await hybrid.get("k")).toEqual({ id: "k", v: 2 });
    await hybrid.close();
  });

  it("the sync timer does not keep the process alive", async () => {
    const server = collectionServer<{ id: string }>("items");
    const remote = new ApiStorage<{ id: string }>(new Client(server.transport), { collection: "items" });
    const hybrid = new HybridStorage(remote, { syncOnInit: false, writeStrategy: "write-back", syncInterval: 1000 });
    const timer = (hybrid as unknown as { syncTimer: { hasRef?: () => boolean } }).syncTimer;
    expect(timer.hasRef?.()).toBe(false);
    await hybrid.close();
  });
});

describe("SyncedProcedureRegistry (deep dive CORE-8, DATA-8)", () => {
  function procedure(path: string[], result: string): AnyProcedure {
    return defineProcedure({
      path,
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<string>(),
      metadata: { description: result },
      handler: async () => result,
    });
  }

  it("a pull with conflictResolution \"remote\" never replaces a handler with a stub", async () => {
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), new InMemoryStorage(), {
      writeStrategy: "write-through",
      conflictResolution: "remote",
    });
    synced.register(procedure(["s", "a"], "a"));
    await synced.flushWrites();

    await synced.syncFromStorage();
    await synced.syncToStorage();
    // A second process changed the record (no handler in storage)
    const storage = synced.getAdapter().getStorage();
    const stored = (await storage.get("s.a"))!;
    await storage.set("s.a", { ...stored, metadata: { description: "remote" }, storedAt: Date.now() + 1000 });
    await synced.syncFromStorage();

    const current = synced.get(["s", "a"])!;
    expect(current.handler).toBeTypeOf("function");
    expect(current.metadata.description).toBe("remote");
    await synced.close();
  });

  it("register() with a pathPrefix stores the prefixed path", async () => {
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), new InMemoryStorage(), {
      writeStrategy: "write-back",
    });
    synced.register(procedure(["a"], "x"), { pathPrefix: ["pre"] });
    await synced.flushPending();
    expect(await synced.getAdapter().listPaths()).toEqual([["pre", "a"]]);
    await synced.close();
  });

  it("a write-back unregister() deletes the record on the next flush", async () => {
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), new InMemoryStorage(), {
      writeStrategy: "write-back",
    });
    synced.register(procedure(["w", "a"], "a"));
    await synced.flushPending();
    synced.unregister(["w", "a"]);
    expect(synced.getStatus().pendingChanges).toBe(1);
    await synced.flushPending();
    expect(await synced.getAdapter().has(["w", "a"])).toBe(false);
    await synced.close();
  });

  it("compares timestamps: no conflict when only one side changed", async () => {
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), new InMemoryStorage(), {
      writeStrategy: "write-through",
      conflictResolution: "error",
    });
    synced.register(procedure(["t", "a"], "local"));
    await synced.flushWrites();

    // Nothing changed: no conflict
    await expect(synced.syncFromStorage()).resolves.toMatchObject({ conflicts: [] });

    // Only the remote changed: it applies, with no conflict
    const storage = synced.getAdapter().getStorage();
    const stored = (await storage.get("t.a"))!;
    await storage.set("t.a", { ...stored, metadata: { description: "remote" }, storedAt: Date.now() + 1000 });
    await expect(synced.syncFromStorage()).resolves.toMatchObject({ conflicts: [] });
    expect(synced.get(["t", "a"])!.metadata.description).toBe("remote");

    // Both changed: a conflict ("error" throws)
    await new Promise((resolve) => setTimeout(resolve, 2));
    synced.register(procedure(["t", "a"], "local again"), { override: true, persist: false });
    await storage.set("t.a", { ...stored, metadata: { description: "remote again" }, storedAt: Date.now() + 5000 });
    await expect(synced.syncFromStorage()).rejects.toThrow(/conflict/i);
    await synced.close();
  });

  it("keeps the handlerRef of a registration through a push and a pull", async () => {
    const loader: HandlerLoader = { load: async () => async () => "loaded" };
    const synced = new SyncedProcedureRegistry(new ProcedureRegistry(), new InMemoryStorage(), {
      writeStrategy: "write-back",
      handlerLoader: loader,
    });
    synced.register(procedure(["h", "a"], "a"), { handlerRef: { module: "@scope/pkg", export: "handler" } });
    await synced.syncToStorage();
    const raw = await synced.getAdapter().getRaw(["h", "a"]);
    expect(raw?.handlerRef).toEqual({ module: "@scope/pkg", export: "handler" });

    // A second registry pulls the record and loads the handler
    const other = new SyncedProcedureRegistry(new ProcedureRegistry(), synced.getAdapter().getStorage(), {
      handlerLoader: loader,
    });
    await other.syncFromStorage();
    const pulled = other.get(["h", "a"])!;
    expect(await pulled.handler!({}, {} as never)).toBe("loaded");
  });
});
