/**
 * The copy of the query language in the core (roadmap CLI-14): the problems of a selector, the
 * order of the values, the paths through arrays and the merge patch. The procedures `find` and
 * `patch` use it for a storage without `query()` or `patch()`. The same cases test the copy in
 * `@procedures/collections`.
 */

import { describe, expect, it } from "vitest";
import {
  compareStorageValues,
  compileSelector,
  matchesSelector,
  mergePatch,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
  type StorageSelector,
} from "./query.js";

describe("selectorProblems()", () => {
  it("accepts the operators of the language", () => {
    const selectors: StorageSelector[] = [
      {},
      { a: 1, "b.c": "x", d: null, e: [1, 2], f: { g: 1 } },
      { a: { $eq: 1, $ne: 2, $gt: 0, $gte: 0, $lt: 9, $lte: 9 } },
      { a: { $in: [1, null], $nin: [] }, b: { $exists: true }, c: { $size: 2 }, d: { $all: ["x"] } },
      { a: { $regex: "^x", $options: "imsu" }, b: { $not: { $regex: "y" } } },
      { a: { $elemMatch: { $gt: 1 } }, b: { $elemMatch: { c: 1, $or: [{ d: 2 }] } } },
      { $and: [{ a: 1 }], $or: [{ b: 1 }, { c: 2 }], $nor: [{ d: 1 }] },
      { a: undefined, b: { $gt: undefined, $lt: 3 } },
    ];
    for (const selector of selectors) expect(selectorProblems(selector), JSON.stringify(selector)).toEqual([]);
  });

  it("names each part that a query cannot use", () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /selector must be an object/],
      [[], /selector must be an object/],
      [{ $where: "x" }, /operator \$where is not known/],
      [{ a: { $type: "string" } }, /operator \$type is not known/],
      [{ $or: [] }, /\$or takes a list of one or more selectors/],
      [{ $and: { a: 1 } }, /\$and takes a list/],
      [{ $or: [1] }, /selector\.\$or\[0\] must be an object/],
      [{ "a..b": 1 }, /empty part/],
      [{ "a.$b": 1 }, /starts with \$/],
      [{ a: { $gt: 1, b: 2 } }, /mixes operators and fields/],
      [{ a: { $gt: [1] } }, /\$gt takes a number, a string, a boolean or null/],
      [{ a: { $in: 1 } }, /\$in takes a list/],
      [{ a: { $all: [{ $elemMatch: { b: 1 } }] } }, /\$all takes values/],
      [{ a: { $exists: 1 } }, /\$exists takes true or false/],
      [{ a: { $size: -1 } }, /\$size takes a whole number/],
      [{ a: { $size: 1.5 } }, /\$size takes a whole number/],
      [{ a: { $regex: 1 } }, /\$regex takes a string/],
      [{ a: { $regex: "(" } }, /\$regex is not a regular expression/],
      [{ a: { $regex: "x", $options: "g" } }, /\$options takes the flags/],
      [{ a: { $regex: "x", $options: "ii" } }, /\$options takes the flags/],
      [{ a: { $options: "i" } }, /\$options needs \$regex/],
      [{ a: { $not: 1 } }, /\$not takes an object of operators/],
      [{ a: { $not: {} } }, /\$not takes an object of operators/],
      [{ a: { $elemMatch: 1 } }, /\$elemMatch takes an object/],
    ];
    for (const [selector, problem] of cases) {
      const problems = selectorProblems(selector);
      expect(problems.join("\n"), JSON.stringify(selector)).toMatch(problem);
    }
  });

  it("compileSelector() throws a TypeError with each problem", () => {
    expect(() => compileSelector({ a: { $foo: 1 }, $bar: [] } as StorageSelector)).toThrow(TypeError);
    expect(() => compileSelector({ a: { $foo: 1 }, $bar: [] } as StorageSelector)).toThrow(/\$foo.*\$bar/);
  });
});

describe("queryOptionsProblems()", () => {
  it("accepts a sort, a skip and a limit", () => {
    expect(queryOptionsProblems(undefined)).toEqual([]);
    expect(queryOptionsProblems({})).toEqual([]);
    expect(queryOptionsProblems({ sort: { a: 1, "b.c": -1 }, skip: 0, limit: 1 })).toEqual([]);
    expect(queryOptionsProblems({ sort: undefined, skip: undefined, limit: undefined })).toEqual([]);
  });

  it("names each option that a query cannot use", () => {
    expect(queryOptionsProblems(3)).toEqual(["the options of a query must be an object"]);
    expect(queryOptionsProblems({ fields: { a: 1 } })).toEqual(["the option fields is not known: use sort, skip and limit"]);
    expect(queryOptionsProblems({ sort: [["a", 1]] })).toEqual(["sort must be an object of field paths with 1 or -1"]);
    expect(queryOptionsProblems({ sort: { a: 0 } })).toEqual(["sort.a must be 1 or -1"]);
    expect(queryOptionsProblems({ sort: { "a..b": 1 } })[0]).toMatch(/empty part/);
    expect(queryOptionsProblems({ skip: -1 })).toEqual(["skip must be a whole number, 0 or more"]);
    expect(queryOptionsProblems({ skip: 1.5 })).toEqual(["skip must be a whole number, 0 or more"]);
    expect(queryOptionsProblems({ limit: 0 })).toEqual(["limit must be a whole number, 1 or more"]);
    expect(queryOptionsProblems({ limit: "2" })).toEqual(["limit must be a whole number, 1 or more"]);
  });
});

