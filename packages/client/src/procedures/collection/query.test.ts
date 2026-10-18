/**
 * The query language of the storages (roadmap CLI-14, CLI-34): the problems of a selector, the
 * query policy and each of its limits, the order of the values, the paths through arrays, and the
 * two forms of a patch. This is the one copy of the language: `@procedures/collections` and the
 * storage packages import it from `@procedures/client/query`.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIND_LIMIT,
  DEFAULT_QUERY_OPERATORS,
  DEFAULT_QUERY_POLICY,
  QUERY_OPERATORS,
  applyPatch,
  compareStorageValues,
  compileSelector,
  isPatchOperations,
  matchesSelector,
  mergePatch,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
  type StorageQueryPolicy,
  type StorageSelector,
} from "./query.js";

/** A policy that permits each operator, with the default limits. */
const OPEN: StorageQueryPolicy = { operators: QUERY_OPERATORS };

describe("selectorProblems()", () => {
  it("accepts the operators of the language under a policy that permits them", () => {
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
    for (const selector of selectors) expect(selectorProblems(selector, OPEN), JSON.stringify(selector)).toEqual([]);
  });

  it("names each part that the language does not know", () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /selector must be an object/],
      [[], /selector must be an object/],
      [{ $where: "x" }, /operator \$where is not known/],
      [{ $expr: { $gt: ["$a", 1] } }, /operator \$expr is not known/],
      [{ a: { $type: "string" } }, /operator \$type is not known/],
      [{ a: { $and: [{ b: 1 }] } }, /\$and goes at the top of a selector/],
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
      expect(selectorProblems(selector, OPEN).join("\n"), JSON.stringify(selector)).toMatch(problem);
    }
  });

  it("compileSelector() throws a TypeError with each problem", () => {
    expect(() => compileSelector({ a: { $foo: 1 }, $bar: [] } as StorageSelector)).toThrow(TypeError);
    expect(() => compileSelector({ a: { $foo: 1 }, $bar: [] } as StorageSelector)).toThrow(/\$foo.*\$bar/);
  });
});

