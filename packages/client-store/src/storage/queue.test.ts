/**
 * The split of a queued batch into operations of one id each (roadmap CLI-108), and the removal of one id from a batch.
 */

import { describe, expect, it } from "vitest";
import { singlesOf, withoutId, type QueuedOperation } from "./queue.js";

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
