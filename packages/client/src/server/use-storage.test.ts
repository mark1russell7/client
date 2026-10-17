/**
 * `ProcedureServer.useStorage` with options (roadmap R28): it flushes the old storage before the
 * change, and closes it when asked. Without options, it changes the storage at once, as before.
 */

import { describe, it, expect } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { ProcedureServer } from "./procedure-server.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";
import { ms, seconds, type Duration } from "../duration.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { pathToMethod } from "./method.js";
import type { ServerRequest, ServerResponse } from "./types.js";
import { TIMER_DEFAULTS } from "../timers.js";

/** A storage that records the calls of flush and close. */
function recordingStorage(events: string[], name: string, flush?: () => Promise<void>): CollectionStorage<unknown> {
  const storage: CollectionStorage<unknown> = {
    get: async () => undefined,
    getAll: async () => [],
    find: async () => [],
    has: async () => false,
    size: async () => 0,
    set: async () => undefined,
    delete: async () => false,
    clear: async () => undefined,
    setBatch: async () => undefined,
    deleteBatch: async () => 0,
    getBatch: async () => new Map(),
    close: async () => void events.push(`${name}.close`),
  };
  if (flush) storage.flush = flush;
  return storage;
}

describe("ProcedureServer.useStorage (roadmap R28)", () => {
  it("without options, changes the storage at once and returns the server", () => {
    const events: string[] = [];
    const old = recordingStorage(events, "old", async () => void events.push("old.flush"));
    const server = new ProcedureServer({ collections: { things: old } });
    const next = recordingStorage(events, "next");
    expect(server.useStorage("things", next)).toBe(server);
    expect(server.getStorage("things")).toBe(next);
    expect(events).toEqual([]);
  });

  it("drain: flushes the old storage, then changes the storage, then closes the old one", async () => {
    const events: string[] = [];
    const server = new ProcedureServer();
    const old = recordingStorage(events, "old", async () => {
      // A call during the flush still finds the old storage
      events.push(server.getStorage("things") === old ? "old.flush (old in use)" : "old.flush (new in use)");
    });
    server.useStorage("things", old);
    const next = recordingStorage(events, "next");
    expect(await server.useStorage("things", next, { drain: true, close: true })).toBe(server);
    expect(server.getStorage("things")).toBe(next);
    expect(events).toEqual(["old.flush (old in use)", "old.close"]);
  });

  it("keeps the old storage and throws when the flush fails", async () => {
    const events: string[] = [];
    const old = recordingStorage(events, "old", async () => {
      throw new Error("the remote is down");
    });
    const server = new ProcedureServer({ collections: { things: old } });
    await expect(server.useStorage("things", recordingStorage(events, "next"), { drain: true, close: true })).rejects.toThrow("the remote is down");
    expect(server.getStorage("things")).toBe(old);
    expect(events).toEqual([]);
  });

  it("drains a storage without flush(), and a new collection, without an error", async () => {
    const events: string[] = [];
    const server = new ProcedureServer({ collections: { things: recordingStorage(events, "old") } });
    await server.useStorage("things", recordingStorage(events, "next"), { drain: true });
    await server.useStorage("others", recordingStorage(events, "other"), { drain: true, close: true });
    expect(server.getCollectionNames().sort()).toEqual(["others", "things"]);
    expect(events).toEqual([]);
  });
});

describe("ProcedureServer.closeStorages and stop (the close() of the CollectionStorage contract)", () => {
  it("closes each storage one time, also a storage of two collections, and removes the closed storages", async () => {
    const events: string[] = [];
    const shared = recordingStorage(events, "shared");
    const server = new ProcedureServer({ collections: { a: shared, b: shared, c: recordingStorage(events, "c") } });
    await server.stop({ grace: ms(0) });
    expect(events.sort()).toEqual(["c.close", "shared.close"]);
    // A server that starts again does not use a closed storage
    expect(server.getCollectionNames()).toEqual([]);
    expect(() => server.getStorage("a")).toThrow("Collection storage not configured: a");
    await server.stop({ grace: ms(0) });
    expect(events).toHaveLength(2);
  });

  it("closes each storage when one close fails, and throws the error", async () => {
    const events: string[] = [];
    const failing = { ...recordingStorage(events, "failing"), close: async () => Promise.reject(new Error("the disk is full")) };
    const server = new ProcedureServer({ collections: { a: failing, b: recordingStorage(events, "b") } });
    await expect(server.closeStorages()).rejects.toThrow("the disk is full");
    expect(events).toEqual(["b.close"]);
    expect(server.getCollectionNames()).toEqual([]);
  });
});

/**
 * A storage whose `get` waits until `release()`. After `close()`, a `get` that ends rejects with
 * the error of a closed storage, as the contract of `CollectionStorage` says.
 */
function gatedStorage(events: string[], name: string, value: string) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let closed = false;
  const storage: CollectionStorage<unknown> = {
    ...recordingStorage(events, name),
    get: async () => {
      events.push(`${name}.get`);
      await gate;
      if (closed) throw new Error(`The storage ${name} is closed`);
      return value;
    },
    close: async () => {
      closed = true;
      events.push(`${name}.close`);
    },
  };
  return { storage, release: () => open() };
}

