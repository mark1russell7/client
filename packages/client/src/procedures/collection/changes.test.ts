/**
 * The collection procedure `changes` (roadmap R28): the items that changed after a version, for
 * a delta sync. A storage without a change log gives all its items.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures } from "./procedures.js";
import type { CollectionStorage, StorageChanges } from "./storage.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import type { RepositoryProvider } from "../types.js";

/** A storage of a Map. `changes` gives it a change log of one version per write. */
function mapStorage(withChanges: boolean, withEntries = true): CollectionStorage<number> {
  const data = new Map<string, number>();
  const log: Array<{ id: string; deleted: boolean }> = [];
  const storage: CollectionStorage<number> = {
    get: async (id) => data.get(id),
    getAll: async () => [...data.values()],
    find: async (predicate) => [...data.values()].filter(predicate),
    has: async (id) => data.has(id),
    size: async () => data.size,
    set: async (id, value) => {
      data.set(id, value);
      log.push({ id, deleted: false });
    },
    delete: async (id) => {
      log.push({ id, deleted: true });
      return data.delete(id);
    },
    clear: async () => data.clear(),
    setBatch: async (items) => items.forEach(([id, value]) => data.set(id, value)),
    deleteBatch: async (ids) => ids.filter((id) => data.delete(id)).length,
    getBatch: async (ids) => new Map(ids.filter((id) => data.has(id)).map((id) => [id, data.get(id)!])),
    close: async () => undefined,
  };
  if (withEntries) storage.getEntries = async () => [...data.entries()];
  if (withChanges) {
    storage.getChangesSince = async (since?: string): Promise<StorageChanges<number>> => {
      const version = String(log.length);
      if (since === undefined) return { version, full: true, changed: [...data.entries()], deleted: [] };
      const ids = new Set(log.slice(Number(since)).map((entry) => entry.id));
      return {
        version,
        full: false,
        changed: [...ids].filter((id) => data.has(id)).map((id) => [id, data.get(id)!]),
        deleted: [...ids].filter((id) => !data.has(id)),
      };
    };
  }
  return storage;
}

async function changes(storage: CollectionStorage<number>, since?: string): Promise<unknown> {
  const procedure = createCollectionProcedures("numbers").find((p) => p.path[2] === "changes")!;
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  return outputValue(await invokeProcedure(procedure, since === undefined ? {} : { since }, { repository }), procedure.path);
}

describe("collections.<name>.changes (roadmap R28)", () => {
  it("gives the changes since a version from getChangesSince of the storage", async () => {
    const storage = mapStorage(true);
    await storage.set("a", 1);
    await storage.set("b", 2);
    const first = (await changes(storage)) as { version: string };
    expect(first).toEqual({ version: "2", full: true, changed: [{ id: "a", value: 1 }, { id: "b", value: 2 }], deleted: [] });

    await storage.set("a", 10);
    await storage.delete("b");
    expect(await changes(storage, first.version)).toEqual({
      version: "4",
      full: false,
      changed: [{ id: "a", value: 10 }],
      deleted: ["b"],
    });
  });

  it("gives all entries and an empty version for a storage without a change log", async () => {
    const storage = mapStorage(false);
    await storage.set("a", 1);
    expect(await changes(storage, "7")).toEqual({ version: "", full: true, changed: [{ id: "a", value: 1 }], deleted: [] });
  });

  it("fails for a storage without a change log and without ids", async () => {
    await expect(changes(mapStorage(false, false))).rejects.toThrow("cannot give its changes");
  });

  it("refuses a version that is not a string", async () => {
    const procedure = createCollectionProcedures("numbers").find((p) => p.path[2] === "changes")!;
    const repository = { getStorage: () => mapStorage(true), hasCollection: () => true } as unknown as RepositoryProvider;
    await expect(invokeProcedure(procedure, { since: 3 }, { repository })).rejects.toThrow("since must be a string");
  });

  it("only reads: its effects write nothing", () => {
    const procedure = createCollectionProcedures("numbers").find((p) => p.path[2] === "changes")!;
    expect(procedure.metadata.effects).toEqual({ reads: ["collection:numbers"], writes: [] });
  });
});
