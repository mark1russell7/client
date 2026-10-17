/**
 * The collection procedure `ids`: the ids of the items without the values, for a full sync. A
 * storage without `getIds()` gives the ids of its entries.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures } from "./procedures.js";
import type { CollectionStorage } from "./storage.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import type { RepositoryProvider } from "../types.js";

/** A storage of a Map that counts its reads. Without `withIds` or `withEntries`, it lacks the method. */
function mapStorage(withIds: boolean, withEntries = true): { storage: CollectionStorage<number>; reads: string[] } {
  const data = new Map<string, number>([["b", 2], ["a", 1]]);
  const reads: string[] = [];
  const storage = { get: async (id: string) => data.get(id) } as unknown as CollectionStorage<number>;
  if (withIds) {
    storage.getIds = async () => {
      reads.push("getIds");
      return [...data.keys()];
    };
  }
  if (withEntries) {
    storage.getEntries = async () => {
      reads.push("getEntries");
      return [...data.entries()];
    };
  }
  return { storage, reads };
}

async function ids(storage: CollectionStorage<number>, input: unknown = {}): Promise<unknown> {
  const procedure = createCollectionProcedures("numbers").find((p) => p.path[2] === "ids")!;
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  return outputValue(await invokeProcedure(procedure, input, { repository }), procedure.path);
}

describe("collections.<name>.ids", () => {
  it("gives the ids from getIds() of the storage, in the order of the entries", async () => {
    const { storage, reads } = mapStorage(true);
    expect(await ids(storage)).toEqual(["b", "a"]);
    expect(reads).toEqual(["getIds"]);
  });

  it("gives the ids of the entries for a storage without getIds()", async () => {
    const { storage, reads } = mapStorage(false);
    expect(await ids(storage)).toEqual(["b", "a"]);
    expect(reads).toEqual(["getEntries"]);
  });

  it("fails for a storage without getIds() and without entries", async () => {
    await expect(ids(mapStorage(false, false).storage)).rejects.toThrow("cannot give the ids");
  });

  it("refuses an input that is not an object", async () => {
    await expect(ids(mapStorage(true).storage, "all")).rejects.toThrow("Input must be an object");
  });

  it("refuses an output that is not an array of ids", async () => {
    const storage = { getIds: async () => [1, 2] } as unknown as CollectionStorage<number>;
    await expect(ids(storage)).rejects.toThrow();
  });

  it("only reads: its effects write nothing", () => {
    const procedure = createCollectionProcedures("numbers").find((p) => p.path[2] === "ids")!;
    expect(procedure.metadata.effects).toEqual({ reads: ["collection:numbers"], writes: [] });
  });
});
