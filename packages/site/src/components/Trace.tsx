import { useState, type ReactElement } from "react";
import { categoryOf, procedureByKey } from "../data";
import { formatJson } from "../lib/program";
import type { RunResult, TraceCall } from "../lib/runtime";

function preview(value: unknown): string {
  if (value === undefined) return "";
  const text = JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

function pretty(value: unknown): string {
  return value === undefined ? "(none)" : formatJson(value);
}

/** The calls of a run as a tree, with a bar for the time of each call. */
export function Trace({ result }: { result: RunResult }): ReactElement {
  const [open, setOpen] = useState<number | null>(null);
  const children = new Map<number | null, TraceCall[]>();
  for (const call of result.calls) {
    children.set(call.parent, [...(children.get(call.parent) ?? []), call]);
  }
  const rows: Array<{ call: TraceCall; depth: number }> = [];
  const walk = (parent: number | null, depth: number): void => {
    for (const call of children.get(parent) ?? []) {
      rows.push({ call, depth });
      walk(call.id, depth + 1);
    }
  };
  walk(null, 0);
  const total = Math.max(result.duration, ...result.calls.map((call) => call.end ?? call.start), 0.01);

  if (rows.length === 0) return <p className="muted small">No procedure ran.</p>;

  return (
    <div className="trace" role="tree" aria-label="Trace of the calls">
      {rows.map(({ call, depth }) => {
        const info = procedureByKey(call.key);
        const category = info ? categoryOf(info) : "other";
        const end = call.end ?? total;
        const left = (call.start / total) * 100;
        const width = Math.max(((end - call.start) / total) * 100, 0.8);
        const name = call.key.replace(/^client\./, "");
        return (
          <div key={call.id} role="treeitem" aria-expanded={open === call.id}>
            <div
              className={`trace-row cat-${category}`}
              onClick={() => setOpen(open === call.id ? null : call.id)}
              title={`${call.key}: ${(end - call.start).toFixed(2)} ms`}
            >
              <span className="trace-name" style={{ paddingLeft: depth * 14 }}>
                {depth > 0 ? "└ " : ""}
                {name}
                {call.error !== undefined ? (
                  <span className="err">✗ {call.error}</span>
                ) : (
                  <span className="out">→ {preview(call.output)}</span>
                )}
              </span>
              <span className="trace-track">
                <span
                  className={`trace-bar${call.error !== undefined ? " error" : ""}`}
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                />
              </span>
            </div>
            {open === call.id ? (
              <div className="trace-detail">
                <div>
                  <div className="muted small">input</div>
                  <pre className="code">{pretty(call.input)}</pre>
                </div>
                <div>
                  <div className="muted small">{call.error !== undefined ? "error" : "output"}</div>
                  <pre className="code">{call.error ?? pretty(call.output)}</pre>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
