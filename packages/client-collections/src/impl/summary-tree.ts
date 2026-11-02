/**
 * SummaryTree: a persistent sequence of leaves with a summary of each part.
 *
 * The tree is a balanced binary tree (AVL) with one leaf in each node. Each node keeps the summary of its subtree.
 * A summary is a value of a monoid: the caller gives the monoid as data, with `empty` and `combine`. The order of the
 * leaves is kept, so `combine` must be associative, but it can be non-commutative.
 *
 * Each operation returns a new tree and keeps the old tree. The two trees share the nodes that did not change.
 * Concatenation, a split at an index or at a summary search, an edit and a lookup are O(log n).
 *
 * The algorithms are the "join" algorithms of Blelloch, Ferizovic and Sun, "Just Join for Parallel Ordered Sets"
 * (SPAA 2016).
 *
 * @example
 * // The number of leaves and the total length of the strings
 * const spec = {
 *   monoid: { empty: { count: 0, length: 0 }, combine: (a, b) => ({ count: a.count + b.count, length: a.length + b.length }) },
 *   measure: (leaf: string) => ({ count: 1, length: leaf.length }),
 * };
 * const tree = summaryTree(spec, ["ab", "cde", "f"]);
 * tree.summary; // { count: 3, length: 6 }
 * const [left, right] = tree.split((prefix) => prefix.length > 2); // left: ["ab"], right: ["cde", "f"]
 */

/** A monoid as data: the identity value `empty` and an associative operation `combine`. */
export interface SummaryMonoid<Summary> {
  /** The summary of a sequence with no leaf. `combine(empty, s)` and `combine(s, empty)` are equal to `s`. */
  readonly empty: Summary;
  /** This function gives the summary of a sequence from the summaries of its two parts, left first. */
  readonly combine: (left: Summary, right: Summary) => Summary;
}

/** The data that a tree needs: the monoid of the summaries and the summary of one leaf. */
export interface SummarySpec<Leaf, Summary> {
  readonly monoid: SummaryMonoid<Summary>;
  /** This function gives the summary of one leaf. */
  readonly measure: (leaf: Leaf) => Summary;
}

/** The result of a summary search: the first leaf whose prefix summary satisfies the predicate. */
export interface SummarySearch<Leaf, Summary> {
  /** The index of the leaf. */
  readonly index: number;
  readonly leaf: Leaf;
  /** The summary of the leaves before the leaf. */
  readonly before: Summary;
  /** The summary of the leaves before the leaf, and of the leaf. */
  readonly through: Summary;
}

/** One node of the tree. The tree never changes a node after it makes it. */
interface Node<Leaf, Summary> {
  readonly left: Node<Leaf, Summary> | null;
  readonly leaf: Leaf;
  /** The summary of the leaf of this node only. */
  readonly own: Summary;
  readonly right: Node<Leaf, Summary> | null;
  readonly height: number;
  readonly size: number;
  /** The summary of all the leaves of this subtree. */
  readonly summary: Summary;
}

type Tree<Leaf, Summary> = Node<Leaf, Summary> | null;

function heightOf<L, S>(tree: Tree<L, S>): number {
  return tree === null ? 0 : tree.height;
}

function sizeOf<L, S>(tree: Tree<L, S>): number {
  return tree === null ? 0 : tree.size;
}

/** The functions that make and join nodes for one monoid. */
class Builder<L, S> {
  constructor(readonly spec: SummarySpec<L, S>) {}

  summaryOf(tree: Tree<L, S>): S {
    return tree === null ? this.spec.monoid.empty : tree.summary;
  }

  node(left: Tree<L, S>, leaf: L, own: S, right: Tree<L, S>): Node<L, S> {
    const { combine } = this.spec.monoid;
    const inner = left === null ? own : combine(left.summary, own);
    return {
      left,
      leaf,
      own,
      right,
      height: 1 + Math.max(heightOf(left), heightOf(right)),
      size: sizeOf(left) + 1 + sizeOf(right),
      summary: right === null ? inner : combine(inner, right.summary),
    };
  }

