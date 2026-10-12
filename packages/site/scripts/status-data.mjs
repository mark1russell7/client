// Read the status documents for the status board of the site.
//
// The sources are two Markdown files of packages/documentation:
// - deep-dive-2026-10/STATUS.md: one table for each area, a row for each finding (ID, Severity,
//   Status, Commit, Note), and the table of the architecture roadmap (Item, Status, Commit, Note);
// - BUGS-STATUS-2026-10.md: the status of the July register (a summary table, the fixes of
//   October, and the defects that October found and fixed).
//
// The parser is strict: a table that it cannot read stops the build with the file and the line,
// so the board never shows a part of the data without a message.
//
// A commit cell names hashes in code spans (`ee52893`), sometimes with a repository
// (`docker-sqlite` `239baa6`, or `352adc9` (`docker-sqlite`)). Each hash links to its commit on
// GitHub. In a full clone, git tells if the hash is a commit of this repository. In a shallow
// clone, a repository name next to the hash decides.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OWNER = "mark1russell7";
const THIS_REPO = "client";

/** The values of the Status column that the board knows, in the order of the board. */
export const STATUSES = ["open", "decision", "partly", "fixed", "done"];
/** The severities, from the highest. */
export const SEVERITIES = ["critical", "high", "medium", "low"];

export class StatusParseError extends Error {}

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

/**
 * The tables of a Markdown file, each with the `##` section above it. A row whose cells do not
 * match the header is an error.
 */
export function readTables(markdown, file) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  let section = "";
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (!line.trim().startsWith("|")) continue;
    const separator = lines[index + 1] ?? "";
    if (!/^\s*\|?\s*:?-{3,}/.test(separator)) {
      throw new StatusParseError(`${file}:${index + 1}: a table needs a separator line (|---|) under its header`);
    }
    const header = splitRow(line);
    const rows = [];
    let next = index + 2;
    for (; next < lines.length && lines[next].trim().startsWith("|"); next++) {
      const cells = splitRow(lines[next]);
      if (cells.length !== header.length) {
        throw new StatusParseError(`${file}:${next + 1}: the row has ${cells.length} cells, and the header has ${header.length}`);
      }
      rows.push({ line: next + 1, cells: Object.fromEntries(header.map((name, column) => [name.toLowerCase(), cells[column]])) });
    }
    tables.push({ section, line: index + 1, header: header.map((name) => name.toLowerCase()), rows });
    index = next - 1;
  }
  return tables;
}

/** The short names of the known areas, by a word of their section title. */
const AREA_NAMES = [
  ["security", "security", "Security"],
  ["core", "core", "Core"],
  ["transports", "transports", "Transports"],
  ["wrappers", "wrappers", "Wrappers"],
  ["data", "data", "Data"],
  ["mark", "cli", "CLI"],
  ["site", "site", "Site and CI"],
  ["collections", "collections", "Collections"],
];

/**
 * A short, stable name of an area for the URL and its label: "Transports, server and
 * middleware" gives "transports" and "Transports". A new section gets its first word.
 */
export function areaOf(title) {
  const words = title
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const [word, slug, label] of AREA_NAMES) {
    if (words.includes(word)) return { slug, label };
  }
  const first = words[0] ?? "other";
  return { slug: first, label: first.charAt(0).toUpperCase() + first.slice(1) };
}

/** The status word of a cell: "fixed", "partly", ... An unknown word is an error. */
export function statusOf(cell, where) {
  const word = cell.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!STATUSES.includes(word)) {
    throw new StatusParseError(`${where}: the status "${cell}" is not one of ${STATUSES.join(", ")}`);
  }
  return word;
}

/** The highest severity that a cell names ("critical / high" gives "critical"), or null. */
export function severityOf(cell) {
  const text = (cell ?? "").toLowerCase();
  return SEVERITIES.find((severity) => text.includes(severity)) ?? null;
}

const HASH = /^[0-9a-f]{7,40}$/;

/**
 * The hashes of a commit cell, each with the repository that a name next to it gives: a code
 * span before it (`docker-sqlite` `239baa6`), or a code span in parentheses after it
 * (`352adc9` (`docker-sqlite`)). `named` is a repository name anywhere in the cell.
 */
export function hashesOf(cell) {
  const tokens = [];
  const pattern = /`([^`]+)`/g;
  let match;
  while ((match = pattern.exec(cell))) tokens.push({ text: match[1], start: match.index, end: match.index + match[0].length });
  const names = tokens.filter((token) => !HASH.test(token.text) && /^[A-Za-z][\w.-]*$/.test(token.text));
  const result = [];
  tokens.forEach((token, index) => {
    if (!HASH.test(token.text)) return;
    const before = tokens[index - 1];
    const after = tokens[index + 1];
    let adjacent = null;
    if (before && !HASH.test(before.text) && /^\s*$/.test(cell.slice(before.end, token.start))) adjacent = before.text;
    else if (after && !HASH.test(after.text) && /^\s*\(\s*$/.test(cell.slice(token.end, after.start))) adjacent = after.text;
    result.push({ hash: token.text, adjacent, named: names.length > 0 ? names[names.length - 1].text : null });
  });
  return result;
}

/**
 * The repository of a hash. `inThisRepo` is true or false in a full clone (the history
 * decides), and null in a shallow clone (only a name next to the hash decides).
 */
export function repoOf(record, inThisRepo) {
  if (inThisRepo === true) return THIS_REPO;
  if (inThisRepo === false) return record.adjacent ?? record.named ?? THIS_REPO;
  return record.adjacent ?? THIS_REPO;
}

/**
 * This function makes the commit resolver of a repository: for each hash, the repository and the
 * URL of its commit. `resolve` records a hash, and `finish` asks git once for all of them.
 */
export function commitResolver(cwd) {
  const pending = [];
  const resolve = (record) => {
    const commit = { hash: record.hash, repo: THIS_REPO, url: "" };
    pending.push({ record, commit });
    return commit;
  };
  const finish = () => {
    const run = (args, input) => execFileSync("git", args, { cwd, encoding: "utf8", input, stdio: ["pipe", "pipe", "ignore"] });
    let known = null;
    try {
      if (run(["rev-parse", "--is-shallow-repository"]).trim() === "false") {
        const hashes = [...new Set(pending.map(({ record }) => record.hash))];
        const lines = run(["cat-file", "--batch-check"], `${hashes.join("\n")}\n`).trim().split(/\r?\n/);
        known = new Map(hashes.map((hash, index) => [hash, / commit /.test(lines[index] ?? "")]));
      }
    } catch {
      known = null;
    }
    for (const { record, commit } of pending) {
      commit.repo = repoOf(record, known ? (known.get(record.hash) ?? false) : null);
      commit.url = `https://github.com/${OWNER}/${commit.repo}/commit/${record.hash}`;
    }
    pending.length = 0;
  };
  return { resolve, finish };
}

