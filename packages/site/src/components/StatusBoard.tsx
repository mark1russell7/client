/**
 * The live status board: the open work of the roadmap file, the open pull requests and the open
 * issues. The build reads them (`readStatusBoard` of `@mark1russell7/site-pages`), so the board shows the state
 * at the time of the build. The component takes only the data of the board, and it names no
 * project, so another site can use it.
 */

import "../styles/status-board.css";

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { InlineMarkdown } from "./InlineMarkdown";
import {
  OPEN_CLASSES,
  classCounts,
  doneItems,
  filtersOf,
  leadLine,
  openGroups,
  plural,
  queryOf,
  relativeTime,
  sectionsOf,
  utcDateTime,
  type BoardFilters,
  type BoardItem,
  type CheckState,
  type StatusBoardData,
  type StatusClass,
} from "../lib/status-board";
import { href, writeUrl, type Route } from "../lib/router";

/** The label, the icon and the meaning of each class. The page always shows a color with an icon and a label. */
const CLASS_INFO: Record<StatusClass, { label: string; icon: string; meaning: string }> = {
  waiting: { label: "Waiting", icon: "◷", meaning: "It waits for a person or a decision" },
  blocked: { label: "Blocked", icon: "⊘", meaning: "Other work must finish first" },
  progress: { label: "In progress", icon: "◐", meaning: "Work started" },
  open: { label: "Open", icon: "○", meaning: "Nobody started it" },
  later: { label: "Later", icon: "◌", meaning: "It is for later" },
  done: { label: "Done", icon: "✓", meaning: "It is finished" },
};

const CHECK_INFO: Record<CheckState, { label: string }> = {
  success: { label: "Checks pass" },
  failure: { label: "Checks fail" },
  pending: { label: "Checks run" },
  none: { label: "No checks" },
};

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((candidate) => candidate !== item) : [...list, item];
}

