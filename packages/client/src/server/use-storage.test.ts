/**
 * `ProcedureServer.useStorage` with options (roadmap R28): it flushes the old storage before the
 * change, and closes it when asked. Without options, it changes the storage at once, as before.
 */

import { describe, it, expect } from "vitest";
import { ProcedureServer } from "./procedure-server.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";
import { ms } from "../duration.js";

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
