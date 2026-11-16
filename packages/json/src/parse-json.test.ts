/**
 * The root entry exports parseJsonOrUndefined, so a program that reads response bodies does not keep its own copy.
 */

import { describe, expect, it } from "vitest";
import { isPlainObject, parseJsonOrUndefined } from "./index.js";

describe("parseJsonOrUndefined from the root entry", () => {
  it("reads each kind of JSON value", () => {
    expect(parseJsonOrUndefined('{"a":[1,"b",null,true]}')).toEqual({ a: [1, "b", null, true] });
    expect(parseJsonOrUndefined("[]")).toEqual([]);
    expect(parseJsonOrUndefined('"text"')).toBe("text");
    expect(parseJsonOrUndefined("0")).toBe(0);
    expect(parseJsonOrUndefined("null")).toBeNull();
  });

  it("gives undefined for a text that is not JSON, and does not throw", () => {
    for (const text of ["", "<html>busy</html>", "package not found", "{", "{'a':1}", "undefined", "NaN"]) {
      expect(parseJsonOrUndefined(text)).toBeUndefined();
    }
  });

  it("keeps a key __proto__ as data", () => {
    const value = parseJsonOrUndefined('{"__proto__":{"polluted":true}}');
    expect(isPlainObject(value)).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