describe("the matches of a selector", () => {
  it("an array field matches an equal element or the equal array, and null matches a missing field", () => {
    expect(matchesSelector({ tags: "x" }, { tags: ["x", "y"] })).toBe(true);
    expect(matchesSelector({ tags: ["x", "y"] }, { tags: ["x", "y"] })).toBe(true);
    expect(matchesSelector({ tags: ["y", "x"] }, { tags: ["x", "y"] })).toBe(false);
    expect(matchesSelector({ tags: ["x"] }, { tags: [["x"], "z"] })).toBe(true);
    expect(matchesSelector({ a: null }, {})).toBe(true);
    expect(matchesSelector({ a: null }, { a: undefined })).toBe(true);
    expect(matchesSelector({ a: null }, { a: 0 })).toBe(false);
    expect(matchesSelector({ "a.b": null }, { a: [{ b: 1 }, {}] })).toBe(true);
    expect(matchesSelector({ "a.b": null }, { a: [{ b: 1 }] })).toBe(false);
    expect(matchesSelector({ "a.b": 1 }, { a: [1, 2] })).toBe(false);
    expect(matchesSelector({ "a.b": { $exists: false } }, { a: [1, 2] })).toBe(true);
  });

  it("an object literal is equal in any order of its keys, and a key with undefined is not in it", () => {
    expect(matchesSelector({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })).toBe(true);
    expect(matchesSelector({ a: { x: 1 } }, { a: { x: 1, y: undefined } })).toBe(true);
    expect(matchesSelector({ a: { x: 1 } }, { a: { x: 1, y: 2 } })).toBe(false);
    expect(matchesSelector({ a: undefined }, { b: 1 })).toBe(true);
  });

  it("the comparisons compare only values of one type", () => {
    expect(matchesSelector({ a: { $gt: 1 } }, { a: "2" })).toBe(false);
    expect(matchesSelector({ a: { $gt: "1" } }, { a: "2" })).toBe(true);
    expect(matchesSelector({ a: { $gt: false } }, { a: true })).toBe(true);
    expect(matchesSelector({ a: { $lt: 5 } }, { a: [9, 3] })).toBe(true);
    expect(matchesSelector({ a: { $gte: null } }, {})).toBe(true);
    expect(matchesSelector({ a: { $lte: null } }, { a: null })).toBe(true);
    expect(matchesSelector({ a: { $gt: null } }, { a: null })).toBe(false);
    expect(matchesSelector({ a: { $lt: null } }, { a: 1 })).toBe(false);
  });

  it("$regex examines only strings, also the elements of an array", () => {
    expect(matchesSelector({ a: { $regex: "^ab" } }, { a: "abc" })).toBe(true);
    expect(matchesSelector({ a: { $regex: "^AB", $options: "i" } }, { a: "abc" })).toBe(true);
    expect(matchesSelector({ a: { $regex: "1" } }, { a: 1 })).toBe(false);
    expect(matchesSelector({ a: { $regex: "^b" } }, { a: ["a", "b"] })).toBe(true);
    expect(matchesSelector({ a: { $not: { $regex: "^b" } } }, { a: "c" })).toBe(true);
  });

  it("$all is a test for each value, and an empty $all matches nothing", () => {
    expect(matchesSelector({ a: { $all: ["x"] } }, { a: "x" })).toBe(true);
    expect(matchesSelector({ a: { $all: ["x", "y"] } }, { a: ["y", "z", "x"] })).toBe(true);
    expect(matchesSelector({ a: { $all: [] } }, { a: [] })).toBe(false);
  });

  it("$elemMatch takes operators for the elements, or a selector for object elements", () => {
    expect(matchesSelector({ a: { $elemMatch: { $gt: 1, $lt: 3 } } }, { a: [0, 2, 5] })).toBe(true);
    expect(matchesSelector({ a: { $elemMatch: { $gt: 1, $lt: 3 } } }, { a: [0, 5] })).toBe(false);
    expect(matchesSelector({ a: { $elemMatch: { $gt: 1 } } }, { a: 5 })).toBe(false);
    expect(matchesSelector({ a: { $elemMatch: { b: 1, c: 2 } } }, { a: [{ b: 1 }, { b: 1, c: 2 }] })).toBe(true);
    expect(matchesSelector({ a: { $elemMatch: { b: 1, c: 2 } } }, { a: [{ b: 1 }, { c: 2 }] })).toBe(false);
    expect(matchesSelector({ a: { $elemMatch: { $or: [{ b: 3 }] } } }, { a: [{ b: 3 }] })).toBe(true);
  });

  it("a field named __proto__ is an own field of the item", () => {
    const item = JSON.parse('{"__proto__": {"x": 1}}') as unknown;
    expect(matchesSelector({ "__proto__.x": 1 }, item)).toBe(true);
    expect(matchesSelector({ "__proto__.x": 1 }, {})).toBe(false);
  });
});

