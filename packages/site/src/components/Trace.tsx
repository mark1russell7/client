/**
 * The trace of a run: the calls as a tree, with a bar for the time of each call.
 *
 * A call is under the call that started it. A call that hydration ran for the input of another
 * call is under that call (its consumer), as in the blocks: `add { a: multiply }` shows multiply
 * under add, with the tag "input", although multiply ran first.
 *
 * The tree is a WAI-ARIA tree: one row has the focus (Tab reaches it), the arrow keys move,
 * Left and Right close and open a call, Home and End go to the first and the last row, and
 * Enter shows the input and the output of a call. Only the visible rows are in the page, so a
 * trace of thousands of calls stays fast.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { categoryOf, procedureByKey } from "../data";
import { formatValue, previewValue } from "../lib/display";
import type { RunResult, TraceCall } from "../lib/runtime";

const ROW_HEIGHT = 26;
const VIEW_HEIGHT = 420;
const OVERSCAN = 8;

interface Row {
  call: TraceCall;
  depth: number;
  /** The position among the children of the parent, from 1. */
  position: number;
  siblings: number;
  hasChildren: boolean;
}

interface Tree {
  children: Map<number | null, TraceCall[]>;
  /** The parent of each call in the tree: its consumer, or the call that started it. */
  parentOf: Map<number, number | null>;
  total: number;
}

/**
 * The parent of each call in the tree. A consumer comes first, unless it makes a cycle (a
 * consumer that is under the call): then the call that started it.
 */
function treeParents(calls: TraceCall[]): Map<number, number | null> {
  const ids = new Set(calls.map((call) => call.id));
  const parentOf = new Map<number, number | null>();
  for (const call of calls) {
    parentOf.set(call.id, call.consumer !== undefined && ids.has(call.consumer) ? call.consumer : call.parent);
  }
  for (const call of calls) {
    if (call.consumer === undefined) continue;
    const seen = new Set<number>([call.id]);
    for (let up = parentOf.get(call.id) ?? null; up !== null; up = parentOf.get(up) ?? null) {
      if (seen.has(up)) {
        parentOf.set(call.id, call.parent);
        break;
      }
      seen.add(up);
    }
  }
  return parentOf;
}

function buildTree(result: RunResult): Tree {
  const children = new Map<number | null, TraceCall[]>();
  const parentOf = treeParents(result.calls);
  let total = Math.max(result.duration, 0.01);
  for (const call of result.calls) {
    const parent = parentOf.get(call.id) ?? null;
    const list = children.get(parent);
    if (list) list.push(call);
    else children.set(parent, [call]);
    total = Math.max(total, call.end ?? call.start);
  }
  // A call whose parent is not in the trace (the trace was full) goes to the top level
  const ids = new Set(result.calls.map((call) => call.id));
  for (const [parent, list] of children) {
    if (parent !== null && !ids.has(parent)) {
      children.delete(parent);
      children.set(null, [...(children.get(null) ?? []), ...list]);
    }
  }
  // A consumer comes after the calls of its input: show the children in the order they started
  for (const list of children.values()) list.sort((a, b) => a.start - b.start || a.id - b.id);
  return { children, parentOf, total };
}

/** The visible rows: a depth-first walk without recursion, which skips the closed calls. */
function visibleRows(tree: Tree, closed: Set<number>): Row[] {
  const rows: Row[] = [];
  const stack: Array<{ call: TraceCall; depth: number; position: number; siblings: number }> = [];
  const pushChildren = (parent: number | null, depth: number): void => {
    const list = tree.children.get(parent) ?? [];
    for (let index = list.length - 1; index >= 0; index--) {
      stack.push({ call: list[index]!, depth, position: index + 1, siblings: list.length });
    }
  };
  pushChildren(null, 0);
  while (stack.length > 0) {
    const item = stack.pop()!;
    const hasChildren = (tree.children.get(item.call.id)?.length ?? 0) > 0;
    rows.push({ ...item, hasChildren });
    if (hasChildren && !closed.has(item.call.id)) pushChildren(item.call.id, item.depth + 1);
  }
  return rows;
}

function Detail({ call, onClose }: { call: TraceCall; onClose: () => void }): ReactElement {
  return (
    <section className="trace-detail" aria-label={`Input and output of ${call.key}`}>
      <div className="trace-detail-head">
        <strong>
          <code>{call.key}</code>
        </strong>
        <span className="muted small">{((call.end ?? call.start) - call.start).toFixed(2)} ms</span>
        <span className="spacer" />
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="trace-detail-body">
        <div>
          <div className="muted small">input</div>
          <pre className="code" tabIndex={0} aria-label={`Input of ${call.key}`}>
            {call.input === undefined ? "(none)" : formatValue(call.input)}
          </pre>
        </div>
        <div>
          <div className="muted small">{call.error !== undefined ? "error" : "output"}</div>
          <pre className={`code${call.error !== undefined ? " error-text" : ""}`} tabIndex={0} aria-label={`${call.error !== undefined ? "Error" : "Output"} of ${call.key}`}>
            {call.error ?? (call.end === undefined ? "(no result yet)" : formatValue(call.output))}
          </pre>
        </div>
      </div>
    </section>
  );
}

