/**
 * Regression tests: the composite map methods go through the behaviors (BUGS-2026-07 L13).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { compose, hashMap, lruMap, ttlMap } from "./index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("lruMap composite methods", () => {
  it("setIfAbsent and computeIfAbsent respect the capacity", () => {
    const evicted: string[] = [];
    const map = lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) })(
      hashMap<string, number>()
    );

    map.set("a", 1);
    map.set("b", 2);
    map.setIfAbsent("c", 3);
    map.computeIfAbsent("d", () => 4);

    expect(map.size).toBe(2);
    expect(evicted).toEqual(["a", "b"]);
    expect(map.has("c")).toBe(true);
    expect(map.has("d")).toBe(true);
  });

  it("replace updates the recency and the value that onEvict reports", () => {
    // HashMap.replace changes its buckets directly; through the behavior it must also
    // refresh the LRU entry (before the fix, onEvict reported the old value 1)
    const evicted: Array<[string, number]> = [];
    const map = lruMap<string, number>({ capacity: 2, onEvict: ({ key, value }) => evicted.push([key, value]) })(
      hashMap<string, number>()
    );

    map.set("a", 1);
    map.set("b", 2);
    map.replace("b", 20);
    map.replace("a", 10); // "a" is now the most recently used
    map.set("c", 3); // evicts "b"

    expect(evicted).toEqual([["b", 20]]);
    expect(map.get("a")).toBe(10);
  });

  it("merge, compute and putAll keep the usual semantics", () => {
    const map = lruMap<string, number>({ capacity: 10 })(hashMap<string, number>());

    map.merge("a", 1, (x, y) => x + y);
    map.merge("a", 5, (x, y) => x + y);
    expect(map.get("a")).toBe(6);

    map.compute("a", () => undefined);
    expect(map.has("a")).toBe(false);

    map.putAll([{ key: "x", value: 1 }, { key: "y", value: 2 }] as never);
    expect(map.size).toBe(2);
    expect(map.setIfAbsent("x", 99)).toBe(1);
    expect(map.replaceEntry("y", 2, 3)).toBe(true);
    expect(map.get("y")).toBe(3);
    expect(map.deleteEntry("y", 99)).toBe(false);
  });
});

describe("ttlMap composite methods", () => {
  it("an entry made by computeIfAbsent expires", () => {
    vi.useFakeTimers();
    const map = ttlMap<string, number>({ ttl: 100, checkInterval: 10_000 })(hashMap<string, number>());

    map.computeIfAbsent("a", () => 1);
    vi.advanceTimersByTime(150);

    expect(map.has("a")).toBe(false);
    map.dispose();
  });

  it("works under lruMap, as in the cache middleware", () => {
    vi.useFakeTimers();
    const map = compose(
      lruMap<string, number>({ capacity: 2 }),
      ttlMap<string, number>({ ttl: 100, checkInterval: 10_000 })
    )(hashMap<string, number>());

    map.setIfAbsent("a", 1);
    vi.advanceTimersByTime(150);
    expect(map.has("a")).toBe(false);
    (map as unknown as { dispose: () => void }).dispose();
  });
});
