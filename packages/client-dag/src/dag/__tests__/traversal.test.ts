import { describe, it, expect } from "vitest";
import { buildLeveledDAG, getTopologicalOrder, visualizeDAG } from "../traversal.js";
import { createNode, buildNodeMap } from "../builder.js";

describe("buildLeveledDAG", () => {
  it("assigns level 0 to leaf nodes", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b"),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.levels.length).toBe(1);
    expect(dag.levels[0].length).toBe(2);
    expect(dag.levels[0][0].level).toBe(0);
    expect(dag.levels[0][1].level).toBe(0);
  });

  it("assigns correct levels to linear chain", () => {
    // c -> b -> a (c depends on b, b depends on a)
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.levels.length).toBe(3);
    expect(nodes.get("a")!.level).toBe(0);
    expect(nodes.get("b")!.level).toBe(1);
    expect(nodes.get("c")!.level).toBe(2);
  });

  it("groups parallel nodes at same level", () => {
    //   d
    //  / \
    // b   c
    //  \ /
    //   a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["a"]),
      createNode("d", ["b", "c"]),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.levels.length).toBe(3);
    expect(nodes.get("a")!.level).toBe(0);
    expect(nodes.get("b")!.level).toBe(1);
    expect(nodes.get("c")!.level).toBe(1);
    expect(nodes.get("d")!.level).toBe(2);
  });

  it("identifies leaves correctly", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.leaves).toEqual(["a"]);
  });

  it("identifies roots correctly", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.roots).toEqual(["b"]);
  });

  it("throws on circular dependency", () => {
    const nodes = buildNodeMap([
      createNode("a", ["b"]),
      createNode("b", ["a"]),
    ]);

    expect(() => buildLeveledDAG(nodes)).toThrow("Circular dependency");
  });

  it("ignores dependencies not in the DAG", () => {
    // b depends on a and external, but external is not in the DAG
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a", "external"]),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.levels.length).toBe(2);
    expect(nodes.get("a")!.level).toBe(0);
    expect(nodes.get("b")!.level).toBe(1);
  });

  it("handles complex graph with multiple paths", () => {
    //        f
    //       / \
    //      d   e
    //     / \ / \
    //    b   c   g
    //     \ /
    //      a
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["a"]),
      createNode("g"),
      createNode("d", ["b", "c"]),
      createNode("e", ["c", "g"]),
      createNode("f", ["d", "e"]),
    ]);

    const dag = buildLeveledDAG(nodes);

    expect(dag.levels.length).toBe(4);
    // Level 0: a, g (leaves)
    expect(new Set(dag.levels[0].map((n) => n.id))).toEqual(new Set(["a", "g"]));
    // Level 1: b, c
    expect(new Set(dag.levels[1].map((n) => n.id))).toEqual(new Set(["b", "c"]));
    // Level 2: d, e
    expect(new Set(dag.levels[2].map((n) => n.id))).toEqual(new Set(["d", "e"]));
    // Level 3: f
    expect(dag.levels[3].map((n) => n.id)).toEqual(["f"]);
  });
});

describe("getTopologicalOrder", () => {
  it("returns nodes in topological order", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const order = getTopologicalOrder(dag);

    const ids = order.map((n) => n.id);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });

  it("returns all nodes", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["a"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const order = getTopologicalOrder(dag);

    expect(order.length).toBe(3);
  });
});

describe("visualizeDAG", () => {
  it("produces readable output", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const output = visualizeDAG(dag);

    expect(output).toContain("DAG Structure:");
    expect(output).toContain("Level 0:");
    expect(output).toContain("Level 1:");
    expect(output).toContain("a");
    expect(output).toContain("b");
  });

  it("marks leaf nodes", () => {
    const nodes = buildNodeMap([createNode("a")]);
    const dag = buildLeveledDAG(nodes);
    const output = visualizeDAG(dag);

    expect(output).toContain("(leaf)");
  });

  it("shows dependencies", () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const output = visualizeDAG(dag);

    expect(output).toContain("-> [a]");
  });
});