export function Trace({ result }: { result: RunResult }): ReactElement {
  const tree = useMemo(() => buildTree(result), [result]);
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
  const rows = useMemo(() => visibleRows(tree, closed), [tree, closed]);
  const [active, setActive] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);

  // A new run: open every call, and keep nothing of the old run
  useEffect(() => {
    setClosed(new Set());
    setActive(null);
    setOpen(null);
  }, [result]);

  const activeIndex = Math.max(0, rows.findIndex((row) => row.call.id === active));
  const current = rows[activeIndex];

  // After a key moves the focus, the new row must be in the page: scroll, then focus it
  useEffect(() => {
    if (!focusNext.current || !viewport.current) return;
    const top = activeIndex * ROW_HEIGHT;
    const element = viewport.current;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
    const row = element.querySelector<HTMLElement>(`[data-call="${current?.call.id}"]`);
    if (row) {
      row.focus({ preventScroll: true });
      focusNext.current = false;
    }
  });

  if (rows.length === 0) {
    return <p className="muted small">{result.dropped > 0 ? `${result.dropped} calls ran. The trace has none of them.` : "No procedure ran."}</p>;
  }

  const height = Math.min(VIEW_HEIGHT, rows.length * ROW_HEIGHT + 2);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const openCall = open === null ? undefined : result.calls.find((call) => call.id === open);

  const move = (index: number): void => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    focusNext.current = true;
    setActive(row.call.id);
  };
  const toggle = (id: number, close: boolean): void => {
    setClosed((previous) => {
      const next = new Set(previous);
      if (close) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent, row: Row, index: number): void => {
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(rows.length - 1);
        break;
      case "ArrowRight":
        if (row.hasChildren && closed.has(row.call.id)) toggle(row.call.id, false);
        else if (row.hasChildren) move(index + 1);
        break;
      case "ArrowLeft":
        if (row.hasChildren && !closed.has(row.call.id)) toggle(row.call.id, true);
        else {
          const parent = tree.parentOf.get(row.call.id) ?? null;
          if (parent !== null) move(rows.findIndex((candidate) => candidate.call.id === parent));
        }
        break;
      case "Enter":
      case " ":
        setOpen(open === row.call.id ? null : row.call.id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className="trace">
      <div
        className="trace-viewport"
        ref={viewport}
        style={{ height }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div role="tree" aria-label="Trace of the calls" className="trace-tree" style={{ height: rows.length * ROW_HEIGHT }}>
          {rows.slice(first, last).map((row, offset) => {
            const index = first + offset;
            const { call, depth } = row;
            const info = procedureByKey(call.key);
            const category = info ? categoryOf(info) : "other";
            const end = call.end ?? tree.total;
            const left = (call.start / tree.total) * 100;
            const width = Math.max(((end - call.start) / tree.total) * 100, 0.8);
            const name = call.key.replace(/^client\./, "");
            const failed = call.error !== undefined;
            const isInput = call.consumer !== undefined && tree.parentOf.get(call.id) === call.consumer;
            return (
              <div
                key={call.id}
                role="treeitem"
                data-call={call.id}
                aria-level={depth + 1}
                aria-posinset={row.position}
                aria-setsize={row.siblings}
                aria-expanded={row.hasChildren ? !closed.has(call.id) : undefined}
                aria-selected={open === call.id}
                aria-label={`${name}${isInput ? ", an input" : ""}, ${failed ? `error: ${call.error}` : `result ${previewValue(call.output, 80)}`}, ${(end - call.start).toFixed(2)} ms`}
                tabIndex={index === activeIndex ? 0 : -1}
                className={`trace-row cat-${category}${open === call.id ? " open" : ""}`}
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                onClick={() => {
                  setActive(call.id);
                  setOpen(open === call.id ? null : call.id);
                }}
                onFocus={() => setActive(call.id)}
                onKeyDown={(event) => onKeyDown(event, row, index)}
              >
                <span className="trace-name" style={{ paddingLeft: depth * 14 }}>
                  {row.hasChildren ? (
                    <span
                      className="twisty"
                      aria-hidden="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(call.id, !closed.has(call.id));
                      }}
                    >
                      {closed.has(call.id) ? "▸" : "▾"}
                    </span>
                  ) : (
                    <span className="twisty" aria-hidden="true" />
                  )}
                  {name}
                  {isInput ? (
                    <span className="trace-via" title="Hydration ran this call for the input of the call above it">
                      input
                    </span>
                  ) : null}
                  {failed ? <span className="err">✗ {call.error}</span> : <span className="out">→ {previewValue(call.output)}</span>}
                </span>
                <span className="trace-track" aria-hidden="true">
                  <span className={`trace-bar${failed ? " error" : ""}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted small trace-help">
        {rows.length.toLocaleString("en")} {rows.length === 1 ? "call" : "calls"} shown
        {result.dropped > 0 ? `, ${result.dropped.toLocaleString("en")} more calls not recorded` : ""}. Arrow keys move, Enter shows a call.
      </p>
      {openCall ? <Detail call={openCall} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
