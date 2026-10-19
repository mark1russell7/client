// The data of a live status board: the open work of a roadmap file, and the open pull requests and
// issues of a GitHub repository. The build reads both, so the board shows the state at the time of
// the build. A scheduled build keeps the GitHub part current without a push.
//
// The step is generic. The caller gives the roadmap file, the repository and the token, and the
// step names no project:
// - `roadmapItems` reads each Markdown table with an `ID` column and a `Status` column. Each row
//   is one item, with the heading above the table as its section.
// - `githubOpenWork` asks the GitHub GraphQL API for the open pull requests and issues in one
//   request. Without a token, or after an error, it gives `{ available: false, reason }`. GitHub
//   never stops the build.
// - `buildStatusBoard` puts both parts into the shape that the page reads, and `readStatusBoard`
//   does all the steps for a file on disk.
//
// The roadmap parser is strict for the item tables: a row whose cells do not match the header
// stops the build with the file and the line, so the board never drops an item without a message.

import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

/** The classes of a status, in the order of the board. The open work comes first. */
export const STATUS_CLASSES = ["waiting", "blocked", "progress", "open", "later", "done"];

/** The GraphQL endpoint of GitHub. */
export const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export class RoadmapParseError extends Error {}

// The keywords of each class. In a status text, the first keyword wins: "done, needs a release" is
// done, and "blocked, waits for X" is blocked. A negation ("not started") comes first, so that the
// word after it does not count.
const STATUS_KEYWORDS = [
  ["open", /\bnot\s+(?:yet\s+)?(?:started|done|fixed|merged|shipped|released)\b|\bto[ -]?do\b/],
  ["done", /\b(?:done|shipped|merged|fixed|released|complete|completed|closed)\b/],
  ["progress", /\bin[ -]progress\b|\b(?:active|ongoing|started|wip)\b/],
  ["waiting", /\b(?:waiting|waits|awaiting|needs)\b/],
  ["blocked", /\bblocked\b/],
  ["later", /\b(?:later|deferred|postponed|someday)\b/],
];

/**
 * This function gives the class of a free-text status: done, progress, waiting, blocked, later or
 * open. The first keyword of the text decides. A text without a keyword ("next", "open") is open.
 */
export function statusClassOf(text) {
  const lower = String(text ?? "").toLowerCase();
  let best = { index: Infinity, value: "open" };
  for (const [value, pattern] of STATUS_KEYWORDS) {
    const match = pattern.exec(lower);
    if (match && match.index < best.index) best = { index: match.index, value };
  }
  return best.value;
}

