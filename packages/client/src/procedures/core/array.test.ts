/**
 * Unit tests for array procedures
 */

import { describe, it, expect } from "vitest";
import {
  firstProcedure,
  lastProcedure,
  nthProcedure,
  arrLengthProcedure,
  flattenProcedure,
  reverseProcedure,
  sortProcedure,
  sliceProcedure,
  arrConcatProcedure,
  uniqueProcedure,
  groupByProcedure,
  zipProcedure,
  unzipProcedure,
  indexOfProcedure,
  containsProcedure,
  pushProcedure,
  unshiftProcedure,
  rangeProcedure,
  filterProcedure,
  whereProcedure,
  pluckProcedure,
  arrPickProcedure,
  arrOmitProcedure,
  partitionProcedure,
  countProcedure,
} from "./array.js";

// =============================================================================
// Access Procedures
// =============================================================================

describe("firstProcedure", () => {
  it("returns first element", async () => {
    const result = await firstProcedure.handler!({ items: [1, 2, 3] }, {} as any);
    expect(result).toBe(1);
  });

  it("returns undefined for empty array", async () => {
    const result = await firstProcedure.handler!({ items: [] }, {} as any);
    expect(result).toBeUndefined();
  });
});

describe("lastProcedure", () => {
  it("returns last element", async () => {
    const result = await lastProcedure.handler!({ items: [1, 2, 3] }, {} as any);
    expect(result).toBe(3);
  });

  it("returns undefined for empty array", async () => {
    const result = await lastProcedure.handler!({ items: [] }, {} as any);
    expect(result).toBeUndefined();
  });
});

describe("nthProcedure", () => {
  it("returns element at positive index", async () => {
    const result = await nthProcedure.handler!({ items: [1, 2, 3], index: 1 }, {} as any);
    expect(result).toBe(2);
  });

  it("supports negative indexing", async () => {
    const result = await nthProcedure.handler!({ items: [1, 2, 3], index: -1 }, {} as any);
    expect(result).toBe(3);
  });

  it("returns undefined for out-of-bounds", async () => {
    const result = await nthProcedure.handler!({ items: [1, 2], index: 5 }, {} as any);
    expect(result).toBeUndefined();
  });
});

describe("arrLengthProcedure", () => {
  it("returns array length", async () => {
    const result = await arrLengthProcedure.handler!({ items: [1, 2, 3, 4, 5] }, {} as any);
    expect(result).toBe(5);
  });

  it("returns 0 for empty array", async () => {
    const result = await arrLengthProcedure.handler!({ items: [] }, {} as any);
    expect(result).toBe(0);
  });
});

// =============================================================================
// Transform Procedures
// =============================================================================

