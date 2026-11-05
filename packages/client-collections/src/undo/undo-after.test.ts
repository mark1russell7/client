import { describe, expect, it } from "vitest";
import { applyPatch } from "@procedures/client/query";
import { InMemoryStorage, UndoLog, type CollectionStorage, type StoragePatch, type UndoEntry } from "../index.js";

/** A log over one collection. */
function setup(keepAfter?: boolean) {
  const notes = new InMemoryStorage<unknown>();
  const storages: Record<string, CollectionStorage<unknown>> = { notes };
  const log = new UndoLog(new InMemoryStorage<UndoEntry>(), (name) => storages[name], keepAfter === undefined ? {} : { keepAfter });
  /** A patch of a note through its storage, recorded in the log. */
  const change = async (id: string, patch: StoragePatch) => {
    const before = await notes.get(id);
    await notes.patch(id, patch);
    return { before, entry: await log.record({ collection: "notes", id, before, patch }) };
  };
  return { notes, log, change };
}

describe("UndoLog: the option keepAfter", () => {
  it("the default keeps no item after the change", async () => {
    const { notes, change } = setup();
    await notes.set("n1", { id: "n1", title: "a" });
    const { entry } = await change("n1", { $set: { title: "b" } });
    expect(entry).not.toHaveProperty("afterItem");
  });

  it("false keeps no item after the change", async () => {
    const { notes, change } = setup(false);
    await notes.set("n1", { id: "n1", title: "a" });
    const { entry } = await change("n1", { $set: { title: "b" } });
    expect(entry).not.toHaveProperty("afterItem");
  });

  it("true keeps the item after a patch", async () => {
    const { notes, change } = setup(true);
    await notes.set("n1", { id: "n1", title: "a", tags: ["x", "y"] });
    const { entry } = await change("n1", { $set: { title: "b" } });
    expect(entry.afterItem).toEqual({ id: "n1", title: "b", tags: ["x", "y"] });
  });

  it("the inverse over the item after gives the item before, for each form of a patch", async () => {
    const { notes, change } = setup(true);
    const patches: StoragePatch[] = [{ $set: { title: "b" } }, { $remove: ["tags.0"] }, { $set: { "extra.deep": 1 } }, { $remove: ["title"] }];
    await notes.set("n1", { id: "n1", title: "a", tags: ["x", "y"] });
    for (const patch of patches) {
      const { before, entry } = await change("n1", patch);
      expect(entry.inverse, JSON.stringify(patch)).toBeDefined();
      expect(applyPatch(entry.afterItem, entry.inverse!), JSON.stringify(patch)).toEqual(before);
    }
  });

  it("true keeps the whole item of a change with no patch, and null for a removed item", async () => {
    const { log } = setup(true);
    const added = await log.record({ collection: "notes", id: "n1", before: undefined, after: { id: "n1", title: "a" } });
    expect(added.afterItem).toEqual({ id: "n1", title: "a" });
    expect(added.item).toBeNull();
    const removed = await log.record({ collection: "notes", id: "n1", before: { id: "n1", title: "a" }, after: undefined });
    expect(removed.afterItem).toBeNull();
    expect(removed.item).toEqual({ id: "n1", title: "a" });
  });

  it("an undo reads the print as before, with the option", async () => {
    const { notes, log, change } = setup(true);
    await notes.set("n1", { id: "n1", title: "a" });
    await change("n1", { $set: { title: "b" } });
    await log.undo();
    expect(await notes.get("n1")).toEqual({ id: "n1", title: "a" });
  });
});
