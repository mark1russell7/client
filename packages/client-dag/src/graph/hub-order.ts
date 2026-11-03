/** An undirected edge between the nodes `a` and `b`. The default weight is 1. */
export interface WeightedEdge {
  readonly a: number;
  readonly b: number;
  readonly weight?: number | undefined;
}

/**
 * This function gives a breadth-first order of the nodes `0` to `n - 1` of an undirected weighted graph.
 *
 * - The hub of a component is the node with the largest sum of edge weights. `compare`, then the lower index, breaks a tie.
 * - The order starts at the hub of each component, and goes breadth-first. `compare`, then the lower index, orders the neighbours of a node.
 * - Without edges, each node is a component, so the order is the order of `compare`.
 * - An edge from a node to itself adds no weight.
 * - A bad `n`, an index outside the nodes, or a weight that is not a finite number above 0, throws a `RangeError`.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 */
export function hubBreadthFirstOrder(n: number, edges: readonly WeightedEdge[] = [], compare: (i: number, j: number) => number = () => 0): number[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`The count of the nodes is a whole number from 0, not ${n}.`);
  const degree = new Float64Array(n);
  const next: number[][] = Array.from({ length: n }, () => []);
  for (const { a, b, weight = 1 } of edges) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) {
      throw new RangeError(`An edge joins the nodes ${a} and ${b}, but the indexes go from 0 to ${n - 1}.`);
    }
    if (!Number.isFinite(weight) || weight <= 0) throw new RangeError(`The weight of an edge is a finite number above 0, not ${weight}.`);
    if (a === b) continue;
    degree[a] = degree[a]! + weight;
    degree[b] = degree[b]! + weight;
    next[a]!.push(b);
    next[b]!.push(a);
  }
  const order = (i: number, j: number): number => compare(i, j) || i - j;
  const hubs = Array.from({ length: n }, (_, i) => i).sort((i, j) => degree[j]! - degree[i]! || order(i, j));
  const seen = new Uint8Array(n);
  const out: number[] = [];
  for (const hub of hubs) {
    if (seen[hub] === 1) continue;
    seen[hub] = 1;
    const queue = [hub];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      out.push(i);
      for (const j of next[i]!.toSorted(order)) {
        if (seen[j] === 1) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return out;
}
