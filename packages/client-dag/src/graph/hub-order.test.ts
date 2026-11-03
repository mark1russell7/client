import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hubBreadthFirstOrder } from "./index.js";

describe("hubBreadthFirstOrder", () => {
  it("gives an empty order for no nodes", () => {
    expect(hubBreadthFirstOrder(0)).toEqual([]);
  });

  it("gives the order of the indexes with no edges and no comparator", () => {
    expect(hubBreadthFirstOrder(4)).toEqual([0, 1, 2, 3]);
  });

  it("gives the order of the comparator with no edges", () => {
    expect(hubBreadthFirstOrder(4, [], (i, j) => j - i)).toEqual([3, 2, 1, 0]);
  });

  it("starts at the node with the largest sum of weights", () => {
    expect(hubBreadthFirstOrder(4, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }])).toEqual([1, 0, 2, 3]);
  });

  it("counts the weight and not the count of the edges", () => {
    expect(hubBreadthFirstOrder(4, [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 3, b: 2, weight: 5 }])).toEqual([2, 0, 3, 1]);
  });

  it("adds the weights of parallel edges", () => {
    expect(hubBreadthFirstOrder(4, [{ a: 2, b: 3 }, { a: 2, b: 3 }, { a: 0, b: 1 }])).toEqual([2, 3, 0, 1]);
  });

  it("breaks a tie of hubs with the comparator, then with the lower index", () => {
    const edges = [{ a: 0, b: 1 }, { a: 2, b: 3 }];
    expect(hubBreadthFirstOrder(4, edges)).toEqual([0, 1, 2, 3]);
    expect(hubBreadthFirstOrder(4, edges, (i, j) => (j % 2) - (i % 2))).toEqual([1, 0, 3, 2]);
  });

  it("orders the neighbours with the comparator, and goes breadth-first", () => {
    const edges = [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }, { a: 1, b: 4 }, { a: 3, b: 5 }];
    expect(hubBreadthFirstOrder(6, edges)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(hubBreadthFirstOrder(6, edges, (i, j) => j - i)).toEqual([0, 3, 2, 1, 5, 4]);
  });

  it("starts each next component at its own hub", () => {
    const edges = [{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 3, b: 5 }];
    expect(hubBreadthFirstOrder(7, edges)).toEqual([3, 4, 5, 1, 2, 0, 6]);
  });

  it("follows a cycle once, and adds no weight for an edge to the same node", () => {
    expect(hubBreadthFirstOrder(3, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }])).toEqual([0, 1, 2]);
    expect(hubBreadthFirstOrder(3, [{ a: 2, b: 2, weight: 9 }, { a: 0, b: 1 }])).toEqual([0, 1, 2]);
  });

  it("gives each node once for each graph of a small set", () => {
    for (let n = 1; n < 7; n++) {
      const edges = Array.from({ length: 2 * n }, (_, k) => ({ a: k % n, b: (k * k + 1) % n }));
      expect(hubBreadthFirstOrder(n, edges).toSorted((p, q) => p - q)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it("does not change its arguments", () => {
    const edges = Object.freeze([Object.freeze({ a: 0, b: 1 })]);
    expect(hubBreadthFirstOrder(2, edges)).toEqual([0, 1]);
  });

  it("refuses a bad count, a bad index and a bad weight", () => {
    for (const n of [-1, 1.5, Number.NaN]) expect(() => hubBreadthFirstOrder(n)).toThrow(RangeError);
    for (const edge of [{ a: 0, b: 3 }, { a: -1, b: 1 }, { a: 0.5, b: 1 }, { a: 1, b: 0.5 }, { a: 3, b: 0 }, { a: 0, b: -1 }]) {
      expect(() => hubBreadthFirstOrder(3, [edge])).toThrow(RangeError);
    }
    for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => hubBreadthFirstOrder(3, [{ a: 0, b: 1, weight }])).toThrow(RangeError);
  });
});

describe("the entry ./graph", () => {
  it("imports no other package", () => {
    const folder = new URL("./", import.meta.url);
    for (const file of readdirSync(folder).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const text = readFileSync(new URL(file, folder), "utf8");
      const imports = [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1]!);
      expect(imports.filter((path) => !path.startsWith("./")), file).toEqual([]);
    }
  });
});
