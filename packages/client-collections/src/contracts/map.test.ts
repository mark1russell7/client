/**
 * The MapLike contract (HashMap, LinkedHashMap, TreeMap) against a JavaScript Map, the order of
 * each kind, and the red-black invariants of TreeMap.
 *
 * Regressions: BUGS-2026-07 C10 (LinkedHashMap corrupted on the first collision or resize) and
 * L10 (TreeMap's delete did not rebalance).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { hashMap } from "../impl/hash-map.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import type { MapLike } from "../interfaces/map.js";
import { runModel, smallInt, step, type Step } from "./model.js";

type S = MapLike<number, string>;
type M = Map<number, string>;

const value = fc.constantFrom("a", "b", "c", "d");

const steps: fc.Arbitrary<Step<S, M>> = fc.oneof(
  fc.tuple(smallInt, value).map(([k, v]) =>
    step<S, M>(`set(${k}, ${v})`, (s, m) => {
      expect(s.set(k, v)).toBe(m.get(k));
      m.set(k, v);
    }),
  ),
  // Many keys at once: the table resizes often
  fc.array(fc.tuple(fc.integer({ min: -200, max: 200 }), value), { minLength: 5, maxLength: 30 }).map((entries) =>
    step<S, M>(`set x${entries.length}`, (s, m) => {
      for (const [k, v] of entries) {
        expect(s.set(k, v)).toBe(m.get(k));
        m.set(k, v);
      }
    }),
  ),
  smallInt.map((k) =>
    step<S, M>(`delete(${k})`, (s, m) => {
      expect(s.delete(k)).toBe(m.get(k));
      m.delete(k);
    }),
  ),
  fc.tuple(smallInt, value).map(([k, v]) =>
    step<S, M>(`setIfAbsent(${k}, ${v})`, (s, m) => {
      const expected = m.has(k) ? m.get(k) : v;
      if (!m.has(k)) m.set(k, v);
      expect(s.setIfAbsent(k, v)).toBe(expected);
    }),
  ),
  fc.tuple(smallInt, value).map(([k, v]) =>
    step<S, M>(`replace(${k}, ${v})`, (s, m) => {
      const old = m.get(k);
      expect(s.replace(k, v)).toBe(old);
      if (m.has(k)) m.set(k, v);
    }),
  ),
  fc.tuple(smallInt, value).map(([k, v]) =>
    step<S, M>(`deleteEntry(${k}, ${v})`, (s, m) => {
      const match = m.get(k) === v;
      expect(s.deleteEntry(k, v)).toBe(match);
      if (match) m.delete(k);
    }),
  ),
  fc.tuple(smallInt, value).map(([k, v]) =>
    step<S, M>(`merge(${k}, ${v})`, (s, m) => {
      const old = m.get(k);
      const next = old === undefined ? v : old + v;
      expect(s.merge(k, v, (a, b) => a + b)).toBe(next);
      m.set(k, next);
    }),
  ),
  smallInt.map((k) =>
    step<S, M>(`computeIfPresent(${k})`, (s, m) => {
      const old = m.get(k);
      // A remapping to undefined deletes the entry
      const next = old === undefined || old.length > 2 ? undefined : old + "!";
      expect(s.computeIfPresent(k, (_key, v) => (v.length > 2 ? undefined : v + "!"))).toBe(next);
      if (next === undefined) m.delete(k);
      else m.set(k, next);
    }),
  ),
  fc.constant(step<S, M>("clear()", (s, m) => (s.clear(), m.clear()))),
);

function checkEntries(s: S, m: M, order: "insertion" | "sorted" | "any"): void {
  expect(s.size).toBe(m.size);
  expect(s.isEmpty).toBe(m.size === 0);
  let expected = [...m.entries()];
  if (order === "sorted") expected = expected.sort(([a], [b]) => a - b);
  const actual = [...s.entries()].map((entry) => [entry.key, entry.value] as [number, string]);
  if (order === "any") {
    expect(actual.sort(([a], [b]) => a - b)).toEqual(expected.sort(([a], [b]) => a - b));
  } else {
    expect(actual).toEqual(expected);
  }
  expect([...s.keys()].length).toBe(m.size);
  for (const k of [-3, 0, 5, 19, 150]) {
    expect(s.has(k)).toBe(m.has(k));
    expect(s.getOrUndefined(k)).toBe(m.get(k));
    if (!m.has(k)) expect(() => s.get(k)).toThrow();
  }
}

// Every key in one of four buckets: chains and collisions on every insert (C10)
const colliding = { hash: (k: number) => Math.abs(k) % 4, eq: (a: number, b: number) => a === b };

for (const [name, create, order] of [
  ["HashMap", () => hashMap<number, string>(), "any"],
  ["HashMap (colliding hash)", () => hashMap<number, string>({ keyHash: colliding.hash, keyEq: colliding.eq, initialCapacity: 2 }), "any"],
  ["LinkedHashMap", () => linkedHashMap<number, string>(), "insertion"],
  ["LinkedHashMap (colliding hash)", () => linkedHashMap<number, string>({ hash: colliding.hash, eq: colliding.eq, initialCapacity: 2 }), "insertion"],
  ["TreeMap", () => treeMap<number, string>(), "sorted"],
] as const) {
  describe(`${name} follows the MapLike contract`, () => {
    it("matches a JavaScript Map for random operation sequences", () => {
      runModel<S, M>({
        create: () => ({ sut: create() as S, model: new Map() }),
        steps,
        check: (s, m) => checkEntries(s, m, order),
        maxSteps: 150,
      });
    });
  });
}

// =============================================================================
// TreeMap: navigation and balance
// =============================================================================

interface Node {
  key: number;
  color: "RED" | "BLACK";
  left: Node | null;
  right: Node | null;
  parent: Node | null;
}

/** The black height of a valid red-black subtree. It throws when an invariant fails. */
function blackHeight(node: Node | null, parent: Node | null): number {
  if (node === null) return 1;
  if (node.parent !== parent) throw new Error(`parent link of ${node.key} is wrong`);
  if (node.color === "RED" && (node.left?.color === "RED" || node.right?.color === "RED")) {
    throw new Error(`red node ${node.key} has a red child`);
  }
  if (node.left && node.left.key >= node.key) throw new Error(`order at ${node.key}`);
  if (node.right && node.right.key <= node.key) throw new Error(`order at ${node.key}`);
  const left = blackHeight(node.left, node);
  const right = blackHeight(node.right, node);
  if (left !== right) throw new Error(`black heights differ at ${node.key}: ${left} and ${right}`);
  return left + (node.color === "BLACK" ? 1 : 0);
}