/** A time as a relative text, with the UTC time in the element and its tooltip. */
function When({ date, now }: { date: string; now: number }): ReactElement {
  return (
    <time dateTime={date} title={utcDateTime(date)}>
      {relativeTime(date, now)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// The meter: the items of each class, as one bar
// ---------------------------------------------------------------------------

function Meter({ items }: { items: readonly BoardItem[] }): ReactElement {
  const counts = classCounts(items);
  const order: StatusClass[] = ["done", ...OPEN_CLASSES];
  const total = Math.max(1, items.length);
  const summary = order
    .filter((value) => counts[value] > 0)
    .map((value) => `${counts[value]} ${CLASS_INFO[value].label.toLowerCase()}`)
    .join(", ");
  return (
    <div className="board-meter-wrap">
      <div className="board-meter" role="img" aria-label={`${plural(items.length, "item")} of the roadmap: ${summary}`}>
        {order
          .filter((value) => counts[value] > 0)
          .map((value) => (
            <span key={value} className={`board-meter-part sb-${value}`} style={{ flexGrow: counts[value] / total }} />
          ))}
      </div>
      <ul className="board-legend small" aria-hidden="true">
        {order
          .filter((value) => counts[value] > 0)
          .map((value) => (
            <li key={value} className={`sb-${value}`}>
              <span className="board-swatch" />
              {CLASS_INFO[value].label} <strong>{counts[value]}</strong>
            </li>
          ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The items
// ---------------------------------------------------------------------------

function ItemTable({ items, data }: { items: readonly BoardItem[]; data: StatusBoardData }): ReactElement {
  const fileUrl = `https://github.com/${data.source.github}/blob/${data.commit ?? "HEAD"}/${data.source.roadmap}`;
  return (
    <div className="board-table-wrap">
      <table className="board-table">
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Item</th>
            <th scope="col">Owner</th>
            <th scope="col">Status</th>
            <th scope="col">Links</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.section}/${item.id}/${item.line}`} className={`sb-${item.statusClass}`}>
              <th scope="row" data-label="ID">
                <a href={`${fileUrl}#L${item.line}`} title={`The row of ${item.id} in the roadmap file`}>
                  {item.id}
                </a>
              </th>
              <td data-label="Item" className="board-item-cell">
                <span className="board-item-title">{item.title ? <InlineMarkdown text={item.title} /> : <span className="muted">No title</span>}</span>
                <span className="board-item-meta small muted">
                  {item.section}
                  {item.area ? ` · ${item.area}` : ""}
                  {item.needs ? (
                    <>
                      {" · needs "}
                      <InlineMarkdown text={item.needs} />
                    </>
                  ) : null}
                </span>
              </td>
              <td data-label="Owner">{item.owner ? <InlineMarkdown text={item.owner} /> : <span className="muted">—</span>}</td>
              <td data-label="Status">
                <span className="board-status">
                  <span aria-hidden="true">{CLASS_INFO[item.statusClass].icon}</span> <InlineMarkdown text={item.status || CLASS_INFO[item.statusClass].label} />
                </span>
              </td>
              <td data-label="Links">
                {item.links.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  <span className="board-links">
                    {item.links.map((link) => (
                      <a key={link.url} href={link.url}>
                        {link.label}
                      </a>
                    ))}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpenWork({ data, filters, onChange }: { data: StatusBoardData; filters: BoardFilters; onChange: (filters: BoardFilters) => void }): ReactElement {
  const open = data.items.filter((item) => item.statusClass !== "done");
  const counts = classCounts(data.items);
  const sections = sectionsOf(data.items);
  const groups = useMemo(() => openGroups(data.items, filters), [data.items, filters]);
  const done = useMemo(() => doneItems(data.items, filters), [data.items, filters]);
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const filtered = filters.classes.length > 0 || filters.sections.length > 0;
  const fileUrl = `https://github.com/${data.source.github}/blob/${data.commit ?? "HEAD"}/${data.source.roadmap}`;

  return (
    <section className="board-section" aria-labelledby="open-work">
      <h2 id="open-work">Open work</h2>
      <p className="muted small">
        Each row of a table of <a href={fileUrl}>{data.source.roadmap.split("/").pop()}</a> with an ID and a status that is not done. The
        build reads the file, so this list follows each commit.
      </p>
      <Meter items={data.items} />

      <div className="board-filters" role="group" aria-label="Filters of the open work">
        <span className="board-chips" role="group" aria-label="Status of the items">
          {OPEN_CLASSES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip sb-${value}`}
              aria-pressed={filters.classes.includes(value)}
              title={CLASS_INFO[value].meaning}
              onClick={() => onChange({ ...filters, classes: toggle(filters.classes, value) })}
            >
              <span aria-hidden="true">{CLASS_INFO[value].icon}</span> {CLASS_INFO[value].label} <span className="chip-count">{counts[value]}</span>
            </button>
          ))}
        </span>
        <span className="board-chips" role="group" aria-label="Section of the roadmap">
          {sections
            .filter((section) => section.open > 0 || filters.sections.includes(section.slug))
            .map((section) => (
              <button
                key={section.slug}
                type="button"
                className="chip"
                aria-pressed={filters.sections.includes(section.slug)}
                onClick={() => onChange({ ...filters, sections: toggle(filters.sections, section.slug) })}
              >
                {section.label} <span className="chip-count">{section.open}</span>
              </button>
            ))}
        </span>
        {filtered ? (
          <button type="button" className="ghost" onClick={() => onChange({ ...filters, classes: [], sections: [] })}>
            Clear the filters
          </button>
        ) : null}
      </div>
      <p className="muted small" aria-live="polite">
        {shown} of {plural(open.length, "open item")}
      </p>

      {groups.length === 0 ? (
        <p className="callout">{open.length === 0 ? "The roadmap has no open item." : "No open item matches the filters."}</p>
      ) : (
        groups.map((group) => (
          <section key={group.statusClass} className={`board-group sb-${group.statusClass}`} aria-labelledby={`group-${group.statusClass}`}>
            <h3 id={`group-${group.statusClass}`}>
              <span aria-hidden="true">{CLASS_INFO[group.statusClass].icon}</span> {CLASS_INFO[group.statusClass].label}{" "}
              <span className="board-count">{group.items.length}</span>
            </h3>
            <ItemTable items={group.items} data={data} />
          </section>
        ))
      )}

      <p className="board-done-line">
        <span>
          <span aria-hidden="true">✓</span> {counts.done === 1 ? "1 item is done" : `${counts.done} items are done`}.
        </span>{" "}
        {counts.done > 0 ? (
          <button
            type="button"
            className="ghost"
            aria-expanded={filters.done}
            aria-controls={filters.done ? "done-items" : undefined}
            onClick={() => onChange({ ...filters, done: !filters.done })}
          >
            {filters.done ? "Hide the done items" : "Show the done items"}
          </button>
        ) : null}
      </p>
      {filters.done ? (
        <section id="done-items" className="board-group sb-done" aria-labelledby="group-done">
          <h3 id="group-done">
            <span aria-hidden="true">{CLASS_INFO.done.icon}</span> Done <span className="board-count">{done.length}</span>
          </h3>
          {done.length > 0 ? <ItemTable items={done} data={data} /> : <p className="callout">No done item matches the filters.</p>}
        </section>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

function GitHubMissing({ data }: { data: StatusBoardData }): ReactElement {
  return (
    <p className="callout">
      The build could not read GitHub{data.github.reason ? ` (${data.github.reason})` : ""}. Refer to{" "}
      <a href={`https://github.com/${data.source.github}`}>{data.source.github}</a> on GitHub.
    </p>
  );
}

function Labels({ labels }: { labels: readonly string[] }): ReactElement | null {
  if (labels.length === 0) return null;
  return (
    <span className="board-labels">
      {labels.map((label) => (
        <span key={label} className="pill">
          {label}
        </span>
      ))}
    </span>
  );
}

function PullRequests({ data, now }: { data: StatusBoardData; now: number }): ReactElement {
  const total = data.github.totals?.pullRequests ?? data.pullRequests.length;
  return (
    <section className="board-section" aria-labelledby="pull-requests">
      <h2 id="pull-requests">Pull requests</h2>
      {!data.github.available ? (
        <GitHubMissing data={data} />
      ) : data.pullRequests.length === 0 ? (
        <p className="callout">
          No pull request is open. Refer to <a href={`https://github.com/${data.source.github}/pulls?q=is%3Apr`}>all the pull requests</a>.
        </p>
      ) : (
        <>
          <p className="muted small">
            {total > data.pullRequests.length
              ? `The ${data.pullRequests.length} most recently updated of ${plural(total, "open pull request")}.`
              : `${plural(total, "open pull request")}, the most recently updated first.`}
          </p>
          <ul className="board-list">
            {data.pullRequests.map((pull) => (
              <li key={pull.number} className="board-card">
                <a className="board-card-title" href={pull.url}>
                  <span className="board-number">#{pull.number}</span> {pull.title}
                </a>
                <span className="board-card-meta small">
                  <span className={`pill ${pull.draft ? "" : "accent"}`}>{pull.draft ? "Draft" : "Ready"}</span>
                  <span className={`board-check check-${pull.checks}`}>
                    <span className="board-dot" aria-hidden="true" />
                    {CHECK_INFO[pull.checks].label}
                  </span>
                  <span>by {pull.author}</span>
                  <code className="board-branch">{pull.branch}</code>
                  <span className="muted">
                    updated <When date={pull.updatedAt} now={now} /> ({utcDateTime(pull.updatedAt)})
                  </span>
                  <Labels labels={pull.labels} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Issues({ data, now }: { data: StatusBoardData; now: number }): ReactElement {
  const total = data.github.totals?.issues ?? data.issues.length;
  return (
    <section className="board-section" aria-labelledby="issues">
      <h2 id="issues">Issues</h2>
      {!data.github.available ? (
        <GitHubMissing data={data} />
      ) : data.issues.length === 0 ? (
        <p className="callout">
          No issue is open. To report a problem, <a href={`https://github.com/${data.source.github}/issues/new`}>open an issue</a>.
        </p>
      ) : (
        <>
          <p className="muted small">
            {total > data.issues.length
              ? `The ${data.issues.length} most recently updated of ${plural(total, "open issue")}.`
              : `${plural(total, "open issue")}, the most recently updated first.`}
          </p>
          <ul className="board-list">
            {data.issues.map((issue) => (
              <li key={issue.number} className="board-card">
                <a className="board-card-title" href={issue.url}>
                  <span className="board-number">#{issue.number}</span> {issue.title}
                </a>
                <span className="board-card-meta small">
                  <span>by {issue.author}</span>
                  <span className="muted">
                    updated <When date={issue.updatedAt} now={now} /> ({utcDateTime(issue.updatedAt)})
                  </span>
                  <Labels labels={issue.labels} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export interface StatusBoardProps {
  data: StatusBoardData;
  route: Route;
  /** The route of the page, for the URL of the filters. */
  page: string;
  /** Content between the lead line and the open work, for example a link to another page. */
  intro?: ReactNode;
}

export function StatusBoard({ data, route, page, intro }: StatusBoardProps): ReactElement {
  const [filters, setFilters] = useState<BoardFilters>(() => filtersOf(route.query));
  // The relative times count from the time of the render
  const [now] = useState(() => Date.now());

  // A link or the Back button changes the filters
  useEffect(() => {
    setFilters(filtersOf(route.query));
  }, [route]);

  // The filters change the URL without a new history entry
  useEffect(() => {
    writeUrl(href(page, undefined, queryOf(filters)), "replace");
  }, [filters, page]);

  return (
    <div className="status-board">
      <h1>Status</h1>
      <p className="lead-text">{leadLine(data)}</p>
      <p className="muted small">The build reads the roadmap file and GitHub again after each commit and on a schedule.</p>
      {intro}
      <OpenWork data={data} filters={filters} onChange={setFilters} />
      <PullRequests data={data} now={now} />
      <Issues data={data} now={now} />
    </div>
  );
}