/** The cells of a table row. A "|" in a code span or after "\" is text. */
export function splitRow(line) {
  const cells = [];
  let cell = "";
  let code = false;
  const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\\" && text[index + 1] === "|") {
      cell += "|";
      index++;
    } else if (char === "`") {
      code = !code;
      cell += char;
    } else if (char === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** The plain text of inline Markdown: no code marks, no emphasis, the text of each link. */
export function plainText(markdown) {
  return String(markdown ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A cell with no value: empty, or a dash. */
function isEmpty(cell) {
  return cell === undefined || /^\s*(?:[-–—]|n\/a)?\s*$/i.test(cell);
}

/**
 * The tables of a Markdown file. Each table has its header names in lowercase plain text, the
 * nearest heading above it, the line of its header and its rows. Fenced code is not read.
 */
export function markdownTables(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const tables = [];
  let section = "";
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMark = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMark) {
      if (fence === null) fence = fenceMark[1][0];
      else if (fenceMark[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      section = plainText(heading[1]);
      continue;
    }
    if (!line.trim().startsWith("|")) continue;
    const separator = lines[index + 1] ?? "";
    if (!/^\s*\|?\s*:?-{3,}/.test(separator)) continue;
    const header = splitRow(line).map((name) => plainText(name).toLowerCase());
    const rows = [];
    let next = index + 2;
    for (; next < lines.length && lines[next].trim().startsWith("|"); next++) {
      rows.push({ line: next + 1, cells: splitRow(lines[next]) });
    }
    tables.push({ section, line: index + 1, header, rows });
    index = next - 1;
  }
  return tables;
}

/** The columns whose cells hold the links of an item. */
const LINK_COLUMNS = ["where", "commit", "commits", "link", "links", "pr", "prs"];
/** Words before a reference that do not name a repository. */
const NOT_REPOSITORIES = new Set(
  "a an and also at by commit commits done fixed for from in into issue issues merged of on or plus pr prs run see the then to via with".split(" "),
);

/** The URL of a link target of the roadmap file: an absolute URL stays, a relative one goes to GitHub. */
function linkUrl(target, { file, repository, ref }) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (!repository) return null;
  const [path = "", anchor = ""] = target.split("#", 2);
  const resolved = path === "" ? file : posix.normalize(posix.join(posix.dirname(file), path));
  if (resolved.startsWith("..")) return null;
  return `https://github.com/${repository}/blob/${ref}/${resolved}${anchor ? `#${anchor}` : ""}`;
}

/**
 * The links of a cell: each Markdown link, then each bare reference in the rest of the text. A
 * reference is a pull request ("PR #12", "#12") or a commit hash in a code span. A repository name
 * right before a reference ("systems PR #16", "jarvis `4287d78`") applies to it and to the next
 * references of the cell. Without a name, a reference belongs to `repository`.
 */
export function linksOf(cell, { file = "", repository = "", ref = "HEAD" } = {}) {
  const links = [];
  const seen = new Set();
  const add = (label, url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ label, url });
  };
  const rest = String(cell ?? "").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, target) => {
    add(plainText(label), linkUrl(target, { file, repository, ref }));
    return " ";
  });
  if (!repository) return links;
  const [owner, defaultRepo] = repository.split("/");
  let current = defaultRepo;
  // After "PR", the next numbers of the cell are pull requests too: "PRs #28, #29 and #30"
  let pulls = false;
  const reference = /\bPRs?\s*#(\d+)|(?<![\w/&])#(\d+)\b|`([0-9a-f]{7,40})`/g;
  let match;
  while ((match = reference.exec(rest))) {
    const word = /([A-Za-z][\w.-]*)\s+$/.exec(rest.slice(0, match.index))?.[1];
    if (word && !NOT_REPOSITORIES.has(word.toLowerCase())) current = word;
    const prefix = current === defaultRepo ? "" : `${current} `;
    if (match[1] !== undefined) pulls = true;
    const number = match[1] ?? match[2];
    if (number !== undefined) add(`${prefix}#${number}`, `https://github.com/${owner}/${current}/${pulls ? "pull" : "issues"}/${number}`);
    else add(`${prefix}${match[3].slice(0, 7)}`, `https://github.com/${owner}/${current}/commit/${match[3]}`);
  }
  return links;
}

/**
 * The items of a roadmap file: one item for each row of each table with an `ID` column and a
 * `Status` column. The header names match without case. The title comes from `Item`, else from
 * `Title`. `Owner`, `Area` and `Needs` are optional. `Where`, `Commit` and `Links` give the links.
 *
 * - `file`: the path of the file in the repository, for the messages and the relative links.
 * - `repository`: "owner/name", for the bare references and the relative links. Optional.
 * - `ref`: the branch or the commit of the relative links. The default is "HEAD".
 */