function rootOf(map: unknown): Node | null {
  return (map as { _root: Node | null })._root;
}

describe("TreeMap keeps the red-black invariants (L10)", () => {
  it("after random inserts and deletes", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 0, max: 60 })), { maxLength: 300 }), (ops) => {
        const map = treeMap<number, string>();
        for (const [insert, key] of ops) {
          if (insert) map.set(key, "v");
          else map.delete(key);
          const root = rootOf(map);
          if (root) expect(root.color).toBe("BLACK");
          blackHeight(root, null);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("stays shallow after deleting most of a large tree", () => {
    const map = treeMap<number, string>();
    for (let i = 0; i < 4096; i++) map.set(i, "v");
    for (let i = 0; i < 4096; i++) if (i % 8 !== 0) map.delete(i);
    const depth = (node: Node | null): number => (node ? 1 + Math.max(depth(node.left), depth(node.right)) : 0);
    // A red-black tree of n nodes has a depth of at most 2 log2(n + 1)
    expect(depth(rootOf(map))).toBeLessThanOrEqual(2 * Math.log2(map.size + 1));
  });

  it("navigates: floor, ceiling, lower, higher, first, last, poll", () => {
    const map = treeMap<number, string>();
    for (const k of [10, 20, 30, 40]) map.set(k, String(k));
    expect([map.floorKey(25), map.ceilingKey(25), map.lowerKey(20), map.higherKey(20)]).toEqual([20, 30, 10, 30]);
    expect([map.floorKey(5), map.ceilingKey(45)]).toEqual([undefined, undefined]);
    expect([map.firstKey(), map.lastKey()]).toEqual([10, 40]);
    expect(map.pollFirstEntry()?.key).toBe(10);
    expect(map.pollLastEntry()?.key).toBe(40);
    expect([...map.keys()]).toEqual([20, 30]);
    expect([...map.descendingKeys()]).toEqual([30, 20]);
  });
});

// =============================================================================
// HashMap: iteration fails fast (L15)
// =============================================================================

describe("HashMap iteration fails fast when the map changes (L15)", () => {
  it("throws when a key is added during iteration, also when the add resizes the table", () => {
    const map = hashMap<number, string>({ initialCapacity: 4 });
    for (let k = 0; k < 3; k++) map.set(k, "v");
    expect(() => {
      for (const entry of map.entries()) map.set(entry.key + 100, "w");
    }).toThrow("changed during iteration");
  });

  it("throws when a key is deleted during iteration", () => {
    const map = hashMap<number, string>();
    for (let k = 0; k < 10; k++) map.set(k, "v");
    expect(() => {
      for (const key of map.keys()) map.delete(key);
    }).toThrow("changed during iteration");
  });

  it("allows a new value for an existing key during iteration", () => {
    const map = hashMap<number, string>();
    for (let k = 0; k < 10; k++) map.set(k, "v");
    for (const entry of map.entries()) map.set(entry.key, "w");
    expect([...map.values()].every((v) => v === "w")).toBe(true);
  });

  it("yields each entry once when nothing changes", () => {
    const map = hashMap<number, string>({ initialCapacity: 4 });
    for (let k = 0; k < 100; k++) map.set(k, "v");
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([...Array(100).keys()]);
  });
});
