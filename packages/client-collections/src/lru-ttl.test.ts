/**
 * Regression tests: lruMap over ttlMap (the cache middleware's composition), and the TTL timers.
 *
 * compose() applies right to left, so compose(lruMap, ttlMap)(base) is lru(ttl(base)).
 * When ttlMap expires an entry it deletes it from the layer below, and lruMap never sees it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { compose, hashMap, lruMap, ttlMap, ttlCollection, TTLCache } from "./index.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lruMap over ttlMap", () => {
  it("keeps the size within capacity after entries expire below it", () => {
    vi.useFakeTimers();
    const evicted: string[] = [];
    const ttl = ttlMap<string, number>({ ttl: 100, checkInterval: 50 });
    const map = compose(
      lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }),
      ttl
    )(hashMap<string, number>());

    map.set("a", 1);
    map.set("b", 2);
    vi.advanceTimersByTime(150); // the background check expires "a" and "b"

    map.set("c", 3);
    map.set("d", 4);
    map.set("e", 5); // full: must evict a live entry ("c"), not the expired "a"

    expect(map.size).toBe(2);
    expect(map.has("c")).toBe(false);
    expect(map.has("d")).toBe(true);
    expect(map.has("e")).toBe(true);
    // Expired entries are not evictions
    expect(evicted).toEqual(["c"]);
    (map as unknown as { dispose: () => void }).dispose();
  });

  it("does not keep nodes for expired entries (bounded memory under churn)", () => {
    vi.useFakeTimers();
    const evicted: string[] = [];
    const map = compose(
      lruMap<string, number>({ capacity: 3, onEvict: ({ key }) => evicted.push(key) }),
      ttlMap<string, number>({ ttl: 10, checkInterval: 5 })
    )(hashMap<string, number>());

    // Many short-lived keys: each expires before the next one arrives
    for (let i = 0; i < 1000; i++) {
      map.set(`k${i}`, i);
      vi.advanceTimersByTime(20);
    }
    map.set("x", 1);
    map.set("y", 2);
    map.set("z", 3);
    map.set("w", 4); // full: evicts "x", the least recently used live entry

    expect(map.size).toBe(3);
    expect(evicted).toEqual(["x"]);
    (map as unknown as { dispose: () => void }).dispose();
  });

  it("forgets a node when has() finds the entry expired", () => {
    vi.useFakeTimers();
    const evicted: string[] = [];
    const map = compose(
      lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }),
      ttlMap<string, number>({ ttl: 100, checkInterval: 10_000 })
    )(hashMap<string, number>());

    map.set("a", 1);
    vi.advanceTimersByTime(150);
    expect(map.has("a")).toBe(false);

    map.set("b", 2);
    map.set("c", 3);
    map.set("d", 4); // evicts "b", not the long-gone "a"

    expect(evicted).toEqual(["b"]);
    expect(map.size).toBe(2);
    (map as unknown as { dispose: () => void }).dispose();
  });
});

describe("TTL timers", () => {
  function captureInterval(): { unref: ReturnType<typeof vi.fn> } {
    const timer = { unref: vi.fn() };
    vi.spyOn(globalThis, "setInterval").mockReturnValue(timer as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
    return timer;
  }

  it("ttlMap does not keep the process alive", () => {
    const timer = captureInterval();
    ttlMap<string, number>({ ttl: 1000 })(hashMap<string, number>());
    expect(timer.unref).toHaveBeenCalled();
  });

  it("ttlCollection does not keep the process alive", () => {
    const timer = captureInterval();
    const base = { add: () => true, remove: () => true } as never;
    ttlCollection<string>({ ttl: 1000 })(base);
    expect(timer.unref).toHaveBeenCalled();
  });

  it("TTLCache does not keep the process alive", () => {
    const timer = captureInterval();
    new TTLCache<string, number>(1000);
    expect(timer.unref).toHaveBeenCalled();
  });
});
