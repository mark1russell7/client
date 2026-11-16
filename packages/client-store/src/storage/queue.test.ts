/**
 * The split of a queued batch into operations of one id each (roadmap CLI-108), and the removal of one id from a batch.
 */

import { describe, expect, it } from "vitest";
import { chunksOf, singlesOf, withoutId, type QueuedOperation } from "./queue.js";

describe("singlesOf", () => {
  it("gives each item of a set batch its own set, with the base version of its id", () => {
    const op: QueuedOperation = { type: "setBatch", data: { items: [["a", 1], ["b", 2]] }, timestamp: 5, base: [["b", "v2"]] };
    expect(singlesOf(op)).toEqual([
      { type: "set", data: { id: "a", value: 1 }, timestamp: 5 },
      { type: "set", data: { id: "b", value: 2 }, timestamp: 5, base: [["b", "v2"]] },
    ]);
  });

  it("gives each id of a delete batch its own delete, and keeps a null base version", () => {
    const op: QueuedOperation = { type: "deleteBatch", data: { ids: ["a", "b"] }, timestamp: 7, base: [["a", null]] };
    expect(singlesOf(op)).toEqual([
      { type: "delete", data: { id: "a" }, timestamp: 7, base: [["a", null]] },
      { type: "delete", data: { id: "b" }, timestamp: 7 },
    ]);
  });

  it("gives a set, a delete and a clear as they are", () => {
    for (const op of [
      { type: "set", data: { id: "a", value: 1 }, timestamp: 1 },
      { type: "delete", data: { id: "a" }, timestamp: 1 },
      { type: "clear", data: {}, timestamp: 1 },
    ] satisfies QueuedOperation[]) expect(singlesOf(op)).toEqual([op]);
  });
});

describe("withoutId", () => {
  it("removes one id from a batch, and removes a batch that has no id left", () => {
    expect(withoutId({ type: "setBatch", data: { items: [["a", 1], ["b", 2]] }, timestamp: 1 }, "a")).toEqual({ type: "setBatch", data: { items: [["b", 2]] }, timestamp: 1 });
    expect(withoutId({ type: "deleteBatch", data: { ids: ["a"] }, timestamp: 1 }, "a")).toBeUndefined();
    expect(withoutId({ type: "set", data: { id: "b", value: 2 }, timestamp: 1 }, "a")).toEqual({ type: "set", data: { id: "b", value: 2 }, timestamp: 1 });
  });
});

describe("chunksOf", () => {
  it("cuts a batch at the cap of items, in its order, with the base version of each id", () => {
    const op: QueuedOperation = { type: "setBatch", data: { items: [["a", 1], ["b", 2], ["c", 3]] }, timestamp: 4, base: [["a", "1"], ["c", null]], baseValues: [["c", null]] };
    expect(chunksOf(op, 2, 1000)).toEqual([
      { type: "setBatch", data: { items: [["a", 1], ["b", 2]] }, timestamp: 4, base: [["a", "1"]] },
      { type: "setBatch", data: { items: [["c", 3]] }, timestamp: 4, base: [["c", null]], baseValues: [["c", null]] },
    ]);
  });

  it("cuts a batch at the cap of bytes, and puts an entry over the cap in a chunk alone", () => {
    // The JSON text of ["a",1] is 7 characters, and of the big entry 27
    const op: QueuedOperation = { type: "setBatch", data: { items: [["a", 1], ["b", 1], ["big", "x".repeat(17)], ["c", 1]] }, timestamp: 1 };
    expect(chunksOf(op, 100, 14).map((chunk) => (chunk.data as { items: Array<[string, unknown]> }).items.map(([id]) => id))).toEqual([["a", "b"], ["big"], ["c"]]);
  });

  it("cuts a delete batch, and gives a batch within the caps, a set and a clear as they are", () => {
    expect(chunksOf({ type: "deleteBatch", data: { ids: ["a", "b", "c"] }, timestamp: 1 }, 2, 1000)).toEqual([
      { type: "deleteBatch", data: { ids: ["a", "b"] }, timestamp: 1 },
      { type: "deleteBatch", data: { ids: ["c"] }, timestamp: 1 },
    ]);
    for (const op of [
      { type: "setBatch", data: { items: [["a", 1]] }, timestamp: 1 },
      { type: "set", data: { id: "a", value: 1 }, timestamp: 1 },
      { type: "clear", data: {}, timestamp: 1 },
    ] satisfies QueuedOperation[]) expect(chunksOf(op, 1, 1)).toEqual([op]);
  });
});
