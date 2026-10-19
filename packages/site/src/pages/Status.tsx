/**
 * The status board: the status of each finding of the October deep dive, of the architecture
 * roadmap and of the July register. `scripts/status-data.mjs` reads the status documents of
 * packages/documentation at build time, so the board shows what the documents say.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { InlineMarkdown } from "../components/InlineMarkdown";
import { Releases } from "../components/Releases";
import type { CommitLink, Finding, FindingStatus, RoadmapItem, Severity } from "../data";
import { status } from "../data/status";
import { href, safeDecode, writeUrl, type Route } from "../lib/router";

// ---------------------------------------------------------------------------
// Statuses and severities
// ---------------------------------------------------------------------------

/** The statuses of a finding, in the order of the bars: from fixed to open. A bar counts "done" as "fixed". */
const BAR_ORDER: FindingStatus[] = ["fixed", "partly", "decision", "open"];
/** The order of the list: the work that is left comes first. */
const LIST_ORDER: FindingStatus[] = ["open", "decision", "partly", "fixed", "done"];
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const STATUS_INFO: Record<FindingStatus, { label: string; icon: string; tone: string; meaning: string }> = {
  open: { label: "Open", icon: "○", tone: "bad", meaning: "No change yet" },
  decision: { label: "Decision", icon: "?", tone: "neutral", meaning: "The owner decides" },
  partly: { label: "Partly", icon: "◐", tone: "warn", meaning: "A part is done" },
  fixed: { label: "Fixed", icon: "✓", tone: "good", meaning: "A commit fixed it" },
  done: { label: "Done", icon: "✓", tone: "good", meaning: "A commit did it" },
};

/** The statuses that the filter chips show: "done" counts with "fixed". */
const FILTER_STATUSES: FindingStatus[] = ["open", "decision", "partly", "fixed"];

function StatusPill({ value }: { value: FindingStatus }): ReactElement {
  const info = STATUS_INFO[value];
  return (
    <span className={`pill status-pill tone-${info.tone}`}>
      <span aria-hidden="true">{info.icon}</span> {info.label}
    </span>
  );
}

function SeverityTag({ finding }: { finding: Finding }): ReactElement | null {
  if (!finding.severity) return <span className="muted small">—</span>;
  // Four bars like a signal meter: critical lights four, low lights one
  const lit = SEVERITY_ORDER.length - SEVERITY_ORDER.indexOf(finding.severity);
  return (
    <span className={`severity sev-${finding.severity}`}>
      <span className="sev-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={index < lit ? "on" : ""} />
        ))}
      </span>
      {finding.severityText}
    </span>
  );
}