  rotateLeft(n: Node<L, S>): Node<L, S> {
    const r = n.right!;
    return this.node(this.node(n.left, n.leaf, n.own, r.left), r.leaf, r.own, r.right);
  }

  rotateRight(n: Node<L, S>): Node<L, S> {
    const l = n.left!;
    return this.node(l.left, l.leaf, l.own, this.node(l.right, n.leaf, n.own, n.right));
  }

  /** This function joins a tree that is higher by more than 1 with a leaf and a lower tree on its right. */
  joinRight(left: Node<L, S>, leaf: L, own: S, right: Tree<L, S>): Node<L, S> {
    const c = left.right;
    if (heightOf(c) <= heightOf(right) + 1) {
      const t = this.node(c, leaf, own, right);
      if (t.height <= heightOf(left.left) + 1) return this.node(left.left, left.leaf, left.own, t);
      return this.rotateLeft(this.node(left.left, left.leaf, left.own, this.rotateRight(t)));
    }
    const t = this.joinRight(c!, leaf, own, right);
    const joined = this.node(left.left, left.leaf, left.own, t);
    return t.height <= heightOf(left.left) + 1 ? joined : this.rotateLeft(joined);
  }

  /** This function joins a lower tree on the left with a leaf and a tree that is higher by more than 1. */
  joinLeft(left: Tree<L, S>, leaf: L, own: S, right: Node<L, S>): Node<L, S> {
    const c = right.left;
    if (heightOf(c) <= heightOf(left) + 1) {
      const t = this.node(left, leaf, own, c);
      if (t.height <= heightOf(right.right) + 1) return this.node(t, right.leaf, right.own, right.right);
      return this.rotateRight(this.node(this.rotateLeft(t), right.leaf, right.own, right.right));
    }
    const t = this.joinLeft(left, leaf, own, c!);
    const joined = this.node(t, right.leaf, right.own, right.right);
    return t.height <= heightOf(right.right) + 1 ? joined : this.rotateRight(joined);
  }

  /** This function gives the tree of the leaves of `left`, then `leaf`, then the leaves of `right`. */
  join(left: Tree<L, S>, leaf: L, own: S, right: Tree<L, S>): Node<L, S> {
    if (heightOf(left) > heightOf(right) + 1) return this.joinRight(left!, leaf, own, right);
    if (heightOf(right) > heightOf(left) + 1) return this.joinLeft(left, leaf, own, right!);
    return this.node(left, leaf, own, right);
  }

  /** This function removes the last leaf of a tree, and gives the rest and the node of that leaf. */
  splitLast(tree: Node<L, S>): [Tree<L, S>, Node<L, S>] {
    if (tree.right === null) return [tree.left, tree];
    const [rest, last] = this.splitLast(tree.right);
    return [this.join(tree.left, tree.leaf, tree.own, rest), last];
  }

  concat(left: Tree<L, S>, right: Tree<L, S>): Tree<L, S> {
    if (left === null) return right;
    if (right === null) return left;
    const [rest, last] = this.splitLast(left);
    return this.join(rest, last.leaf, last.own, right);
  }

  /** This function splits a tree into its first `index` leaves and the other leaves. */
  splitAt(tree: Tree<L, S>, index: number): [Tree<L, S>, Tree<L, S>] {
    if (tree === null) return [null, null];
    const before = sizeOf(tree.left);
    if (index <= before) {
      const [a, b] = this.splitAt(tree.left, index);
      return [a, this.join(b, tree.leaf, tree.own, tree.right)];
    }
    const [a, b] = this.splitAt(tree.right, index - before - 1);
    return [this.join(tree.left, tree.leaf, tree.own, a), b];
  }

