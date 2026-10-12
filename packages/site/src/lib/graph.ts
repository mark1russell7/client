/**
 * The program as a graph, for the graph view of the Composer.
 *
 * - A node is a call. Its parent is the call whose input holds it, so the nodes make a tree.
 * - An "input" edge goes from a call to a call in its input, with the place as its label:
 *   `a`, `steps 2`, `then`.
 * - A "step" edge goes from a step of a chain (or of an implicit chain) to the next step.
 * - A "ref" edge goes from the call that gives a result to the call that reads it with `$ref`:
 *   a named step, the step before (`$last`), or the `map`/`reduce` that gives `item`, `index`
 *   or `acc`.
 *
 * The layout is a tidy tree from the top down: the children of a call are in a row under it,
 * in their order in the program.
 */

import type { Analysis } from "./analysis";
import { controlFlowName } from "./analysis";
import { isPlainObject, isProcRef, keyOf, locationKey, type Json, type Location, type ProcRef } from "./program";

export const NODE_WIDTH = 136;
export const NODE_HEIGHT = 50;
const GAP_X = 24;
const GAP_Y = 64;
const MARGIN = 24;

export interface GraphNode {
  /** `locationKey` of the call. */
  id: string;
  location: Location;
  /** "client.add" */
  key: string;
  /** The last part of the path: "add". */
  name: string;
  /** The control-flow name ("chain", "map"), or undefined. */
  flow: string | undefined;
  /** The `$name` of the call. */
  stepName: string | undefined;
  /** The place in the input of the parent: "a", "steps 2", "then". Empty for the root. */
  label: string;
  parent: string | null;
  children: string[];
  depth: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "input" | "step" | "ref";
  label: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  byId: Map<string, GraphNode>;
}

/** The text of a place: ["input", "steps", 2] gives "steps 2". */
export function placeLabel(relative: Location): string {
  return relative
    .filter((step) => step !== "input")
    .map(String)
    .join(" ");
}

function startsWith(location: Location, prefix: Location): boolean {
  return prefix.length <= location.length && prefix.every((step, index) => location[index] === step);
}

