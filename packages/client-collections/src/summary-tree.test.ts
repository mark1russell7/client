import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { summaryTree, type SummarySpec, type SummaryTree } from "./index.js";
import { summaryTreeFaults } from "./impl/summary-tree.js";

/** A non-commutative monoid: the concatenation of the leaves. An error in the order of the leaves changes the summary. */
const text: SummarySpec<string, string> = { monoid: { empty: "", combine: (a, b) => a + b }, measure: (leaf) => leaf };

/** The count and the sum of the leaves: a search by the sum finds a leaf by its offset. */
interface Total {
  readonly count: number;
  readonly sum: number;
}
const total: SummarySpec<number, Total> = {
  monoid: { empty: { count: 0, sum: 0 }, combine: (a, b) => ({ count: a.count + b.count, sum: a.sum + b.sum }) },
  measure: (leaf) => ({ count: 1, sum: leaf }),
};

/** The same seed each run, so that each run tests the same cases. */
const runs = (seed: number, numRuns = 200) => ({ seed, numRuns });

const leaf = fc.string({ minLength: 1, maxLength: 3 });
const leaves = fc.array(leaf, { maxLength: 60 });

/** One edit of a sequence, with the same effect on an array and on a tree. */
type Edit =
  | { readonly kind: "splice"; readonly start: number; readonly count: number; readonly items: string[] }
  | { readonly kind: "set"; readonly index: number; readonly item: string }
  | { readonly kind: "slice"; readonly start: number; readonly end: number }
  | { readonly kind: "concat"; readonly items: string[] }
  | { readonly kind: "prepend"; readonly items: string[] }
  | { readonly kind: "split-join"; readonly index: number };

const edit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({ kind: fc.constant("splice" as const), start: fc.integer({ min: -5, max: 70 }), count: fc.integer({ min: 0, max: 20 }), items: fc.array(leaf, { maxLength: 20 }) }),
  fc.record({ kind: fc.constant("set" as const), index: fc.integer({ min: -70, max: 70 }), item: leaf }),
  fc.record({ kind: fc.constant("slice" as const), start: fc.integer({ min: -10, max: 70 }), end: fc.integer({ min: -10, max: 80 }) }),
  fc.record({ kind: fc.constant("concat" as const), items: fc.array(leaf, { maxLength: 40 }) }),
  fc.record({ kind: fc.constant("prepend" as const), items: fc.array(leaf, { maxLength: 10 }) }),
  fc.record({ kind: fc.constant("split-join" as const), index: fc.integer({ min: 0, max: 70 }) }),
);

function applyToArray(items: string[], e: Edit): string[] {
  const copy = [...items];
  switch (e.kind) {
    case "splice":
      copy.splice(e.start, e.count, ...e.items);
      return copy;
    case "set":
      // Array.prototype.with throws on an index that is not in the array: the tree changes nothing
      return e.index >= -copy.length && e.index < copy.length ? copy.with(e.index, e.item) : copy;
    case "slice":
      return copy.slice(e.start, e.end);
    case "concat":
      return [...copy, ...e.items];
    case "prepend":
      return [...e.items, ...copy];
    case "split-join":
      return copy;
  }
}

function applyToTree(tree: SummaryTree<string, string>, e: Edit): SummaryTree<string, string> {
  switch (e.kind) {
    case "splice":
      return tree.splice(e.start, e.count, e.items);
    case "set":
      return tree.set(e.index, e.item);
    case "slice":
      return tree.slice(e.start, e.end);
    case "concat":
      return tree.concat(summaryTree(text, e.items));
    case "prepend":
      return tree.prepend(...e.items);
    case "split-join": {
      const [left, right] = tree.splitAt(e.index);
      return left.concat(right);
    }
  }
}

/** The bound of the height of an AVL tree with `n` nodes. */
function heightBound(n: number): number {
  return 1.4405 * Math.log2(n + 2) - 0.3277;
}

function expectValid<L, S>(tree: SummaryTree<L, S>, equal: (a: S, b: S) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)): void {
  expect(summaryTreeFaults(tree, equal)).toEqual([]);
  expect(tree.height).toBeLessThanOrEqual(heightBound(tree.size));
}