  /** This function splits a tree before the first leaf whose prefix summary, after `acc`, satisfies the predicate. */
  splitBy(tree: Tree<L, S>, predicate: (prefix: S) => boolean, acc: S): [Tree<L, S>, Tree<L, S>] {
    if (tree === null) return [null, null];
    const { combine } = this.spec.monoid;
    const throughLeft = tree.left === null ? acc : combine(acc, tree.left.summary);
    if (tree.left !== null && predicate(throughLeft)) {
      const [a, b] = this.splitBy(tree.left, predicate, acc);
      return [a, this.join(b, tree.leaf, tree.own, tree.right)];
    }
    const throughLeaf = combine(throughLeft, tree.own);
    if (predicate(throughLeaf)) return [tree.left, this.join(null, tree.leaf, tree.own, tree.right)];
    const [a, b] = this.splitBy(tree.right, predicate, throughLeaf);
    return [this.join(tree.left, tree.leaf, tree.own, a), b];
  }

  /** This function makes a balanced tree of the leaves `items[lo]` to `items[hi - 1]`. */
  build(items: readonly L[], lo: number, hi: number): Tree<L, S> {
    if (lo >= hi) return null;
    const mid = (lo + hi) >>> 1;
    const leaf = items[mid]!;
    return this.node(this.build(items, lo, mid), leaf, this.spec.measure(leaf), this.build(items, mid + 1, hi));
  }
}

/** The builders of each spec. Each spec has one builder, so that two trees of the same spec can be joined. */
const builders = new WeakMap<object, Builder<unknown, unknown>>();

function builderOf<L, S>(spec: SummarySpec<L, S>): Builder<L, S> {
  let builder = builders.get(spec) as Builder<L, S> | undefined;
  if (builder === undefined) {
    builder = new Builder(spec);
    builders.set(spec, builder as Builder<unknown, unknown>);
  }
  return builder;
}

function* walk<L, S>(tree: Tree<L, S>): Generator<L, void, undefined> {
  // An explicit stack: the depth of the tree is O(log n), so the stack stays small
  const stack: Node<L, S>[] = [];
  let node = tree;
  while (node !== null || stack.length > 0) {
    while (node !== null) {
      stack.push(node);
      node = node.left;
    }
    const top = stack.pop()!;
    yield top.leaf;
    node = top.right;
  }
}

function clamp(value: number, size: number): number {
  if (Number.isNaN(value)) return 0;
  const whole = Math.trunc(value);
  return whole < 0 ? Math.max(0, size + whole) : Math.min(whole, size);
}

/**
 * A persistent sequence of leaves with a summary of each part. Make one with `summaryTree`. Each method that changes
 * the sequence returns a new tree.
 */
export class SummaryTree<Leaf, Summary> implements Iterable<Leaf> {
  private constructor(
    private readonly builder: Builder<Leaf, Summary>,
    private readonly root: Tree<Leaf, Summary>,
  ) {}

  /** This function makes a tree of a spec from leaves, as `summaryTree` does. */
  static of<Leaf, Summary>(spec: SummarySpec<Leaf, Summary>, leaves: Iterable<Leaf> = []): SummaryTree<Leaf, Summary> {
    const builder = builderOf(spec);
    const items = [...leaves];
    return new SummaryTree(builder, builder.build(items, 0, items.length));
  }

  private wrap(root: Tree<Leaf, Summary>): SummaryTree<Leaf, Summary> {
    return root === this.root ? this : new SummaryTree(this.builder, root);
  }

  private treeOf(leaves: Iterable<Leaf> | SummaryTree<Leaf, Summary>): Tree<Leaf, Summary> {
    if (leaves instanceof SummaryTree) {
      if (leaves.builder !== this.builder) throw new TypeError("SummaryTree: the two trees have different specs");
      return leaves.root;
    }
    const items = [...leaves];
    return this.builder.build(items, 0, items.length);
  }

  /** The spec of the tree: its monoid and its measure. */
  get spec(): SummarySpec<Leaf, Summary> {
    return this.builder.spec;
  }

