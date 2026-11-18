import * as home from "@mark1russell7/collections/dag";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { dagHomeProcedures, dagManifest, dagModule } from "./module.js";

const registry = createRegistry(dagModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["dag", name], input, { registry }), ["dag", name])) as T;

/** The nodes of a small DAG: c depends on a and b, and b depends on a. */
const nodes = (): home.DAGNode[] => [home.createNode("a", []), home.createNode("b", ["a"]), home.createNode("c", ["a", "b"]), home.createNode("d", ["c"])];
/** A new map of the nodes for each call of the home, because `buildLeveledDAG` writes the level of each node. */
const nodeMap = (): Map<string, home.DAGNode> => home.buildNodeMap(nodes());
/** The JSON form of a map: its entries. */
const entries = (): [string, home.DAGNode][] => [...nodeMap().entries()];

describe("the generated procedures of @procedures/dag", () => {
  it("gives the same value as the function of the home", async () => {
    expect(await call("createNode", { id: "b", dependencies: ["a"] })).toEqual(home.createNode("b", ["a"]));
    expect(await call("buildNodeMap", { nodes: nodes() })).toEqual(entries());
    expect(await call("getAncestors", { nodes: entries(), id: "d" })).toEqual([...home.getAncestors(nodeMap(), "d")]);
    expect(await call("getDescendants", { nodes: entries(), id: "b" })).toEqual([...home.getDescendants(nodeMap(), "b")]);
    expect(await call("filterDAGFromRoot", { nodes: entries(), rootId: "c" })).toEqual([...home.filterDAGFromRoot(nodeMap(), "c").entries()]);
  });

  it("gives a leveled DAG with its nodes as entries, and the other procedures take it as input", async () => {
    const dag = home.buildLeveledDAG(nodeMap());
    const output = await call<{ nodes: unknown[] }>("buildLeveledDAG", { nodes: entries() });
    expect(output).toEqual({ ...dag, nodes: [...dag.nodes.entries()] });
    expect(await call("getTopologicalOrder", { dag: output })).toEqual(home.getTopologicalOrder(dag));
    expect(await call("visualizeDAG", { dag: output })).toBe(home.visualizeDAG(dag));
  });

  it("names the functions with a function parameter as exemptions", () => {
    expect(dagManifest.exempt.map((exemption) => [exemption.name, exemption.reason])).toEqual([
      ["createProcessor", "function-parameter"],
      ["executeDAG", "function-parameter"],
      ["executeDAGSequential", "function-parameter"],
    ]);
  });

  it("has a procedure with no effect for each other function of the home, next to dag.traverse", () => {
    expect(dagManifest.procedures).toHaveLength(8);
    expect(dagHomeProcedures).toHaveLength(8);
    for (const procedure of dagManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
    expect(registry.get(["dag", "traverse"])).toBeDefined();
    expect(registry.get(["dag", "buildLeveledDAG"])).toBeDefined();
  });
});
