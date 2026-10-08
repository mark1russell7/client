import { describe, it, expect, vi, afterEach } from "vitest";
import { compose, hashMap, lruMap, ttlMap, InMemoryStorage } from "./index.js";

describe("hashMap", () => {
  it("stores, reads and removes entries", () => {
    const map = hashMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);

    expect(map.size).toBe(2);
    expect(map.has("a")).toBe(true);
    expect(map.get("a")).toBe(1);
    expect(map.delete("a")).toBe(1);
    expect(map.has("a")).toBe(false);
    expect(map.size).toBe(1);

    map.clear();
    expect(map.size).toBe(0);
  });

  it("throws on get of a missing key (callers check has first)", () => {
    expect(() => hashMap<string, number>().get("missing")).toThrow("Key not found");
  });

  it("builds from entries", () => {
    const map = hashMap<string, number>([["x", 1], ["y", 2]]);
    expect(map.get("y")).toBe(2);
  });
});

describe("lruMap", () => {
  it("evicts the least recently used entry when full", () => {
    const evicted: string[] = [];
    const map = lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) })(
      hashMap<string, number>()
    );

    map.set("a", 1);
    map.set("b", 2);
    expect(map.isFull).toBe(true);

    map.get("a"); // "b" is now the least recently used
    map.set("c", 3);

    expect(evicted).toEqual(["b"]);
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(true);
    expect(map.size).toBe(2);
  });

  it("updates an existing key without evicting", () => {
    const onEvict = vi.fn();
    const map = lruMap<string, number>({ capacity: 2, onEvict })(hashMap<string, number>());

    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 10);

    expect(onEvict).not.toHaveBeenCalled();
    expect(map.get("a")).toBe(10);
  });
});

describe("ttlMap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires entries after the ttl", () => {
    vi.useFakeTimers();
    const map = ttlMap<string, number>({ ttl: 1000, checkInterval: 10_000 })(hashMap<string, number>());

    map.set("a", 1);
    vi.advanceTimersByTime(999);
    expect(map.has("a")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(map.has("a")).toBe(false);
    map.dispose();
  });

  it("removes expired entries in the background and reports them", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const base = hashMap<string, number>();
    const map = ttlMap<string, number>({ ttl: 1000, checkInterval: 500, onExpire })(base);

    map.set("a", 1);
    vi.advanceTimersByTime(1500);

    expect(base.has("a")).toBe(false);
    expect(onExpire).toHaveBeenCalledWith(expect.objectContaining({ key: "a", value: 1 }));
    map.dispose();
  });

  it("restarts the ttl when a key is set again", () => {
    vi.useFakeTimers();
    const map = ttlMap<string, number>({ ttl: 1000, checkInterval: 10_000 })(hashMap<string, number>());

    map.set("a", 1);
    vi.advanceTimersByTime(800);
    map.set("a", 2);
    vi.advanceTimersByTime(800);

    expect(map.has("a")).toBe(true);
    expect(map.get("a")).toBe(2);
    map.dispose();
  });
});

describe("compose(lruMap, ttlMap) — the cache middleware's map", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies both behaviors", () => {
    vi.useFakeTimers();
    const ttl = ttlMap<string, number>({ ttl: 1000, checkInterval: 10_000 });
    const map = compose(lruMap<string, number>({ capacity: 2 }), ttl)(hashMap<string, number>());

    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3); // evicts "a"
    expect(map.has("a")).toBe(false);
    expect(map.has("c")).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(map.has("b")).toBe(false); // expired
    (map as unknown as { dispose: () => void }).dispose();
  });
});

describe("InMemoryStorage", () => {
  it("implements the CollectionStorage operations", async () => {
    const storage = new InMemoryStorage<{ id: string; n: number }>();

    await storage.set("1", { id: "1", n: 1 });
    await storage.setBatch([["2", { id: "2", n: 2 }], ["3", { id: "3", n: 3 }]]);

    expect(await storage.size()).toBe(3);
    expect(await storage.get("2")).toEqual({ id: "2", n: 2 });
    expect(await storage.has("4")).toBe(false);
    expect((await storage.find((item) => item.n > 1)).map((item) => item.id)).toEqual(["2", "3"]);
    expect([...(await storage.getBatch(["1", "3"])).keys()]).toEqual(["1", "3"]);

    expect(await storage.delete("1")).toBe(true);
    expect(await storage.deleteBatch(["2", "9"])).toBe(1);
    expect((await storage.getAll()).map((item) => item.id)).toEqual(["3"]);

    await storage.clear();
    expect(await storage.size()).toBe(0);
    await storage.close();
  });
});
