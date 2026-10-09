import { describe, it, expect } from "vitest";
import { formatValue, previewValue, snapshot, specialValues } from "./display";

describe("formatValue (deep dive SITE-9)", () => {
  it("shows the values that JSON hides", () => {
    // Before, NaN showed as null under "✓ ok"
    expect(formatValue(NaN)).toBe("NaN");
    expect(formatValue([1, NaN, Infinity, -Infinity, undefined])).toBe("[1, NaN, Infinity, -Infinity, undefined]");
    expect(formatValue({ a: undefined })).toBe('{ "a": undefined }');
    expect(formatValue(undefined)).toBe("undefined");
  });

  it("shows JSON values as JSON", () => {
    const value = { name: "Ada", tags: ["a", "b"], nested: { ok: true, none: null } };
    expect(JSON.parse(formatValue(value))).toEqual(value);
  });

  it("shows other objects in their JavaScript form", () => {
    expect(formatValue(new Map([["a", 1]]))).toBe('Map(1) { "a": 1 }');
    expect(formatValue(new Set([1, 2]))).toBe("Set(2) [1, 2]");
    expect(formatValue(new Date(0))).toBe("Date(1970-01-01T00:00:00.000Z)");
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(formatValue(circular)).toContain("[circular]");
  });

  it("stops after the budget", () => {
    const text = formatValue(Array.from({ length: 100_000 }, (_, index) => index), 100);
    expect(text).toContain("…");
    expect(text.split("\n").length).toBeLessThan(150);
  });

  it("previews a value on one line", () => {
    expect(previewValue({ a: [1, 2, 3] })).toBe('{ "a": [1, 2, 3] }');
    expect(previewValue("x".repeat(100)).length).toBeLessThanOrEqual(48);
  });
});

describe("specialValues", () => {
  it("finds NaN, Infinity and undefined", () => {
    expect([...specialValues({ a: [1, NaN], b: undefined, c: -Infinity })].sort()).toEqual(["Infinity", "NaN", "undefined"]);
    expect(specialValues({ a: 1, b: "x" }).size).toBe(0);
  });
});

describe("snapshot", () => {
  it("copies the value and keeps NaN and undefined", () => {
    const value = { a: [1, NaN], b: undefined };
    const copy = snapshot(value) as typeof value;
    expect(copy).toEqual(value);
    value.a.push(3);
    expect(copy.a).toEqual([1, NaN]);
  });

  it("stops after the budget with a marker", () => {
    const copy = snapshot(Array.from({ length: 10_000 }, () => 1), 10) as unknown[];
    expect(copy.length).toBe(11);
    expect(copy[10]).toEqual({ $truncated: 9990 });
    expect(formatValue(copy)).toContain("9,990 more values");
  });

  it("turns functions and class instances into text", () => {
    class Point {
      constructor(public x: number) {}
    }
    expect(snapshot({ f: () => 1, p: new Point(1) })).toEqual({ f: "[function f]", p: '{ "x": 1 }' });
  });
});
