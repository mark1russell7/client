/**
 * The status board: the types of its data, and the pure parts of the page. These parts are the
 * lead line, the groups of the open items, the filters and the times. `@mark1russell7/site-pages`
 * makes the data at build time, in the shape of its `status.json`. This module names no project, so another site can use it.
 */

/** The class of a status. The board shows the open classes in this order, and "done" last. */
export type StatusClass = "waiting" | "blocked" | "progress" | "open" | "later" | "done";

/** The open classes, in the order of the board. */
export const OPEN_CLASSES: readonly StatusClass[] = ["waiting", "blocked", "progress", "open", "later"];

/** A link of an item: a pull request, a commit or a Markdown link of the roadmap. */
export interface BoardLink {
  label: string;
  url: string;
}

/** One row of a table of the roadmap file. The text fields are inline Markdown. */
export interface BoardItem {
  id: string;
  title: string;
  /** The text of the Status cell, as the roadmap has it. */
  status: string;
  statusClass: StatusClass;
  owner?: string;
  area?: string;
  /** The IDs that the item needs, as the roadmap has them. */
  needs?: string;
  /** The nearest heading above the table, as plain text. */
  section: string;
  /** The line of the row in the roadmap file. */
  line: number;
  links: BoardLink[];
}

/** The combined state of the checks of the last commit of a pull request. */
export type CheckState = "success" | "failure" | "pending" | "none";

export interface BoardPullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  branch: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  checks: CheckState;
}

export interface BoardIssue {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
}

/** The data of the board, as `readStatusBoard` of `@mark1russell7/site-pages` makes it. */
export interface StatusBoardData {
  /** The ISO time of the build that read the data. */
  generatedAt: string;
  /** The commit of the build, or null. */
  commit: string | null;
  /** The roadmap file in the repository, and the repository on GitHub ("owner/name"). */
  source: { roadmap: string; github: string };
  items: BoardItem[];
  pullRequests: BoardPullRequest[];
  issues: BoardIssue[];
  /** The GitHub part: without it, the board shows the reason. */
  github: { available: boolean; reason?: string; totals?: { pullRequests: number; issues: number } };
}

// ---------------------------------------------------------------------------
// Counts and words
// ---------------------------------------------------------------------------