function Commits({ commits }: { commits: CommitLink[] }): ReactElement {
  if (commits.length === 0) return <span className="muted small">—</span>;
  return (
    <span className="commit-links">
      {commits.map((commit) => (
        <a key={`${commit.repo}/${commit.hash}`} href={commit.url} title={`Commit ${commit.hash} of ${commit.repo} on GitHub`}>
          {commit.repo !== "client" ? <span className="commit-repo">{commit.repo} </span> : null}
          <code>{commit.hash.slice(0, 7)}</code>
        </a>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filters (in the URL, so a link keeps them)
// ---------------------------------------------------------------------------

interface Filters {
  query: string;
  area: string;
  statuses: FindingStatus[];
  severities: Severity[];
}

function listOf<T extends string>(text: string | null, allowed: readonly T[]): T[] {
  return (text ?? "").split(",").filter((item): item is T => (allowed as readonly string[]).includes(item));
}

function filtersOf(route: Route): Filters {
  return {
    query: route.query.get("q") ?? "",
    area: route.query.get("area") ?? "",
    statuses: listOf(route.query.get("status"), FILTER_STATUSES),
    severities: listOf(route.query.get("severity"), SEVERITY_ORDER),
  };
}

function queryOf(filters: Filters): Record<string, string> {
  return { q: filters.query, area: filters.area, status: filters.statuses.join(","), severity: filters.severities.join(",") };
}

function matches(finding: Finding, filters: Filters): boolean {
  if (filters.area && finding.area !== filters.area) return false;
  const statusKey = finding.status === "done" ? "fixed" : finding.status;
  if (filters.statuses.length > 0 && !filters.statuses.includes(statusKey)) return false;
  if (filters.severities.length > 0 && (!finding.severity || !filters.severities.includes(finding.severity))) return false;
  const text = filters.query.trim().toLowerCase();
  if (text && !`${finding.id} ${finding.note} ${finding.severityText}`.toLowerCase().includes(text)) return false;
  return true;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((candidate) => candidate !== item) : [...list, item];
}

// ---------------------------------------------------------------------------
// The chart: one stacked bar for each area
// ---------------------------------------------------------------------------

type Counts = Record<FindingStatus, number>;

/** The counts of the statuses. "done" counts as "fixed". */
function countsOf(findings: Finding[]): Counts {
  const counts: Counts = { open: 0, decision: 0, partly: 0, fixed: 0, done: 0 };
  for (const finding of findings) counts[finding.status === "done" ? "fixed" : finding.status]++;
  return counts;
}

function summaryOf(counts: Counts): string {
  return BAR_ORDER.filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} ${STATUS_INFO[key].label.toLowerCase()}`)
    .join(", ");
}

function Legend(): ReactElement {
  return (
    <div className="legend status-legend" aria-label="Legend">
      {(["fixed", "partly", "decision", "open"] as FindingStatus[]).map((key) => (
        <span key={key} className={`legend-item tone-${STATUS_INFO[key].tone}`}>
          <span className="swatch" aria-hidden="true" />
          <span aria-hidden="true">{STATUS_INFO[key].icon}</span> {STATUS_INFO[key].label}
          <span className="muted"> · {STATUS_INFO[key].meaning}</span>
        </span>
      ))}
    </div>
  );
}

function AreaChart({ area, onArea }: { area: string; onArea: (slug: string) => void }): ReactElement {
  const rows = status.areas.map((candidate) => {
    const findings = status.findings.filter((finding) => finding.area === candidate.slug);
    return { area: candidate, counts: countsOf(findings), total: findings.length };
  });
  const max = Math.max(1, ...rows.map((row) => row.total));
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const place = (text: string, clientX: number, clientY: number): void => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ text, x: clientX - rect.left, y: clientY - rect.top });
  };

  return (
    <div className="area-chart" ref={box} onPointerLeave={() => setTip(null)}>
      {rows.map(({ area: row, counts, total }) => {
        const selected = area === row.slug;
        return (
          <button
            key={row.slug}
            type="button"
            className={`area-row${selected ? " selected" : ""}${area && !selected ? " dim" : ""}`}
            aria-pressed={selected}
            aria-label={`${row.label}: ${total} findings, ${summaryOf(counts)}. ${selected ? "Show all areas" : "Show only this area"}`}
            onClick={() => onArea(selected ? "" : row.slug)}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              place(`${row.title}: ${summaryOf(counts)}`, rect.left + rect.width / 2, rect.top);
            }}
            onBlur={() => setTip(null)}
          >
            <span className="area-label">{row.label}</span>
            <span className="area-track">
              <span className="area-bar" style={{ width: `${(total / max) * 100}%` }}>
                {BAR_ORDER.filter((key) => counts[key] > 0).map((key) => (
                  <span
                    key={key}
                    className={`area-seg tone-${STATUS_INFO[key].tone}`}
                    style={{ flexGrow: counts[key] }}
                    onPointerMove={(event) => place(`${row.label}: ${counts[key]} ${STATUS_INFO[key].label.toLowerCase()}`, event.clientX, event.clientY)}
                  />
                ))}
              </span>
            </span>
            <span className="area-total">
              {total}
              {counts.open + counts.decision + counts.partly > 0 ? (
                <span className="area-left"> · {counts.open + counts.decision + counts.partly} left</span>
              ) : null}
            </span>
          </button>
        );
      })}
      {tip ? (
        <div className="chart-tip" role="presentation" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The roadmap
// ---------------------------------------------------------------------------

const PHASES: Array<{ phase: number; title: string }> = [
  { phase: 0, title: "Phase 0: safety and correctness" },
  { phase: 1, title: "Phase 1: one semantics" },
  { phase: 2, title: "Phase 2: contracts" },
  { phase: 3, title: "Phase 3: structure" },
];

function Roadmap({ items }: { items: RoadmapItem[] }): ReactElement {
  return (
    <div className="roadmap">
      {PHASES.map(({ phase, title }) => {
        const list = items.filter((item) => item.phase === phase);
        if (list.length === 0) return null;
        const done = list.filter((item) => item.status === "done" || item.status === "fixed").length;
        return (
          <section key={phase} className="roadmap-phase panel" aria-labelledby={`phase-${phase}`}>
            <h3 id={`phase-${phase}`}>{title}</h3>
            <div className="phase-meter" role="img" aria-label={`${done} of ${list.length} items done`}>
              <span style={{ width: `${(done / list.length) * 100}%` }} />
            </div>
            <p className="muted small">
              {done} of {list.length} done
            </p>
            <ol className="roadmap-items">
              {list.map((item) => (
                <li key={item.item} className={`roadmap-item tone-${STATUS_INFO[item.status].tone}`}>
                  <div className="roadmap-head">
                    <span>
                      <InlineMarkdown text={item.item} />
                    </span>
                    <StatusPill value={item.status} />
                  </div>
                  {item.note ? (
                    <p className="small muted">
                      <InlineMarkdown text={item.note} base="packages/documentation/deep-dive-2026-10" />
                    </p>
                  ) : null}
                  {item.commits.length > 0 ? <Commits commits={item.commits} /> : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function Status({ route }: { route: Route }): ReactElement {
  const [filters, setFilters] = useState<Filters>(() => filtersOf(route));
  const update = (change: Partial<Filters>): void => setFilters((previous) => ({ ...previous, ...change }));

  // A link or the Back button changes the filters
  useEffect(() => {
    setFilters(filtersOf(route));
  }, [route]);

  // A link with an anchor ("status/#releases") goes to its section, also after a navigation of the site.
  // It runs before the next effect, which can write the URL without the anchor
  useEffect(() => {
    const id = safeDecode(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [route]);

  // The filters change the URL without a new history entry
  useEffect(() => {
    writeUrl(href("status", undefined, queryOf(filters)), "replace");
  }, [filters]);

  const shown = useMemo(() => {
    const index = new Map(status.findings.map((finding, position) => [finding, position]));
    return status.findings
      .filter((finding) => matches(finding, filters))
      .sort(
        (a, b) =>
          LIST_ORDER.indexOf(a.status) - LIST_ORDER.indexOf(b.status) ||
          (a.severity ? SEVERITY_ORDER.indexOf(a.severity) : 9) - (b.severity ? SEVERITY_ORDER.indexOf(b.severity) : 9) ||
          index.get(a)! - index.get(b)!,
      );
  }, [filters]);

  const all = countsOf(status.findings);
  const fixed = all.fixed;
  const left = all.open + all.decision + all.partly;
  const labelOf = new Map(status.areas.map((area) => [area.slug, area.label]));
  const filtered = filters.query !== "" || filters.area !== "" || filters.statuses.length > 0 || filters.severities.length > 0;
  const julyTotal = status.july.summary.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="status-page">
      <h1>Status</h1>
      <p className="lead-text">
        The releases of the packages, and the status of each finding of the October deep dive, of the architecture roadmap and
        of the July bug register. The build reads the changelogs and the status documents of the repository, so this page shows
        what they say.
      </p>

      <Releases />

      <h2 id="deep-dive-title">The October deep dive</h2>

      <div className="stat-tiles">
        <div className="stat-tile">
          <strong>{status.findings.length}</strong>
          <span>findings</span>
        </div>
        <div className="stat-tile tone-good">
          <strong>{fixed}</strong>
          <span>
            <span aria-hidden="true">✓</span> fixed
          </span>
        </div>
        <div className="stat-tile tone-warn">
          <strong>{all.partly}</strong>
          <span>
            <span aria-hidden="true">◐</span> partly
          </span>
        </div>
        <div className="stat-tile tone-neutral">
          <strong>{all.decision}</strong>
          <span>
            <span aria-hidden="true">?</span> for a decision
          </span>
        </div>
        <div className="stat-tile tone-bad">
          <strong>{all.open}</strong>
          <span>
            <span aria-hidden="true">○</span> open
          </span>
        </div>
      </div>
      <p className="muted small">
        {Math.round((fixed / Math.max(1, status.findings.length)) * 100)}% fixed. {left} {left === 1 ? "finding has" : "findings have"} work left.
      </p>

      <section className="panel status-section" aria-labelledby="by-area">
        <h2 id="by-area" className="panel-title">
          By area
        </h2>
        <p className="muted small">Each bar is one area of the deep dive. Select an area to show only its findings.</p>
        <Legend />
        <AreaChart area={filters.area} onArea={(area) => update({ area })} />
      </section>

      <section className="status-section" aria-labelledby="findings-title">
        <h2 id="findings-title">Findings</h2>
        <div className="status-filters" role="group" aria-label="Filters of the findings">
          <input
            type="search"
            placeholder="Search the IDs and the notes"
            aria-label="Search the findings"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
          <select value={filters.area} onChange={(event) => update({ area: event.target.value })} aria-label="Area">
            <option value="">All areas</option>
            {status.areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.label}
              </option>
            ))}
          </select>
          <span className="chip-group" role="group" aria-label="Status">
            {FILTER_STATUSES.map((key) => (
              <button
                key={key}
                type="button"
                className={`chip tone-${STATUS_INFO[key].tone}`}
                aria-pressed={filters.statuses.includes(key)}
                onClick={() => update({ statuses: toggle(filters.statuses, key) })}
              >
                <span aria-hidden="true">{STATUS_INFO[key].icon}</span> {STATUS_INFO[key].label}
              </button>
            ))}
          </span>
          <span className="chip-group" role="group" aria-label="Severity">
            {SEVERITY_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className="chip"
                aria-pressed={filters.severities.includes(key)}
                onClick={() => update({ severities: toggle(filters.severities, key) })}
              >
                {key}
              </button>
            ))}
          </span>
          {filtered ? (
            <button type="button" className="ghost" onClick={() => setFilters({ query: "", area: "", statuses: [], severities: [] })}>
              Clear the filters
            </button>
          ) : null}
        </div>
        <p className="muted small" aria-live="polite">
          {shown.length} of {status.findings.length} findings
        </p>
        {shown.length === 0 ? (
          <p className="callout">No finding matches the filters.</p>
        ) : (
          <div className="table-wrap">
            <table className="findings">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Area</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Status</th>
                  <th scope="col">Note</th>
                  <th scope="col">Commits</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((finding) => (
                  <tr key={`${finding.area}/${finding.id}`}>
                    <th scope="row" data-label="ID">
                      <InlineMarkdown text={finding.id} />
                    </th>
                    <td data-label="Area" className="nowrap">
                      {labelOf.get(finding.area) ?? finding.area}
                    </td>
                    <td data-label="Severity">
                      <SeverityTag finding={finding} />
                    </td>
                    <td data-label="Status">
                      <StatusPill value={finding.status} />
                    </td>
                    <td data-label="Note" className="note-cell">
                      {finding.note ? <InlineMarkdown text={finding.note} base="packages/documentation/deep-dive-2026-10" /> : <span className="muted">—</span>}
                    </td>
                    <td data-label="Commits">
                      <Commits commits={finding.commits} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="status-section" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">Architecture roadmap</h2>
        <p className="muted small">The phases of the architecture review. Each item lists its commits when work started.</p>
        <Roadmap items={status.roadmap} />
      </section>

      <section className="status-section" aria-labelledby="july-title">
        <h2 id="july-title">The July bug register</h2>
        <p className="muted small">
          {julyTotal} entries of the July audit, by status. The October work fixed most of the open ones.
        </p>
        <ul className="july-summary">
          {status.july.summary.map((row) => (
            <li key={row.status}>
              <strong>{row.count}</strong> <span>{row.status}</span>
              {row.ids && !/^see /i.test(row.ids) ? (
                <details>
                  <summary className="small">IDs</summary>
                  <p className="small">
                    <InlineMarkdown text={row.ids} />
                  </p>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        <details className="july-details">
          <summary>
            The fixes of October ({status.july.fixes.length} rows)
          </summary>
          <div className="table-wrap">
            <table className="findings compact">
              <thead>
                <tr>
                  <th scope="col">IDs</th>
                  <th scope="col">Fix</th>
                  <th scope="col">Commits</th>
                </tr>
              </thead>
              <tbody>
                {status.july.fixes.map((row) => (
                  <tr key={row.ids}>
                    <th scope="row" data-label="IDs">
                      {row.ids}
                    </th>
                    <td data-label="Fix" className="note-cell">
                      <InlineMarkdown text={row.fix} base="packages/documentation" />
                    </td>
                    <td data-label="Commits">
                      <Commits commits={row.commits} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        {status.july.found.length > 0 ? (
          <details className="july-details">
            <summary>Defects that October found and fixed ({status.july.found.length})</summary>
            <ul className="found-list">
              {status.july.found.map((row) => (
                <li key={row.defect}>
                  <InlineMarkdown text={row.defect} base="packages/documentation" /> <Commits commits={row.commits} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <p className="small muted">
        Sources:{" "}
        <a href={`https://github.com/mark1russell7/client/blob/main/${status.sources.deepDive}`}>
          <code>{status.sources.deepDive}</code>
        </a>{" "}
        and{" "}
        <a href={`https://github.com/mark1russell7/client/blob/main/${status.sources.july}`}>
          <code>{status.sources.july}</code>
        </a>
        .
      </p>
    </div>
  );
}
