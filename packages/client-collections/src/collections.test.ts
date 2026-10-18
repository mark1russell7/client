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
    createWithQueryPolicy: (policy) => new InMemoryStorage<ContractItem>({ queryPolicy: policy }),
  },
  { describe, it },
);

describeCollectionStorageContract(
  "InMemoryStorage with copies: false (the contract of a caller that changes no value)",
  {
    create: () => new InMemoryStorage<ContractItem>({ copies: false }),
    createWithMaxTombstones: (max) => new InMemoryStorage<ContractItem>({ maxTombstones: max, copies: false }),
    createWithQueryPolicy: (policy) => new InMemoryStorage<ContractItem>({ queryPolicy: policy, copies: false }),
  },
  {
    describe,
    // The case of the copies is the one difference of the option
    it: (name, body) => (name.startsWith("the storage keeps copies") ? it.skip(name, body) : it(name, body)),
  },
);

describe("InMemoryStorage: what the contract does not fix", () => {
  it("copies: false keeps the values that set() takes, and gives them to the reads", async () => {
    const storage = new InMemoryStorage<{ n: number }>({ copies: false });
    const value = { n: 1 };
    await storage.set("a", value);
    expect(await storage.get("a")).toBe(value);
    value.n = 2;
    expect(await storage.get("a")).toEqual({ n: 2 });
  });

  it("copies with structuredClone: a Date stays a Date, and a function is an error", async () => {
    const storage = new InMemoryStorage<unknown>();
    const when = new Date(0);
    await storage.set("date", { when });
    const read = (await storage.get("date")) as { when: Date };
    expect(read.when).toBeInstanceOf(Date);
    expect(read.when).not.toBe(when);
    await expect(storage.set("function", { run: () => 1 })).rejects.toThrow();
    // A batch with a value without a copy changes nothing
    await expect(storage.setBatch([["one", 1], ["function", () => 1]])).rejects.toThrow();
    expect(await storage.has("one")).toBe(false);
  });

  it("gives copies from the methods of the Map interface too", async () => {
    const storage = new InMemoryStorage<{ n: number }>();
    await storage.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    expect([...storage.keys()]).toEqual(["a", "b"]);
    for (const value of storage.values()) value.n = 0;
    for (const [, value] of storage.entries()) value.n = 0;
    for (const [, value] of storage) value.n = 0;
    storage.forEach((value, key, map) => {
      value.n = 0;
      map.delete(key);
    });
    expect(await storage.getAll()).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("drops its items at close(), and the methods of the Map interface throw after it", async () => {
    const storage = new InMemoryStorage<{ n: number }>();
    await storage.set("a", { n: 1 });
    await storage.close();
    expect(() => storage.keys()).toThrow(/closed/);
    expect(() => storage.values()).toThrow(/closed/);
    expect(() => storage.entries()).toThrow(/closed/);
    expect(() => storage.forEach(() => undefined)).toThrow(/closed/);
    expect(() => [...storage]).toThrow(/closed/);
    await expect(storage.close()).resolves.toBeUndefined();
  });
});
