/**
 * The graph of a program: the calls as a tree, the steps of chains in order, and the edges of
 * `$ref` from the call that gives a result to the call that reads it.
 */

import { describe, it, expect } from "vitest";
import { analyzeProgram } from "./analysis";
import { buildGraph, NODE_HEIGHT, NODE_WIDTH } from "./graph";
import { examples } from "./examples";
import type { Json } from "./program";

const call = (name: string, input: Json, extra: { $name?: string } = {}): Json => ({ $proc: ["client", name], input, ...extra });
const ref = (name: string): Json => ({ $ref: name });
const graphOf = (program: Json) => buildGraph(program, analyzeProgram(program));
const edgeNames = (program: Json, kind: string) => {
  const graph = graphOf(program);
  return graph.edges.filter((edge) => edge.kind === kind).map((edge) => `${graph.byId.get(edge.from)!.name}→${graph.byId.get(edge.to)!.name}:${edge.label}`);
};

describe("the program graph", () => {
  it("makes a node for each call, under the call whose input holds it", () => {
    const graph = graphOf(call("add", { a: call("multiply", { a: 2, b: 3 }), b: 1 }));
    expect(graph.nodes.map((node) => `${node.name}@${node.depth}:${node.label}`)).toEqual(["add@0:", "multiply@1:a"]);
    expect(edgeNames(call("add", { a: call("multiply", { a: 2, b: 3 }), b: 1 }), "input")).toEqual(["add→multiply:a"]);
  });

  it("links the steps of a chain in order, and the reads of named results", () => {
    const program = call("chain", {
      steps: [call("add", { a: 1, b: 2 }, { $name: "sum" }), call("multiply", { a: ref("$last"), b: 3 }), call("add", { a: ref("sum"), b: 1 })],
    });
    expect(edgeNames(program, "step")).toEqual(["add→multiply:then", "multiply→add:then"]);
    expect(edgeNames(program, "ref")).toEqual(["add→multiply:$last", "add→add:sum"]);
  });

  it("links the steps of an implicit chain", () => {
    expect(edgeNames(call("identity", { value: [call("add", { a: 1, b: 2 }), call("negate", { value: ref("$last") })] }), "step")).toEqual([
      "add→negate:then",
    ]);
  });

  it("links an item of map to the map", () => {
    expect(edgeNames(call("map", { items: [1, 2], fn: call("multiply", { a: ref("item"), b: 2 }) }), "ref")).toEqual(["map→multiply:item"]);
  });

  it("labels the branches of control flow", () => {
    expect(edgeNames(call("conditional", { condition: call("gt", { a: 2, b: 1 }), then: call("add", { a: 1, b: 1 }), else: 0 }), "input")).toEqual([
      "conditional→gt:condition",
      "conditional→add:then",
    ]);
  });

  it("places the children in a row under their parent, without overlap", () => {
    for (const example of examples) {
      const graph = graphOf(example.program);
      expect(graph.nodes.length).toBeGreaterThan(0);
      for (const node of graph.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x + NODE_WIDTH).toBeLessThanOrEqual(graph.width);
        expect(node.y + NODE_HEIGHT).toBeLessThanOrEqual(graph.height);
      }
      const rows = new Map<number, number[]>();
      for (const node of graph.nodes) rows.set(node.y, [...(rows.get(node.y) ?? []), node.x]);
      for (const xs of rows.values()) {
        const sorted = [...xs].sort((a, b) => a - b);
        for (let index = 1; index < sorted.length; index++) expect(sorted[index]! - sorted[index - 1]!).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }
  });

  it("is empty for a program without calls", () => {
    expect(graphOf(null).nodes).toEqual([]);
    expect(graphOf({ a: 1 }).nodes).toEqual([]);
  });
});