  /** The number of leaves. */
  get size(): number {
    return sizeOf(this.root);
  }

  get isEmpty(): boolean {
    return this.root === null;
  }

  /** The summary of all the leaves, in their order. An empty tree has the summary `monoid.empty`. */
  get summary(): Summary {
    return this.builder.summaryOf(this.root);
  }

  /** The height of the tree: 0 for an empty tree. The height is at most 1.45 log2(size + 2). */
  get height(): number {
    return heightOf(this.root);
  }

  /** This function gives the leaf at an index, or `undefined` when the index is not in the tree. */
  at(index: number): Leaf | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return undefined;
    let node = this.root!;
    for (;;) {
      const before = sizeOf(node.left);
      if (index === before) return node.leaf;
      if (index < before) node = node.left!;
      else {
        index -= before + 1;
        node = node.right!;
      }
    }
  }

  /** This function gives the summary of the leaves from `start` to `end`, with `end` not included. */
  summaryOf(start = 0, end: number = this.size): Summary {
    return this.slice(start, end).summary;
  }

  /** This function gives the tree of the leaves of this tree, then the leaves of `other`. The two trees must have the same spec. */
  concat(other: SummaryTree<Leaf, Summary> | Iterable<Leaf>): SummaryTree<Leaf, Summary> {
    return this.wrap(this.builder.concat(this.root, this.treeOf(other)));
  }

  /** This function splits the tree into its first `index` leaves and the other leaves. */
  splitAt(index: number): [SummaryTree<Leaf, Summary>, SummaryTree<Leaf, Summary>] {
    const [left, right] = this.builder.splitAt(this.root, clamp(index, this.size));
    return [this.wrap(left), this.wrap(right)];
  }

  /**
   * This function splits the tree before the first leaf whose prefix summary satisfies the predicate. The prefix of a
   * leaf includes the leaf. The predicate must be monotone: after it is true for a prefix, it is true for each longer
   * prefix. When no prefix satisfies it, the right tree is empty.
   */
  split(predicate: (prefix: Summary) => boolean): [SummaryTree<Leaf, Summary>, SummaryTree<Leaf, Summary>] {
    const [left, right] = this.builder.splitBy(this.root, predicate, this.builder.spec.monoid.empty);
    return [this.wrap(left), this.wrap(right)];
  }

  /**
   * This function finds the first leaf whose prefix summary satisfies a monotone predicate, as `split` does. It changes
   * nothing. It gives `undefined` when no prefix satisfies the predicate.
   */
  search(predicate: (prefix: Summary) => boolean): SummarySearch<Leaf, Summary> | undefined {
    const { combine } = this.builder.spec.monoid;
    let node = this.root;
    let acc = this.builder.spec.monoid.empty;
    let index = 0;
    while (node !== null) {
      const throughLeft = node.left === null ? acc : combine(acc, node.left.summary);
      if (node.left !== null && predicate(throughLeft)) {
        node = node.left;
        continue;
      }
      const through = combine(throughLeft, node.own);
      if (predicate(through)) return { index: index + sizeOf(node.left), leaf: node.leaf, before: throughLeft, through };
      index += sizeOf(node.left) + 1;
      acc = through;
      node = node.right;
    }
    return undefined;
  }

  /** This function gives the tree of the leaves from `start` to `end`, with `end` not included. A negative index counts from the end. */
  slice(start = 0, end: number = this.size): SummaryTree<Leaf, Summary> {
    const from = clamp(start, this.size);
    const to = clamp(end, this.size);
    if (to <= from) return this.wrap(null);
    const [, rest] = this.builder.splitAt(this.root, from);
    const [middle] = this.builder.splitAt(rest, to - from);
    return this.wrap(middle);
  }

  /**
   * This function removes `deleteCount` leaves at `start` and puts the leaves of `inserted` there, as
   * `Array.prototype.splice` does. It returns the new tree, not the removed leaves.
   */
  splice(start: number, deleteCount: number = this.size, inserted: SummaryTree<Leaf, Summary> | Iterable<Leaf> = []): SummaryTree<Leaf, Summary> {
    const from = clamp(start, this.size);
    const count = Math.max(0, Math.min(Number.isNaN(deleteCount) ? 0 : Math.trunc(deleteCount), this.size - from));
    const middle = this.treeOf(inserted);
    if (count === 0 && middle === null) return this;
    const [left, rest] = this.builder.splitAt(this.root, from);
    const [, right] = this.builder.splitAt(rest, count);
    return this.wrap(this.builder.concat(this.builder.concat(left, middle), right));
  }

  /** This function puts the leaves of `inserted` before the leaf at `index`. */
  insert(index: number, inserted: SummaryTree<Leaf, Summary> | Iterable<Leaf>): SummaryTree<Leaf, Summary> {
    return this.splice(index, 0, inserted);
  }

  /** This function removes the leaves from `start` to `end`, with `end` not included. */
  remove(start: number, end: number = this.size): SummaryTree<Leaf, Summary> {
    const from = clamp(start, this.size);
    return this.splice(from, Math.max(0, clamp(end, this.size) - from));
  }

  /** This function replaces the leaf at an index. An index that is not in the tree changes nothing. */
  set(index: number, leaf: Leaf): SummaryTree<Leaf, Summary> {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return this;
    return this.splice(index, 1, [leaf]);
  }

  /** This function adds leaves after the last leaf. */
  append(...leaves: Leaf[]): SummaryTree<Leaf, Summary> {
    return this.concat(leaves);
  }

  /** This function adds leaves before the first leaf. */
  prepend(...leaves: Leaf[]): SummaryTree<Leaf, Summary> {
    return this.wrap(this.builder.concat(this.treeOf(leaves), this.root));
  }

  /** This function gives the leaves in their order. */
  [Symbol.iterator](): Iterator<Leaf> {
    return walk(this.root);
  }

  /** This function gives the leaves in an array. */
  toArray(): Leaf[] {
    return [...walk(this.root)];
  }
}