/** "1 item", "2 items". */
export function plural(count: number, word: string, many: string = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

/** "a", "a and b", "a, b and c". */
export function listText(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 19, 2026, 14:05 UTC". The board shows each time in UTC, so the build and the browser agree. */
export function utcDateTime(date: string | number): string {
  const day = new Date(date);
  if (Number.isNaN(day.getTime())) return "an unknown time";
  const time = `${String(day.getUTCHours()).padStart(2, "0")}:${String(day.getUTCMinutes()).padStart(2, "0")}`;
  return `${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}, ${day.getUTCFullYear()}, ${time} UTC`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", "4 months ago" from `now`. */
export function relativeTime(date: string | number, now: number): string {
  const seconds = Math.round((now - new Date(date).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "at an unknown time";
  if (seconds < 60) return "just now";
  const steps: Array<[number, string]> = [
    [60, "minute"],
    [60 * 60, "hour"],
    [60 * 60 * 24, "day"],
    [60 * 60 * 24 * 30, "month"],
    [60 * 60 * 24 * 365, "year"],
  ];
  let unit = steps[0]!;
  for (const step of steps) if (seconds >= step[0]) unit = step;
  return `${plural(Math.floor(seconds / unit[0]), unit[1])} ago`;
}

/** The short form of a commit hash. */
export function shortCommit(commit: string | null): string | null {
  return commit ? commit.slice(0, 7) : null;
}

/**
 * The lead line of the page, for example "12 open roadmap items, 9 open pull requests and 0 open
 * issues, read at Oct 19, 2026, 14:05 UTC from abc1234."
 */
export function leadLine(data: StatusBoardData): string {
  const open = data.items.filter((item) => item.statusClass !== "done").length;
  const parts = [plural(open, "open roadmap item")];
  if (data.github.available) {
    parts.push(plural(data.github.totals?.pullRequests ?? data.pullRequests.length, "open pull request"));
    parts.push(plural(data.github.totals?.issues ?? data.issues.length, "open issue"));
  }
  const commit = shortCommit(data.commit);
  const read = `read at ${utcDateTime(data.generatedAt)}${commit ? ` from ${commit}` : ""}`;
  const line = `${listText(parts)}, ${read}.`;
  return data.github.available ? line : `${line} The build could not read GitHub.`;
}

// ---------------------------------------------------------------------------
// Sections and filters
// ---------------------------------------------------------------------------

/** The part of a URL for a text: "The server stack (R37)" gives "the-server-stack-r37". */
export function slugOf(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

/** A section of the roadmap, with the count of its open items and of its done items. */
export interface BoardSection {
  slug: string;
  label: string;
  open: number;
  done: number;
}

/** The sections of the items, in the order of the file. */
export function sectionsOf(items: readonly BoardItem[]): BoardSection[] {
  const sections = new Map<string, BoardSection>();
  for (const item of items) {
    const slug = slugOf(item.section);
    const section = sections.get(slug) ?? { slug, label: item.section || "Other", open: 0, done: 0 };
    if (item.statusClass === "done") section.done++;
    else section.open++;
    sections.set(slug, section);
  }
  return [...sections.values()];
}

/** The filters of the board. They are in the URL, so a link keeps them. */
export interface BoardFilters {
  /** The open classes to show. Empty shows all of them. */
  classes: StatusClass[];
  /** The slugs of the sections to show. Empty shows all of them. */
  sections: string[];
  /** Show the done items too. */
  done: boolean;
}

export const NO_FILTERS: BoardFilters = { classes: [], sections: [], done: false };

function listOf(text: string | null): string[] {
  return (text ?? "").split(",").filter((part) => part !== "");
}

/** The filters of a URL query: `status=waiting,blocked&section=open-work&done=1`. */
export function filtersOf(query: URLSearchParams): BoardFilters {
  return {
    classes: listOf(query.get("status")).filter((value): value is StatusClass => (OPEN_CLASSES as readonly string[]).includes(value)),
    sections: listOf(query.get("section")),
    done: query.get("done") === "1",
  };
}

/** The URL query of the filters. An empty value leaves its key out of the URL. */
export function queryOf(filters: BoardFilters): Record<string, string> {
  return { status: filters.classes.join(","), section: filters.sections.join(","), done: filters.done ? "1" : "" };
}

/** A group of items with one class. */
export interface ItemGroup {
  statusClass: StatusClass;
  items: BoardItem[];
}

/**
 * The groups of the open items that the filters show, in the order of `OPEN_CLASSES`, without
 * the empty groups. In a group, the items keep the order of the file.
 */
export function openGroups(items: readonly BoardItem[], filters: BoardFilters): ItemGroup[] {
  const inSection = (item: BoardItem): boolean => filters.sections.length === 0 || filters.sections.includes(slugOf(item.section));
  return OPEN_CLASSES.filter((value) => filters.classes.length === 0 || filters.classes.includes(value))
    .map((statusClass) => ({ statusClass, items: items.filter((item) => item.statusClass === statusClass && inSection(item)) }))
    .filter((group) => group.items.length > 0);
}

/** The done items in the sections of the filters. */
export function doneItems(items: readonly BoardItem[], filters: BoardFilters): BoardItem[] {
  return items.filter((item) => item.statusClass === "done" && (filters.sections.length === 0 || filters.sections.includes(slugOf(item.section))));
}

/** The count of the items of each class. */
export function classCounts(items: readonly BoardItem[]): Record<StatusClass, number> {
  const counts: Record<StatusClass, number> = { waiting: 0, blocked: 0, progress: 0, open: 0, later: 0, done: 0 };
  for (const item of items) counts[item.statusClass]++;
  return counts;
}
