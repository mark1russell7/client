import { describe, expect, it } from "vitest";
import { applyPatch } from "@procedures/client/query";
import { InMemoryStorage, UndoLog, type CollectionStorage, type StoragePatch, type UndoEntry } from "../index.js";

const NOTE = { id: "n1", title: "a", tags: ["x", "y"], meta: { kind: "k", size: 1 } };

/** A log over one collection, and one note in it. */
async function setup(keepAfter?: boolean) {
  const notes = new InMemoryStorage<unknown>();
  await notes.set("n1", NOTE);
  const storages: Record<string, CollectionStorage<unknown>> = { notes };
  const log = new UndoLog(new InMemoryStorage<UndoEntry>(), (name) => storages[name], keepAfter === undefined ? {} : { keepAfter });
  /** A patch of the note, recorded in the log. */
  const change = async (patch: StoragePatch) => {
    const before = await notes.get("n1");
    await notes.patch!("n1", patch);
    return log.record({ collection: "notes", id: "n1", before, patch });
  };
  return { notes, log, change };
}

describe("UndoLog: the option keepAfter", () => {
  it("the default and false keep no values after the change", async () => {
    for (const option of [undefined, false]) {
      const { change } = await setup(option);
      expect(await change({ $set: { title: "b" } })).not.toHaveProperty("afterValues");
    }
  });

  // Each row: the patch, the values at its paths after it, and the inverse over those values
  const rows: readonly (readonly [string, StoragePatch, unknown, unknown])[] = [
    ["a field", { $set: { title: "b" } }, { title: "b" }, { title: "a" }],
    ["a nested field", { $set: { "meta.kind": "z" } }, { meta: { kind: "z" } }, { meta: { kind: "k" } }],
    ["a new nested field", { $set: { "fresh.deep": 1 } }, { fresh: { deep: 1 } }, {}],
    ["a removed field", { $remove: ["title"] }, {}, { title: "a" }],
    ["an unset nested field, with its parent", { $unset: ["meta.size"] }, { meta: {} }, { meta: { size: 1 } }],
    ["a removed element: the whole array", { $remove: ["tags.0"] }, { tags: ["y"] }, { tags: ["x", "y"] }],
    ["a set element: the whole array", { $set: { "tags.1": "z" } }, { tags: ["x", "z"] }, { tags: ["x", "y"] }],
    ["an inserted element: the whole array", { $insert: { "tags.0": "n" } }, { tags: ["n", "x", "y"] }, { tags: ["x", "y"] }],
    ["a merge patch", { title: "b", note: null }, { title: "b" }, { title: "a" }],
  ];
  for (const [name, patch, values, theirs] of rows) {
    it(`keeps only the touched values: ${name}`, async () => {
      const { change } = await setup(true);
      const entry = await change(patch);
      expect(entry.afterValues).toEqual(values);
      expect(applyPatch(entry.afterValues, entry.inverse!)).toEqual(theirs);
    });
  }

  it("keeps a parent that has no touched value left, so that a later removal of the parent shows", async () => {
    const { change } = await setup(true);
    const entry = await change({ $remove: ["meta.kind", "meta.size"] });
    expect(entry.afterValues).toEqual({ meta: {} });
  });

  it("keeps a key __proto__ as data", async () => {
    const { change } = await setup(true);
    const entry = await change(JSON.parse('{"$set":{"meta.__proto__":1}}') as StoragePatch);
    const meta = (entry.afterValues as { meta: object }).meta;
    expect(Object.getPrototypeOf(meta)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(meta, "__proto__")?.value).toBe(1);
  });

  it("keeps the whole item for an entry with no inverse, and null for a removed item", async () => {
    const { log } = await setup(true);
    const added = await log.record({ collection: "notes", id: "n2", before: undefined, after: { id: "n2", title: "a" } });
    expect(added.afterValues).toEqual({ id: "n2", title: "a" });
    expect(added.item).toBeNull();
    const removed = await log.record({ collection: "notes", id: "n2", before: { id: "n2", title: "a" }, after: undefined });
    expect(removed.afterValues).toBeNull();
    expect(removed.item).toEqual({ id: "n2", title: "a" });
  });

  it("an undo reads the fingerprint as before, with the option", async () => {
    const { notes, log, change } = await setup(true);
    await change({ $set: { title: "b" } });
    await log.undo();
    expect(await notes.get("n1")).toEqual(NOTE);
  });
});
