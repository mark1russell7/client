import { describe, it, expect } from "vitest";
import {
  filterDAGFromRoot,
  getAncestors,
  getDescendants,
  createNode,
  buildNodeMap,
} from "../builder.js";
import type { DAGNode } from "../../types.js";

describe("createNode", () => {
  it("creates a node with id and empty dependencies", () => {
    const node = createNode("test");
    expect(node.id).toBe("test");
    expect(node.dependencies).toEqual([]);
    expect(node.data).toBeUndefined();
  });

  it("creates a node with dependencies", () => {
    const node = createNode("test", ["dep1", "dep2"]);
    expect(node.dependencies).toEqual(["dep1", "dep2"]);
  });

  it("creates a node with data", () => {
    const node = createNode("test", [], { value: 42 });
    expect(node.data).toEqual({ value: 42 });
  });
});

describe("buildNodeMap", () => {
  it("builds a Map from node array", () => {
    const nodes: DAGNode[] = [
      createNode("a"),
      createNode("b"),
      createNode("c"),
    ];

    const map = buildNodeMap(nodes);

    expect(map.size).toBe(3);
    expect(map.get("a")).toBe(nodes[0]);
    expect(map.get("b")).toBe(nodes[1]);
    expect(map.get("c")).toBe(nodes[2]);
  });

  it("handles empty array", () => {
    const map = buildNodeMap([]);
    expect(map.size).toBe(0);
  });
});

describe("filterDAGFromRoot", () => {
  it("includes root and all dependencies", () => {
    // c -> b -> a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const filtered = filterDAGFromRoot(nodes, "c");

    expect(filtered.size).toBe(3);
    expect(filtered.has("a")).toBe(true);
    expect(filtered.has("b")).toBe(true);
    expect(filtered.has("c")).toBe(true);
  });

  it("excludes unrelated nodes", () => {
    // c -> b -> a, d (unrelated)
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
      createNode("d"),
    ]);

    const filtered = filterDAGFromRoot(nodes, "c");

    expect(filtered.size).toBe(3);
    expect(filtered.has("d")).toBe(false);
  });

  it("handles diamond dependencies", () => {
    //     d
    //    / \
    //   b   c
    //    \ /
    //     a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["a"]),
      createNode("d", ["b", "c"]),
    ]);

    const filtered = filterDAGFromRoot(nodes, "d");

    expect(filtered.size).toBe(4);
  });

  it("returns empty map for non-existent root", () => {
    const nodes = buildNodeMap([createNode("a")]);
    const filtered = filterDAGFromRoot(nodes, "nonexistent");
    expect(filtered.size).toBe(0);
  });
});

describe("getAncestors", () => {
  it("returns all transitive dependencies", () => {
    // c -> b -> a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const ancestors = getAncestors(nodes, "c");

    expect(ancestors.size).toBe(2);
    expect(ancestors.has("a")).toBe(true);
    expect(ancestors.has("b")).toBe(true);
  });

  it("returns empty set for leaf node", () => {
    const nodes = buildNodeMap([createNode("a")]);
    const ancestors = getAncestors(nodes, "a");
    expect(ancestors.size).toBe(0);
  });

  it("handles diamond dependencies without duplicates", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["a"]),
      createNode("d", ["b", "c"]),
    ]);

    const ancestors = getAncestors(nodes, "d");

    expect(ancestors.size).toBe(3);
    expect(ancestors.has("a")).toBe(true);
    expect(ancestors.has("b")).toBe(true);
    expect(ancestors.has("c")).toBe(true);
  });
});

describe("getDescendants", () => {
  it("returns all nodes that depend on the target", () => {
    // c -> b -> a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const descendants = getDescendants(nodes, "a");

    expect(descendants.size).toBe(2);
    expect(descendants.has("b")).toBe(true);
    expect(descendants.has("c")).toBe(true);
  });

  it("returns empty set for root node with no dependents", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
    ]);

    const descendants = getDescendants(nodes, "b");
    expect(descendants.size).toBe(0);
  });

  it("handles multiple dependents", () => {
    //   b   c
    //    \ /
    //     a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["a"]),
    ]);

    const descendants = getDescendants(nodes, "a");

    expect(descendants.size).toBe(2);
    expect(descendants.has("b")).toBe(true);
    expect(descendants.has("c")).toBe(true);
  });
});