/**
 * This function makes a persistent tree of leaves with a summary of each part. Use the same `spec` object for each
 * tree that `concat` or `splice` joins.
 */
export function summaryTree<Leaf, Summary>(spec: SummarySpec<Leaf, Summary>, leaves: Iterable<Leaf> = []): SummaryTree<Leaf, Summary> {
  return SummaryTree.of(spec, leaves);
}

/**
 * @internal This function examines the invariants of a tree: the AVL balance, the heights, the sizes and the
 * summaries. It gives a list of the faults, empty when there is no fault. The tests use it.
 */
export function summaryTreeFaults<Leaf, Summary>(tree: SummaryTree<Leaf, Summary>, equal: (a: Summary, b: Summary) => boolean): string[] {
  const builder = tree["builder"];
  const faults: string[] = [];
  const visit = (node: Tree<Leaf, Summary>, path: string): void => {
    if (node === null) return;
    visit(node.left, `${path}L`);
    visit(node.right, `${path}R`);
    const hl = heightOf(node.left);
    const hr = heightOf(node.right);
    if (Math.abs(hl - hr) > 1) faults.push(`${path}: balance ${hl - hr}`);
    if (node.height !== 1 + Math.max(hl, hr)) faults.push(`${path}: height ${node.height}`);
    if (node.size !== sizeOf(node.left) + 1 + sizeOf(node.right)) faults.push(`${path}: size ${node.size}`);
    const { combine } = builder.spec.monoid;
    const expected = combine(combine(builder.summaryOf(node.left), builder.spec.measure(node.leaf)), builder.summaryOf(node.right));
    if (!equal(node.summary, expected)) faults.push(`${path}: summary`);
  };
  visit(tree["root"], "^");
  return faults;
}
