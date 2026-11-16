/**
 * The root entry exports isPlainObject, so an app does not keep its own copy of the check.
 */

import { describe, expect, it } from "vitest";
import { isPlainObject } from "./index.js";

class Point {
  x = 1;
}

describe("isPlainObject from the root entry", () => {
  it("accepts an object literal and an object with a null prototype", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(JSON.parse('{"__proto__":1}'))).toBe(true);
  });

  it("refuses arrays, class instances, null and primitives", () => {
    for (const value of [[], new Point(), new Date(0), new Map(), null, undefined, 0, "a", true]) {
      expect(isPlainObject(value)).toBe(false);
    }
  });
});
