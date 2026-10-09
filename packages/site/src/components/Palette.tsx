import { useEffect, useMemo, useState, type ReactElement } from "react";
import { categoryOf, type ProcedureInfo } from "../data";
import { PHONE_QUERY, useMediaQuery } from "../lib/media";
import { DRAG_TYPE, browserProcedures } from "./Blocks";

const ORDER = ["control-flow", "collection", "utility", "math", "comparison", "logic", "string", "array", "object", "type", "meta"];

/**
 * The procedures of the Composer. A click puts the procedure in the selected slot, and a drag
 * puts it in the slot under the pointer. On a phone the list is closed at first, so the
 * program stays in view (deep dive SITE-1).
 */
export function Palette({ onInsert, target }: { onInsert: (key: string) => void; target: string }): ReactElement {
  const phone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(!phone);
  const [query, setQuery] = useState("");
  useEffect(() => setOpen(!phone), [phone]);

  const groups = useMemo(() => {
    const text = query.trim().toLowerCase();
    const map = new Map<string, ProcedureInfo[]>();
    for (const procedure of browserProcedures) {
      if (text && !procedure.key.toLowerCase().includes(text) && !procedure.description.toLowerCase().includes(text)) continue;
      const category = categoryOf(procedure);
      const list = map.get(category);
      if (list) list.push(procedure);
      else map.set(category, [procedure]);
    }
    const rank = (category: string): number => {
      const index = ORDER.indexOf(category);
      return index === -1 ? ORDER.length : index;
    };
    return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [query]);

  return (
    <aside className="panel palette" aria-label="Procedures">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <span className="palette-title">Procedures</span> <span className="muted small">({browserProcedures.length})</span>
        </summary>
        <input
          type="search"
          placeholder={`Search ${browserProcedures.length} procedures`}
          aria-label="Search the procedures"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="muted small palette-target" aria-live="polite">
          A click puts the procedure {target}.
        </p>
        {groups.map(([category, list]) => (
          <section key={category} aria-label={category}>
            <h3>{category}</h3>
            <div className="palette-items">
              {list.map((procedure) => (
                <button
                  key={procedure.key}
                  type="button"
                  className={`palette-item cat-${category}`}
                  draggable
                  title={procedure.description}
                  aria-label={`${procedure.path[procedure.path.length - 1]}: ${procedure.description}`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, procedure.key);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onInsert(procedure.key)}
                >
                  {procedure.path[procedure.path.length - 1]}
                </button>
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 ? <p className="muted small">No procedure matches.</p> : null}
        <p className="muted small">Drag a procedure onto a slot. Or select a slot, then click a procedure.</p>
      </details>
    </aside>
  );
}
