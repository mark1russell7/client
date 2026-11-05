/**
 * The three-way merge: its cases, and property tests of its laws with fast-check.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { mergeThreeWay, type ThreeWayConflict } from "./three-way.js";
import { jsonEqual, type JsonValue } from "./value.js";

const pathsOf = (conflicts: readonly ThreeWayConflict[]): string[] => conflicts.map((conflict) => conflict.path).sort();

/** A JSON value with few keys and few leaf values, so the three sides often share parts. */
const value: fc.Arbitrary<JsonValue> = fc.letrec<{ node: JsonValue }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constantFrom<JsonValue>(null, true, 0, 1, "a", "b"),
    fc.array(tie("node"), { maxLength: 3 }),
    fc.dictionary(fc.constantFrom("a", "b", "c", "__proto__"), tie("node"), { maxKeys: 3 }),
  ),
})).node.map((sample) => JSON.parse(JSON.stringify(sample)) as JsonValue);

const side: fc.Arbitrary<JsonValue | undefined> = fc.option(value, { nil: undefined });

const equal = (a: JsonValue | undefined, b: JsonValue | undefined): boolean =>
  a === undefined || b === undefined ? a === b : jsonEqual(a, b);

/** Each object and array in a value, at each depth. */
function objectsOf(value: unknown): object[] {
  if (value === null || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(objectsOf)];
}

describe("mergeThreeWay: the laws", () => {
  it("the base equal to ours gives theirs, with no conflict", () => {
    fc.assert(fc.property(side, side, (base, theirs) => {
      const { merged, conflicts } = mergeThreeWay(base, base, theirs);
      expect(conflicts).toEqual([]);
      expect(equal(merged, theirs)).toBe(true);
    }));
  });

  it("the base equal to theirs gives ours, with no conflict", () => {
    fc.assert(fc.property(side, side, (base, ours) => {
      const { merged, conflicts } = mergeThreeWay(base, ours, base);
      expect(conflicts).toEqual([]);
      expect(equal(merged, ours)).toBe(true);
    }));
  });

  it("ours equal to theirs gives that value, with no conflict", () => {
    fc.assert(fc.property(side, side, (base, both) => {
      const { merged, conflicts } = mergeThreeWay(base, both, both);
      expect(conflicts).toEqual([]);
      expect(equal(merged, both)).toBe(true);
    }));
  });

  it("a swap of the sides gives conflicts at the same paths, and one merged value when clean", () => {
    fc.assert(fc.property(side, side, side, (base, ours, theirs) => {
      const one = mergeThreeWay(base, ours, theirs);
      const two = mergeThreeWay(base, theirs, ours);
      expect(pathsOf(two.conflicts)).toEqual(pathsOf(one.conflicts));
      if (one.conflicts.length === 0) expect(equal(one.merged, two.merged)).toBe(true);
    }));
  });

  it("each conflict gives three values that all differ", () => {
    fc.assert(fc.property(side, side, side, (base, ours, theirs) => {
      for (const conflict of mergeThreeWay(base, ours, theirs).conflicts) {
        expect(equal(conflict.base, conflict.ours)).toBe(false);
        expect(equal(conflict.base, conflict.theirs)).toBe(false);
        expect(equal(conflict.ours, conflict.theirs)).toBe(false);
      }
    }));
  });

  it("the inputs do not change, and the result shares no object with them", () => {
    fc.assert(fc.property(value, value, value, (base, ours, theirs) => {
      const texts = [base, ours, theirs].map((input) => JSON.stringify(input));
      const { merged, conflicts } = mergeThreeWay(base, ours, theirs);
      const inputs = new Set([base, ours, theirs].flatMap(objectsOf));
      const outputs = [merged, ...conflicts.flatMap((c) => [c.base, c.ours, c.theirs])].flatMap(objectsOf);
      expect(outputs.filter((object) => inputs.has(object))).toEqual([]);
      expect([base, ours, theirs].map((input) => JSON.stringify(input))).toEqual(texts);
    }));
  });
});

