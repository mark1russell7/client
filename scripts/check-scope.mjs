// Find the old npm names of the packages of this repository (scope @mark1russell7) in the
// tracked files. Since 2026-10-12 the packages have the scope @procedures (the root README has the
// table). The general packages keep @mark1russell7, and the documents of history keep the old
// names as the record of their time.
//
// A line that must name an old package says so with the text "scope-check: allow" (in Markdown,
// in an HTML comment).
//
// Usage: node scripts/check-scope.mjs. Exit code 1 when a file names an old package.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OLD_SCOPE, OLD_TO_NEW, NEW_SCOPE } from "./lib/old-names.mjs";
import { root } from "./lib/workspace.mjs";

/** The documents of history, the lockfile and the map itself */
const SKIP_PREFIXES = [
  "packages/documentation/history/",
  "packages/documentation/audit/",
  "packages/documentation/deep-dive-2026-10/",
  ".claude/",
];
const SKIP_FILES = new Set([
  "packages/documentation/DECISIONS-2026-10.md",
  "packages/documentation/BUGS-STATUS-2026-10.md",
  "packages/documentation/ARCHITECTURE-PROPOSALS-2026-10.md",
  "packages/documentation/DOCUMENTATION_AUDIT.md",
  "pnpm-lock.yaml",
  "scripts/lib/old-names.mjs",
]);
const BINARY = /\.(png|gif|jpe?g|ico|woff2?|ttf|tgz|zip|pdf)$/i;

const names = Object.keys(OLD_TO_NEW).sort((a, b) => b.length - a.length);
const literal = (text) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
const pattern = new RegExp(`${literal(OLD_SCOPE)}(${names.map(literal).join("|")})(?![A-Za-z0-9_-])`, "g");

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
if (files.length === 0) {
  console.error(`git ls-files gives no tracked file in ${root}. The check expected the files of a Git checkout of this repository.`);
  process.exit(1);
}
const findings = [];
for (const file of files) {
  if (SKIP_FILES.has(file) || SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
  if (file.split("/").pop().includes("2026-07") || BINARY.test(file)) continue;
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    continue;
  }
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes("scope-check: allow")) return;
    for (const match of line.matchAll(pattern)) {
      findings.push(`${file}:${index + 1}: ${match[0]} is now ${NEW_SCOPE}${OLD_TO_NEW[match[1]]}`);
    }
  });
}

if (findings.length > 0) {
  console.error(`${findings.length} old package names:`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`No old package name in ${files.length} tracked files.`);
