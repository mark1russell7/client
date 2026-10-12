/**
 * The graph view of the Composer: the program as a tree of calls, with the steps of each chain
 * in order and the `$ref` reads as dashed edges.
 *
 * The nodes are a WAI-ARIA tree: one node has the focus (Tab reaches it). Up goes to the
 * parent, Down to the first child, Left and Right to the siblings, Home and End to the first
 * and the last node. Enter selects a node, and "Edit in the blocks" opens it there.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { categoryOf, procedureByKey } from "../data";
import type { Analysis } from "../lib/analysis";
import { buildGraph, NODE_HEIGHT, NODE_WIDTH, type GraphEdge, type GraphNode } from "../lib/graph";
import { locationKey, type Json, type Location } from "../lib/program";

/** The path of an edge, and the place of its label. */
function edgeGeometry(edge: GraphEdge, from: GraphNode, to: GraphNode): { d: string; lx: number; ly: number } {
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

export function ProgramGraph({
  program,
  analysis,
  selected,
  onSelect,
  onEdit,
}: {
  program: Json;
  analysis: Analysis;
  /** The `locationKey` of the selected location of the Composer. */
  selected: string | null;
  onSelect: (location: Location) => void;
  onEdit: (location: Location) => void;
}): ReactElement {
  const graph = useMemo(() => buildGraph(program, analysis), [program, analysis]);
  const [active, setActive] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);

  const unknownCalls = useMemo(() => new Set(analysis.unknownCalls.map((use) => locationKey(use.location))), [analysis]);
  const warnings = useMemo(() => {
    const set = new Set<string>();
    for (const use of analysis.unknownRefs) {
      let best: GraphNode | undefined;
      for (const node of graph.nodes) {
        if (node.location.every((step, index) => use.location[index] === step) && (!best || node.location.length > best.location.length)) best = node;
      }
      if (best) set.add(best.id);
    }
    return set;
  }, [analysis, graph]);

  const current = (active && graph.byId.has(active) ? active : selected && graph.byId.has(selected) ? selected : graph.nodes[0]?.id) ?? null;

  useEffect(() => {
    if (!focusNext.current || current === null) return;
    focusNext.current = false;
    canvas.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(current)}"]`)?.focus();
  });

  if (graph.nodes.length === 0) {
    return <p className="muted small">The program has no call yet. A call is a node of the graph.</p>;
  }

  const order = graph.nodes;
  const move = (id: string | null | undefined): void => {
    if (!id) return;
    focusNext.current = true;
    setActive(id);
  };
  const onKeyDown = (event: KeyboardEvent, node: GraphNode): void => {
    const siblings = node.parent === null ? order.filter((candidate) => candidate.parent === null).map((candidate) => candidate.id) : graph.byId.get(node.parent)!.children;
    const position = siblings.indexOf(node.id);
    switch (event.key) {
      case "ArrowUp":
        move(node.parent);
        break;
      case "ArrowDown":
        move(node.children[0]);
        break;
      case "ArrowLeft":
        move(siblings[position - 1]);
        break;
      case "ArrowRight":
        move(siblings[position + 1]);
        break;
      case "Home":
        move(order[0]?.id);
        break;
      case "End":
        move(order[order.length - 1]?.id);
        break;
      case "Enter":
      case " ":
        onSelect(node.location);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const selectedNode = selected ? graph.byId.get(selected) : undefined;
  const refCount = graph.edges.filter((edge) => edge.kind === "ref").length;

  return (
    <div className="program-graph">
      <div className="graph-legend small" aria-hidden="true">
        <span className="legend-line input" /> a call in an input
        <span className="legend-line step" /> the next step
        <span className="legend-line ref" /> a <code>$ref</code> reads a result
      </div>
      <div className="graph-scroll">
        <div
          className="graph-canvas"
          ref={canvas}
          role="tree"
          aria-label={`The program as a graph: ${graph.nodes.length} calls, ${refCount} $ref reads`}
          style={{ width: graph.width, height: graph.height + 40 }}
        >
          <svg className="graph-edges" width={graph.width} height={graph.height + 40} aria-hidden="true">
            <defs>
              <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" />
              </marker>
              <marker id="graph-arrow-ref" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head ref" />
              </marker>
            </defs>
            {graph.edges.map((edge, index) => {
              const from = graph.byId.get(edge.from)!;
              const to = graph.byId.get(edge.to)!;
              const { d } = edgeGeometry(edge, from, to);
              return (
                <path
                  key={index}
                  d={d}
                  className={`graph-edge ${edge.kind}`}
                  markerEnd={edge.kind === "input" ? undefined : edge.kind === "ref" ? "url(#graph-arrow-ref)" : "url(#graph-arrow)"}
                />
              );
            })}
          </svg>
          {graph.edges
            .filter((edge) => edge.label && edge.kind !== "step")
            .map((edge, index) => {
              const { lx, ly } = edgeGeometry(edge, graph.byId.get(edge.from)!, graph.byId.get(edge.to)!);
              return (
                <span key={index} className={`graph-label ${edge.kind}`} style={{ left: lx, top: ly }} aria-hidden="true">
                  {edge.kind === "ref" ? `$ref ${edge.label}` : edge.label}
                </span>
              );
            })}
          {graph.nodes.map((node) => {
            const info = procedureByKey(node.key);
            const category = info ? categoryOf(info) : "other";
            const siblings = node.parent === null ? order.filter((candidate) => candidate.parent === null).length : graph.byId.get(node.parent)!.children.length;
            const position = node.parent === null ? 1 : graph.byId.get(node.parent)!.children.indexOf(node.id) + 1;
            const unknown = unknownCalls.has(node.id);
            const warning = warnings.has(node.id);
            const place = node.label ? `, in ${node.label}` : "";
            return (
              <button
                key={node.id}
                type="button"
                role="treeitem"
                data-node={node.id}
                aria-level={node.depth + 1}
                aria-posinset={position}
                aria-setsize={siblings}
                aria-selected={selected === node.id}
                aria-label={`${node.key}${node.stepName ? `, named ${node.stepName}` : ""}${place}${unknown ? ", not in the catalog" : ""}${warning ? ", reads a $ref that is not in scope" : ""}`}
                tabIndex={node.id === current ? 0 : -1}
                className={`graph-node cat-${category}${selected === node.id ? " selected" : ""}${unknown ? " unknown" : ""}${warning ? " warning" : ""}`}
                style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                onClick={() => {
                  setActive(node.id);
                  onSelect(node.location);
                }}
                onDoubleClick={() => onEdit(node.location)}
                onFocus={() => setActive(node.id)}
                onKeyDown={(event) => onKeyDown(event, node)}
              >
                <span className="graph-node-name">
                  {warning ? <span aria-hidden="true">⚠ </span> : null}
                  {node.name}
                </span>
                <span className="graph-node-meta">
                  {node.stepName ? (
                    <span className="graph-step-name">{node.stepName}</span>
                  ) : node.flow ? (
                    "control flow"
                  ) : (
                    node.key.split(".").slice(0, -1).join(".")
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="graph-detail" aria-live="polite">
        {selectedNode ? (
          <>
            <span className="small">
              <code>{selectedNode.key}</code>
              {selectedNode.label ? <span className="muted"> in {selectedNode.label}</span> : <span className="muted"> at the root</span>}
            </span>
            <button type="button" onClick={() => onEdit(selectedNode.location)}>
              Edit in the blocks
            </button>
          </>
        ) : (
          <span className="muted small">Select a call (click it, or move with the arrow keys and press Enter). Double-click opens it in the blocks.</span>
        )}
      </div>
    </div>
  );
}
