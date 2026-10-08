import { useMemo, useState, type ReactElement } from "react";
import { categoryOf, type ProcedureInfo } from "../data";
import { DRAG_TYPE, browserProcedures } from "./Blocks";

const ORDER = ["control-flow", "collection", "utility", "math", "comparison", "logic", "string", "array", "object", "type", "meta"];

export function Palette({ onInsert }: { onInsert: (key: string) => void }): ReactElement {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const text = query.trim().toLowerCase();
    const map = new Map<string, ProcedureInfo[]>();
    for (const procedure of browserProcedures) {
      if (text && !procedure.key.toLowerCase().includes(text) && !procedure.description.toLowerCase().includes(text)) continue;
      const category = categoryOf(procedure);
      map.set(category, [...(map.get(category) ?? []), procedure]);
    }
    const rank = (category: string): number => {
      const index = ORDER.indexOf(category);
      return index === -1 ? ORDER.length : index;
    };
    return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [query]);

  return (
    <aside className="panel palette" aria-label="Procedures">
      <input
        type="search"
        placeholder={`Search ${browserProcedures.length} procedures`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {groups.map(([category, list]) => (
        <section key={category}>
          <h3>{category}</h3>
          <div className="palette-items">
            {list.map((procedure) => (
              <button
                key={procedure.key}
                type="button"
                className={`palette-item cat-${category}`}
                draggable
                title={procedure.description}
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
      <p className="muted small">Drag a procedure onto a slot. Or click a slot, then click a procedure.</p>
    </aside>
  );
}
