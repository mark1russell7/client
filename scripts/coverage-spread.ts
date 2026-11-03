#!/usr/bin/env node
/**
 * The spread of the coverage across runs (roadmap O85).
 *
 * The coverage job of `nightly.yml` runs the coverage check several times. Each run writes the
 * measured totals with `node scripts/coverage.mjs --totals <file>`. This script reads the files
 * of all runs and writes, for each package and each metric, the lowest value, the highest value
 * and the spread. It also writes the floors: the lowest value of each metric minus its spread,
 * rounded down to 0.1 (roadmap O88). For a spread of 0, the floor is the lowest value, rounded down.
 *
 *   node scripts/coverage-spread.ts <folder> [--out <file>]
 *
 * The script reads each file `coverage-totals.json` below `<folder>`. With `--out`, it writes the
 * floors in the format of `coverage-baseline.json` to that file.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const METRICS = ["lines", "statements", "functions", "branches"] as const;
type Metric = (typeof METRICS)[number];
/** The totals of one run: for each package, the percent of each metric. */
type Totals = Record<string, Record<Metric, number> | undefined>;
const args = process.argv.slice(2);
const folder = args[0];
const out = ((): string | undefined => {
  const index = args.indexOf("--out");
  return index >= 0 ? args[index + 1] : undefined;
})();
if (!folder || folder.startsWith("--")) {
  console.error("Give the folder with the files coverage-totals.json: node scripts/coverage-spread.ts <folder> [--out <file>]");
  process.exit(1);
}

/** This function gives the path of each file `coverage-totals.json` below the folder. */
function totalsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return totalsFiles(path);
    return entry.name === "coverage-totals.json" ? [path] : [];
  });
}

const files = totalsFiles(folder).sort();
if (files.length === 0) {
  console.error(`${folder}: no file coverage-totals.json`);
  process.exit(1);
}
const runs = files.map((file) => JSON.parse(readFileSync(file, "utf8")) as Totals);
const names = [...new Set(runs.flatMap((run) => Object.keys(run)))].sort();

const floors: Record<string, Partial<Record<Metric, number>>> = {};
let largest = 0;
for (const name of names) {
  const missing = runs.filter((run) => !run[name]).length;
  if (missing > 0) {
    console.log(`${name}: no totals in ${missing} of ${runs.length} runs`);
    continue;
  }
  const floor: Partial<Record<Metric, number>> = {};
  floors[name] = floor;
  const parts: string[] = [];
  for (const metric of METRICS) {
    const values = runs.map((run) => run[name]![metric]);
    const low = Math.min(...values);
    const spread = Math.round((Math.max(...values) - low) * 100) / 100;
    largest = Math.max(largest, spread);
    // In hundredths, so that the subtraction gives no binary fraction below the true value
    floor[metric] = Math.floor(Math.round((low - spread) * 100) / 10) / 10;
    parts.push(spread === 0 ? `${metric} ${low}` : `${metric} ${values.join("/")} (spread ${spread})`);
  }
  console.log(`${name}: ${parts.join(", ")}`);
}
console.log(`\n${runs.length} runs, ${names.length} packages. The largest spread of a metric: ${largest} points.`);
if (out) writeFileSync(out, JSON.stringify(floors, null, 2) + "\n");
