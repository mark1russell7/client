// The verdicts of the cells of the Harness workflow (CLI-33).
//
// Each shard of the workflow uploads a folder with summary.ndjson: one line for each cell, with
// its decision (`holds`, `fails`, `measured` or `inconclusive`) and the reason. This script reads
// the summary of each folder under the given root, writes a table to the summary of the job, and
// writes an annotation for each cell that does not hold.
//
// A cell that `fails` or is `inconclusive` fails the script: the release of this checkout does not
// do what the prediction of the cell says, or no run counted. A `measured` cell is a record with no
// band, thus it passes. The raw record of each cell is in the artifact of its shard.
//
// Usage: node .github/scripts/harness-verdicts.mjs <root> [expected shards]
// Exit code: 1 when a cell fails, when a cell is inconclusive, or when a shard has no summary.

import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [root, expected] = process.argv.slice(2);
if (root === undefined) {
  console.error("Usage: node .github/scripts/harness-verdicts.mjs <root> [expected shards]");
  process.exit(2);
}

/** The folders of the shards: each folder under the root that has a summary.ndjson. */
const folders = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [];
const summaries = folders.filter((folder) => existsSync(join(root, folder, "summary.ndjson")));
const cells = summaries.flatMap((folder) =>
  readFileSync(join(root, folder, "summary.ndjson"), "utf8")
    .split("\n")
    .filter((text) => text.trim() !== "")
    .map((text) => ({ shard: folder, ...JSON.parse(text) })),
);

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
if (missing > 0) console.log(`::error title=Missing shards::${missing} shards wrote no summary.ndjson`);
process.exit(failing.length > 0 || cells.length === 0 || missing > 0 ? 1 : 0);
