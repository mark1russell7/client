/**
 * The Releases section of the status page: a timeline of the versions of the `@procedures/*`
 * packages, and the changes of the selected version. `scripts/releases-data.mjs` reads the
 * changelogs and the git tags at build time.
 *
 * The page loads the changes of the newest version only. The changes of the other versions load
 * when the pointer or the focus comes to the timeline, so the first load of the page stays small.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { ReleaseChange, ReleaseEntry, ReleaseKind } from "../data";
import { releases as data } from "../data/releases";
import { laneCenter, longDate, oldestFirst, releaseSummary, shortDate, timelineLayout, type TimelineLayout } from "../lib/releases";
import { InlineMarkdown } from "./InlineMarkdown";

const REPOSITORY = "https://github.com/mark1russell7/client";
/** The width of the timeline before the page measures it (the prerender measures too). */
const DEFAULT_WIDTH = 960;
/** Below this width, the timeline scrolls in its own box, so that the labels keep their size. */
const MIN_WIDTH = 640;
/** The changes and the package chips that show before "Show all". */
const FIRST_CHANGES = 8;
const FIRST_CHIPS = 4;
/** The y of the mark below the center line of its lane. The label is above the line. */
const MARK_Y = 9;

const KIND_INFO: Record<ReleaseKind, { label: string; word: string; pill: string }> = {
  first: { label: "First release", word: "first release", pill: "pill good" },
  minor: { label: "MINOR", word: "minor", pill: "pill accent" },
  patch: { label: "PATCH", word: "patch", pill: "pill" },
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** The shape of a mark: a filled circle for a MINOR, a ring for a PATCH, a diamond for the first release. */
function MarkShape({ kind, y }: { kind: ReleaseKind; y: number }): ReactElement {
  if (kind === "first") return <rect className="release-dot" x={-5.5} y={y - 5.5} width={11} height={11} transform={`rotate(45 0 ${y})`} />;
  if (kind === "minor") return <circle className="release-dot" cy={y} r={6.5} />;
  return <circle className="release-ring" cy={y} r={4.5} />;
}

function Legend(): ReactElement {
  return (
    <div className="release-legend small">
      {(["minor", "patch", "first"] as ReleaseKind[]).map((kind) => (
        <span key={kind} className="release-legend-item">
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true" className="release-swatch">
            <g className={`kind-${kind}`}>
              <MarkShape kind={kind} y={0} />
            </g>
          </svg>
          {kind === "minor" ? "MINOR: new features or a change of the API" : kind === "patch" ? "PATCH: fixes and additions" : "The first release on npm"}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

interface TimelineProps {
  releases: ReleaseEntry[];
  selected: string;
  onSelect: (version: string) => void;
  /** The pointer or the focus came to the timeline: the changes of the other versions can load. */
  onApproach: () => void;
}

function Timeline({ releases, selected, onSelect, onApproach }: TimelineProps): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const markElements = useRef(new Map<string, SVGGElement>());
  const [boxWidth, setBoxWidth] = useState(DEFAULT_WIDTH);

  // The width of the box: the layout uses pixels, so the labels keep their size at each width
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = (): void => setBoxWidth((previous) => Math.round(element.clientWidth) || previous);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout: TimelineLayout<ReleaseEntry> = useMemo(() => timelineLayout(releases, { width: Math.max(MIN_WIDTH, boxWidth) }), [releases, boxWidth]);
  const index = layout.marks.findIndex((mark) => mark.release.version === selected);

  /** This function scrolls the box (not the page) so that the mark of a version shows. */
  const reveal = (version: string, smooth: boolean): void => {
    const box = scroller.current;
    const mark = layout.marks.find((candidate) => candidate.release.version === version);
    if (!box || !mark || box.scrollWidth <= box.clientWidth) return;
    const margin = mark.half + 16;
    if (mark.x - margin >= box.scrollLeft && mark.x + margin <= box.scrollLeft + box.clientWidth) return;
    box.scrollTo({ left: mark.x - box.clientWidth / 2, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  };

  // At first, and after a change of the width, the selected mark shows
  useLayoutEffect(() => reveal(selected, false), [layout]);

  const select = (position: number): void => {
    const mark = layout.marks[Math.max(0, Math.min(layout.marks.length - 1, position))];
    if (!mark) return;
    onSelect(mark.release.version);
    markElements.current.get(mark.release.version)?.focus({ preventScroll: true });
    reveal(mark.release.version, true);
  };

  const onKey = (event: KeyboardEvent<SVGGElement>, position: number): void => {
    // Alt+Left is the Back button of the browser
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let target: number;
    switch (event.key) {
      case "ArrowLeft":
        target = position - 1;
        break;
      case "ArrowRight":
        target = position + 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = layout.marks.length - 1;
        break;
      case "Enter":
      case " ":
        target = position;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(target);
  };

  const { plotTop, plotBottom } = layout;
  return (
    <div className="release-scroll" ref={scroller} onPointerEnter={onApproach} onFocus={onApproach}>
      <svg
        className="release-timeline"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label={`The release timeline, ${plural(layout.marks.length, "version")}. The arrow keys move between the versions.`}
      >
        <g aria-hidden="true">
          {layout.bands.map((band) => {
            const middle = (band.x0 + band.x1) / 2;
            const room = band.x1 - band.x0;
            const count = band.empty ? "no release" : plural(band.count, "release");
            return (
              <g key={band.start} className={band.empty ? "release-band empty" : "release-band"}>
                {band.empty ? <rect className="release-gap" x={band.x0} y={plotTop} width={room} height={plotBottom - plotTop} /> : null}
                <line className="release-grid" x1={band.x0} x2={band.x0} y1={plotTop} y2={plotBottom + 6} />
                {room >= band.label.length * 7 + 6 ? (
                  <text className="release-day" x={middle} y={plotBottom + 21} textAnchor="middle">
                    {band.label}
                  </text>
                ) : null}
                {room >= count.length * 6 + 6 ? (
                  <text className="release-count" x={middle} y={plotBottom + 38} textAnchor="middle">
                    {count}
                  </text>
                ) : null}
              </g>
            );
          })}
          {layout.bands.length > 0 ? (
            <line className="release-grid" x1={layout.bands[layout.bands.length - 1]!.x1} x2={layout.bands[layout.bands.length - 1]!.x1} y1={plotTop} y2={plotBottom + 6} />
          ) : null}
          <line className="release-axis" x1={layout.bands[0]?.x0 ?? 0} x2={layout.bands[layout.bands.length - 1]?.x1 ?? layout.width} y1={plotBottom} y2={plotBottom} />
        </g>
        {layout.marks.map((mark, position) => {
          const { release } = mark;
          const isSelected = release.version === selected;
          const changes = plural(release.changeCount, "change");
          return (
            <g
              key={release.version}
              ref={(element) => {
                if (element) markElements.current.set(release.version, element);
                else markElements.current.delete(release.version);
              }}
              className={`release-mark kind-${release.kind}${isSelected ? " selected" : ""}`}
              transform={`translate(${mark.x.toFixed(1)} ${laneCenter(layout, mark.lane).toFixed(1)})`}
              role="button"
              tabIndex={isSelected || (index === -1 && position === layout.marks.length - 1) ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={`${release.version}, ${KIND_INFO[release.kind].word}, ${shortDate(release.date)}, ${changes}`}
              onClick={() => select(position)}
              onKeyDown={(event) => onKey(event, position)}
            >
              <rect className="release-hit" x={-mark.half - 4} y={-layout.laneHeight / 2 + 1} width={mark.half * 2 + 8} height={layout.laneHeight - 2} rx={4} />
              {isSelected ? <circle className="release-halo" cy={MARK_Y} r={11} /> : null}
              <MarkShape kind={release.kind} y={MARK_Y} />
              <text className="release-label" y={-3} textAnchor="middle">
                {release.version}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The details of the selected version
// ---------------------------------------------------------------------------

function shortName(name: string): string {
  return name.replace(/^@procedures\//, "");
}

function PackageChips({ packages }: { packages: string[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const shown = open ? packages : packages.slice(0, FIRST_CHIPS);
  const more = packages.length - FIRST_CHIPS;
  return (
    <span className="release-chips">
      {shown.map((name) => (
        <span key={name} className="pill release-chip" title={name}>
          {shortName(name)}
        </span>
      ))}
      {more > 0 ? (
        <button
          type="button"
          className="chip release-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Fewer" : `+${more} more`}
          <span className="visually-hidden"> packages</span>
        </button>
      ) : null}
    </span>
  );
}

function Change({ change }: { change: ReleaseChange }): ReactElement {
  return (
    <li className="release-change">
      <p className="release-change-text">
        <InlineMarkdown text={change.text} />
      </p>
      <div className="release-change-meta">
        {change.commit ? (
          <a className="release-commit" href={`${REPOSITORY}/commit/${change.commit}`} title={`Commit ${change.commit} on GitHub`}>
            <code>{change.commit}</code>
          </a>
        ) : null}
        <PackageChips packages={change.packages} />
      </div>
    </li>
  );
}

/** The list of the changes of a version: null while it loads, undefined when it did not load. */
function ChangeList({ count, changes }: { count: number; changes: ReleaseChange[] | null | undefined }): ReactElement {
  const [all, setAll] = useState(false);
  if (count === 0) return <p className="small muted">This version has no change entries. The packages got the new version number only.</p>;
  if (changes === null) {
    return (
      <p className="small muted" data-loading="" aria-busy="true">
        Loading the {plural(count, "change")}…
      </p>
    );
  }
  if (changes === undefined) return <p className="small error-text">The changes did not load. The changelog has them.</p>;
  const packages = new Set(changes.flatMap((change) => change.packages)).size;
  const shown = all ? changes : changes.slice(0, FIRST_CHANGES);
  return (
    <>
      <p className="small muted">
        {plural(changes.length, "change")} in {plural(packages, "package")}. The changes with the most packages come first.
      </p>
      <ul className="release-changes">
        {shown.map((change) => (
          <Change key={change.commit ?? change.text} change={change} />
        ))}
      </ul>
      {changes.length > FIRST_CHANGES ? (
        <button type="button" className="ghost release-all" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer changes" : `Show all ${changes.length} changes`}
        </button>
      ) : null}
    </>
  );
}

function Details({ release, changes }: { release: ReleaseEntry; changes: ReleaseChange[] | null | undefined }): ReactElement {
  const info = KIND_INFO[release.kind];
  return (
    <div className="panel release-details">
      <div className="release-head">
        <h3 className="release-version">{release.version}</h3>
        <span className={info.pill}>{info.label}</span>
        <time className="small muted" dateTime={release.date}>
          {longDate(release.date)}
        </time>
        <span className="release-links small">
          <a href={`https://www.npmjs.com/package/${data.group}/v/${release.version}`}>On npm</a>
          <a href={`${REPOSITORY}/blob/main/packages/client/CHANGELOG.md#${release.version.replace(/\./g, "")}`}>Changelog</a>
        </span>
      </div>
      <ChangeList count={release.changeCount} changes={changes} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

export function Releases(): ReactElement {
  const list = data.releases;
  const ordered = useMemo(() => oldestFirst(list), [list]);
  const [selected, setSelected] = useState(() => list[0]?.version ?? "");
  const summary = releaseSummary(list);
  const release = list.find((candidate) => candidate.version === selected) ?? list[0];

  // The changes by version: at first, only those of the newest version
  const [changes, setChanges] = useState<Record<string, ReleaseChange[]> | "failed">(data.changes);
  const loading = useRef(false);
  const loadChanges = useCallback((): void => {
    if (loading.current) return;
    loading.current = true;
    import("../data/release-changes").then(
      (module) => setChanges(module.releaseChanges),
      () => setChanges("failed"),
    );
  }, []);
  // A selected version without its changes loads them
  useEffect(() => {
    if (release && changes !== "failed" && changes[release.version] === undefined && release.changeCount > 0) loadChanges();
  }, [release, changes, loadChanges]);
  const shownChanges = !release ? undefined : changes === "failed" ? data.changes[release.version] : (changes[release.version] ?? null);

  return (
    <section id="releases" className="status-section releases" aria-labelledby="releases-title">
      <h2 id="releases-title">Releases</h2>
      {summary.first && summary.last ? (
        <p className="lead-text">
          {plural(summary.versions, "version")} from {shortDate(summary.first)} to {shortDate(summary.last)}.{" "}
          {plural(summary.minor, "MINOR release")} changed the API. {plural(summary.patch, "PATCH release")} fixed defects or added
          features.
        </p>
      ) : (
        <p className="lead-text">The changelogs have no release yet.</p>
      )}
      {release ? (
        <>
          <div className="panel release-panel">
            <p className="muted small">
              Each mark is one version of the <code>@procedures/*</code> packages, in UTC. Select a mark to show its changes.
            </p>
            <Legend />
            <Timeline releases={ordered} selected={release.version} onSelect={setSelected} onApproach={loadChanges} />
          </div>
          <Details key={release.version} release={release} changes={shownChanges} />
        </>
      ) : null}
    </section>
  );
}