export function roadmapItems(markdown, { file = "ROADMAP.md", repository = "", ref = "HEAD" } = {}) {
  const items = [];
  for (const table of markdownTables(markdown)) {
    const column = (...names) => names.map((name) => table.header.indexOf(name)).find((index) => index >= 0) ?? -1;
    const id = column("id");
    const status = column("status");
    if (id < 0 || status < 0) continue;
    const title = column("item", "title");
    const owner = column("owner");
    const area = column("area");
    const needs = column("needs");
    const linkColumns = LINK_COLUMNS.map((name) => table.header.indexOf(name)).filter((index) => index >= 0);
    for (const row of table.rows) {
      if (row.cells.length !== table.header.length) {
        throw new RoadmapParseError(`${file}:${row.line}: the row has ${row.cells.length} cells, and the header has ${table.header.length}`);
      }
      const idText = plainText(row.cells[id]);
      if (isEmpty(idText)) continue;
      const statusText = row.cells[status] ?? "";
      const item = {
        id: idText,
        title: title >= 0 ? row.cells[title] : "",
        status: statusText,
        statusClass: statusClassOf(plainText(statusText)),
        section: table.section,
        line: row.line,
        links: linkColumns.flatMap((index) => linksOf(row.cells[index], { file, repository, ref })),
      };
      if (owner >= 0 && !isEmpty(row.cells[owner])) item.owner = row.cells[owner];
      if (area >= 0 && !isEmpty(row.cells[area])) item.area = row.cells[area];
      if (needs >= 0 && !isEmpty(row.cells[needs])) item.needs = row.cells[needs];
      items.push(item);
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

const OPEN_WORK_QUERY = `query OpenWork($owner: String!, $repo: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: $first, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number title url isDraft createdAt updatedAt headRefName
        author { login }
        labels(first: 10) { nodes { name } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
    issues(states: OPEN, first: $first, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number title url createdAt updatedAt
        author { login }
        labels(first: 10) { nodes { name } }
      }
    }
  }
}`;

/** The combined check state of a commit: success, failure, pending or none. */
export function checkStateOf(rollup) {
  switch (rollup?.state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "none";
  }
}

const labelsOf = (node) => (node?.labels?.nodes ?? []).map((label) => label?.name).filter((name) => typeof name === "string");
const authorOf = (node) => node?.author?.login ?? "ghost";

/**
 * The open pull requests and issues of a repository, the most recently updated first, with one
 * GraphQL request. The result is `{ available: true, pullRequests, issues, totals }`. Without a
 * token, or after any error, the result is `{ available: false, reason }`.
 */
export async function githubOpenWork({ owner, repo, token, fetch = globalThis.fetch, endpoint = GITHUB_GRAPHQL, first = 50, timeoutMs = 15_000 } = {}) {
  if (!owner || !repo) return { available: false, reason: "no repository was given" };
  if (!token) return { available: false, reason: "the build had no GitHub token" };
  if (typeof fetch !== "function") return { available: false, reason: "this Node has no fetch" };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "status-board-data" },
      body: JSON.stringify({ query: OPEN_WORK_QUERY, variables: { owner, repo, first } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { available: false, reason: `GitHub answered with HTTP ${response.status}` };
    const body = await response.json();
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      return { available: false, reason: `GitHub gave an error: ${String(body.errors[0]?.message ?? "no message")}` };
    }
    const repository = body?.data?.repository;
    if (!repository) return { available: false, reason: `GitHub has no repository ${owner}/${repo}` };
    const pullRequests = (repository.pullRequests?.nodes ?? []).filter(Boolean).map((node) => ({
      number: node.number,
      title: node.title,
      url: node.url,
      author: authorOf(node),
      branch: node.headRefName,
      draft: node.isDraft === true,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      labels: labelsOf(node),
      checks: checkStateOf(node.commits?.nodes?.[0]?.commit?.statusCheckRollup),
    }));
    const issues = (repository.issues?.nodes ?? []).filter(Boolean).map((node) => ({
      number: node.number,
      title: node.title,
      url: node.url,
      author: authorOf(node),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      labels: labelsOf(node),
    }));
    return {
      available: true,
      pullRequests,
      issues,
      totals: { pullRequests: repository.pullRequests?.totalCount ?? pullRequests.length, issues: repository.issues?.totalCount ?? issues.length },
    };
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? `GitHub did not answer in ${timeoutMs / 1000} s` : `the request failed: ${error?.message ?? error}`;
    return { available: false, reason };
  }
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * The data of the page: the items, the open pull requests and issues, and where they come from.
 * `github` is the result of `githubOpenWork`.
 */
export function buildStatusBoard({ items, github, roadmap, repository, commit = null, generatedAt = new Date().toISOString() }) {
  return {
    generatedAt,
    commit,
    source: { roadmap, github: repository },
    items,
    pullRequests: github.available ? github.pullRequests : [],
    issues: github.available ? github.issues : [],
    github: github.available ? { available: true, totals: github.totals } : { available: false, reason: github.reason },
  };
}

/**
 * The board of a repository on disk. `roadmap` is the path of the roadmap file from `repoDir`,
 * and `owner`, `repo` and `token` go to GitHub. The relative links of the roadmap go to `commit`.
 */
export async function readStatusBoard({ repoDir, roadmap, owner, repo, token, commit = null, fetch, generatedAt }) {
  const repository = `${owner}/${repo}`;
  const markdown = readFileSync(join(repoDir, ...roadmap.split("/")), "utf8");
  const items = roadmapItems(markdown, { file: roadmap, repository, ref: commit ?? "HEAD" });
  if (items.length === 0) throw new RoadmapParseError(`${roadmap}: no table with an ID column and a Status column`);
  const github = await githubOpenWork({ owner, repo, token, ...(fetch ? { fetch } : {}) });
  return buildStatusBoard({ items, github, roadmap, repository, commit, ...(generatedAt ? { generatedAt } : {}) });
}
