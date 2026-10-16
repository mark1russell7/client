/**
 * JSON Patch (RFC 6902), the diff and the merge patch (RFC 7386): the examples of the RFCs, the
 * refusal of the prototype keys (roadmap R6), and property tests of the diff with fast-check.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { diffJson } from "./diff.js";
import { mergePatch } from "./merge.js";
import { applyPatch, type PatchOperation } from "./patch.js";
import { parsePointer } from "./pointer.js";
import { cloneJson, hasOwn, isPlainObject, jsonEqual, put, type JsonValue } from "./value.js";

const parse = (text: string): JsonValue => JSON.parse(text) as JsonValue;

/** The text of a value with sorted keys: a comparison that does not use `jsonEqual`. */
function canonical(value: JsonValue): string {
  const sorted = (current: JsonValue): JsonValue => {
    if (Array.isArray(current)) return current.map(sorted);
    if (current === null || typeof current !== "object") return current === 0 ? 0 : current;
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(current).sort()) put(out, key, sorted(current[key]!));
    return out;
  };
  return JSON.stringify(sorted(value));
}

describe("applyPatch: the examples of RFC 6902, appendix A", () => {
  it.each<[string, string, string, string]>([
    ["A.1 add an object member", '{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux"}]', '{"baz":"qux","foo":"bar"}'],
    ["A.2 add an array element", '{"foo":["bar","baz"]}', '[{"op":"add","path":"/foo/1","value":"qux"}]', '{"foo":["bar","qux","baz"]}'],
    ["A.3 remove an object member", '{"baz":"qux","foo":"bar"}', '[{"op":"remove","path":"/baz"}]', '{"foo":"bar"}'],
    ["A.4 remove an array element", '{"foo":["bar","qux","baz"]}', '[{"op":"remove","path":"/foo/1"}]', '{"foo":["bar","baz"]}'],
    ["A.5 replace a value", '{"baz":"qux","foo":"bar"}', '[{"op":"replace","path":"/baz","value":"boo"}]', '{"baz":"boo","foo":"bar"}'],
    [
      "A.6 move a value",
      '{"foo":{"bar":"baz","waldo":"fred"},"qux":{"corge":"grault"}}',
      '[{"op":"move","from":"/foo/waldo","path":"/qux/thud"}]',
      '{"foo":{"bar":"baz"},"qux":{"corge":"grault","thud":"fred"}}',
    ],
    ["A.7 move an array element", '{"foo":["all","grass","cows","eat"]}', '[{"op":"move","from":"/foo/1","path":"/foo/3"}]', '{"foo":["all","cows","eat","grass"]}'],
    ["A.8 test a value", '{"baz":"qux","foo":["a",2,"c"]}', '[{"op":"test","path":"/baz","value":"qux"},{"op":"test","path":"/foo/1","value":2}]', '{"baz":"qux","foo":["a",2,"c"]}'],
    ["A.10 add a nested member object", '{"foo":"bar"}', '[{"op":"add","path":"/child","value":{"grandchild":{}}}]', '{"foo":"bar","child":{"grandchild":{}}}'],
    ["A.11 ignore unknown members", '{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux","xyz":123}]', '{"foo":"bar","baz":"qux"}'],
    ["A.14 the order of the escapes", '{"/":9,"~1":10}', '[{"op":"test","path":"/~01","value":10}]', '{"/":9,"~1":10}'],
    ["A.16 add an array value", '{"foo":["bar"]}', '[{"op":"add","path":"/foo/-","value":["abc","def"]}]', '{"foo":["bar",["abc","def"]]}'],
    ["copy", '{"a":{"b":[1]}}', '[{"op":"copy","from":"/a","path":"/c"},{"op":"add","path":"/c/b/-","value":2}]', '{"a":{"b":[1]},"c":{"b":[1,2]}}'],
    ["replace the whole value", '{"a":1}', '[{"op":"replace","path":"","value":[1]}]', "[1]"],
    ["add the whole value", '{"a":1}', '[{"op":"add","path":"","value":null}]', "null"],
    ["move to the same location", '{"a":1}', '[{"op":"move","from":"/a","path":"/a"}]', '{"a":1}'],
  ])("%s", (_name, document, patch, expected) => {
    expect(applyPatch(parse(document), parse(patch) as unknown as PatchOperation[])).toEqual(parse(expected));
  });

  it.each<[string, string, string, string]>([
    ["A.9 a test that fails", '{"baz":"qux"}', '[{"op":"test","path":"/baz","value":"bar"}]', "TEST_FAILED"],
    ["A.12 add to a target that does not exist", '{"foo":"bar"}', '[{"op":"add","path":"/baz/bat","value":"qux"}]', "INVALID_PATCH"],
    ["A.15 a string is not a number", '{"/":9,"~1":10}', '[{"op":"test","path":"/~01","value":"10"}]', "TEST_FAILED"],
    ["a test of a location that does not exist", "{}", '[{"op":"test","path":"/a","value":null}]', "TEST_FAILED"],
    ["an index after the end", "[1]", '[{"op":"add","path":"/2","value":0}]', "INVALID_PATCH"],
    ["an index with a leading zero", "[1,2]", '[{"op":"replace","path":"/01","value":0}]', "INVALID_PATCH"],
    ["a remove of the whole value", "[1]", '[{"op":"remove","path":""}]', "INVALID_PATCH"],
    ["a remove of a key that does not exist", "{}", '[{"op":"remove","path":"/a"}]', "INVALID_PATCH"],
    ["a replace of a key that does not exist", "{}", '[{"op":"replace","path":"/a","value":1}]', "INVALID_PATCH"],
    ["a move into itself", '{"a":{"b":1}}', '[{"op":"move","from":"/a","path":"/a/c"}]', "INVALID_PATCH"],
    ["an add without a value", "{}", '[{"op":"add","path":"/a"}]', "INVALID_PATCH"],
    ["a copy without from", "{}", '[{"op":"copy","path":"/a"}]', "INVALID_PATCH"],
    ["a copy from a location that does not exist", "{}", '[{"op":"copy","from":"/x","path":"/a"}]', "INVALID_PATCH"],
    ["an unknown operation", "{}", '[{"op":"merge","path":"/a"}]', "INVALID_PATCH"],
    ["an add into a string", '{"a":"text"}', '[{"op":"add","path":"/a/b","value":1}]', "INVALID_PATCH"],
    ["a prototype key in path", "{}", '[{"op":"add","path":"/__proto__/polluted","value":true}]', "PROTOTYPE_KEY"],
    ["a prototype key in from", '{"a":1}', '[{"op":"copy","from":"/constructor","path":"/a"}]', "PROTOTYPE_KEY"],
    ["a prototype key at the end", "{}", '[{"op":"add","path":"/prototype","value":{}}]', "PROTOTYPE_KEY"],
  ])("refuses %s", (_name, document, patch, code) => {
    const value = parse(document);
    const before = canonical(value);
    expect(() => applyPatch(value, parse(patch) as unknown as PatchOperation[])).toThrow(expect.objectContaining({ code }));
    // The input does not change
    expect(canonical(value)).toBe(before);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("applies all operations or none, and does not change its input", () => {
    const value = parse('{"a":[1,2],"b":{"c":1}}');
    const result = applyPatch(value, [
      { op: "add", path: "/a/-", value: 3 },
      { op: "remove", path: "/b/c" },
    ]);
    expect(result).toEqual({ a: [1, 2, 3], b: {} });
    expect(value).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(() =>
      applyPatch(value, [
        { op: "add", path: "/a/-", value: 3 },
        { op: "test", path: "/a/0", value: 9 },
      ]),
    ).toThrow(/Operation 1 \(test \/a\/0\)/);
    expect(value).toEqual({ a: [1, 2], b: { c: 1 } });
  });

  it("keeps a key __proto__ of a value as data", () => {
    const value = parse('{"__proto__":{"polluted":true}}');
    const result = applyPatch({}, [{ op: "add", path: "/a", value }]) as Record<string, Record<string, unknown>>;
    expect(hasOwn(result["a"]!, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result["a"])).toBe(Object.prototype);
    expect(result["a"]!["polluted"]).toBeUndefined();
  });
});

describe("mergePatch: the examples of RFC 7386, appendix A", () => {
  it.each<[string, string, string]>([
    ['{"a":"b"}', '{"a":"c"}', '{"a":"c"}'],
    ['{"a":"b"}', '{"b":"c"}', '{"a":"b","b":"c"}'],
    ['{"a":"b"}', '{"a":null}', "{}"],
    ['{"a":"b","b":"c"}', '{"a":null}', '{"b":"c"}'],
    ['{"a":["b"]}', '{"a":"c"}', '{"a":"c"}'],
    ['{"a":"c"}', '{"a":["b"]}', '{"a":["b"]}'],
    ['{"a":{"b":"c"}}', '{"a":{"b":"d","c":null}}', '{"a":{"b":"d"}}'],
    ['{"a":[{"b":"c"}]}', '{"a":[1]}', '{"a":[1]}'],
    ['["a","b"]', '["c","d"]', '["c","d"]'],
    ['{"a":"b"}', '["c"]', '["c"]'],
    ['{"a":"foo"}', "null", "null"],
    ['{"a":"foo"}', '"bar"', '"bar"'],
    ['{"e":null}', '{"a":1}', '{"e":null,"a":1}'],
    ["[1,2]", '{"a":"b","c":null}', '{"a":"b"}'],
    ["{}", '{"a":{"bb":{"ccc":null}}}', '{"a":{"bb":{}}}'],
  ])("%s merged with %s gives %s", (target, patch, expected) => {
    const value = parse(target);
    const before = canonical(value);
    expect(mergePatch(value, parse(patch))).toEqual(parse(expected));
    expect(canonical(value)).toBe(before);
  });

  it.each(['{"__proto__":{"polluted":true}}', '{"a":{"constructor":{"prototype":{"polluted":true}}}}', '{"prototype":null}'])("refuses the prototype key in %s", (patch) => {
    expect(() => mergePatch({}, parse(patch))).toThrow(expect.objectContaining({ code: "PROTOTYPE_KEY" }));
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("keeps a key __proto__ of the target as data", () => {
    const result = mergePatch(parse('{"__proto__":{"x":1}}'), { b: 2 }) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(["__proto__", "b"]);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});

// =============================================================================
// The diff
// =============================================================================

/** JSON values with few keys and small numbers, so two values share parts. */
const { similar } = fc.letrec<{ similar: JsonValue }>((tie) => ({
  similar: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constantFrom<JsonValue>(null, true, false, 0, 1, 2, "a", "b", ""),
    fc.array(tie("similar"), { maxLength: 6 }),
    fc
      .array(fc.tuple(fc.constantFrom("a", "b", "c", "d", "__proto__", "constructor", "x/y", "m~n"), tie("similar")), { maxLength: 5 })
      .map((entries) => {
        const out: Record<string, JsonValue> = {};
        for (const [key, value] of entries) put(out, key, value);
        return out;
      }),
  ),
}));

/** A value and a copy of it with random edits. */
const edited: fc.Arbitrary<[JsonValue, JsonValue]> = similar.chain((a) =>
  fc.tuple(fc.constant(a), fc.array(fc.tuple(fc.nat(), similar), { maxLength: 4 })).map(([value, edits]) => {
    const b = cloneJson(value);
    for (const [seed, replacement] of edits) {
      // Each edit replaces or adds a part at a place of the value
      const containers: Array<JsonValue[] | Record<string, JsonValue>> = [];
      const visit = (node: JsonValue): void => {
        if (node === null || typeof node !== "object") return;
        containers.push(node);
        (Array.isArray(node) ? node : Object.values(node)).forEach(visit);
      };
      visit(b);
      const container = containers[seed % Math.max(1, containers.length)];
      if (container === undefined) continue;
      if (Array.isArray(container)) {
        if (seed % 3 === 0 && container.length > 0) container.splice(seed % container.length, 1);
        else container.splice(seed % (container.length + 1), 0, replacement);
      } else {
        const keys = Object.keys(container);
        if (seed % 3 === 0 && keys.length > 0) delete container[keys[seed % keys.length]!];
        else put(container, ["a", "b", "q", "__proto__"][seed % 4]!, replacement);
      }
    }
    return [value, b] as [JsonValue, JsonValue];
  }),
);

function checkDiff(a: JsonValue, b: JsonValue): void {
  const before = canonical(a);
  const patch = diffJson(a, b);
  const result = applyPatch(a, patch);
  expect(canonical(result)).toBe(canonical(b));
  expect(jsonEqual(result, b)).toBe(true);
  // The diff does not change its inputs, and its patch names no prototype key
  expect(canonical(a)).toBe(before);
  for (const operation of patch) {
    expect(() => parsePointer(operation.path)).not.toThrow();
  }
}

describe("diffJson", () => {
  it("gives an empty patch for equal values, also with another key order", () => {
    expect(diffJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toEqual([]);
    expect(diffJson(-0, 0)).toEqual([]);
  });

  it("gives small patches for small changes", () => {
    expect(diffJson({ a: 1, b: 2 }, { a: 1, c: 3 })).toEqual([
      { op: "remove", path: "/b" },
      { op: "add", path: "/c", value: 3 },
    ]);
    expect(diffJson([1, 2, 3, 4], [1, 9, 3, 4])).toEqual([{ op: "replace", path: "/1", value: 9 }]);
    // The shared start and end stay: an insert at the start is one add, not a replace of each item
    expect(diffJson([1, 2, 3], [0, 1, 2, 3])).toEqual([{ op: "add", path: "/0", value: 0 }]);
    expect(diffJson([1, 2, 3, 4, 5], [1, 5])).toEqual([
      { op: "remove", path: "/3" },
      { op: "remove", path: "/2" },
      { op: "remove", path: "/1" },
    ]);
    expect(diffJson([1, 2, 3], [1, 7, 8, 3])).toEqual([
      { op: "replace", path: "/1", value: 7 },
      { op: "add", path: "/2", value: 8 },
    ]);
    expect(diffJson({ "a/b": { "m~n": 1 } }, { "a/b": { "m~n": 2 } })).toEqual([{ op: "replace", path: "/a~1b/m~0n", value: 2 }]);
  });

  it("replaces the object that holds a different prototype key", () => {
    const a = parse('{"x":{"__proto__":1,"y":1}}');
    const b = parse('{"x":{"__proto__":2,"y":1}}');
    const patch = diffJson(a, b);
    expect(patch).toHaveLength(1);
    expect(patch[0]).toMatchObject({ op: "replace", path: "/x" });
    checkDiff(a, b);
    checkDiff(parse('{"constructor":1}'), parse("{}"));
  });

  it("gives a patch that changes a into b: any two JSON values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (a, b) => checkDiff(a as JsonValue, b as JsonValue)),
      { numRuns: 300 },
    );
  });

  it("gives a patch that changes a into b: a value and an edited copy", () => {
    fc.assert(
      fc.property(edited, ([a, b]) => checkDiff(a, b)),
      { numRuns: 500 },
    );
  });

  it("gives a patch that changes a into b: two values with shared keys", () => {
    fc.assert(
      fc.property(similar, similar, (a, b) => checkDiff(a, b)),
      { numRuns: 500 },
    );
  });
});

describe("jsonEqual and cloneJson", () => {
  it("compares objects without the order of the keys, and arrays with it", () => {
    expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({ a: undefined as unknown as JsonValue }, { b: 1 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
  });

  it("copies with own data properties", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const copy = cloneJson(value as JsonValue);
        expect(canonical(copy)).toBe(canonical(value as JsonValue));
        if (isPlainObject(copy)) expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
      }),
      { numRuns: 200 },
    );
  });
});
