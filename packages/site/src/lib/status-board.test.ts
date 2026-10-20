/**
 * The live status board: the pure parts of the page (`lib/status-board.ts`), and the roadmap of this
 * repository. `@mark1russell7/site-pages` reads the data, and its own tests cover the roadmap
 * parser and the GitHub step.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildStatusBoard, readStatusBoard, roadmapItems, type GitHubOpenWork } from "@mark1russell7/site-pages";
import {
  NO_FILTERS,
  classCounts,
  doneItems,
  filtersOf,
  leadLine,
  openGroups,
  queryOf,
  relativeTime,
  sectionsOf,
  slugOf,
  utcDateTime,
  type StatusBoardData,
} from "./status-board";

const ROADMAP = `# Roadmap

Text with a table that is not an item table:

| Question | Decision |
|---|---|
| A | B |

## The items

| ID | Tier | Item | Size | Status | Commit |
|---|---|---|---|---|---|
| R1 | 1 | Retry obeys the effects | M | fixed | \`cfb9d69\`, \`ad8d8c2\` |
| R2 | 1 | \`HybridStorage\` keeps its copy | S | fixed (the plan changed) | systems PR #16 (\`065d6a2\`), widgets \`061fa22\` |
| R3 | 2 | A long item | L | in progress | — |

\`\`\`md
| ID | Status |
|---|---|
| X1 | open |
\`\`\`

### Open work

| id | Area | Title | Status | Needs | Owner | Where |
|---|---|---|---|---|---|---|
| O1 | Docs | The guide \\| the index | waiting for Mark | O2 | \`client\` | [client PR #7](https://github.com/acme/widgets/pull/7), [the contract](./CONTRACT.md#rules) |
| O2 | Systems | A cell | blocked | R3 | — | — |
| O3 | Apps | A later thing | deferred | — | \`apps\` | jarvis PRs #28, #29 and #30 |
| O4 | Apps | The next thing | next | — | — | — |
| O5 | Apps | Not done yet | not started | — | — | — |
| — | Apps | A row without an ID | open | — | — | — |
`;

const OPTIONS = { file: "docs/ROADMAP.md", repository: "acme/widgets", ref: "abc1234" };

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** The board of the test roadmap. This site always has a roadmap file, so `source.roadmap` is a string. */
function board(github: GitHubOpenWork): StatusBoardData {
  return buildStatusBoard({
    items: roadmapItems(ROADMAP, OPTIONS),
    github,
    roadmap: "docs/ROADMAP.md",
    repository: "acme/widgets",
    commit: "abc1234def5678",
    generatedAt: "2026-10-19T14:05:00Z",
  }) as StatusBoardData;
}

describe("the page", () => {
  it("has the shape of the board, and a lead line from the data", () => {
    const data = board({ available: true, pullRequests: [], issues: [], totals: { pullRequests: 9, issues: 1 } });
    expect(data.source).toEqual({ roadmap: "docs/ROADMAP.md", github: "acme/widgets" });
    expect(data.github).toEqual({ available: true, totals: { pullRequests: 9, issues: 1 } });
    expect(leadLine(data)).toBe("6 open roadmap items, 9 open pull requests and 1 open issue, read at Oct 19, 2026, 14:05 UTC from abc1234.");
  });

  it("says when the build could not read GitHub", () => {
    const data = board({ available: false, reason: "the build had no GitHub token" });
    expect(data.github).toEqual({ available: false, reason: "the build had no GitHub token" });
    expect(data.pullRequests).toEqual([]);
    expect(leadLine(data)).toBe("6 open roadmap items, read at Oct 19, 2026, 14:05 UTC from abc1234. The build could not read GitHub.");
  });

  it("groups the open items in the order of the board, and filters them by class and by section", () => {
    const items = roadmapItems(ROADMAP, OPTIONS);
    expect(openGroups(items, NO_FILTERS).map((group) => [group.statusClass, group.items.map((item) => item.id)])).toEqual([
      ["waiting", ["O1"]],
      ["blocked", ["O2"]],
      ["progress", ["R3"]],
      ["open", ["O4", "O5"]],
      ["later", ["O3"]],
    ]);
    const filtered = openGroups(items, { classes: ["progress", "open"], sections: ["open-work"], done: false });
    expect(filtered.map((group) => group.items.map((item) => item.id))).toEqual([["O4", "O5"]]);
    expect(doneItems(items, NO_FILTERS).map((item) => item.id)).toEqual(["R1", "R2"]);
    expect(doneItems(items, { ...NO_FILTERS, sections: ["open-work"] })).toEqual([]);
    expect(classCounts(items)).toEqual({ waiting: 1, blocked: 1, progress: 1, open: 2, later: 1, done: 2 });
    expect(sectionsOf(items)).toEqual([
      { slug: "the-items", label: "The items", open: 1, done: 2 },
      { slug: "open-work", label: "Open work", open: 5, done: 0 },
    ]);
  });

  it("keeps the filters in the URL", () => {
    const filters = filtersOf(new URLSearchParams("status=blocked,nope,later&section=the-items&done=1"));
    expect(filters).toEqual({ classes: ["blocked", "later"], sections: ["the-items"], done: true });
    expect(queryOf(filters)).toEqual({ status: "blocked,later", section: "the-items", done: "1" });
    expect(queryOf(NO_FILTERS)).toEqual({ status: "", section: "", done: "" });
    expect(slugOf("The server stack (R37)")).toBe("the-server-stack-r37");
  });

  it("gives the times in UTC and relative to now", () => {
    const now = Date.parse("2026-10-19T14:05:00Z");
    expect(utcDateTime("2026-10-19T09:03:00-04:00")).toBe("Oct 19, 2026, 13:03 UTC");
    expect(relativeTime("2026-10-19T14:04:30Z", now)).toBe("just now");
    expect(relativeTime("2026-10-19T14:00:00Z", now)).toBe("5 minutes ago");
    expect(relativeTime("2026-10-19T13:00:00Z", now)).toBe("1 hour ago");
    expect(relativeTime("2026-10-16T13:00:00Z", now)).toBe("3 days ago");
  });
});

describe("the roadmap of this repository", () => {
  it("is readable, and the board has items in each class it names", async () => {
    const repo = fileURLToPath(new URL("../../../..", import.meta.url));
    const roadmap = "packages/documentation/ROADMAP-2026-10.md";
    const items = roadmapItems(readFileSync(join(repo, roadmap), "utf8"), { file: roadmap, repository: "mark1russell7/client" });
    expect(items.length).toBeGreaterThan(100);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.some((item) => item.statusClass !== "done")).toBe(true);
    const data = await readStatusBoard({ repoDir: repo, roadmap, owner: "mark1russell7", repo: "client", token: "" });
    expect(data.items).toHaveLength(items.length);
    expect(data.github).toEqual({ available: false, reason: "the build had no GitHub token" });
  });
});
