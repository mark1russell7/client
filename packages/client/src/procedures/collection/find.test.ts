/**
 * The collection procedures `find` and `patch` (roadmap CLI-14). `find` runs a JSON selector with
 * an order, a skip and a limit: in the storage with `query()`, or here for a storage without it.
 * `patch` merges fields into one item: in the storage with `patch()`, or with a read and a write.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures } from "./procedures.js";
import type { CollectionStorage, StoragePatch, StorageQueryOptions, StorageSelector } from "./storage.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import type { RepositoryProvider } from "../types.js";

/** A storage of a Map, with the optional methods that the test gives. */
function mapStorage(entries: Array<[string, unknown]> = []): CollectionStorage<unknown> & { data: Map<string, unknown>; calls: string[] } {
  const data = new Map<string, unknown>(entries);
  const calls: string[] = [];
  return {
    data,
    calls,
    get: async (id) => {
      calls.push(`get ${id}`);
      return structuredClone(data.get(id));
    },
    getAll: async () => [...data.values()],
    getEntries: async () => {
      calls.push("getEntries");
      return structuredClone([...data.entries()]);
    },
    find: async (predicate) => [...data.values()].filter(predicate),
    has: async (id) => data.has(id),
    size: async () => data.size,
    set: async (id, value) => {
      // A pause between the read and the write of a patch lets another patch start
      await new Promise((resolve) => setImmediate(resolve));
      calls.push(`set ${id}`);
      data.set(id, structuredClone(value));
    },
    delete: async (id) => data.delete(id),
    clear: async () => data.clear(),
    setBatch: async (items) => items.forEach(([id, value]) => data.set(id, value)),
    deleteBatch: async (ids) => ids.filter((id) => data.delete(id)).length,
    getBatch: async (ids) => new Map(ids.filter((id) => data.has(id)).map((id) => [id, data.get(id)])),
    close: async () => undefined,
  };
}

function procedureOf(operation: string) {
  return createCollectionProcedures("things").find((procedure) => procedure.path[2] === operation)!;
}

async function run(operation: string, storage: CollectionStorage<unknown>, input: unknown): Promise<unknown> {
  const procedure = procedureOf(operation);
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  return outputValue(await invokeProcedure(procedure, input, { repository }), procedure.path);
}

const things: Array<[string, unknown]> = [
  ["a", { n: 3, tags: ["x"], owner: { team: "core" } }],
  ["b", { n: 1, tags: ["y"] }],
  ["c", { n: 2, tags: ["x", "y"], owner: { team: "web" } }],
  ["d", { n: "4" }],
];

describe("collections.<name>.find (roadmap CLI-14)", () => {
  it("gives the matching items with their ids, in the order of the entries, for a storage without query()", async () => {
    const storage = mapStorage(things);
    expect(await run("find", storage, { selector: { tags: "x" } })).toEqual([
      { id: "a", value: { n: 3, tags: ["x"], owner: { team: "core" } } },
      { id: "c", value: { n: 2, tags: ["x", "y"], owner: { team: "web" } } },
    ]);
    expect(await run("find", storage, { selector: { "owner.team": "web" } })).toEqual([{ id: "c", value: things[2]![1] }]);
    expect(await run("find", storage, {})).toHaveLength(4);
    expect(storage.calls).toEqual(["getEntries", "getEntries", "getEntries"]);
  });

  it("sorts, skips and limits for a storage without query()", async () => {
    const storage = mapStorage(things);
    const ids = async (input: unknown): Promise<string[]> => ((await run("find", storage, input)) as Array<{ id: string }>).map((entry) => entry.id);
    expect(await ids({ sort: { n: 1 } })).toEqual(["b", "c", "a", "d"]);
    expect(await ids({ sort: { n: -1 }, skip: 1, limit: 2 })).toEqual(["a", "c"]);
    expect(await ids({ selector: { n: { $lt: 3 } }, sort: { n: -1 } })).toEqual(["c", "b"]);
    expect(await ids({ selector: { $or: [{ n: "4" }, { tags: { $size: 2 } }] } })).toEqual(["c", "d"]);
  });

  it("gives the selector and the options to query() of the storage", async () => {
    const storage = mapStorage(things);
    const queries: Array<[StorageSelector, StorageQueryOptions | undefined]> = [];
    storage.query = async (selector, options) => {
      queries.push([selector, options]);
      return [["z", { n: 9 }]];
    };
    expect(await run("find", storage, { selector: { n: { $gt: 1 } }, sort: { n: 1 }, limit: 5 })).toEqual([{ id: "z", value: { n: 9 } }]);
    expect(await run("find", storage, {})).toEqual([{ id: "z", value: { n: 9 } }]);
    expect(queries).toEqual([
      [{ n: { $gt: 1 } }, { sort: { n: 1 }, limit: 5 }],
      [{}, {}],
    ]);
    expect(storage.calls).toEqual([]);
  });

  it("refuses a selector, options or fields that are not correct", async () => {
    const storage = mapStorage(things);
    await expect(run("find", storage, "all")).rejects.toThrow("Input must be an object");
    await expect(run("find", storage, { selector: { n: { $where: "1" } } })).rejects.toThrow("the operator $where is not known");
    await expect(run("find", storage, { selector: { $or: [] } })).rejects.toThrow("takes a list of one or more selectors");
    await expect(run("find", storage, { limit: 0 })).rejects.toThrow("limit must be a whole number, 1 or more");
    await expect(run("find", storage, { skip: -2 })).rejects.toThrow("skip must be a whole number, 0 or more");
    await expect(run("find", storage, { sort: { n: "up" } })).rejects.toThrow("sort.n must be 1 or -1");
    await expect(run("find", storage, { sort: { "a..b": 1 } })).rejects.toThrow("empty part");
    await expect(run("find", storage, { fields: { n: 1 } })).rejects.toThrow("fields is not a field of the input");
    expect(storage.calls).toEqual([]);
  });

  it("fails for a storage without query() and without ids", async () => {
    const storage = mapStorage(things);
    delete (storage as { getEntries?: unknown }).getEntries;
    await expect(run("find", storage, {})).rejects.toThrow("cannot run a selector or give the ids");
  });

  it("only reads: its effects write nothing", () => {
    expect(procedureOf("find").metadata.effects).toEqual({ reads: ["collection:things"], writes: [] });
  });
});

