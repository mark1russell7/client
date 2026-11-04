import { describe, it, expect } from "vitest";
import { InMemoryStorage } from "./index.js";
import { describeCollectionStorageContract, type ContractItem } from "./testing/index.js";

// The contract of CollectionStorage: the suite of the test-only entry ./testing
describeCollectionStorageContract(
  "InMemoryStorage",
  {
    create: () => new InMemoryStorage<ContractItem>(),
    createWithMaxTombstones: (max) => new InMemoryStorage<ContractItem>({ maxTombstones: max }),
    createWithQueryPolicy: (policy) => new InMemoryStorage<ContractItem>({ queryPolicy: policy }),
    createWithVersions: (versionOf) => new InMemoryStorage<ContractItem>({ versionOf }),
  },
  { describe, it },
);

describeCollectionStorageContract(
  "InMemoryStorage with copies: false (the contract of a caller that changes no value)",
  {
    create: () => new InMemoryStorage<ContractItem>({ copies: false }),
    createWithMaxTombstones: (max) => new InMemoryStorage<ContractItem>({ maxTombstones: max, copies: false }),
    createWithQueryPolicy: (policy) => new InMemoryStorage<ContractItem>({ queryPolicy: policy, copies: false }),
    createWithVersions: (versionOf) => new InMemoryStorage<ContractItem>({ versionOf, copies: false }),
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