/** The IDs of a cell: "WRP-1 / MCP-2" gives ["WRP-1", "MCP-2"]. */
export function idsOf(cell) {
  return [...cell.matchAll(/\b[A-Z]{2,5}-\d+\b|\b[CHML]\d+(?:–\d+|-\d+)?\b/g)].map((match) => match[0]);
}

/** The data of the deep-dive status file. */
export function parseDeepDive(markdown, file, resolve) {
  const findings = [];
  const roadmap = [];
  const areas = [];
  for (const table of readTables(markdown, file)) {
    const where = `${file}:${table.line}`;
    const has = (name) => table.header.includes(name);
    if (!has("status") || !has("commit") || !has("note") || !(has("id") || has("item"))) {
      throw new StatusParseError(`${where}: a status table needs the columns ID (or Item), Status, Commit and Note`);
    }
    if (!table.section) throw new StatusParseError(`${where}: a status table needs a "##" section above it`);
    if (has("item")) {
      for (const row of table.rows) {
        const item = row.cells["item"];
        const phase = /^(\d)\.\d+/.exec(item)?.[1] ?? null;
        roadmap.push({
          item,
          phase: phase === null ? null : Number(phase),
          status: statusOf(row.cells["status"], `${file}:${row.line}`),
          note: row.cells["note"],
          commits: hashesOf(row.cells["commit"]).map(resolve),
        });
      }
      continue;
    }
    const { slug, label } = areaOf(table.section);
    if (areas.some((area) => area.slug === slug)) throw new StatusParseError(`${where}: two sections give the area "${slug}"`);
    areas.push({ slug, label, title: table.section });
    for (const row of table.rows) {
      findings.push({
        id: row.cells["id"],
        ids: idsOf(row.cells["id"]),
        area: slug,
        severity: severityOf(row.cells["severity"]),
        severityText: row.cells["severity"] ?? "",
        status: statusOf(row.cells["status"], `${file}:${row.line}`),
        note: row.cells["note"],
        commits: hashesOf(row.cells["commit"]).map(resolve),
      });
    }
  }
  if (findings.length === 0) throw new StatusParseError(`${file}: no finding table`);
  return { areas, findings, roadmap };
}

/** The data of the status file of the July register. */
export function parseJulyRegister(markdown, file, resolve) {
  const tables = readTables(markdown, file);
  const summaryTable = tables.find((table) => table.header.includes("count") && table.header.includes("status"));
  if (!summaryTable) throw new StatusParseError(`${file}: no summary table (Status | Count | IDs)`);
  const summary = summaryTable.rows.map((row) => {
    const count = Number(row.cells["count"]);
    if (!Number.isInteger(count)) throw new StatusParseError(`${file}:${row.line}: the count "${row.cells["count"]}" is not a number`);
    return { status: row.cells["status"], count, ids: row.cells["ids"] ?? "" };
  });
  const fixesTable = tables.find((table) => table.header.includes("fix") && table.header.includes("id"));
  if (!fixesTable) throw new StatusParseError(`${file}: no table of fixes (ID | Fix | Commit)`);
  const fixes = fixesTable.rows.map((row) => ({ ids: row.cells["id"], fix: row.cells["fix"], commits: hashesOf(row.cells["commit"] ?? "").map(resolve) }));
  const foundTable = tables.find((table) => table.header.includes("defect"));
  const found = (foundTable?.rows ?? []).map((row) => ({ defect: row.cells["defect"], commits: hashesOf(row.cells["commit"] ?? "").map(resolve) }));
  return { summary, fixes, found };
}

/** The status data of the documentation folder of the workspace. */
export function readStatusData(packagesDir, repoDir) {
  const docs = join(packagesDir, "documentation");
  const deepDiveFile = "packages/documentation/deep-dive-2026-10/STATUS.md";
  const julyFile = "packages/documentation/BUGS-STATUS-2026-10.md";
  const { resolve, finish } = commitResolver(repoDir);
  const deepDive = parseDeepDive(readFileSync(join(docs, "deep-dive-2026-10", "STATUS.md"), "utf8"), deepDiveFile, resolve);
  const july = parseJulyRegister(readFileSync(join(docs, "BUGS-STATUS-2026-10.md"), "utf8"), julyFile, resolve);
  finish();
  return { ...deepDive, july, sources: { deepDive: deepDiveFile, july: julyFile } };
}