describe("the query policy (roadmap CLI-14)", () => {
  it("the default policy permits each operator except $regex", () => {
    expect(DEFAULT_QUERY_OPERATORS).toEqual(QUERY_OPERATORS.filter((operator) => operator !== "$regex"));
    expect(DEFAULT_QUERY_POLICY.operators).toEqual(DEFAULT_QUERY_OPERATORS);
    expect(DEFAULT_FIND_LIMIT).toBe(1000);
    expect(Object.isFrozen(DEFAULT_QUERY_POLICY)).toBe(true);
  });

  it("refuses $regex unless the policy permits it, and says how a host turns it on", () => {
    const selector: StorageSelector = { name: { $regex: "^a" } };
    for (const policy of [undefined, {}, DEFAULT_QUERY_POLICY, { maxRegexLength: 1000 }]) {
      const problems = selectorProblems(selector, policy);
      expect(problems, JSON.stringify(policy)).toEqual([
        "selector.name: the query policy does not permit the operator $regex. A host turns it on with a queryPolicy whose operators include $regex",
      ]);
    }
    expect(selectorProblems(selector, OPEN)).toEqual([]);
    expect(matchesSelector(selector, { name: "abc" }, OPEN)).toBe(true);
    expect(() => matchesSelector(selector, { name: "abc" })).toThrow(TypeError);
  });

  it("refuses a pattern that repeats a repetition, by default and also when $regex is on", () => {
    const redos = ["^(a+)+$", "(a*)*", "(x+x+)+y", "((ab)+c)+", "(a+){2,}", "(?:\\d+)+"];
    for (const pattern of redos) {
      expect(selectorProblems({ a: { $regex: pattern } }).join(), pattern).toMatch(/does not permit the operator \$regex/);
      expect(selectorProblems({ a: { $regex: pattern } }, OPEN).join(), pattern).toMatch(/repeats a group that repeats without a bound/);
    }
    for (const pattern of ["(ab)+", "(a+)?b", "(a{2,3})+", "(?:a|b)+", "[(a+)]+", "\\(a+\\)+", "a+b*c?"]) {
      expect(selectorProblems({ a: { $regex: pattern } }, OPEN), pattern).toEqual([]);
    }
  });

  it("refuses an operator, also a logical one, that the policy does not permit", () => {
    const policy: StorageQueryPolicy = { operators: ["$eq", "$and"] };
    expect(selectorProblems({ a: 1, b: { $eq: 2 }, $and: [{ c: 3 }] }, policy)).toEqual([]);
    expect(selectorProblems({ a: { $gt: 1 } }, policy)).toEqual(["selector.a: the query policy does not permit the operator $gt"]);
    expect(selectorProblems({ $or: [{ a: 1 }] }, policy)).toEqual(["selector: the query policy does not permit the operator $or"]);
  });

  it("refuses a pattern longer than maxRegexLength, and a flag outside regexFlags", () => {
    const policy: StorageQueryPolicy = { operators: QUERY_OPERATORS, maxRegexLength: 3, regexFlags: "i" };
    expect(selectorProblems({ a: { $regex: "abc", $options: "i" } }, policy)).toEqual([]);
    expect(selectorProblems({ a: { $regex: "abcd" } }, policy)).toEqual(["selector.a.$regex has 4 characters, more than the 3 of the query policy"]);
    expect(selectorProblems({ a: { $regex: "ab", $options: "im" } }, policy)).toEqual([
      'selector.a.$options has the flag m, and the query policy permits only "i"',
    ]);
    // The default length is 128
    expect(selectorProblems({ a: { $regex: "x".repeat(128) } }, OPEN)).toEqual([]);
    expect(selectorProblems({ a: { $regex: "x".repeat(129) } }, OPEN)[0]).toMatch(/129 characters, more than the 128/);
  });

  it("refuses more clauses than maxClauses: each field condition, each operator and each logical operator", () => {
    const policy: StorageQueryPolicy = { maxClauses: 3 };
    expect(selectorProblems({ a: 1, b: { $gt: 1, $lt: 5 } }, policy)).toEqual([]);
    expect(selectorProblems({ a: 1, b: 2, c: 3, d: 4 }, policy)).toEqual(["selector: it has 4 clauses, more than the 3 of the query policy"]);
    expect(selectorProblems({ $or: [{ a: 1 }, { b: 2 }, { c: 3 }] }, policy)).toEqual(["selector: it has 4 clauses, more than the 3 of the query policy"]);
    const wide = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`f${index}`, index]));
    expect(selectorProblems(wide)).toEqual(["selector: it has 65 clauses, more than the 64 of the query policy"]);
  });

  it("refuses a selector deeper than maxDepth: each $and, $or, $nor, $not and $elemMatch adds a level", () => {
    const policy: StorageQueryPolicy = { maxDepth: 1 };
    expect(selectorProblems({ $and: [{ a: 1 }] }, policy)).toEqual([]);
    expect(selectorProblems({ a: { $not: { $eq: 1 } } }, policy)).toEqual([]);
    expect(selectorProblems({ a: { $elemMatch: { $gt: 1 } } }, policy)).toEqual([]);
    expect(selectorProblems({ $and: [{ $or: [{ a: 1 }] }] }, policy)).toEqual([
      "selector.$and[0].$or: the selector is nested deeper than the 1 levels of the query policy",
    ]);
    expect(selectorProblems({ $and: [{ a: { $not: { $eq: 1 } } }] }, policy)[0]).toMatch(/nested deeper than the 1 levels/);
    expect(selectorProblems({ a: { $elemMatch: { b: { $elemMatch: { $gt: 1 } } } } }, policy)[0]).toMatch(/nested deeper than the 1 levels/);
    let deep: StorageSelector = { a: 1 };
    for (let level = 0; level < 7; level++) deep = { $and: [deep] };
    expect(selectorProblems(deep)[0]).toMatch(/nested deeper than the 6 levels/);
  });

  it("refuses a list of $in, $nin or $all longer than maxListLength", () => {
    const policy: StorageQueryPolicy = { maxListLength: 2 };
    expect(selectorProblems({ a: { $in: [1, 2], $nin: [3, 4] }, b: { $all: [1, 2] } }, policy)).toEqual([]);
    for (const operator of ["$in", "$nin", "$all"]) {
      expect(selectorProblems({ a: { [operator]: [1, 2, 3] } }, policy)).toEqual([`selector.a.${operator} has 3 values, more than the 2 of the query policy`]);
    }
    expect(selectorProblems({ a: { $in: Array.from({ length: 257 }, (_, index) => index) } })[0]).toMatch(/257 values, more than the 256/);
  });

  it("refuses a limit above maxLimit, and gives maxLimit to a query without a limit", () => {
    const policy: StorageQueryPolicy = { maxLimit: 2 };
    expect(queryOptionsProblems({ limit: 2 }, policy)).toEqual([]);
    expect(queryOptionsProblems({ limit: 3 }, policy)).toEqual(["limit must be at most 2, the maxLimit of the query policy"]);
    const entries: Array<[string, number]> = [["a", 1], ["b", 2], ["c", 3]];
    expect(queryEntries(entries, {}, {}, policy).map(([id]) => id)).toEqual(["a", "b"]);
    expect(queryEntries(entries, {}, { skip: 2 }, policy).map(([id]) => id)).toEqual(["c"]);
    expect(queryEntries(entries).map(([id]) => id)).toEqual(["a", "b", "c"]);
    expect(() => queryEntries(entries, {}, { limit: 3 }, policy)).toThrow(TypeError);
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
    expect(matchesSelector({ a: { $regex: "^ab" } }, { a: "abc" }, OPEN)).toBe(true);
    expect(matchesSelector({ a: { $regex: "^AB", $options: "i" } }, { a: "abc" }, OPEN)).toBe(true);
    expect(matchesSelector({ a: { $regex: "1" } }, { a: 1 }, OPEN)).toBe(false);
    expect(matchesSelector({ a: { $regex: "^b" } }, { a: ["a", "b"] }, OPEN)).toBe(true);
    expect(matchesSelector({ a: { $not: { $regex: "^b" } } }, { a: "c" }, OPEN)).toBe(true);
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
});

