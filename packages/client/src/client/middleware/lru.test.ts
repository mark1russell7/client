/**
 * The small LRU map of the cache middleware (roadmap 3.3: the core does not depend on
 * client-collections for it).
 */

import { describe, it, expect } from "vitest";
import { LruMap } from "./lru.js";

describe("LruMap", () => {
  it("removes the least recently used key when a write goes over the capacity", () => {
    const evicted: string[] = [];
    const map = new LruMap<string, number>(2, (key) => evicted.push(key));
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    expect(evicted).toEqual(["a"]);
    expect(map.has("a")).toBe(false);
    expect(map.size).toBe(2);
  });

  it("makes a read the most recent use", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.get("a")).toBe(1);
    map.set("c", 3);
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(false);
  });

  it("replaces the value of a key without an eviction", () => {
    const evicted: string[] = [];
    const map = new LruMap<string, number>(2, (key) => evicted.push(key));
    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 10);
    expect(evicted).toEqual([]);
    expect(map.get("a")).toBe(10);
    expect(map.size).toBe(2);
  });

  it("deletes and clears, and gives undefined for a missing key", () => {
    const map = new LruMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.delete("a")).toBe(true);
    expect(map.delete("a")).toBe(false);
    expect(map.get("a")).toBeUndefined();
    map.clear();
    expect(map.size).toBe(0);
  });

  it("refuses a capacity that is not a positive whole number", () => {
    expect(() => new LruMap(0)).toThrow(RangeError);
    expect(() => new LruMap(1.5)).toThrow(RangeError);
  });
});