describe("mergeThreeWay: objects", () => {
  it("changes of different keys both stay", () => {
    const { merged, conflicts } = mergeThreeWay(
      { value: "b", options: ["a", "b"] },
      { value: "b", options: ["a", "b", "c"] },
      { value: "a", options: ["a", "b"] },
    );
    expect(conflicts).toEqual([]);
    expect(merged).toEqual({ value: "a", options: ["a", "b", "c"] });
  });

  it("a different change of one key is a conflict with its path and three values", () => {
    const { merged, conflicts } = mergeThreeWay({ a: { b: 1 } }, { a: { b: 2 } }, { a: { b: 3 } });
    expect(conflicts).toEqual([{ path: "/a/b", base: 1, ours: 2, theirs: 3 }]);
    expect(merged).toEqual({ a: { b: 2 } });
  });

  it("the no-fault copy: one change of that key is no conflict", () => {
    const { merged, conflicts } = mergeThreeWay({ a: { b: 1 } }, { a: { b: 1 } }, { a: { b: 3 } });
    expect(conflicts).toEqual([]);
    expect(merged).toEqual({ a: { b: 3 } });
  });

  it("a key that one side added stays, and two equal additions are one", () => {
    expect(mergeThreeWay({}, { a: 1 }, { b: 2 })).toEqual({ merged: { a: 1, b: 2 }, conflicts: [] });
    expect(mergeThreeWay({}, { a: 1 }, { a: 1 })).toEqual({ merged: { a: 1 }, conflicts: [] });
  });

  it("two different additions of one key are a conflict with no base", () => {
    expect(mergeThreeWay({}, { a: 1 }, { a: 2 }).conflicts).toEqual([{ path: "/a", base: undefined, ours: 1, theirs: 2 }]);
  });

  it("a key that one side removed leaves when the other side kept it", () => {
    expect(mergeThreeWay({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 })).toEqual({ merged: { a: 1 }, conflicts: [] });
  });

  it("a removal against a change is a conflict, and a parent that one side removed is not made again", () => {
    const parent = mergeThreeWay({ p: { x: 5, y: 1 } }, {}, { p: { x: 1, y: 1 } });
    expect(parent.conflicts).toEqual([{ path: "/p", base: { x: 5, y: 1 }, ours: undefined, theirs: { x: 1, y: 1 } }]);
    expect(parent.merged).toEqual({});
  });

  it("null is a value, not a removal", () => {
    expect(mergeThreeWay({ a: 1 }, { a: null }, { a: 1 })).toEqual({ merged: { a: null }, conflicts: [] });
    expect(mergeThreeWay({ a: 1 }, { a: null }, {}).conflicts).toEqual([{ path: "/a", base: 1, ours: null, theirs: undefined }]);
  });

  it("the path of a key escapes its characters", () => {
    expect(mergeThreeWay({ "a/b": 1 }, { "a/b": 2 }, { "a/b": 3 }).conflicts[0]?.path).toBe("/a~1b");
  });

  it("a key __proto__ stays data, and the merge changes no prototype", () => {
    const ours = JSON.parse('{"__proto__":{"polluted":true},"a":1}') as JsonValue;
    const theirs = JSON.parse('{"__proto__":{"polluted":true},"b":2}') as JsonValue;
    const { merged, conflicts } = mergeThreeWay({}, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(Object.getOwnPropertyNames(merged)).toContain("__proto__");
    expect((merged as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("mergeThreeWay: arrays merge whole", () => {
  it("one changed side wins whole", () => {
    expect(mergeThreeWay(["a"], ["a", "b"], ["a"])).toEqual({ merged: ["a", "b"], conflicts: [] });
  });

  it("two changed sides are a conflict, with no merge of items", () => {
    expect(mergeThreeWay(["a"], ["a", "b"], ["a", "c"]).conflicts).toEqual([
      { path: "", base: ["a"], ours: ["a", "b"], theirs: ["a", "c"] },
    ]);
  });

  it("an array against an object is a conflict", () => {
    expect(mergeThreeWay({ a: 1 }, [1], { a: 2 }).conflicts).toHaveLength(1);
  });
});

describe("mergeThreeWay: no value at the root", () => {
  it("a value that is absent from theirs leaves when ours equals the base", () => {
    expect(mergeThreeWay({ a: 1 }, { a: 1 }, undefined)).toEqual({ merged: undefined, conflicts: [] });
  });

  it("the same with a change in ours is a conflict at the root", () => {
    expect(mergeThreeWay({ a: 1 }, { a: 2 }, undefined).conflicts).toEqual([
      { path: "", base: { a: 1 }, ours: { a: 2 }, theirs: undefined },
    ]);
  });

  it("an input that is not JSON is refused", () => {
    expect(() => mergeThreeWay(Number.NaN, 1, 1)).toThrow();
    expect(() => mergeThreeWay(1, new Date() as unknown as JsonValue, 1)).toThrow();
  });
});
