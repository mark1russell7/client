/**
 * The chart of the catalog: one bar for each package, with the count of its procedures. The fill
 * of a bar is the count that matches the other filters. A click on a bar shows only that package.
 * A second click shows all packages again.
 */

import { useMemo, useState, type ReactElement } from "react";
import { packages, procedures } from "../data";
import { narrows, packageBars, visibleBars, type CatalogFilters, type PackageBar } from "../lib/catalog";

/** The bars that show before "Show all". */
const FIRST_BARS = 8;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The text of the readout under the chart for one package. */
function readout(bar: PackageBar): string {
  const reach = [`${bar.mcp} for Claude as MCP tools`, `${bar.cli} as CLI commands`, `${bar.browser} in the browser`];
  return `${plural(bar.total, "procedure")}: ${reach.join(", ")}.`;
}

interface PackageChartProps {
  filters: CatalogFilters;
  /** This function selects a package, or "" for all packages. */
  onSelect: (pkg: string) => void;
}

export function PackageChart({ filters, onSelect }: PackageChartProps): ReactElement {
  const bars = useMemo(() => packageBars(procedures, filters), [filters]);
  const [expanded, setExpanded] = useState(false);
  const [pointed, setPointed] = useState<string | null>(null);
  const shown = expanded ? bars : visibleBars(bars, FIRST_BARS, filters.pkg);
  const largest = bars[0]?.total ?? 1;
  const filtered = narrows(filters);
  const active = bars.find((bar) => bar.pkg === (pointed ?? filters.pkg));
  const description = active ? packages.find((pkg) => pkg.dir === active.pkg)?.description : undefined;

  return (
    <section className="pkg-chart" aria-labelledby="pkg-chart-title">
      <div className="pkg-chart-head">
        <h2 id="pkg-chart-title" className="pkg-chart-title">
          The procedures by package
        </h2>
        <p className="small muted">
          {filtered
            ? "The fill shows the procedures that match the filters."
            : `${plural(bars.length, "package")}. Click a bar to show only that package.`}
        </p>
      </div>
      <ul className="pkg-bars" onMouseLeave={() => setPointed(null)}>
        {shown.map((bar) => {
          const selected = filters.pkg === bar.pkg;
          const count = filtered ? `${bar.matching} of ${bar.total}` : String(bar.total);
          return (
            <li key={bar.pkg}>
              <button
                type="button"
                className={`pkg-bar${selected ? " selected" : ""}${filtered && bar.matching === 0 ? " empty" : ""}`}
                aria-pressed={selected}
                aria-label={`${bar.pkg} ${count}: ${filtered ? `${bar.matching} of ${plural(bar.total, "procedure")} match the filters` : readout(bar)} ${
                  selected ? "Show all packages." : "Show only this package."
                }`}
                onClick={() => onSelect(selected ? "" : bar.pkg)}
                onMouseEnter={() => setPointed(bar.pkg)}
                onFocus={() => setPointed(bar.pkg)}
                onBlur={() => setPointed(null)}
              >
                <code className="pkg-bar-name" title={bar.pkg}>
                  {bar.pkg}
                </code>{" "}
                <span className="pkg-bar-track" aria-hidden="true" style={{ ["--total" as string]: bar.total / largest }}>
                  <span className="pkg-bar-fill" style={{ ["--part" as string]: bar.total === 0 ? 0 : bar.matching / bar.total }} />
                </span>
                <span className="pkg-bar-count">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="pkg-chart-foot">
        <p className="small pkg-readout">
          {active ? (
            <>
              <code>{active.pkg}</code>: {readout(active)}
              {description ? <span className="muted"> {description}</span> : null}
            </>
          ) : (
            <span className="muted">Point at a bar, or move the focus to it, to see the reach of the package.</span>
          )}
        </p>
        {bars.length > FIRST_BARS ? (
          <button type="button" className="ghost small-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer" : `Show all ${bars.length} packages`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