describe("compareStorageValues()", () => {
  it("orders null, numbers, strings, objects, arrays and booleans", () => {
    const values = [true, [1], { a: 1 }, "b", 2, null, false, "a", 1, [], {}];
    const sorted = [...values].sort(compareStorageValues);
    expect(sorted).toEqual([null, 1, 2, "a", "b", {}, { a: 1 }, [], [1], false, true]);
  });

  it("compares arrays element by element, and objects by their sorted keys", () => {
    expect(compareStorageValues([1, 2], [1, 3])).toBeLessThan(0);
    expect(compareStorageValues([1, 2], [1])).toBeGreaterThan(0);
    expect(compareStorageValues({ b: 1, a: 2 }, { a: 2, b: 1 })).toBe(0);
    expect(compareStorageValues({ a: 1 }, { b: 0 })).toBeLessThan(0);
    expect(compareStorageValues({ a: 1 }, { a: 2 })).toBeLessThan(0);
    expect(compareStorageValues({ a: 1, b: 1 }, { a: 1 })).toBeGreaterThan(0);
    expect(compareStorageValues(undefined, null)).toBe(0);
  });
});

describe("queryEntries()", () => {
  const entries: Array<[string, unknown]> = [
    ["a", { n: 2, tags: ["m", "z"] }],
    ["b", { n: 1, tags: ["a"] }],
    ["c", { n: 2 }],
    ["d", { n: 1, tags: [] }],
  ];

  it("gives the entries themselves, in the order of the entries without a sort", () => {
    const result = queryEntries(entries, { n: 2 });
    expect(result.map(([id]) => id)).toEqual(["a", "c"]);
    expect(result[0]![1]).toBe(entries[0]![1]);
    expect(queryEntries(entries).map(([id]) => id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts an array field by its least element up, and by its most element down", () => {
    expect(queryEntries(entries, {}, { sort: { tags: 1 } }).map(([id]) => id)).toEqual(["c", "d", "b", "a"]);
    expect(queryEntries(entries, {}, { sort: { tags: -1 } }).map(([id]) => id)).toEqual(["a", "b", "c", "d"]);
    expect(queryEntries(entries, {}, { sort: { n: 1, tags: -1 } }).map(([id]) => id)).toEqual(["b", "d", "a", "c"]);
  });

  it("throws a TypeError for options that are not correct", () => {
    expect(() => queryEntries(entries, {}, { limit: 0 })).toThrow(TypeError);
    expect(() => queryEntries(entries, { $x: 1 } as StorageSelector)).toThrow(TypeError);
  });
});

describe("mergePatch()", () => {
  it("replaces the fields, merges the object fields and removes the null fields (RFC 7386)", () => {
    const value = { a: 1, b: { c: 2, d: 3 }, e: [1], f: "x" };
    const patched = mergePatch(value, { a: 10, b: { c: null, g: 4 }, e: [2], f: null, h: { i: 1 } });
    expect(patched).toEqual({ a: 10, b: { d: 3, g: 4 }, e: [2], h: { i: 1 } });
    // The value does not change
    expect(value).toEqual({ a: 1, b: { c: 2, d: 3 }, e: [1], f: "x" });
  });

  it("starts from an empty object for a value that is not an object, and skips undefined fields", () => {
    expect(mergePatch(5, { a: 1 })).toEqual({ a: 1 });
    expect(mergePatch(null, { a: { b: null } })).toEqual({ a: {} });
    expect(mergePatch([1], { a: 1 })).toEqual({ a: 1 });
    expect(mergePatch({ a: 1 }, { a: undefined, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("keeps a field named __proto__ as an own field", () => {
    const patched = mergePatch({}, JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>);
    expect(Object.getPrototypeOf(patched)).toBe(Object.prototype);
    expect(Object.hasOwn(patched, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("patchProblems() accepts only an object", () => {
    expect(patchProblems({})).toEqual([]);
    for (const fields of [null, [], "x", 1, undefined]) expect(patchProblems(fields)).toEqual(["the fields of a patch must be an object"]);
  });
});