describe("collections.<name>.patch (roadmap CLI-14)", () => {
  it("merges the fields with a read and a write for a storage without patch(), and null removes a field", async () => {
    const storage = mapStorage([["a", { n: 1, tags: ["x"], meta: { kind: "k", score: 2 } }]]);
    expect(await run("patch", storage, { id: "a", fields: { n: 2, tags: null, meta: { score: 3 } } })).toEqual({
      found: true,
      value: { n: 2, meta: { kind: "k", score: 3 } },
    });
    expect(storage.data.get("a")).toEqual({ n: 2, meta: { kind: "k", score: 3 } });
    expect(storage.calls).toEqual(["get a", "set a"]);
  });

  it("gives found: false for a missing id, and writes nothing", async () => {
    const storage = mapStorage();
    expect(await run("patch", storage, { id: "missing", fields: { n: 1 } })).toEqual({ found: false });
    expect(storage.data.has("missing")).toBe(false);
    expect(storage.calls).toEqual(["get missing"]);
  });

  it("runs the patches of one id one at a time, so each field stays", async () => {
    const storage = mapStorage([["a", {}], ["b", {}]]);
    await Promise.all([
      ...Array.from({ length: 6 }, (_, n) => run("patch", storage, { id: "a", fields: { [`f${n}`]: n } })),
      run("patch", storage, { id: "b", fields: { g: 1 } }),
    ]);
    expect(storage.data.get("a")).toEqual({ f0: 0, f1: 1, f2: 2, f3: 3, f4: 4, f5: 5 });
    expect(storage.data.get("b")).toEqual({ g: 1 });
  });

  it("a failed patch does not stop the next patch of the id", async () => {
    const storage = mapStorage([["a", { n: 1 }]]);
    const set = storage.set;
    let fail = true;
    storage.set = async (id, value) => {
      if (fail) {
        fail = false;
        throw new Error("the disk is full");
      }
      return set(id, value);
    };
    const results = await Promise.allSettled([
      run("patch", storage, { id: "a", fields: { n: 2 } }),
      run("patch", storage, { id: "a", fields: { m: 3 } }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    expect(storage.data.get("a")).toEqual({ n: 1, m: 3 });
  });

  it("gives the patch to patch() of the storage", async () => {
    const storage = mapStorage([["a", { n: 1 }]]);
    const patches: Array<[string, StoragePatch]> = [];
    storage.patch = async (id, fields) => {
      patches.push([id, fields]);
      return id === "a" ? { n: 5 } : undefined;
    };
    expect(await run("patch", storage, { id: "a", fields: { n: 5 } })).toEqual({ found: true, value: { n: 5 } });
    expect(await run("patch", storage, { id: "b", fields: { n: 5 } })).toEqual({ found: false });
    expect(patches).toEqual([["a", { n: 5 }], ["b", { n: 5 }]]);
    expect(storage.calls).toEqual([]);
  });

  it("refuses an id or fields that are not correct", async () => {
    const storage = mapStorage([["a", { n: 1 }]]);
    await expect(run("patch", storage, [])).rejects.toThrow("Input must be an object");
    await expect(run("patch", storage, { id: "", fields: {} })).rejects.toThrow("id must be a non-empty string");
    await expect(run("patch", storage, { id: "a", fields: [1] })).rejects.toThrow("the fields of a patch must be an object");
    await expect(run("patch", storage, { id: "a" })).rejects.toThrow("the fields of a patch must be an object");
    expect(storage.calls).toEqual([]);
  });

  it("reads and writes the collection, and a second patch with the same fields gives the same item", () => {
    expect(procedureOf("patch").metadata.effects).toEqual({ reads: ["collection:things"], writes: ["collection:things"], idempotent: true });
  });
});
