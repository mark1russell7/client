import { describe, it, expect } from "vitest";
import { defaultKeyGenerator } from "./cache.js";
import type { Method } from "../types.js";

const method: Method = { service: "mongo", operation: "documents.find" };

/** The part of the key of a call without metadata that holds the payload. */
const prefix = defaultKeyGenerator(method, null).slice(0, -"null".length);
function text(payload: unknown): string {
  const key = defaultKeyGenerator(method, payload);
  expect(key.startsWith(prefix)).toBe(true);
  return key.slice(prefix.length);
}

describe("cache key generation (regression: BUGS-2026-07 C1)", () => {
  it("produces DIFFERENT keys for payloads that differ only in a nested field", () => {
    // The old array-replacer stringify collapsed both of these to `{"collection":"users","filter":{}}`,
    // so the second caller received the first caller's cached response.
    const a = defaultKeyGenerator(method, { collection: "users", filter: { status: "active" } });
    const b = defaultKeyGenerator(method, { collection: "users", filter: { status: "inactive" } });
    expect(a).not.toBe(b);
  });

  it("produces the SAME key regardless of key order (structural equality)", () => {
    const a = defaultKeyGenerator(method, { collection: "users", filter: { a: 1, b: 2 } });
    const b = defaultKeyGenerator(method, { filter: { b: 2, a: 1 }, collection: "users" });
    expect(a).toBe(b);
  });

  it("distinguishes deeply nested differences", () => {
    const a = text({ x: { y: { z: 1 } } });
    const b = text({ x: { y: { z: 2 } } });
    expect(a).not.toBe(b);
  });

  it("does not throw on null / undefined / primitive payloads", () => {
    expect(() => defaultKeyGenerator(method, null)).not.toThrow();
    expect(() => defaultKeyGenerator(method, undefined)).not.toThrow();
    expect(() => defaultKeyGenerator(method, 42)).not.toThrow();
    expect(() => defaultKeyGenerator(method, "raw")).not.toThrow();
    // Distinct primitives must not collide.
    expect(defaultKeyGenerator(method, 1)).not.toBe(defaultKeyGenerator(method, 2));
  });

  it("handles arrays element-wise and order-sensitively", () => {
    expect(text([1, 2, 3])).not.toBe(text([3, 2, 1]));
    expect(text([{ a: 1 }])).toBe(text([{ a: 1 }]));
  });
});

describe("the cache key of a payload", () => {
  it("is the JSON text of a JSON payload, with the keys in order", () => {
    const payload = { b: [1, "two", { d: null, c: true }, []], a: { y: 2, x: 1 }, e: {} };
    expect(JSON.parse(text(payload))).toEqual(payload);
    expect(text(payload)).toBe(text({ e: {}, a: { x: 1, y: 2 }, b: [1, "two", { c: true, d: null }, []] }));
  });

  it("keeps apart the payloads that differ only in type or in the bounds of their items", () => {
    expect(text("1")).not.toBe(text(1));
    expect(text([1, 2])).not.toBe(text({ 0: 1, 1: 2 }));
    expect(text([1, 23])).not.toBe(text([12, 3]));
    expect(defaultKeyGenerator(method, { id: "1" })).not.toBe(defaultKeyGenerator(method, { id: 1 }));
  });

  it("gives a key to a bigint payload, and keeps it apart from other bigints and from numbers", () => {
    expect(() => text({ id: 1n })).not.toThrow();
    expect(text({ id: 1n })).not.toBe(text({ id: 2n }));
    expect(text(1n)).not.toBe(text(1));
  });

  it("keeps the versions of a method apart", () => {
    const v1 = defaultKeyGenerator({ ...method, version: "v1" }, {});
    const v2 = defaultKeyGenerator({ ...method, version: "v2" }, {});
    expect(v1).not.toBe(v2);
    expect(v1).not.toBe(defaultKeyGenerator(method, {}));
  });

  it("ignores a metadata key whose value is undefined: it is the same as an absent key", () => {
    expect(defaultKeyGenerator(method, {}, { tenant: undefined })).toBe(defaultKeyGenerator(method, {}, {}));
    expect(defaultKeyGenerator(method, {}, { tenant: "a" })).not.toBe(defaultKeyGenerator(method, {}, {}));
  });

  it("keeps apart the payloads that differ only in a Date, a RegExp, a Map or a Set (CLI-128)", () => {
    const pairs: Array<[unknown, unknown]> = [
      [{ since: new Date(0) }, { since: new Date(1_000) }],
      [{ since: new Date(Number.NaN) }, { since: new Date(0) }],
      [{ match: /a/ }, { match: /a/i }],
      [{ m: new Map([["a", 1]]) }, { m: new Map([["a", 2]]) }],
      [{ s: new Set([1]) }, { s: new Set([2]) }],
    ];
    for (const [a, b] of pairs) expect(text(a)).not.toBe(text(b));
    expect(text(new Date(0))).toBe("Date(0)");
    expect(text(/a+"/gi)).toBe('RegExp("/a+\\"/gi")');
    expect(text(new Map<unknown, unknown>([["b", 2n], [1, { y: 1, x: 0 }]]))).toBe('Map(["b",2n],[1,{"x":0,"y":1}])');
    expect(text(new Set(["b", "a"]))).toBe('Set("a","b")');
    expect(text(new Set([2, 1]))).toBe(text(new Set([1, 2])));
  });

  it("throws a TypeError for a payload with a function, a symbol or a cycle (CLI-128)", () => {
    const cycle: Record<string, unknown> = { a: 1 };
    cycle["self"] = cycle;
    for (const payload of [{ f: () => 1 }, { s: Symbol("s") }, cycle]) {
      expect(() => defaultKeyGenerator(method, payload)).toThrow(TypeError);
    }
    expect(() => defaultKeyGenerator(method, {}, { hook: () => 1 })).toThrow(TypeError);
  });
});
