import { describe, it, expect } from "vitest";
import { defaultKeyGenerator, stableStringify } from "./cache.js";
import type { Method } from "../types.js";

const method: Method = { service: "mongo", operation: "documents.find" };

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
    const a = stableStringify({ x: { y: { z: 1 } } });
    const b = stableStringify({ x: { y: { z: 2 } } });
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
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
    expect(stableStringify([{ a: 1 }])).toBe(stableStringify([{ a: 1 }]));
  });
});

describe("the cache key of a payload", () => {
  it("is the JSON text of a JSON payload, with the keys in order", () => {
    const payload = { b: [1, "two", { d: null, c: true }, []], a: { y: 2, x: 1 }, e: {} };
    expect(JSON.parse(stableStringify(payload))).toEqual(payload);
    expect(stableStringify(payload)).toBe(stableStringify({ e: {}, a: { x: 1, y: 2 }, b: [1, "two", { c: true, d: null }, []] }));
  });

  it("keeps apart the payloads that differ only in type or in the bounds of their items", () => {
    expect(stableStringify("1")).not.toBe(stableStringify(1));
    expect(stableStringify([1, 2])).not.toBe(stableStringify({ 0: 1, 1: 2 }));
    expect(stableStringify([1, 23])).not.toBe(stableStringify([12, 3]));
    expect(defaultKeyGenerator(method, { id: "1" })).not.toBe(defaultKeyGenerator(method, { id: 1 }));
  });

  it("gives a key to a bigint payload, and keeps it apart from other bigints and from numbers", () => {
    expect(() => stableStringify({ id: 1n })).not.toThrow();
    expect(stableStringify({ id: 1n })).not.toBe(stableStringify({ id: 2n }));
    expect(stableStringify(1n)).not.toBe(stableStringify(1));
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
});
