/**
 * The Releases section of the status page: the dates, the summary line and the layout of the
 * timeline. The timeline is an SVG with one mark for each version on a time axis.
 *
 * The axis has one band for each day with a release. A run of days with no release becomes one
 * narrow band, so the busy days get the width. In a day band, the time is linear. Marks that are
 * near each other go into lanes, so that no two labels overlap. The site shows each date in UTC,
 * so the prerendered page and the live page agree.
 */

import type { Release } from "../data";
import { compareVersions } from "./versions";

export const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The start of the UTC day of a time. */
export function utcDay(time: number): number {
  return Math.floor(time / DAY_MS) * DAY_MS;
}

/** "Oct 18": the UTC day of a time or of an ISO date. */
export function shortDate(date: string | number): string {
  const day = new Date(date);
  return `${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}`;
}

/** "Oct 18, 2026, 19:34 UTC". */
export function longDate(date: string | number): string {
  const day = new Date(date);
  const time = `${String(day.getUTCHours()).padStart(2, "0")}:${String(day.getUTCMinutes()).padStart(2, "0")}`;
  return `${shortDate(date)}, ${day.getUTCFullYear()}, ${time} UTC`;
}

/** "Oct 13–15", or "Sep 30–Oct 2" over the end of a month. */
export function dayRange(start: number, end: number): string {
  if (utcDay(start) === utcDay(end)) return shortDate(start);
  const first = new Date(start);
  const last = new Date(end);
  return first.getUTCMonth() === last.getUTCMonth()
    ? `${shortDate(start)}–${last.getUTCDate()}`
    : `${shortDate(start)}–${shortDate(end)}`;
}

export interface ReleaseSummary {
  versions: number;
  minor: number;
  patch: number;
  /** The date of the oldest and of the newest version, or null without a release. */
  first: string | null;
  last: string | null;
}

/** The numbers of the summary line. The first release counts as a version, not as a MINOR. */
export function releaseSummary(releases: readonly Release[]): ReleaseSummary {
  const times = releases.map((release) => Date.parse(release.date)).filter(Number.isFinite);
  return {
    versions: releases.length,
    minor: releases.filter((release) => release.kind === "minor").length,
    patch: releases.filter((release) => release.kind === "patch").length,
    first: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
    last: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null,
  };
}

/** The versions from the oldest to the newest: the order of the marks and of the arrow keys. */
export function oldestFirst(releases: readonly Release[]): Release[] {
  return [...releases].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || compareVersions(a.version, b.version));
}

// ---------------------------------------------------------------------------
// The layout of the timeline
// ---------------------------------------------------------------------------

export interface TimelineOptions {
  /** The width of the SVG, in pixels. */
  width: number;
  /** The space at each side, for the labels of the first and the last mark. */
  padX?: number;
  laneHeight?: number;
  /** The width of one character of a label (12 px monospace). */
  charWidth?: number;
  /** The minimum space between two labels in one lane. */
  gap?: number;
  /** The width of a run of days with no release, as a part of the width of a day with releases. */
  emptyWeight?: number;
}

/** A band of the axis: one day with releases, or a run of days with none. */
export interface TimelineBand {
  start: number;
  /** The end of the band: the start of the next day. */
  end: number;
  x0: number;
  x1: number;
  label: string;
  count: number;
  empty: boolean;
}

export interface TimelineMark {
  release: Release;
  time: number;
  x: number;
  /** 0 is the lane next to the axis. */
  lane: number;
  /** The half width of the label and of the target of the pointer. */
  half: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  plotTop: number;
  /** The y of the axis line. */
  plotBottom: number;
  laneHeight: number;
  lanes: number;
  bands: TimelineBand[];
  /** The marks from the oldest to the newest. */
  marks: TimelineMark[];
}

/** The top margin and the height of the axis labels under the plot. */
export const PLOT_TOP = 6;
export const AXIS_HEIGHT = 46;

/** This function gives the center line of a lane. */
export function laneCenter(layout: Pick<TimelineLayout, "plotBottom" | "laneHeight">, lane: number): number {
  return layout.plotBottom - (lane + 0.5) * layout.laneHeight;
}

/** The layout of the timeline at a width. */
export function timelineLayout(releases: readonly Release[], options: TimelineOptions): TimelineLayout {
  const { width, padX = 30, laneHeight = 38, charWidth = 7.4, gap = 8, emptyWeight = 0.6 } = options;
  const ordered = oldestFirst(releases).filter((release) => Number.isFinite(Date.parse(release.date)));
  if (ordered.length === 0) {
    return { width, height: PLOT_TOP + laneHeight + AXIS_HEIGHT, plotTop: PLOT_TOP, plotBottom: PLOT_TOP + laneHeight, laneHeight, lanes: 0, bands: [], marks: [] };
  }

  // The bands: each day with releases, and each run of days without
  const counts = new Map<number, number>();
  for (const release of ordered) {
    const day = utcDay(Date.parse(release.date));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const firstDay = utcDay(Date.parse(ordered[0]!.date));
  const lastDay = utcDay(Date.parse(ordered[ordered.length - 1]!.date));
  const raw: Array<{ start: number; end: number; count: number; empty: boolean; weight: number }> = [];
  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    const count = counts.get(day) ?? 0;
    const previous = raw[raw.length - 1];
    if (count === 0 && previous?.empty) previous.end = day + DAY_MS;
    else raw.push({ start: day, end: day + DAY_MS, count, empty: count === 0, weight: count === 0 ? emptyWeight : 1 });
  }
  const unit = (width - 2 * padX) / raw.reduce((sum, band) => sum + band.weight, 0);
  let cursor = padX;
  const bands: TimelineBand[] = raw.map((band) => {
    const x0 = cursor;
    cursor += band.weight * unit;
    return { start: band.start, end: band.end, x0, x1: cursor, label: dayRange(band.start, band.end - 1), count: band.count, empty: band.empty };
  });
  const xOf = (time: number): number => {
    const band = bands.find((candidate) => time >= candidate.start && time < candidate.end) ?? bands[bands.length - 1]!;
    return band.x0 + ((time - band.start) / (band.end - band.start)) * (band.x1 - band.x0);
  };

  // The lanes: each mark goes into the lowest lane where its label does not touch the last label
  const laneEnds: number[] = [];
  const marks: TimelineMark[] = ordered.map((release) => {
    const time = Date.parse(release.date);
    const x = xOf(time);
    const half = Math.max(release.version.length * charWidth, 24) / 2;
    let lane = laneEnds.findIndex((end) => end + gap <= x - half);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = x + half;
    return { release, time, x, lane, half };
  });

  const lanes = laneEnds.length;
  const plotBottom = PLOT_TOP + lanes * laneHeight;
  return { width, height: plotBottom + AXIS_HEIGHT, plotTop: PLOT_TOP, plotBottom, laneHeight, lanes, bands, marks };
}
