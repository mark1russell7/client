/**
 * The example gallery of the Composer: a card for each example, with a small drawing of its graph
 * (the layout of the graph view), its title and one sentence. A click loads the example.
 *
 * The Gallery button of the Composer opens it as a dialog with a grid of cards. An empty program
 * shows it in its panel as a list.
 */

import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactElement } from "react";
import { categoryOf, procedureByKey } from "../data";
import { analyzeProgram } from "../lib/analysis";
import type { Example } from "../lib/examples";
import { buildGraph, edgeGeometry, NODE_HEIGHT, NODE_WIDTH } from "../lib/graph";
import type { Json } from "../lib/program";

/** The graph of a program as a small drawing: the nodes in the colors of their category, and the edges. */
export function GraphThumbnail({ program }: { program: Json }): ReactElement {
  const graph = useMemo(() => buildGraph(program, analyzeProgram(program)), [program]);
  const pad = 14;
  // A $ref between two calls of one row is an arc under the row: room for it
  const bottom = graph.edges.some((edge) => edge.kind === "ref") ? 96 : pad;
  return (
    <svg
      className="thumbnail"
      viewBox={`${-pad} ${-pad} ${graph.width + pad * 2} ${graph.height + pad + bottom}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {graph.edges.map((edge, index) => {
        const from = graph.byId.get(edge.from);
        const to = graph.byId.get(edge.to);
        if (!from || !to) return null;
        return <path key={index} d={edgeGeometry(edge, from, to).d} className={`thumbnail-edge ${edge.kind}`} />;
      })}
      {graph.nodes.map((node) => {
        const info = procedureByKey(node.key);
        return (
          <g key={node.id} className={`thumbnail-node cat-${info ? categoryOf(info) : "other"}`} transform={`translate(${node.x} ${node.y})`}>
            <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} />
            <rect className="thumbnail-node-bar" width={7} height={NODE_HEIGHT} rx={3} />
            <text x={18} y={NODE_HEIGHT / 2 + 1}>
              {node.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface GalleryProps {
  examples: Example[];
  /** The id of the example that the Composer shows, or null. */
  current: string | null;
  onLoad: (id: string) => void;
  /** "grid": cards with the drawing on top. "list": the drawing on the left, for a narrow panel. */
  layout?: "grid" | "list";
}

export function ExampleGallery({ examples, current, onLoad, layout = "grid" }: GalleryProps): ReactElement {
  return (
    <ul className={`gallery-grid layout-${layout}`}>
      {examples.map((example) => (
        <li key={example.id}>
          <button
            type="button"
            className="gallery-card"
            aria-current={current === example.id ? "true" : undefined}
            onClick={() => onLoad(example.id)}
          >
            <span className="gallery-picture graph-paper">
              <GraphThumbnail program={example.program} />
            </span>
            <span className="gallery-text">
              <span className="gallery-title">{example.title}</span>
              <span className="gallery-summary">{example.summary}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The elements that can have the focus in an element. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
    (element) => !element.hasAttribute("disabled"),
  );
}

/**
 * The gallery as a modal dialog. The focus goes to the card of the current example (or the
 * first card), Tab stays in the dialog, and Escape, the close button or a click outside closes it.
 */
export function GalleryDialog({ examples, current, onLoad, onClose }: GalleryProps & { onClose: () => void }): ReactElement {
  const dialog = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = dialog.current;
    if (!root) return;
    const start = root.querySelector<HTMLElement>(".gallery-card[aria-current='true']") ?? root.querySelector<HTMLElement>(".gallery-card");
    start?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const items = focusables(dialog.current);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="gallery-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="gallery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
        id="example-gallery"
        ref={dialog}
        onKeyDown={onKeyDown}
      >
        <div className="gallery-head">
          <div>
            <h2 id="gallery-title">Example gallery</h2>
            <p className="small muted">
              {examples.length} programs that show the format: nested calls, named steps, control flow, scopes and
              a procedure that a program defines. Choose one to load it.
            </p>
          </div>
          <button type="button" className="ghost gallery-close" onClick={onClose} aria-label="Close the gallery">
            ✕
          </button>
        </div>
        <div className="gallery-body">
          <ExampleGallery examples={examples} current={current} onLoad={onLoad} layout="grid" />
        </div>
      </div>
    </div>
  );
}
