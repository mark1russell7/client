/**
 * JSON Pointer (RFC 6901) and the path query. The examples of section 5 and section 6 of the RFC,
 * and the refusal of the prototype keys (roadmap R6).
 */

import { describe, expect, it } from "vitest";
import { lookup, parsePointer } from "./pointer.js";
import { parsePath, queryPath } from "./path.js";
import { formatPointer, JsonError, type JsonValue } from "./value.js";

const RFC_DOCUMENT: JsonValue = JSON.parse('{"foo":["bar","baz"],"":0,"a/b":1,"c%d":2,"e^f":3,"g|h":4,"i\\\\j":5,"k\\"l":6," ":7,"m~n":8}') as JsonValue;

function at(pointer: string): JsonValue | undefined {
  const found = lookup(RFC_DOCUMENT, parsePointer(pointer));
  return found.found ? found.value : undefined;
}

describe("JSON Pointer", () => {
  it.each([
    ["", RFC_DOCUMENT],
    ["/foo", ["bar", "baz"]],
    ["/foo/0", "bar"],
    ["/", 0],
    ["/a~1b", 1],
    ["/c%d", 2],
    ["/e^f", 3],
    ["/g|h", 4],
    ["/i\\j", 5],
    ['/k"l', 6],
    ["/ ", 7],
    ["/m~0n", 8],
  ])("gives the value of %j (RFC 6901, section 5)", (pointer, value) => {
    expect(at(pointer)).toEqual(value);
  });

  it.each([
    ["#", RFC_DOCUMENT],
    ["#/foo", ["bar", "baz"]],
    ["#/foo/0", "bar"],
    ["#/", 0],
    ["#/a~1b", 1],
    ["#/c%25d", 2],
    ["#/e%5Ef", 3],
    ["#/g%7Ch", 4],
    ["#/i%5Cj", 5],
    ["#/k%22l", 6],
    ["#/%20", 7],
    ["#/m~0n", 8],
  ])("gives the value of the fragment %j (RFC 6901, section 6)", (pointer, value) => {
    expect(at(pointer)).toEqual(value);
  });

  it("finds nothing at an index that is not canonical, at - and after the end", () => {
    for (const pointer of ["/foo/01", "/foo/-", "/foo/2", "/foo/-1", "/foo/x", "/missing", "/foo/0/x", "/ /x"]) {
      expect(at(pointer), pointer).toBeUndefined();
    }
  });

  it("reads only own keys", () => {
    expect(lookup({ a: 1 }, ["toString"])).toEqual({ found: false });
    expect(lookup([1, 2], ["length"])).toEqual({ found: false });
  });

  it.each(["foo", "/~2", "/a~", "#/%E0%A4%A"])("refuses the bad pointer %j", (pointer) => {
    expect(() => parsePointer(pointer)).toThrow(expect.objectContaining({ code: "INVALID_POINTER" }));
  });

  it.each(["/__proto__", "/a/constructor", "#/prototype", "/x/__proto__/polluted"])("refuses the prototype key in %j", (pointer) => {
    expect(() => parsePointer(pointer)).toThrow(expect.objectContaining({ code: "PROTOTYPE_KEY" }));
  });

  it("formats tokens with the escapes", () => {
    expect(formatPointer(["a/b", "m~n", 0, ""])).toBe("/a~1b/m~0n/0/");
    expect(parsePointer(formatPointer(["a/b", "m~n", "0", ""]))).toEqual(["a/b", "m~n", "0", ""]);
  });
});

describe("the path query", () => {
  const value = JSON.parse('{"items":[{"id":1,"name":"a","tags":["x"]},{"id":2,"name":"b"},{"id":3}],"meta":{"id":"m","a.b":true}}') as JsonValue;
  const pointers = (path: string): string[] => queryPath(value, path).map((match) => formatPointer(match.tokens));
  const values = (path: string): JsonValue[] => queryPath(value, path).map((match) => match.value);

  it("gives the matches in document order, with their pointers", () => {
    expect(values("items[*].name")).toEqual(["a", "b"]);
    expect(pointers("$.items[*].name")).toEqual(["/items/0/name", "/items/1/name"]);
    expect(values("items[1]")).toEqual([{ id: 2, name: "b" }]);
    expect(values("items[-1].id")).toEqual([3]);
    expect(values("items[5]")).toEqual([]);
    expect(values('meta["a.b"]')).toEqual([true]);
    expect(values("meta['a.b']")).toEqual([true]);
    expect(values("meta.*")).toEqual(["m", true]);
    expect(values("$")).toEqual([value]);
    expect(values("")).toEqual([value]);
    expect(values("[0]")).toEqual([]);
  });

  it("descends at each depth with ..", () => {
    expect(values("$..id")).toEqual([1, 2, 3, "m"]);
    expect(pointers("..tags[0]")).toEqual(["/items/0/tags/0"]);
    expect(values("items..[0]")).toEqual([{ id: 1, name: "a", tags: ["x"] }, "x"]);
    expect(pointers("meta..*")).toEqual(["/meta/id", "/meta/a.b"]);
  });

  it("reads escapes in a quoted key", () => {
    expect(parsePath('["a\\"b"]["c\\\\d"]')).toEqual([
      { kind: "key", key: 'a"b', deep: false },
      { kind: "key", key: "c\\d", deep: false },
    ]);
  });

  it.each(["a b", "a.", "a.[0]", "a[", "a[x]", 'a["b', "a[0", "..", "a[*"])("refuses the bad path %j", (path) => {
    expect(() => parsePath(path)).toThrow(JsonError);
  });

  it.each(["__proto__.x", "a.constructor", '["prototype"]', "$..__proto__"])("refuses the prototype key in %j", (path) => {
    expect(() => parsePath(path)).toThrow(expect.objectContaining({ code: "PROTOTYPE_KEY" }));
  });
});