/** A server with the collection procedures of `things` over the old storage, and a fake clock. */
function serverOf(old: CollectionStorage<unknown>) {
  const clock = fakeClock();
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["things", "watch"],
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<unknown>(),
      handler: async function* (_input: unknown, ctx) {
        const storage = ctx.repository!.getStorage("things");
        yield await storage.get("a");
        yield await storage.get("b");
      },
    }),
  );
  const server = new ProcedureServer({ registry, clock, collections: { things: old } });
  server.registerCollectionProcedures("things");
  server.registerFromRegistry();
  let ids = 0;
  const call = (path: string[], payload: unknown): Promise<ServerResponse<unknown>> => {
    const method = pathToMethod(path);
    const handler = (server as unknown as { findHandler(m: unknown): (r: ServerRequest<unknown>) => Promise<ServerResponse<unknown>> }).findHandler(method);
    return handler({ id: String(++ids), method, payload, metadata: {} });
  };
  return { clock, server, get: (id: string) => call(["collections", "things", "get"], { id }), call };
}

/** One turn of the event loop: the handlers in flight reach their storage. It is not a sleep. */
const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("ProcedureServer.useStorage with close: the calls on the old storage end first", () => {
  it("waits for the calls that took the old storage, and sends each new call to the new storage", async () => {
    const events: string[] = [];
    const old = gatedStorage(events, "old", "old value");
    const { clock, server, get } = serverOf(old.storage);
    const first = get("a");
    const second = get("b");
    await turn();
    expect(events).toEqual(["old.get", "old.get"]);

    const next = { ...recordingStorage(events, "next"), get: async () => "new value" };
    const replacing = server.useStorage("things", next, { close: true, grace: seconds(5) });
    await turn();
    expect(server.getStorage("things")).toBe(next);
    expect((await get("c")).payload).toBe("new value");
    expect(events).toEqual(["old.get", "old.get"]);

    old.release();
    expect((await first).payload).toBe("old value");
    expect((await second).payload).toBe("old value");
    await replacing;
    expect(events).toEqual(["old.get", "old.get", "old.close"]);
    // The timer of the grace stopped: nothing waits on the clock
    expect(clock.pending).toBe(0);
  });

  it("closes the old storage when the grace ends: a call that still uses it fails as closed", async () => {
    const events: string[] = [];
    const old = gatedStorage(events, "old", "old value");
    const { clock, server, get } = serverOf(old.storage);
    const first = get("a");
    await turn();

    let replaced = false;
    const replacing = server.useStorage("things", recordingStorage(events, "next"), { close: true, grace: seconds(5) }).then(() => {
      replaced = true;
    });
    await clock.advance(4_999);
    await turn();
    expect(replaced).toBe(false);
    expect(events).toEqual(["old.get"]);

    await clock.advance(1);
    await replacing;
    expect(events).toEqual(["old.get", "old.close"]);
    old.release();
    const response = await first;
    expect(response.status.type).toBe("error");
    expect(JSON.stringify(response.status)).toContain("closed");
  });

  it("waits for 30 s by default (TIMER_DEFAULTS.server.storageGraceMs)", async () => {
    expect(TIMER_DEFAULTS.server.storageGraceMs).toBe(30_000);
    const events: string[] = [];
    const old = gatedStorage(events, "old", "old value");
    const { clock, server, get } = serverOf(old.storage);
    const first = get("a");
    await turn();
    const replacing = server.useStorage("things", recordingStorage(events, "next"), { close: true });
    await clock.advance(29_999);
    await turn();
    expect(events).toEqual(["old.get"]);
    await clock.advance(1);
    await replacing;
    expect(events).toEqual(["old.get", "old.close"]);
    old.release();
    await first;
  });

  it("with a grace of 0, closes the old storage at once", async () => {
    const events: string[] = [];
    const old = gatedStorage(events, "old", "old value");
    const { server, get } = serverOf(old.storage);
    const first = get("a");
    await turn();
    await server.useStorage("things", recordingStorage(events, "next"), { close: true, grace: ms(0) });
    expect(events).toEqual(["old.get", "old.close"]);
    old.release();
    expect((await first).status.type).toBe("error");
  });

  it("does not wait for a call that took no storage, and a stream holds its storage until its end", async () => {
    const events: string[] = [];
    const old = gatedStorage(events, "old", "old value");
    const { clock, server, call } = serverOf(old.storage);
    // A stream that has not read an item: its handler starts at the first read
    const watch = await call(["things", "watch"], {});
    const next = gatedStorage(events, "next", "new value");
    await server.useStorage("things", next.storage, { close: true, grace: seconds(5) });
    expect(events).toEqual(["old.close"]);
    expect(clock.pending).toBe(0);

    // The stream starts now, on the new storage. The next change waits for its end.
    const items = watch.stream![Symbol.asyncIterator]();
    const firstItem = items.next();
    await turn();
    let replaced = false;
    const replacing = server.useStorage("things", recordingStorage(events, "last"), { close: true, grace: seconds(5) }).then(() => {
      replaced = true;
    });
    await turn();
    expect(replaced).toBe(false);
    next.release();
    expect((await firstItem).value).toBe("new value");
    await turn();
    expect(replaced).toBe(false);
    expect((await items.next()).value).toBe("new value");
    expect((await items.next()).done).toBe(true);
    await replacing;
    expect(events).toEqual(["old.close", "next.get", "next.get", "next.close"]);
  });

  it("refuses a grace that is a plain number, and changes nothing", async () => {
    const events: string[] = [];
    const old = recordingStorage(events, "old");
    const server = new ProcedureServer({ registry: new ProcedureRegistry(), collections: { things: old } });
    await expect(
      server.useStorage("things", recordingStorage(events, "next"), { close: true, grace: 5 as unknown as Duration }),
    ).rejects.toThrow(TypeError);
    expect(server.getStorage("things")).toBe(old);
    expect(events).toEqual([]);
  });
});