/** The graph of a program. `analysis` gives the implicit chains and the `$ref` uses. */
export function buildGraph(program: Json, analysis: Analysis): Graph {
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const walk = (value: Json | undefined, location: Location, parent: GraphNode | null, relative: Location): void => {
    if (value === undefined || value === null || typeof value !== "object") return;
    if (isProcRef(value)) {
      const ref = value as ProcRef;
      const node: GraphNode = {
        id: locationKey(location),
        location,
        key: keyOf(ref),
        name: ref.$proc[ref.$proc.length - 1] ?? "",
        flow: controlFlowName(ref),
        stepName: typeof ref.$name === "string" && ref.$name !== "" ? ref.$name : undefined,
        label: placeLabel(relative),
        parent: parent?.id ?? null,
        children: [],
        depth: parent ? parent.depth + 1 : 0,
        x: 0,
        y: 0,
      };
      nodes.push(node);
      byId.set(node.id, node);
      if (parent) {
        parent.children.push(node.id);
        edges.push({ from: parent.id, to: node.id, kind: "input", label: node.label });
      }
      if (ref.input !== undefined) walk(ref.input, [...location, "input"], node, ["input"]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...location, index], parent, [...relative, index]));
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, item] of Object.entries(value)) walk(item, [...location, key], parent, [...relative, key]);
    }
  };
  walk(program, [], null, []);

  // Steps: the steps of client.chain, and the lists that run as an implicit chain
  const stepLists: Location[] = [];
  for (const node of nodes) {
    if (node.flow !== "chain") continue;
    stepLists.push([...node.location, "input", "steps"]);
  }
  for (const key of analysis.chains) {
    try {
      const location = JSON.parse(key) as Location;
      if (Array.isArray(location)) stepLists.push(location);
    } catch {
      // Not a location
    }
  }
  const stepOf = new Map<string, { list: string; index: number }>();
  for (const list of stepLists) {
    const steps: GraphNode[] = [];
    for (let index = 0; ; index++) {
      const step = byId.get(locationKey([...list, index]));
      if (!step) {
        // A step that is not a call ends the run of calls
        if (!nodes.some((candidate) => startsWith(candidate.location, [...list, index]))) break;
        continue;
      }
      steps.push(step);
      stepOf.set(step.id, { list: locationKey(list), index });
    }
    for (let index = 1; index < steps.length; index++) {
      edges.push({ from: steps[index - 1]!.id, to: steps[index]!.id, kind: "step", label: "then" });
    }
  }

  // Ref edges: the call that gives the result, to the call that reads it
  const enclosing = (location: Location): GraphNode | undefined => {
    let best: GraphNode | undefined;
    for (const node of nodes) {
      if (startsWith(location, node.location) && (!best || node.location.length > best.location.length)) best = node;
    }
    return best;
  };
  for (const use of analysis.refs) {
    const reader = enclosing(use.location);
    if (!reader) continue;
    const name = use.name.split(".")[0] ?? "";
    let source: GraphNode | undefined;
    if (name === "$last") {
      // The step before the step that holds the reader
      for (const node of nodes) {
        const step = stepOf.get(node.id);
        if (!step || !startsWith(use.location, node.location)) continue;
        const previous = nodes.find((candidate) => {
          const other = stepOf.get(candidate.id);
          return other !== undefined && other.list === step.list && other.index === step.index - 1;
        });
        if (previous) source = previous;
      }
    } else {
      // The nearest named step before the reader, or the map/reduce that gives the name
      const named = nodes.filter((node) => node.stepName === name && stepOf.has(node.id) && !startsWith(use.location, node.location));
      source = named.at(-1);
      if (!source) {
        source = nodes
          .filter((node) => (node.flow === "map" || node.flow === "reduce") && startsWith(use.location, node.location))
          .at(-1);
      }
    }
    if (source && source.id !== reader.id) edges.push({ from: source.id, to: reader.id, kind: "ref", label: use.name });
  }

  // Layout: the width of each subtree, then the place of each node
  const widthOf = new Map<string, number>();
  const measure = (node: GraphNode): number => {
    const children = node.children.map((id) => byId.get(id)!);
    const total = children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * GAP_X;
    const width = Math.max(NODE_WIDTH, total);
    widthOf.set(node.id, width);
    return width;
  };
  const place = (node: GraphNode, left: number): void => {
    const width = widthOf.get(node.id)!;
    node.x = left + width / 2 - NODE_WIDTH / 2;
    node.y = MARGIN + node.depth * (NODE_HEIGHT + GAP_Y);
    const children = node.children.map((id) => byId.get(id)!);
    const total = children.reduce((sum, child) => sum + widthOf.get(child.id)!, 0) + Math.max(0, children.length - 1) * GAP_X;
    let x = left + (width - total) / 2;
    for (const child of children) {
      place(child, x);
      x += widthOf.get(child.id)! + GAP_X;
    }
  };
  const roots = nodes.filter((node) => node.parent === null);
  let left = MARGIN;
  for (const root of roots) {
    measure(root);
    place(root, left);
    left += widthOf.get(root.id)! + GAP_X;
  }
  const width = Math.max(NODE_WIDTH + 2 * MARGIN, left - GAP_X + MARGIN);
  const depth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const height = nodes.length === 0 ? 0 : MARGIN * 2 + (depth + 1) * NODE_HEIGHT + depth * GAP_Y;
  return { nodes, edges, width, height, byId };
}

/** The path of an edge, and the place of its label. */
export function edgeGeometry(edge: GraphEdge, from: GraphNode, to: GraphNode): { d: string; lx: number; ly: number } {
  const fx = from.x + NODE_WIDTH / 2;
  const tx = to.x + NODE_WIDTH / 2;
  if (edge.kind === "step") {
    const y = from.y + NODE_HEIGHT / 2;
    return { d: `M ${from.x + NODE_WIDTH} ${y} L ${to.x - 2} ${to.y + NODE_HEIGHT / 2}`, lx: (from.x + NODE_WIDTH + to.x) / 2, ly: y - 10 };
  }
  if (edge.kind === "input") {
    const y1 = from.y + NODE_HEIGHT;
    const y2 = to.y;
    const bend = (y2 - y1) / 2;
    return { d: `M ${fx} ${y1} C ${fx} ${y1 + bend}, ${tx} ${y2 - bend}, ${tx} ${y2}`, lx: tx, ly: y2 - 12 };
  }
  // A ref: from the bottom of the source to the top of a deeper reader, or to the bottom of a
  // reader in the same row (an arc below the row)
  const y1 = from.y + NODE_HEIGHT;
  if (to.y > from.y) {
    const y2 = to.y;
    return {
      d: `M ${fx + 18} ${y1} C ${fx + 18} ${y1 + 60}, ${tx + 18} ${y2 - 60}, ${tx + 18} ${y2 - 2}`,
      lx: (fx + tx) / 2 + 18,
      ly: (y1 + y2) / 2,
    };
  }
  const y2 = to.y + NODE_HEIGHT;
  const depth = 34 + Math.min(60, Math.abs(tx - fx) / 8);
  return { d: `M ${fx} ${y1} C ${fx} ${y1 + depth}, ${tx} ${y2 + depth}, ${tx} ${y2 + 2}`, lx: (fx + tx) / 2, ly: Math.max(y1, y2) + depth * 0.75 };
}
