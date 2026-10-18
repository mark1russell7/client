import { describe, expect, it } from "vitest";
import { compareKeys, dropIndex, isValidKey, keyBetween, keysBetween, keysForDrop, type KeyedItem } from "../index.js";

/** True when the keys are in strictly ascending order of their code units. */
function ascending(keys: readonly string[]): boolean {
  return keys.every((key, i) => i === 0 || keys[i - 1]! < key);
}

/** A small random generator with a seed, so each run tests the same sequence. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("keyBetween", () => {
  it("gives the known keys of the algorithm", () => {
    const cases: Array<[string | null, string | null, string]> = [
      [null, null, "a0"],
      [null, "a0", "Zz"],
      [null, "Zz", "Zy"],
      ["a0", null, "a1"],
      ["a1", null, "a2"],
      ["a0", "a1", "a0V"],
      ["a1", "a2", "a1V"],
      ["a0V", "a1", "a0l"],
      ["Zz", "a0", "ZzV"],
      ["Zz", "a1", "a0"],
      [null, "Y00", "Xzzz"],
      ["bzz", null, "c000"],
      ["a0", "a0V", "a0G"],
      ["a0", "a0G", "a08"],
      ["b125", "b129", "b127"],
      ["a0", "a1V", "a1"],
      ["Zz", "a01", "a0"],
      [null, "a0V", "a0"],
      [null, "b999", "b99"],
    ];
    for (const [prev, next, key] of cases) expect(keyBetween(prev, next), `${prev} .. ${next}`).toBe(key);
  });

  it("takes undefined as an end of the list, as null", () => {
    expect(keyBetween(undefined, undefined)).toBe("a0");
    expect(keyBetween("a0", undefined)).toBe("a1");
  });

  it("never runs out in one gap: 2000 moves into the gap between two keys stay strictly between", () => {
    // A float rank fails at the 53rd halving of the gap between 1 and 2 (review of #42)
    const low = keyBetween(null, null);
    let high = keyBetween(low, null);
    for (let i = 0; i < 2000; i++) {
      const key = keyBetween(low, high);
      expect(low < key && key < high, `move ${i}: ${low} < ${key} < ${high}`).toBe(true);
      high = key;
    }
    expect(high.length).toBeLessThan(400);
  });

  it("keeps the keys short when items go to an end of the list", () => {
    let last = keyBetween(null, null);
    let first = last;
    for (let i = 0; i < 10_000; i++) {
      last = keyBetween(last, null);
      first = keyBetween(null, first);
    }
    expect(last.length).toBeLessThanOrEqual(4);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(first < last).toBe(true);
  });

  it("keeps the order through random moves", () => {
    const next = random(42);
    const keys: string[] = [keyBetween(null, null)];
    for (let i = 0; i < 3000; i++) {
      const at = Math.floor(next() * (keys.length + 1));
      keys.splice(at, 0, keyBetween(keys[at - 1], keys[at]));
      if (keys.length > 200 && next() < 0.3) keys.splice(Math.floor(next() * keys.length), 1);
    }
    expect(ascending(keys)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses neighbors that are not in order, and keys that are not valid, with a RangeError", () => {
    expect(() => keyBetween("a1", "a0")).toThrow(RangeError);
    expect(() => keyBetween("a1", "a1")).toThrow(RangeError);
    for (const bad of ["", "a", "a00", "a0 ", "!0", `A${"0".repeat(26)}`, "a0é"]) {
      expect(() => keyBetween(bad, null), bad).toThrow(RangeError);
      expect(() => keyBetween(null, bad), bad).toThrow(RangeError);
    }
  });
});

describe("keysBetween", () => {
  it("gives count keys in ascending order between the neighbors", () => {
    expect(keysBetween(null, null, 0)).toEqual([]);
    expect(keysBetween(null, null, 3)).toEqual(["a0", "a1", "a2"]);
    expect(keysBetween(null, "a0", 2)).toEqual(["Zy", "Zz"]);
    const inner = keysBetween("a0", "a1", 50);
    expect(inner).toHaveLength(50);
    expect(ascending(["a0", ...inner, "a1"])).toBe(true);
  });

  it("refuses a count that is not an integer of 0 or more", () => {
    for (const bad of [-1, 1.5, Number.NaN]) expect(() => keysBetween(null, null, bad)).toThrow(RangeError);
  });
});

/** The list after the writes of a move, sorted by key, then by id: the ids in order. */
function after(items: readonly KeyedItem[], writes: ReadonlyArray<{ id: string; key: string }>): string[] {
  const byId = new Map(items.map((item) => [item.id, item.key]));
  for (const { id, key } of writes) byId.set(id, key);
  return [...byId].sort(([ia, ka], [ib, kb]) => compareKeys(ka, kb) || compareKeys(ia, ib)).map(([id]) => id);
}

