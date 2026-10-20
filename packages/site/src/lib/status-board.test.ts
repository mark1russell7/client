/**
 * The live status board: the roadmap parser and the GitHub step (`scripts/status-board-data.mjs`),
 * and the pure parts of the page (`lib/status-board.ts`).
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RoadmapParseError,
  buildStatusBoard,
  checkStateOf,
  githubOpenWork,
  linksOf,
  markdownTables,
  readStatusBoard,
  roadmapItems,
  statusClassOf,
  type GitHubOpenWork,
} from "../../scripts/status-board-data.mjs";
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

describe("the status classes", () => {
  it("map the free text of a status by its keywords", () => {
    expect(["fixed", "done", "shipped", "merged", "fixed: 12 cells hold", "Done, needs a release"].map(statusClassOf)).toEqual(Array(6).fill("done"));
    expect(["in progress", "In-progress", "active"].map(statusClassOf)).toEqual(["progress", "progress", "progress"]);
    expect(["waiting for Mark", "needs the owner", "waits for D13"].map(statusClassOf)).toEqual(["waiting", "waiting", "waiting"]);
    expect(statusClassOf("blocked, waits for X")).toBe("blocked");
    expect(["later", "deferred"].map(statusClassOf)).toEqual(["later", "later"]);
    expect(["open", "next", "", "not started", "not done"].map(statusClassOf)).toEqual(Array(5).fill("open"));
  });
});

describe("the roadmap items", () => {
  const items = roadmapItems(ROADMAP, OPTIONS);

  it("read each table with an ID column and a Status column, with the heading above it", () => {
    expect(items.map((item) => item.id)).toEqual(["R1", "R2", "R3", "O1", "O2", "O3", "O4", "O5"]);
    expect(items.map((item) => item.section)).toEqual([...Array(3).fill("The items"), ...Array(5).fill("Open work")]);
    expect(items.map((item) => item.statusClass)).toEqual(["done", "done", "progress", "waiting", "blocked", "later", "open", "open"]);
  });

  it("keep the title from Item or Title, the text of the status, and the optional fields", () => {
    expect(items[1]).toMatchObject({ title: "`HybridStorage` keeps its copy", status: "fixed (the plan changed)", line: 14 });
    expect(items[3]).toMatchObject({ title: "The guide | the index", status: "waiting for Mark", owner: "`client`", area: "Docs", needs: "O2" });
    expect(items[4]).not.toHaveProperty("owner");
    expect(items[0]).not.toHaveProperty("area");
  });

  it("give the links of the Where and Commit cells: Markdown links, pull requests and commits", () => {
    expect(items[0]!.links).toEqual([
      { label: "cfb9d69", url: "https://github.com/acme/widgets/commit/cfb9d69" },
      { label: "ad8d8c2", url: "https://github.com/acme/widgets/commit/ad8d8c2" },
    ]);
    expect(items[1]!.links).toEqual([
      { label: "systems #16", url: "https://github.com/acme/systems/pull/16" },
      { label: "systems 065d6a2", url: "https://github.com/acme/systems/commit/065d6a2" },
      { label: "061fa22", url: "https://github.com/acme/widgets/commit/061fa22" },
    ]);
    expect(items[3]!.links).toEqual([
      { label: "client PR #7", url: "https://github.com/acme/widgets/pull/7" },
      { label: "the contract", url: "https://github.com/acme/widgets/blob/abc1234/docs/CONTRACT.md#rules" },
    ]);
    expect(items[5]!.links.map((link) => link.url)).toEqual([28, 29, 30].map((number) => `https://github.com/acme/jarvis/pull/${number}`));
    expect(items[2]!.links).toEqual([]);
  });

  it("give only the absolute links without a repository", () => {
    expect(linksOf("[a](https://example.com/a), [b](./b.md), `abcdef12`, PR #3")).toEqual([{ label: "a", url: "https://example.com/a" }]);
  });

  it("stop at a row whose cells do not match the header, with the file and the line", () => {
    const broken = "## A\n\n| ID | Status |\n|---|---|\n| R1 | open | extra |\n";
    expect(() => roadmapItems(broken, { file: "R.md" })).toThrow(RoadmapParseError);
    expect(() => roadmapItems(broken, { file: "R.md" })).toThrow(/R\.md:5: the row has 3 cells/);
  });

  it("skip the tables in fenced code", () => {
    expect(markdownTables("```\n| ID | Status |\n|---|---|\n| X | open |\n```\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

const ANSWER = {
  data: {
    repository: {
      pullRequests: {
        totalCount: 2,
        nodes: [
          {
            number: 12,
            title: "site: a live board",
            url: "https://github.com/acme/widgets/pull/12",
            isDraft: false,
            createdAt: "2026-10-18T10:00:00Z",
            updatedAt: "2026-10-19T12:00:00Z",
            headRefName: "site/live",
            author: { login: "mark" },
            labels: { nodes: [{ name: "site" }] },
            commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
          },
          {
            number: 11,
            title: "draft",
            url: "https://github.com/acme/widgets/pull/11",
            isDraft: true,
            createdAt: "2026-10-17T10:00:00Z",
            updatedAt: "2026-10-18T12:00:00Z",
            headRefName: "wip",
            author: null,
            labels: { nodes: [] },
            commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
          },
        ],
      },
      issues: {
        totalCount: 1,
        nodes: [
          {
            number: 3,
            title: "A bug",
            url: "https://github.com/acme/widgets/issues/3",
            createdAt: "2026-10-01T00:00:00Z",
            updatedAt: "2026-10-02T00:00:00Z",
            author: { login: "ann" },
            labels: { nodes: [{ name: "bug" }] },
          },
        ],
      },
    },
  },
};

/** A fetch that records each request and gives one answer. */
function fakeFetch(answer: () => Promise<Response>): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return answer();
    }) as typeof fetch,
  };
}