describe("applyPatch(): the two forms of a patch", () => {
  it("a patch whose keys each start with $ is the operations form", () => {
    expect(isPatchOperations({ $set: { a: 1 } })).toBe(true);
    expect(isPatchOperations({ $unset: ["a"], $set: undefined })).toBe(true);
    expect(isPatchOperations({ a: 1 })).toBe(false);
    expect(isPatchOperations({})).toBe(false);
    expect(isPatchOperations(null)).toBe(false);
  });

  it("a patch with fields is a JSON Merge Patch", () => {
    expect(applyPatch({ a: 1, b: { c: 1 } }, { a: null, b: { d: 2 } })).toEqual({ b: { c: 1, d: 2 } });
  });

  it("$set sets null and nested paths, makes a missing or null part an object, and sets an element of an array", () => {
    const value = { a: 1, b: { c: 1 }, list: [1, 2], none: null };
    const patched = applyPatch(value, { $set: { a: null, "b.c": 2, "b.d.e": 3, "list.1": 20, "list.2": 30, "none.x": 1, "fresh.y": [1] } });
    expect(patched).toEqual({ a: null, b: { c: 2, d: { e: 3 } }, list: [1, 20, 30], none: { x: 1 }, fresh: { y: [1] } });
    // The value does not change
    expect(value).toEqual({ a: 1, b: { c: 1 }, list: [1, 2], none: null });
  });

  it("$unset removes paths, makes an element of an array null, and skips a missing path", () => {
    const value = { a: 1, b: { c: 1, d: 2 }, list: [1, 2, 3] };
    expect(applyPatch(value, { $unset: ["a", "b.c", "list.1", "missing", "b.missing.deep", "list.9"] })).toEqual({ b: { d: 2 }, list: [1, null, 3] });
    const same = applyPatch(value, { $unset: ["missing"] });
    expect(same).toEqual(value);
    expect(same).not.toBe(value);
  });

  it("applies $set before $unset, and starts from an empty object for a value that is not an object", () => {
    expect(applyPatch({ a: { b: 1, c: 2 } }, { $set: { "a.b": 5 }, $unset: ["a.c"] })).toEqual({ a: { b: 5 } });
    expect(applyPatch(7, { $set: { a: 1 } })).toEqual({ a: 1 });
    expect(applyPatch(undefined, { $unset: ["a"] })).toEqual({});
  });

  it("throws a TypeError for a path through a value that is not an object, or past the end of an array", () => {
    expect(() => applyPatch({ a: 1 }, { $set: { "a.b": 1 } })).toThrow("The patch cannot set a.b: a is not an object");
    expect(() => applyPatch({ list: [1] }, { $set: { "list.x": 1 } })).toThrow("The patch cannot set list.x: list is an array");
    expect(() => applyPatch({ list: [1] }, { $set: { "list.5": 1 } })).toThrow("The patch cannot set list.5: list has 1 elements");
  });

  it("keeps a path segment named __proto__ as an own field", () => {
    const patched = applyPatch({}, { $set: { "__proto__.polluted": true } });
    expect(Object.getPrototypeOf(patched)).toBe(Object.prototype);
    expect(Object.hasOwn(patched, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("patchProblems() names each problem of a patch, also a patch of two forms", () => {
    expect(patchProblems({})).toEqual([]);
    expect(patchProblems({ a: 1, $b: undefined })).toEqual([]);
    expect(patchProblems({ $set: { "a.b": 1, c: null }, $unset: ["d"] })).toEqual([]);
    for (const fields of [null, [], "x", 1, undefined]) expect(patchProblems(fields)).toEqual(["the fields of a patch must be an object"]);
    expect(patchProblems({ $set: { a: 1 }, b: 2 })).toEqual(["the patch mixes operations and fields: give operations ($set, $unset, $remove, $insert), or only fields (a JSON Merge Patch)"]);
    expect(patchProblems({ $inc: { a: 1 } })).toEqual(["the patch operation $inc is not known: use $set, $unset, $remove and $insert"]);
    expect(patchProblems({ $set: [1] })).toEqual(["$set takes an object of field paths and values"]);
    expect(patchProblems({ $unset: "a" })).toEqual(["$unset takes a list of field paths"]);
    expect(patchProblems({ $unset: ["a", 1] })).toEqual(["$unset takes a list of field paths"]);
    expect(patchProblems({ $set: { "a..b": 1 } })[0]).toMatch(/empty part/);
    expect(patchProblems({ $unset: ["$a"] })[0]).toMatch(/starts with \$/);
    expect(patchProblems({ $set: { a: 1, "a.b": 2 } })).toEqual(["the field paths a and a.b of the patch overlap"]);
    expect(patchProblems({ $set: { "a.b": 1 }, $unset: ["a.b"] })).toEqual(["the field paths a.b and a.b of the patch overlap"]);
    expect(patchProblems({ $set: { ab: 1 }, $unset: ["a"] })).toEqual([]);
    expect(() => applyPatch({}, { $set: { a: 1 }, b: 2 })).toThrow(TypeError);
  });
});

describe("applyPatch(): $remove and $insert move the elements of an array (JSON Patch, RFC 6902)", () => {
  it("$remove takes elements out of an array, and removes the fields of an object as $unset", () => {
    const value = { list: ["a", "b", "c", "d"], meta: { kind: "k", score: 1 }, rows: [{ n: 1 }, { n: 2 }] };
    expect(applyPatch(value, { $remove: ["list.1"] })).toEqual({ ...value, list: ["a", "c", "d"] });
    expect(applyPatch(value, { $remove: ["meta.score", "rows.0.n"] })).toEqual({ ...value, meta: { kind: "k" }, rows: [{}, { n: 2 }] });
    expect(applyPatch(value, { $remove: ["list.9", "missing.0", "meta.none"] })).toEqual(value);
    expect(value.list).toEqual(["a", "b", "c", "d"]);
  });

  it("each index of one patch refers to the item before the patch", () => {
    const value = { list: ["a", "b", "c", "d", "e"] };
    expect(applyPatch(value, { $remove: ["list.1", "list.3"] })).toEqual({ list: ["a", "c", "e"] });
    expect(applyPatch(value, { $remove: ["list.3", "list.1"] })).toEqual({ list: ["a", "c", "e"] });
    expect(applyPatch(value, { $insert: { "list.1": "x", "list.3": "y" } })).toEqual({ list: ["a", "x", "b", "c", "y", "d", "e"] });
    expect(applyPatch(value, { $set: { "list.3": "D" }, $remove: ["list.0"] })).toEqual({ list: ["b", "c", "D", "e"] });
    expect(applyPatch(value, { $unset: ["list.4"], $insert: { "list.0": "z" } })).toEqual({ list: ["z", "a", "b", "c", "d", null] });
  });

  it("a deeper path refers to the item before the patch too", () => {
    const value = { rows: [{ tags: ["a", "b"] }, { tags: ["c", "d"] }] };
    expect(applyPatch(value, { $remove: ["rows.0", "rows.1.tags.0"] })).toEqual({ rows: [{ tags: ["d"] }] });
    expect(applyPatch(value, { $insert: { "rows.0": { tags: [] }, "rows.1.tags.2": "e" } })).toEqual({
      rows: [{ tags: [] }, { tags: ["a", "b"] }, { tags: ["c", "d", "e"] }],
    });
  });

  it("$insert adds an element at an index, also at the end, and refuses other places", () => {
    const value = { list: [1, 2], meta: { kind: "k" } };
    expect(applyPatch(value, { $insert: { "list.0": 0 } })).toEqual({ ...value, list: [0, 1, 2] });
    expect(applyPatch(value, { $insert: { "list.2": 3 } })).toEqual({ ...value, list: [1, 2, 3] });
    expect(applyPatch(value, { $insert: { "list.1": { a: [null] } } })).toEqual({ ...value, list: [1, { a: [null] }, 2] });
    expect(() => applyPatch(value, { $insert: { "list.3": 3 } })).toThrow("The patch cannot insert at list.3: list has 2 elements");
    expect(() => applyPatch(value, { $insert: { "meta.0": 1 } })).toThrow("The patch cannot insert at meta.0: meta is not an array");
    expect(() => applyPatch(value, { $insert: { "missing.0": 1 } })).toThrow("The patch cannot insert at missing.0: the item has no field missing");
    expect(() => applyPatch(value, { $insert: { "none.list.0": 1 } })).toThrow("The patch cannot insert at none.list.0: the item has no field none");
    expect(() => applyPatch(value, { $insert: { "list.5.x.0": 1 } })).toThrow("The patch cannot insert at list.5.x.0: list has no element 5");
    expect(value.list).toEqual([1, 2]);
  });

  it("an $insert is the inverse of a $remove", () => {
    const value = { list: ["a", "b", "c"] };
    const removed = applyPatch(value, { $remove: ["list.1"] });
    expect(applyPatch(removed, { $insert: { "list.1": "b" } })).toEqual(value);
  });

  it("patchProblems() refuses the patches that $remove and $insert cannot apply", () => {
    expect(patchProblems({ $remove: ["a.0"], $insert: { "b.1": 1 } })).toEqual([]);
    expect(patchProblems({ $remove: "a" })).toEqual(["$remove takes a list of field paths"]);
    expect(patchProblems({ $insert: ["a.0"] })).toEqual(["$insert takes an object of field paths and values"]);
    expect(patchProblems({ $insert: { "a.b": 1 } })).toEqual(['$insert: the field path "a.b" does not end with an index']);
    expect(patchProblems({ $remove: ["list.0"], $insert: { "list.2": 1 } })).toEqual(["the patch removes and inserts elements of the same array list"]);
    expect(patchProblems({ $remove: ["rows.1"], $set: { "rows.1.n": 2 } })).toEqual(["the field paths rows.1.n and rows.1 of the patch overlap"]);
    expect(patchProblems({ $insert: { "list.1": 1 }, $unset: ["list.1"] })).toEqual(["the field paths list.1 and list.1 of the patch overlap"]);
    expect(patchProblems({ $remove: ["list.1", "list.10"] })).toEqual([]);
    expect(() => applyPatch({ list: [1] }, { $remove: ["list.0"], $insert: { "list.0": 2 } })).toThrow(TypeError);
  });
});