describe("flattenProcedure", () => {
  it("flattens nested arrays", async () => {
    const result = await flattenProcedure.handler!(
      { items: [[1, 2], [3, 4], [5]] },
      {} as any
    );
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("respects depth parameter", async () => {
    const result = await flattenProcedure.handler!(
      { items: [[[1]], [[2]], [[3]]], depth: 1 },
      {} as any
    );
    expect(result).toEqual([[1], [2], [3]]);
  });
});

describe("reverseProcedure", () => {
  it("reverses array", async () => {
    const result = await reverseProcedure.handler!({ items: [1, 2, 3] }, {} as any);
    expect(result).toEqual([3, 2, 1]);
  });

  it("does not mutate original", async () => {
    const original = [1, 2, 3];
    await reverseProcedure.handler!({ items: original }, {} as any);
    expect(original).toEqual([1, 2, 3]);
  });
});

describe("sortProcedure", () => {
  it("sorts numbers ascending", async () => {
    const result = await sortProcedure.handler!({ items: [3, 1, 2] }, {} as any);
    expect(result).toEqual([1, 2, 3]);
  });

  it("sorts strings alphabetically", async () => {
    const result = await sortProcedure.handler!({ items: ["c", "a", "b"] }, {} as any);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("sorts by key", async () => {
    const items = [{ name: "c" }, { name: "a" }, { name: "b" }];
    const result = await sortProcedure.handler!({ items, key: "name" }, {} as any);
    expect(result).toEqual([{ name: "a" }, { name: "b" }, { name: "c" }]);
  });

  it("sorts descending", async () => {
    const result = await sortProcedure.handler!({ items: [1, 2, 3], desc: true }, {} as any);
    expect(result).toEqual([3, 2, 1]);
  });
});

describe("sliceProcedure", () => {
  it("extracts portion of array", async () => {
    const result = await sliceProcedure.handler!({ items: [1, 2, 3, 4, 5], start: 1, end: 4 }, {} as any);
    expect(result).toEqual([2, 3, 4]);
  });

  it("slices to end when no end specified", async () => {
    const result = await sliceProcedure.handler!({ items: [1, 2, 3, 4], start: 2 }, {} as any);
    expect(result).toEqual([3, 4]);
  });
});

describe("arrConcatProcedure", () => {
  it("concatenates multiple arrays", async () => {
    const result = await arrConcatProcedure.handler!(
      { arrays: [[1, 2], [3, 4], [5]] },
      {} as any
    );
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty arrays", async () => {
    const result = await arrConcatProcedure.handler!({ arrays: [[], [1], []] }, {} as any);
    expect(result).toEqual([1]);
  });
});

describe("uniqueProcedure", () => {
  it("removes duplicates", async () => {
    const result = await uniqueProcedure.handler!({ items: [1, 2, 2, 3, 1] }, {} as any);
    expect(result).toEqual([1, 2, 3]);
  });

  it("removes duplicates by key", async () => {
    const items = [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 1, name: "c" }];
    const result = await uniqueProcedure.handler!({ items, key: "id" }, {} as any);
    expect(result).toEqual([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  });
});

describe("groupByProcedure", () => {
  it("groups items by key", async () => {
    const items = [
      { type: "a", value: 1 },
      { type: "b", value: 2 },
      { type: "a", value: 3 },
    ];
    const result = await groupByProcedure.handler!({ items, key: "type" }, {} as any);
    expect(result).toEqual({
      a: [{ type: "a", value: 1 }, { type: "a", value: 3 }],
      b: [{ type: "b", value: 2 }],
    });
  });
});

describe("zipProcedure", () => {
  it("zips arrays into tuples", async () => {
    const result = await zipProcedure.handler!(
      { arrays: [[1, 2], ["a", "b"], [true, false]] },
      {} as any
    );
    expect(result).toEqual([[1, "a", true], [2, "b", false]]);
  });

  it("handles arrays of different lengths", async () => {
    const result = await zipProcedure.handler!(
      { arrays: [[1, 2, 3], ["a"]] },
      {} as any
    );
    expect(result).toEqual([[1, "a"], [2, undefined], [3, undefined]]);
  });
});

describe("unzipProcedure", () => {
  it("unzips tuples into arrays", async () => {
    const result = await unzipProcedure.handler!(
      { tuples: [[1, "a", true], [2, "b", false]] },
      {} as any
    );
    expect(result).toEqual([[1, 2], ["a", "b"], [true, false]]);
  });
});

// =============================================================================
// Search Procedures
// =============================================================================

describe("indexOfProcedure", () => {
  it("finds index of value", async () => {
    const result = await indexOfProcedure.handler!({ items: ["a", "b", "c"], value: "b" }, {} as any);
    expect(result).toBe(1);
  });

  it("returns -1 when not found", async () => {
    const result = await indexOfProcedure.handler!({ items: [1, 2, 3], value: 5 }, {} as any);
    expect(result).toBe(-1);
  });

  it("respects fromIndex", async () => {
    const result = await indexOfProcedure.handler!(
      { items: [1, 2, 1, 2], value: 1, fromIndex: 1 },
      {} as any
    );
    expect(result).toBe(2);
  });
});

describe("containsProcedure", () => {
  it("returns true when value exists", async () => {
    const result = await containsProcedure.handler!({ items: [1, 2, 3], value: 2 }, {} as any);
    expect(result).toBe(true);
  });

  it("returns false when value missing", async () => {
    const result = await containsProcedure.handler!({ items: [1, 2, 3], value: 5 }, {} as any);
    expect(result).toBe(false);
  });
});

// =============================================================================
// Mutation Procedures (Immutable)
// =============================================================================

describe("pushProcedure", () => {
  it("adds value to end", async () => {
    const result = await pushProcedure.handler!({ items: [1, 2], value: 3 }, {} as any);
    expect(result).toEqual([1, 2, 3]);
  });

  it("does not mutate original", async () => {
    const original = [1, 2];
    await pushProcedure.handler!({ items: original, value: 3 }, {} as any);
    expect(original).toEqual([1, 2]);
  });
});

describe("unshiftProcedure", () => {
  it("adds value to beginning", async () => {
    const result = await unshiftProcedure.handler!({ items: [2, 3], value: 1 }, {} as any);
    expect(result).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// Generation Procedures
// =============================================================================

describe("rangeProcedure", () => {
  it("generates range of numbers", async () => {
    const result = await rangeProcedure.handler!({ start: 0, end: 5 }, {} as any);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("respects step parameter", async () => {
    const result = await rangeProcedure.handler!({ start: 0, end: 10, step: 2 }, {} as any);
    expect(result).toEqual([0, 2, 4, 6, 8]);
  });

  it("handles negative step", async () => {
    const result = await rangeProcedure.handler!({ start: 5, end: 0, step: -1 }, {} as any);
    expect(result).toEqual([5, 4, 3, 2, 1]);
  });
});

// =============================================================================
// Filter Procedures (Core Logic + Filtering Separation)
// =============================================================================

describe("filterProcedure", () => {
  const items = [
    { name: "alice", age: 25 },
    { name: "bob", age: 30 },
    { name: "charlie", age: 25 },
  ];

  describe("equals match", () => {
    it("filters by field equals value", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 25, match: "equals" },
        {} as any
      );
      expect(result).toEqual([
        { name: "alice", age: 25 },
        { name: "charlie", age: 25 },
      ]);
    });

    it("uses equals as default match", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 30 },
        {} as any
      );
      expect(result).toEqual([{ name: "bob", age: 30 }]);
    });
  });

  describe("not match", () => {
    it("filters by field not equals value", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 25, match: "not" },
        {} as any
      );
      expect(result).toEqual([{ name: "bob", age: 30 }]);
    });
  });

  describe("in match", () => {
    it("filters by field in array of values", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "name", values: ["alice", "bob"], match: "in" },
        {} as any
      );
      expect(result).toEqual([
        { name: "alice", age: 25 },
        { name: "bob", age: 30 },
      ]);
    });
  });

  describe("notIn match", () => {
    it("filters by field not in array of values", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "name", values: ["alice", "bob"], match: "notIn" },
        {} as any
      );
      expect(result).toEqual([{ name: "charlie", age: 25 }]);
    });
  });

  describe("string matches", () => {
    const strings = [
      { text: "hello world" },
      { text: "hello there" },
      { text: "goodbye world" },
    ];

    it("filters by contains", async () => {
      const result = await filterProcedure.handler!(
        { items: strings, key: "text", value: "world", match: "contains" },
        {} as any
      );
      expect(result).toEqual([
        { text: "hello world" },
        { text: "goodbye world" },
      ]);
    });

    it("filters by startsWith", async () => {
      const result = await filterProcedure.handler!(
        { items: strings, key: "text", value: "hello", match: "startsWith" },
        {} as any
      );
      expect(result).toEqual([
        { text: "hello world" },
        { text: "hello there" },
      ]);
    });

    it("filters by endsWith", async () => {
      const result = await filterProcedure.handler!(
        { items: strings, key: "text", value: "world", match: "endsWith" },
        {} as any
      );
      expect(result).toEqual([
        { text: "hello world" },
        { text: "goodbye world" },
      ]);
    });
  });

  describe("numeric comparisons", () => {
    it("filters by gt", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 25, match: "gt" },
        {} as any
      );
      expect(result).toEqual([{ name: "bob", age: 30 }]);
    });

    it("filters by gte", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 25, match: "gte" },
        {} as any
      );
      expect(result).toEqual(items);
    });

    it("filters by lt", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 30, match: "lt" },
        {} as any
      );
      expect(result).toEqual([
        { name: "alice", age: 25 },
        { name: "charlie", age: 25 },
      ]);
    });

    it("filters by lte", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 25, match: "lte" },
        {} as any
      );
      expect(result).toEqual([
        { name: "alice", age: 25 },
        { name: "charlie", age: 25 },
      ]);
    });
  });

  describe("invert option", () => {
    it("inverts filter result", async () => {
      const result = await filterProcedure.handler!(
        { items, key: "age", value: 25, match: "equals", invert: true },
        {} as any
      );
      expect(result).toEqual([{ name: "bob", age: 30 }]);
    });
  });
});

