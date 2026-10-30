// The reports of the public API of the packages (roadmap R30, CLI-86). Each public package has its
// report in test/api/public-api.txt. The report comes from the built .d.ts files of the entries of
// its exports field: start the build first.
//
//   node scripts/api-report.mjs [--check | --update] [--root <folder>] [<package folder>...]
//
// --check (the default) compares each report with the built .d.ts files. It exits with 1 and lists
// each package whose report differs or is missing. --update writes the reports. Without package
// folders, the script reads each public package of the workspace (pnpm-workspace.yaml, the field
// workspaces of package.json, or the root folder alone). A private package has no report.
//
// Without package folders, the script also exits with 1 when it finds no public package, and when a
// folder of the workspace has a report that the run does not examine: a private, excluded or removed
// package.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { packageFolders, packageReport, REPORT_FILE, workspaceFolders } from "./lib/api-report.mjs";

const usage = "Usage: node scripts/api-report.mjs [--check | --update] [--root <folder>] [<package folder>...]";

let mode = "check";
let root = process.cwd();
const named = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--check") mode = "check";
  else if (arg === "--update") mode = "update";
  else if (arg === "--root") root = resolve(args[++index] ?? ".");
  else if (arg === "--help" || arg === "-h") {
    console.log(usage);
    process.exit(0);
  } else if (arg.startsWith("-")) {
    console.error(`An unknown option: ${arg}\n${usage}`);
    process.exit(2);
  } else named.push(resolve(arg));
}

const show = (path) => relative(root, path).split(sep).join("/") || ".";
const folders = named.length > 0 ? named : packageFolders(root);
const differ = [];
const missing = [];
const failed = [];
const written = [];
const skipped = [];
const stale = [];
// The folders that the run examines: each one gets a report, or an error
const examined = new Set();
let count = 0;

for (const folder of folders) {
  const manifestFile = join(folder, "package.json");
  if (!existsSync(manifestFile)) {
    failed.push(`${show(folder)}: no package.json`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  // A private package has no public API. A named folder gets a report all the same.
  if (manifest.private === true && named.length === 0) {
    skipped.push(show(folder));
    continue;
  }
  examined.add(folder);
  let report;
  try {
    report = packageReport(folder, { tool: "scripts/api-report.mjs" });
  } catch (error) {
    failed.push(`${show(folder)}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  count++;
  const file = join(folder, REPORT_FILE);
  // A checkout with CRLF line ends gives the same text
  const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : undefined;
  if (current === report) continue;
  if (mode === "update") {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, report);
    written.push(`${show(file)}${current === undefined ? " (new)" : ""}`);
  } else if (current === undefined) missing.push(show(folder));
  else {
    const a = current.split("\n");
    const b = report.split("\n");
    let line = 0;
    while (line < a.length && a[line] === b[line]) line++;
    differ.push(`${show(folder)} (first difference at line ${line + 1})`);
  }
}

if (named.length === 0) {
  // A run over no package examines nothing: that is a failure, not a pass
  if (folders.length - skipped.length === 0) {
    failed.push(`${show(root)}: no public package. The script expected the package folders of pnpm-workspace.yaml, of the field workspaces of package.json, or a package.json in the root`);
  }
  for (const folder of workspaceFolders(root)) {
    if (!examined.has(folder) && existsSync(join(folder, REPORT_FILE))) stale.push(show(join(folder, REPORT_FILE)));
  }
}

const list = (title, items) => {
  if (items.length === 0) return;
  console.log(`${title}:`);
  for (const item of items) console.log(`  ${item}`);
};
console.log(`${count} reports of the public API, ${skipped.length} private packages without a report.`);
list("Written", written);
list("The report differs from the built .d.ts files", differ);
list("No report", missing);
list("Errors", failed);
list("A report of a package that the run does not examine (remove the report, or make the package public)", stale);
if (differ.length > 0 || missing.length > 0) {
  console.log("To accept a change of the API, start the build, then node scripts/api-report.mjs --update, and review the diff.");
}
process.exit(failed.length > 0 || differ.length > 0 || missing.length > 0 || stale.length > 0 ? 1 : 0);
