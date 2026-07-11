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
