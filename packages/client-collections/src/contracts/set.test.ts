/**
 * The Set contract (HashSet, TreeSet) against a JavaScript Set, TreeSet navigation, and the
 * access order of LinkedHashMap.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { hashSet } from "../impl/hash-set.js";
import { treeSet } from "../impl/tree-set.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import type { Set as SetLike, NavigableSet } from "../interfaces/set.js";
import { runModel, smallInt, step, type Step } from "./model.js";

type S = SetLike<number>;
type M = Set<number>;

const steps: fc.Arbitrary<Step<S, M>> = fc.oneof(
  smallInt.map((x) =>
    step<S, M>(`add(${x})`, (s, m) => {
      expect(s.add(x)).toBe(!m.has(x));
      m.add(x);
    }),
  ),
  smallInt.map((x) =>
    step<S, M>(`remove(${x})`, (s, m) => {
      expect(s.remove(x)).toBe(m.has(x));
      m.delete(x);
    }),
  ),
  fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 30 }).map((xs) =>
    step<S, M>(`addAll x${xs.length}`, (s, m) => {
      const changed = xs.some((x) => !m.has(x));
      expect(s.addAll(xs)).toBe(changed);
      for (const x of xs) m.add(x);
    }),
  ),
  fc.array(smallInt, { maxLength: 8 }).map((xs) =>
    step<S, M>(`removeAll(${xs})`, (s, m) => {
      const changed = xs.some((x) => m.has(x));
      expect(s.removeAll(xs)).toBe(changed);
      for (const x of xs) m.delete(x);
    }),
  ),
  fc.array(smallInt, { maxLength: 12 }).map((xs) =>
    step<S, M>(`retainAll(${xs})`, (s, m) => {
      const kept = [...m].filter((x) => xs.includes(x));
      expect(s.retainAll(xs)).toBe(kept.length !== m.size);
      m.clear();
      for (const x of kept) m.add(x);
    }),
  ),
  fc.constant(step<S, M>("clear()", (s, m) => (s.clear(), m.clear()))),
);

function check(s: S, m: M, sorted: boolean): void {
  expect(s.size).toBe(m.size);
  expect(s.isEmpty).toBe(m.size === 0);
  const expected = [...m].sort((a, b) => a - b);
  const actual = s.toArray();
  expect(sorted ? actual : [...actual].sort((a, b) => a - b)).toEqual(expected);
  expect([...s].length).toBe(m.size);
  for (const x of [-5, 0, 3, 50]) expect(s.contains(x)).toBe(m.has(x));
  expect(s.containsAll([...m])).toBe(true);
}

for (const [name, create, sorted] of [
  ["HashSet", () => hashSet<number>({ initialCapacity: 2 }), false],
  ["TreeSet", () => treeSet<number>(), true],
] as const) {
  describe(`${name} follows the Set contract`, () => {
    it("matches a JavaScript Set for random operation sequences", () => {
      runModel<S, M>({ create: () => ({ sut: create() as S, model: new Set() }), steps, check: (s, m) => check(s, m, sorted), maxSteps: 150 });
    });
  });
}

describe("TreeSet navigation", () => {
  it("finds floor, ceiling, lower, higher and polls both ends", () => {
    const set = treeSet<number>() as NavigableSet<number>;
    set.addAll([10, 20, 30, 40]);
    expect([set.floor(25), set.ceiling(25), set.lower(20), set.higher(20)]).toEqual([20, 30, 10, 30]);
    expect([set.first(), set.last()]).toEqual([10, 40]);
    expect([set.pollFirst(), set.pollLast()]).toEqual([10, 40]);
    expect(set.toArray()).toEqual([20, 30]);
    expect([...set.descendingSet()]).toEqual([30, 20]);
    expect(set.headSet(30).toArray()).toEqual([20]);
    expect(set.tailSet(30).toArray()).toEqual([30]);
  });

  it("throws first() and last() on an empty set", () => {
    const set = treeSet<number>();
    expect(() => set.first()).toThrow();
    expect(() => set.last()).toThrow();
  });
});

describe("LinkedHashMap with access order", () => {
  it("moves an entry to the end when it is read or written", () => {
    const map = linkedHashMap<string, number>({ accessOrder: true });
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.get("a");
    map.set("b", 20);
    expect([...map.keys()]).toEqual(["c", "a", "b"]);
    map.delete("a");
    expect([...map.keys()]).toEqual(["c", "b"]);
  });
});
