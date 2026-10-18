import { describe, expect, it } from "vitest";
import { InMemoryStorage, UndoLog, type CollectionStorage, type StoragePatch, type UndoEntry } from "../index.js";

/** A log over two collections, with a clock that the test moves. */
function setup(options: { cap?: number } = {}) {
  let time = 1000;
  const notes = new InMemoryStorage<unknown>();
  const archive = new InMemoryStorage<unknown>();
  const storages: Record<string, CollectionStorage<unknown>> = { notes, archive };
  const entries = new InMemoryStorage<UndoEntry>();
  const log = new UndoLog(entries, (name) => storages[name], { ...options, now: () => time });
  /** A patch of a note through its storage, recorded in the log. */
  const change = async (id: string, patch: StoragePatch, group?: string) => {
    const before = await notes.get(id);
    await notes.patch(id, patch);
    time += 10;
    return log.record({ collection: "notes", id, before, patch, ...(group === undefined ? {} : { group }) });
  };
  return { notes, archive, entries, log, change, tick: () => (time += 10) };
}

describe("UndoLog", () => {
  it("undoes the newest change with its inverse patch, one change at a time", async () => {
    const { notes, log, change } = setup();
    await notes.set("n1", { id: "n1", title: "a", tags: ["x", "y", "z"] });
    const first = await change("n1", { $remove: ["tags.1"] });
    expect(first.inverse).toEqual({ $insert: { "tags.1": "y" } });
    await change("n1", { $set: { title: "b" } });
    expect(await notes.get("n1")).toEqual({ id: "n1", title: "b", tags: ["x", "z"] });

    expect((await log.undo()).map((e) => e.inverse)).toEqual([{ $set: { title: "a" } }]);
    expect(await notes.get("n1")).toEqual({ id: "n1", title: "a", tags: ["x", "z"] });
    await log.undo();
    expect(await notes.get("n1")).toEqual({ id: "n1", title: "a", tags: ["x", "y", "z"] });
    expect(await log.undo()).toEqual([]);
  });

  it("undoes a group together, the newest change first", async () => {
    const { notes, archive, log, change, tick } = setup();
    await notes.set("n1", { id: "n1", n: 1 });
    await change("n1", { $set: { n: 2 } });
    // A move of n1 to the archive: two changes of whole items, in one group
    const before = await notes.get("n1");
    await archive.set("n1", before);
    tick();
    await log.record({ collection: "archive", id: "n1", before: undefined, group: "move" });
    await notes.delete("n1");
    tick();
    await log.record({ collection: "notes", id: "n1", before, group: "move" });

    const undone = await log.undo();
    expect(undone.map((e) => [e.collection, e.item])).toEqual([["notes", { id: "n1", n: 2 }], ["archive", null]]);
    expect(await notes.get("n1")).toEqual({ id: "n1", n: 2 });
    expect(await archive.has("n1")).toBe(false);
    expect((await log.entries()).length).toBe(1);
  });

  it("keeps the whole item when no patch undoes the change", async () => {
    const { notes, log, change } = setup();
    await notes.set("n1", { id: "n1", tags: ["a", "b", "c"] });
    const entry = await change("n1", { $remove: ["tags.0", "tags.1"] });
    expect(entry.inverse).toBeUndefined();
    expect(entry.item).toEqual({ id: "n1", tags: ["a", "b", "c"] });
    await log.undo();
    expect(await notes.get("n1")).toEqual({ id: "n1", tags: ["a", "b", "c"] });
  });

  it("removes the oldest entries past the cap", async () => {
    const { notes, log, change } = setup({ cap: 3 });
    await notes.set("n1", { id: "n1", n: 0 });
    for (let n = 1; n <= 5; n++) await change("n1", { $set: { n } });
    const entries = await log.entries();
    expect(entries.map((e) => e.inverse)).toEqual([{ $set: { n: 4 } }, { $set: { n: 3 } }, { $set: { n: 2 } }]);
  });

  it("applies an inverse patch through get and set when the storage has no patch method", async () => {
    const plain = new InMemoryStorage<unknown>();
    const withoutPatch: CollectionStorage<unknown> = Object.assign(Object.create(plain) as CollectionStorage<unknown>, { patch: undefined });
    const log = new UndoLog(new InMemoryStorage<UndoEntry>(), () => withoutPatch);
    await plain.set("a", { id: "a", list: [1, 2] });
    await log.record({ collection: "c", id: "a", before: { id: "a", list: [1, 2] }, patch: { $insert: { "list.0": 0 } } });
    await plain.set("a", { id: "a", list: [0, 1, 2] });
    await log.undo();
    expect(await plain.get("a")).toEqual({ id: "a", list: [1, 2] });
  });

  it("keeps the entry when the log has no storage for its collection", async () => {
    const log = new UndoLog(new InMemoryStorage<UndoEntry>(), () => undefined);
    await log.record({ collection: "gone", id: "a", before: { n: 1 }, patch: { $set: { n: 2 } } });
    await expect(log.undo()).rejects.toThrow("The undo log has no storage for the collection gone");
    expect((await log.entries()).length).toBe(1);
  });
});
