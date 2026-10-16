/**
 * The checks of the contract suite, and the suite against broken storages: each break must fail
 * the case that covers it.
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorage } from "../storage/memory.js";
import type { StorageChanges } from "../storage/interface.js";
import { byId, deepEqual, holds, rejects, same, show } from "./check.js";
import { ContractViolation, collectionStorageContract, type ContractCase, type ContractItem, type ContractStorage } from "./index.js";

describe("the checks of the contract suite", () => {
  it("deepEqual compares JSON values, arrays, plain objects and maps", () => {
    expect(deepEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, c: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual(new Map([["a", 1], ["b", 2]]), new Map([["b", 2], ["a", 1]]))).toBe(true);
    expect(deepEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(deepEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
    expect(deepEqual(new Map(), new Map([["a", 1]]))).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(new Date(0), new Date(0))).toBe(false);
  });

  it("show gives JSON, a map as its entries, and undefined", () => {
    expect(show(new Map([["a", 1]]))).toBe('{"Map":[["a",1]]}');
    expect(show(undefined)).toBe("undefined");
    expect(show({ a: undefined })).toBe('{"a":"<undefined>"}');
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    expect(show(loop)).toBe("[object Object]");
  });

  it("same, holds and rejects throw ContractViolation", async () => {
    expect(() => same(1, 2, "one")).toThrow(new ContractViolation("one: expected 2, got 1"));
    expect(() => holds(false, "never")).toThrow(ContractViolation);
    await expect(rejects(() => { throw new Error("now"); }, "sync")).rejects.toThrow(/sync: the method threw at once/);
    await expect(rejects(() => 1 as unknown as Promise<unknown>, "value")).rejects.toThrow(/value: the method did not give a promise/);
    await expect(rejects(() => Promise.resolve(1), "resolved")).rejects.toThrow(/resolved: the promise did not reject/);
    const error = new Error("rejected");
    expect(await rejects(() => Promise.reject(error), "rejected")).toBe(error);
    expect(byId([["b", 2], ["a", 1], ["c", 3]])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
  });
});

/** The case of the suite with this start of its name, for a storage. */
function caseOf(create: () => ContractStorage, start: string): ContractCase {
  const found = collectionStorageContract({ create }).find((contractCase) => contractCase.name.startsWith(start));
  if (!found) throw new Error(`no case starts with ${start}`);
  return found;
}

describe("the contract suite finds a broken storage", () => {
  it("a delete() that always gives true", async () => {
    class Broken extends InMemoryStorage<ContractItem> {
      override async delete(id: string): Promise<boolean> {
        await super.delete(id);
        return true;
      }
    }
    await expect(caseOf(() => new Broken(), "an empty storage").run()).rejects.toThrow(/delete\(\) of a missing id: expected false, got true/);
  });

  it("a getAll() in another order", async () => {
    class Broken extends InMemoryStorage<ContractItem> {
      override async getAll(): Promise<ContractItem[]> {
        return (await super.getAll()).reverse();
      }
    }
    await expect(caseOf(() => new Broken(), "the entries keep the order").run()).rejects.toThrow(ContractViolation);
  });

  it("a getChangesSince() that forgets the deletes", async () => {
    class Broken extends InMemoryStorage<ContractItem> {
      override async getChangesSince(since?: string): Promise<StorageChanges<ContractItem>> {
        return { ...(await super.getChangesSince(since)), deleted: [] };
      }
    }
    await expect(caseOf(() => new Broken(), "getChangesSince(version) gives").run()).rejects.toThrow(/deleted of a delta/);
    await expect(caseOf(() => new Broken(), "a random sequence").run()).rejects.toThrow(ContractViolation);
  });

  it("a storage that keeps the values does not pass the case of the copies", async () => {
    const copies = collectionStorageContract({ create: () => new InMemoryStorage<ContractItem>(), copies: true }).find((contractCase) => contractCase.name.startsWith("the storage keeps copies"))!;
    await expect(copies.run()).rejects.toThrow(/get\(\) after a change of the value that set\(\) took/);
  });

  it("skips a case for an optional method that the storage does not have", async () => {
    class Plain extends InMemoryStorage<ContractItem> {}
    Object.defineProperty(Plain.prototype, "getChangesSince", { value: undefined });
    const notes: string[] = [];
    await caseOf(() => new Plain(), "getChangesSince() without a version").run({ skip: (note) => notes.push(note ?? "") });
    expect(notes).toEqual(["The storage has no getChangesSince()"]);
  });
});