describe("keysForDrop", () => {
  const list = (...pairs: Array<[string, string]>): KeyedItem[] => pairs.map(([id, key]) => ({ id, key }));

  it("gives one write when the neighbors have different keys, at each place of the list", () => {
    const items = list(["a", "a0"], ["b", "a1"], ["c", "a2"]);
    for (let index = 0; index <= items.length; index++) {
      const writes = keysForDrop(items, index, "m");
      expect(writes).toHaveLength(1);
      expect(writes[0]!.id).toBe("m");
      const ids = items.map((item) => item.id);
      ids.splice(index, 0, "m");
      expect(after(items, writes)).toEqual(ids);
    }
    expect(keysForDrop([], 0, "m")).toEqual([{ id: "m", key: "a0" }]);
  });

  it("gives a new key to the tied neighbor when the drop is between two items with one key (two writers)", () => {
    const items = list(["a", "a0"], ["b", "a1"], ["c", "a1"], ["d", "a2"]);
    const writes = keysForDrop(items, 2, "m");
    expect(writes.map((w) => w.id)).toEqual(["c", "m"]);
    expect(after(items, writes)).toEqual(["a", "b", "m", "c", "d"]);
  });

  it("needs no new key at either end of a tie run", () => {
    const items = list(["a", "a0"], ["b", "a1"], ["c", "a1"], ["d", "a2"]);
    const atStart = keysForDrop(items, 1, "m");
    expect(atStart.map((w) => w.id)).toEqual(["m"]);
    expect(after(items, atStart)).toEqual(["a", "m", "b", "c", "d"]);
    const atEnd = keysForDrop(items, 3, "m");
    expect(atEnd.map((w) => w.id)).toEqual(["m"]);
    expect(after(items, atEnd)).toEqual(["a", "b", "c", "m", "d"]);
  });

  it("gives new keys to each tied item after the drop in a run of three, and at the end of the list", () => {
    const run = list(["a", "a1"], ["b", "a1"], ["c", "a1"]);
    const writes = keysForDrop(run, 1, "m");
    expect(writes.map((w) => w.id)).toEqual(["b", "c", "m"]);
    expect(after(run, writes)).toEqual(["a", "m", "b", "c"]);
    const last = keysForDrop(run, 3, "m");
    expect(after(run, last)).toEqual(["a", "b", "c", "m"]);
  });

  it("refuses an index outside the list, and a list that holds the item that moves", () => {
    const items = list(["a", "a0"]);
    for (const bad of [-1, 2, 0.5]) expect(() => keysForDrop(items, bad, "m")).toThrow(RangeError);
    expect(() => keysForDrop(items, 0, "a")).toThrow(RangeError);
  });
});

describe("isValidKey", () => {
  it("accepts a key that keyBetween can take, up to the longest length", () => {
    expect(isValidKey("a0")).toBe(true);
    expect(isValidKey("a0V")).toBe(true);
    for (const bad of ["", "a", "a00", "a0 ", 42, null, undefined, {}]) expect(isValidKey(bad), String(bad)).toBe(false);
    const long = `a0${"V".repeat(30)}`;
    expect(isValidKey(long)).toBe(true);
    expect(isValidKey(long, { maxLength: 16 })).toBe(false);
    expect(isValidKey(`a0${"V".repeat(1100)}`)).toBe(false);
  });
});

describe("compareKeys", () => {
  it("compares the code units, never the locale order", () => {
    // In a locale order, "a" comes before "B"; in the order of the keys, "B" comes first
    expect(compareKeys("B0", "a0")).toBe(-1);
    expect(compareKeys("a0", "a0")).toBe(0);
    expect(["a1", "Zz", "a0V", "a0"].sort(compareKeys)).toEqual(["Zz", "a0", "a0V", "a1"]);
  });
});

describe("dropIndex", () => {
  it("reads the rows from top to bottom, then each row from left to right", () => {
    const grid = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 50, y: 150 }];
    expect(dropIndex({ x: 10, y: 50 }, grid)).toBe(0);
    expect(dropIndex({ x: 100, y: 55 }, grid)).toBe(1);
    expect(dropIndex({ x: 200, y: 50 }, grid)).toBe(2);
    expect(dropIndex({ x: 10, y: 100 }, grid)).toBe(2);
    expect(dropIndex({ x: 10, y: 400 }, grid)).toBe(3);
  });

  it("gives an index from 0 to the number of items, and takes the row tolerance", () => {
    expect(dropIndex({ x: 0, y: 0 }, [])).toBe(0);
    expect(dropIndex({ x: 10, y: 20 }, [{ x: 50, y: 50 }])).toBe(0);
    expect(dropIndex({ x: 60, y: 20 }, [{ x: 50, y: 50 }], 40)).toBe(1);
  });
});
