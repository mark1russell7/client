// The verdicts of the cells of the Harness workflow (CLI-33).
//
// Each shard of the workflow uploads a folder with summary.ndjson: one line for each cell, with
// its decision (for example `holds`, `fails`, `measured`, `inconclusive`, `extend` or `void`) and
// the reason. This script reads the summary of each folder under the given root, writes a table to
// the summary of the job, and writes an annotation for each cell that does not hold.
//
// Only two decisions pass: `holds`, and `measured` (a record with no band). Each other decision
// fails the script. This includes `fails`, `inconclusive`, `extend`, `void` and each new value. A
// `fails` cell shows that the release of this checkout does not do what the prediction of the cell
// says. An `inconclusive` cell shows that no run counted. The raw record of each cell is in the
// artifact of its shard.
//
// Usage: node .github/scripts/harness-verdicts.mjs <root> [expected shards]
// Exit code: 1 when a cell has a decision other than `holds` or `measured`, or when a shard has no
// summary. A summary with no cell counts as no summary.

import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [root, expected] = process.argv.slice(2);
if (root === undefined) {
  console.error("Usage: node .github/scripts/harness-verdicts.mjs <root> [expected shards]");
  process.exit(2);
}

/** The folders of the shards: each folder under the root. */
const folders = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [];
/** The lines of the summary.ndjson of a folder that are not blank, or none when the folder has no summary. */
const linesOf = (folder) => {
  const file = join(root, folder, "summary.ndjson");
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((text) => text.trim() !== "") : [];
};
/** The shards with a summary of at least one cell. An empty summary counts as a missing shard. */
const shards = folders.map((folder) => ({ folder, lines: linesOf(folder) })).filter((shard) => shard.lines.length > 0);
const summaries = shards.map((shard) => shard.folder);
const empty = folders.filter((folder) => existsSync(join(root, folder, "summary.ndjson")) && !summaries.includes(folder));
const cells = shards.flatMap((shard) => shard.lines.map((text) => ({ shard: shard.folder, ...JSON.parse(text) })));

/** These decisions do not fail the run: a band that holds, and a record with no band. */
const PASSING = new Set(["holds", "measured"]);
const failing = cells.filter((cell) => !PASSING.has(cell.decision));
const counts = cells.reduce((all, cell) => ({ ...all, [cell.decision]: (all[cell.decision] ?? 0) + 1 }), {});
const missing = expected === undefined ? 0 : Number(expected) - summaries.length;

/** This function gives a text that a cell of a Markdown table can hold. */
const cellText = (text) => String(text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
/** This function gives the reason of a verdict, shortened for the table. */
const short = (text) => {
  const plain = cellText(text);
  return plain.length > 240 ? `${plain.slice(0, 237)}...` : plain;
};

const lines = [
  "## The cells on the procedures subject of this checkout",
  "",
  `${cells.length} cells in ${summaries.length} shards: ${Object.entries(counts).map(([decision, count]) => `${count} ${decision}`).join(", ") || "none"}.`,
  ...(missing > 0 ? ["", `${missing} shards have no summary. Examine the log of each shard.`] : []),
  ...(empty.length > 0 ? ["", `These shards wrote a summary.ndjson with no cell: ${empty.join(", ")}.`] : []),
  "",
  "| Cell | Decision | Median | Why |",
  "|---|---|---|---|",
  ...cells.map((cell) => {
    const median = cell.median === null || cell.median === undefined ? "" : `${cell.median.value} ${cell.median.unit}`;
    return `| ${cellText(cell.name)} | ${cell.decision} | ${median} | ${short(cell.why)} |`;
  }),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);

for (const cell of failing) console.log(`::error title=${cellText(cell.name)}::${cell.decision}: ${cellText(cell.why)}`);
if (cells.length === 0) console.log("::error title=No cells::no shard wrote a summary.ndjson");
if (missing > 0) console.log(`::error title=Missing shards::${missing} shards wrote no summary.ndjson with a cell`);
for (const folder of empty) console.log(`::error title=Empty summary::${folder}/summary.ndjson has no cell. The script expected one line for each cell of the shard.`);
process.exit(failing.length > 0 || cells.length === 0 || missing > 0 || empty.length > 0 ? 1 : 0);