describe("summaryTree", () => {
  it("keeps the leaves in order and gives the summary of all the leaves", () => {
    const tree = summaryTree(text, ["ab", "c", "def"]);
    expect(tree.size).toBe(3);
    expect(tree.summary).toBe("abcdef");
    expect(tree.toArray()).toEqual(["ab", "c", "def"]);
    expect([...tree]).toEqual(["ab", "c", "def"]);
    expect(tree.at(1)).toBe("c");
    expect(tree.at(3)).toBeUndefined();
    expect(tree.at(-1)).toBe("def");
    expect(tree.at(-3)).toBe("ab");
    expect(tree.at(-4)).toBeUndefined();
    expect(tree.at(0.5)).toBeUndefined();
    expect(tree.spec).toBe(text);
  });

  it("gives the empty summary and the height 0 for an empty tree", () => {
    const tree = summaryTree(total);
    expect(tree.isEmpty).toBe(true);
    expect(tree.summary).toEqual({ count: 0, sum: 0 });
    expect(tree.height).toBe(0);
    expect(tree.split(() => true)[0].isEmpty).toBe(true);
    expect(tree.search(() => true)).toBeUndefined();
  });

  it("refuses to join two trees of different specs", () => {
    const other: SummarySpec<string, string> = { ...text };
    expect(() => summaryTree(text, ["a"]).concat(summaryTree(other, ["b"]))).toThrow(TypeError);
  });

  it("reads and replaces a leaf at each index as Array.prototype.at and Array.prototype.with do", () => {
    fc.assert(
      fc.property(leaves, fc.integer({ min: 0, max: 1000 }), leaf, (items, pick, item) => {
        const tree = summaryTree(text, items);
        const n = items.length;
        for (let i = -n - 2; i < n + 2; i++) {
          expect(tree.at(i)).toBe(items.at(i));
          const expected = i >= -n && i < n ? items.with(i, item) : items;
          const edited = tree.set(i, item);
          expect(edited.toArray()).toEqual(expected);
          expect(edited.summary).toBe(expected.join(""));
        }
        expect(tree.at(pick + 0.5)).toBeUndefined();
        expect(tree.toArray()).toEqual(items);
      }),
      runs(0x5e9d6, 100),
    );
  });

  it("returns the same tree for an edit that changes nothing", () => {
    const tree = summaryTree(text, ["a", "b"]);
    expect(tree.splice(1, 0, [])).toBe(tree);
    expect(tree.set(5, "x")).toBe(tree);
    expect(tree.concat([])).toBe(tree);
  });

  it("finds a leaf by its offset with a search over the sum", () => {
    const tree = summaryTree(total, [3, 0, 4, 2]);
    expect(tree.search((p) => p.sum > 3)).toEqual({ index: 2, leaf: 4, before: { count: 2, sum: 3 }, through: { count: 3, sum: 7 } });
    expect(tree.search((p) => p.sum > 9)).toBeUndefined();
    const [left, right] = tree.split((p) => p.sum > 3);
    expect(left.toArray()).toEqual([3, 0]);
    expect(right.toArray()).toEqual([4, 2]);
    expect(tree.summaryOf(1, 3)).toEqual({ count: 2, sum: 4 });
  });

  it("gives the fold of the leaves as the summary after each edit of a sequence", () => {
    fc.assert(
      fc.property(leaves, fc.array(edit, { maxLength: 25 }), (initial, edits) => {
        let model = initial;
        let tree = summaryTree(text, initial);
        for (const e of edits) {
          model = applyToArray(model, e);
          tree = applyToTree(tree, e);
          expect(tree.toArray()).toEqual(model);
          expect(tree.size).toBe(model.length);
          expect(tree.summary).toBe(model.join(""));
          expectValid(tree);
        }
      }),
      runs(0x5e9d1),
    );
  });

  it("keeps each old tree unchanged after an edit", () => {
    fc.assert(
      fc.property(leaves, fc.array(edit, { minLength: 1, maxLength: 10 }), (initial, edits) => {
        const trees = [summaryTree(text, initial)];
        const snapshots = [initial];
        for (const e of edits) {
          trees.push(applyToTree(trees[trees.length - 1]!, e));
          snapshots.push(trees[trees.length - 1]!.toArray());
        }
        trees.forEach((tree, i) => {
          expect(tree.toArray()).toEqual(snapshots[i]);
          expect(tree.summary).toBe(snapshots[i]!.join(""));
        });
      }),
      runs(0x5e9d2),
    );
  });

  it("makes concat and splitAt inverse", () => {
    fc.assert(
      fc.property(leaves, leaves, (a, b) => {
        const joined = summaryTree(text, a).concat(summaryTree(text, b));
        expectValid(joined);
        const [left, right] = joined.splitAt(a.length);
        expect(left.toArray()).toEqual(a);
        expect(right.toArray()).toEqual(b);
        expectValid(left);
        expectValid(right);
      }),
      runs(0x5e9d3),
    );
    fc.assert(
      fc.property(leaves, fc.integer({ min: 0, max: 70 }), (items, index) => {
        const tree = summaryTree(text, items);
        const [left, right] = tree.splitAt(index);
        expect(left.size).toBe(Math.min(index, items.length));
        const again = left.concat(right);
        expect(again.toArray()).toEqual(items);
        expect(again.summary).toBe(tree.summary);
        expectValid(again);
      }),
      runs(0x5e9d4),
    );
  });

  it("splits before the first leaf whose prefix satisfies a monotone predicate", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 80 }), fc.integer({ min: -1, max: 400 }), (items, limit) => {
        const tree = summaryTree(total, items);
        const predicate = (p: Total) => p.sum > limit;
        let sum = 0;
        let index = items.findIndex((item) => (sum += item) > limit);
        if (index === -1) index = items.length;
        const [left, right] = tree.split(predicate);
        expect(left.toArray()).toEqual(items.slice(0, index));
        expect(right.toArray()).toEqual(items.slice(index));
        expectValid(left);
        expectValid(right);
        const found = tree.search(predicate);
        if (index === items.length) expect(found).toBeUndefined();
        else expect(found).toMatchObject({ index, leaf: items[index], before: left.summary });
      }),
      runs(0x5e9d5),
    );
  });

  it("keeps the height O(log n) after many appends at one end", () => {
    let tree = summaryTree(total);
    for (let i = 0; i < 4096; i++) tree = tree.append(i);
    expect(tree.size).toBe(4096);
    expect(tree.height).toBeLessThanOrEqual(heightBound(4096));
    for (let i = 0; i < 4096; i++) tree = tree.prepend(i);
    expectValid(tree);
    expect(tree.summary).toEqual({ count: 8192, sum: 4095 * 4096 });
  });
});