describe("whereProcedure", () => {
  it("filters by multiple field conditions", async () => {
    const items = [
      { type: "user", active: true, age: 25 },
      { type: "admin", active: true, age: 30 },
      { type: "user", active: false, age: 25 },
    ];

    const result = await whereProcedure.handler!(
      { items, where: { type: "user", active: true } },
      {} as any
    );

    expect(result).toEqual([{ type: "user", active: true, age: 25 }]);
  });
});

describe("pluckProcedure", () => {
  it("extracts single field from objects", async () => {
    const items = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
    const result = await pluckProcedure.handler!({ items, key: "name" }, {} as any);
    expect(result).toEqual(["a", "b"]);
  });

  it("returns undefined for missing keys", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = await pluckProcedure.handler!({ items, key: "name" }, {} as any);
    expect(result).toEqual([undefined, undefined]);
  });
});

describe("arrPickProcedure", () => {
  it("picks specified fields from objects in array", async () => {
    const items = [
      { id: 1, name: "a", extra: "x" },
      { id: 2, name: "b", extra: "y" },
    ];
    const result = await arrPickProcedure.handler!({ items, keys: ["id", "name"] }, {} as any);
    expect(result).toEqual([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  });

  it("ignores missing keys", async () => {
    const items = [{ id: 1 }];
    const result = await arrPickProcedure.handler!({ items, keys: ["id", "missing"] }, {} as any);
    expect(result).toEqual([{ id: 1 }]);
  });
});

describe("arrOmitProcedure", () => {
  it("omits specified fields from objects in array", async () => {
    const items = [
      { id: 1, name: "a", extra: "x" },
      { id: 2, name: "b", extra: "y" },
    ];
    const result = await arrOmitProcedure.handler!({ items, keys: ["extra"] }, {} as any);
    expect(result).toEqual([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  });
});

describe("partitionProcedure", () => {
  it("splits array by predicate", async () => {
    const items = [
      { active: true, name: "a" },
      { active: false, name: "b" },
      { active: true, name: "c" },
    ];
    const result = await partitionProcedure.handler!({ items, key: "active" }, {} as any);
    expect(result).toEqual({
      truthy: [{ active: true, name: "a" }, { active: true, name: "c" }],
      falsy: [{ active: false, name: "b" }],
    });
  });

  it("partitions by value match", async () => {
    const items = [
      { status: "pending", id: 1 },
      { status: "done", id: 2 },
      { status: "pending", id: 3 },
    ];
    const result = await partitionProcedure.handler!(
      { items, key: "status", value: "done" },
      {} as any
    );
    expect(result.truthy).toEqual([{ status: "done", id: 2 }]);
    expect(result.falsy).toHaveLength(2);
  });
});

describe("countProcedure", () => {
  it("counts all items when no criteria", async () => {
    const result = await countProcedure.handler!({ items: [1, 2, 3, 4, 5] }, {} as any);
    expect(result).toBe(5);
  });

  it("counts matching items by key truthiness", async () => {
    const items = [
      { active: true },
      { active: false },
      { active: true },
    ];
    const result = await countProcedure.handler!({ items, key: "active" }, {} as any);
    expect(result).toBe(2);
  });

  it("counts matching items by value", async () => {
    const items = [
      { status: "pending" },
      { status: "done" },
      { status: "pending" },
    ];
    const result = await countProcedure.handler!(
      { items, key: "status", value: "pending" },
      {} as any
    );
    expect(result).toBe(2);
  });
});
