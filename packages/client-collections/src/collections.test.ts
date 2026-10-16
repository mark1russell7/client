import { describe, it, expect, vi, afterEach } from "vitest";
import { compose, hashMap, lruMap, ttlMap, InMemoryStorage } from "./index.js";
import { describeCollectionStorageContract, type ContractItem } from "./testing/index.js";

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

// The contract of CollectionStorage: the suite of the test-only entry ./testing
describeCollectionStorageContract(
  "InMemoryStorage",
  {
    create: () => new InMemoryStorage<ContractItem>(),
    createWithMaxTombstones: (max) => new InMemoryStorage<ContractItem>({ maxTombstones: max }),
  },
  { describe, it },
);

describe("InMemoryStorage: what the contract does not fix", () => {
  it("empties itself at close(), and a version of the closed storage gives all items", async () => {
    const storage = new InMemoryStorage<{ n: number }>();
    await storage.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const before = await storage.getChangesSince();
    await storage.close();
    expect(await storage.size()).toBe(0);
    await storage.set("c", { n: 3 });
    expect(await storage.getChangesSince(before.version)).toMatchObject({ full: true, changed: [["c", { n: 3 }]], deleted: [] });
  });

  it("keeps the values that set() takes, and gives them to the reads: it makes no copies", async () => {
    const storage = new InMemoryStorage<{ n: number }>();
    const value = { n: 1 };
    await storage.set("a", value);
    expect(await storage.get("a")).toBe(value);
    // The contract suite tests the copies only for a storage that declares them (SqliteStorage)
    value.n = 2;
    expect(await storage.get("a")).toEqual({ n: 2 });
  });

  it("gives a delta in the order of the first write of each id since its last delete", async () => {
    const storage = new InMemoryStorage<{ n: number }>();
    await storage.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const start = await storage.getChangesSince();
    await storage.set("b", { n: 20 });
    await storage.set("a", { n: 10 });
    expect((await storage.getChangesSince(start.version)).changed.map(([id]) => id)).toEqual(["a", "b"]);
  });
});
