/**
 * The collection procedure `get`: the input `found: true` asks for `{ found, value }`, so a stored
 * `null` and a missing id give different outputs. Without it, the output is the item, as before.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures } from "./procedures.js";
import type { CollectionStorage } from "./storage.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import type { RepositoryProvider } from "../types.js";

/** A storage of a Map, with only the methods that `get` uses. */
function mapStorage(data: Map<string, unknown>): CollectionStorage<unknown> {
  return { get: async (id: string) => data.get(id) } as unknown as CollectionStorage<unknown>;
}

async function get(data: Map<string, unknown>, input: unknown): Promise<unknown> {
  const procedure = createCollectionProcedures("things").find((p) => p.path[2] === "get")!;
  const repository = { getStorage: () => mapStorage(data), hasCollection: () => true } as unknown as RepositoryProvider;
  return outputValue(await invokeProcedure(procedure, input, { repository }), procedure.path);
}

describe("collections.<name>.get", () => {
  const data = new Map<string, unknown>([["item", { n: 1 }], ["none", null]]);

  it("gives the item without found, as before", async () => {
    expect(await get(data, { id: "item" })).toEqual({ n: 1 });
    expect(await get(data, { id: "none" })).toBeNull();
    expect(await get(data, { id: "missing" })).toBeUndefined();
    expect(await get(data, { id: "item", found: false })).toEqual({ n: 1 });
  });

  it("gives { found, value } with found: true: a stored null is found", async () => {
    expect(await get(data, { id: "item", found: true })).toEqual({ found: true, value: { n: 1 } });
    expect(await get(data, { id: "none", found: true })).toEqual({ found: true, value: null });
    expect(await get(data, { id: "missing", found: true })).toEqual({ found: false });
  });

  it("refuses a found that is not a boolean", async () => {
    await expect(get(data, { id: "item", found: "yes" })).rejects.toThrow(/found must be a boolean/);
  });
});