describe("the GitHub step", () => {
  it("reads the open pull requests and issues with one GraphQL request", async () => {
    const { fetch, calls } = fakeFetch(async () => new Response(JSON.stringify(ANSWER), { status: 200 }));
    const result = await githubOpenWork({ owner: "acme", repo: "widgets", token: "t0ken", fetch });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.github.com/graphql");
    expect((calls[0]!.init?.headers as Record<string, string>)["authorization"]).toBe("bearer t0ken");
    const body = JSON.parse(String(calls[0]!.init?.body)) as { query: string; variables: Record<string, unknown> };
    expect(body.variables).toEqual({ owner: "acme", repo: "widgets", first: 50 });
    expect(body.query).toContain("pullRequests(states: OPEN");
    expect(body.query).toContain("statusCheckRollup");
    expect(result).toEqual({
      available: true,
      totals: { pullRequests: 2, issues: 1 },
      pullRequests: [
        {
          number: 12,
          title: "site: a live board",
          url: "https://github.com/acme/widgets/pull/12",
          author: "mark",
          branch: "site/live",
          draft: false,
          createdAt: "2026-10-18T10:00:00Z",
          updatedAt: "2026-10-19T12:00:00Z",
          labels: ["site"],
          checks: "success",
        },
        expect.objectContaining({ number: 11, author: "ghost", draft: true, checks: "none", labels: [] }),
      ],
      issues: [
        {
          number: 3,
          title: "A bug",
          url: "https://github.com/acme/widgets/issues/3",
          author: "ann",
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          labels: ["bug"],
        },
      ],
    });
  });

  it("gives no data and sends no request without a token", async () => {
    const { fetch, calls } = fakeFetch(async () => new Response("{}"));
    expect(await githubOpenWork({ owner: "acme", repo: "widgets", token: "", fetch })).toEqual({ available: false, reason: "the build had no GitHub token" });
    expect(calls).toHaveLength(0);
  });

  it("gives the reason of an error, and never throws", async () => {
    const http = await githubOpenWork({ owner: "a", repo: "b", token: "t", fetch: fakeFetch(async () => new Response("no", { status: 401 })).fetch });
    expect(http).toEqual({ available: false, reason: "GitHub answered with HTTP 401" });
    const graphql = await githubOpenWork({
      owner: "a",
      repo: "b",
      token: "t",
      fetch: fakeFetch(async () => new Response(JSON.stringify({ data: null, errors: [{ message: "Resource not accessible" }] }))).fetch,
    });
    expect(graphql).toEqual({ available: false, reason: "GitHub gave an error: Resource not accessible" });
    const network = await githubOpenWork({ owner: "a", repo: "b", token: "t", fetch: fakeFetch(async () => Promise.reject(new Error("getaddrinfo ENOTFOUND"))).fetch });
    expect(network).toEqual({ available: false, reason: "the request failed: getaddrinfo ENOTFOUND" });
    const missing = await githubOpenWork({ owner: "a", repo: "b", token: "t", fetch: fakeFetch(async () => new Response(JSON.stringify({ data: { repository: null } }))).fetch });
    expect(missing).toEqual({ available: false, reason: "GitHub has no repository a/b" });
  });

  it("maps the check rollup of the last commit", () => {
    expect([{ state: "SUCCESS" }, { state: "FAILURE" }, { state: "ERROR" }, { state: "PENDING" }, { state: "EXPECTED" }, null].map(checkStateOf)).toEqual([
      "success",
      "failure",
      "failure",
      "pending",
      "pending",
      "none",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function board(github: GitHubOpenWork): StatusBoardData {
  return buildStatusBoard({
    items: roadmapItems(ROADMAP, OPTIONS),
    github,
    roadmap: "docs/ROADMAP.md",
    repository: "acme/widgets",
    commit: "abc1234def5678",
    generatedAt: "2026-10-19T14:05:00Z",
  });
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
