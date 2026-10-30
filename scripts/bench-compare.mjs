#!/usr/bin/env node
/**
 * This script compares the results of the benchmarks with earlier results (roadmap R32).
 *
 *   node scripts/bench-compare.mjs <earlier folder> <current folder> [--factor 2]
 *
 * Each folder holds one JSON file for each benchmark, as `bench(name, { writeResult })` of
 * vitest writes it. A benchmark whose mean time is more than `factor` times the earlier mean
 * fails the run. The machines of CI are not equal, thus the default factor is 2. A benchmark
 * without an earlier result only shows its time.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [earlierDir, currentDir] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const factorIndex = process.argv.indexOf("--factor");
const factor = factorIndex > 0 ? Number(process.argv[factorIndex + 1]) : 2;
if (!earlierDir || !currentDir) {
  console.error("Usage: node scripts/bench-compare.mjs <earlier folder> <current folder> [--factor 2]");
  process.exit(2);
}

/** The mean time of one call of a benchmark, in milliseconds. */
function meanOf(file) {
  const result = JSON.parse(readFileSync(file, "utf8"));
  return result.latency?.mean ?? result.mean;
}

// Without current results, the comparison examines nothing: the benchmarks did not write them
const currentFiles = existsSync(currentDir) ? readdirSync(currentDir).filter((name) => name.endsWith(".json")).sort() : [];
if (currentFiles.length === 0) {
  console.error(`${currentDir}: ${existsSync(currentDir) ? "the folder has no .json file" : "the folder does not exist"}. The comparison expected one JSON file for each benchmark (bench(name, { writeResult }) of vitest).`);
  process.exit(1);
}

const rows = [];
const slower = [];
for (const file of currentFiles) {
  const name = file.replace(/\.json$/, "");
  const current = meanOf(join(currentDir, file));
  const earlierFile = join(earlierDir, file);
  if (!existsSync(earlierFile)) {
    rows.push(`${name}: ${current.toFixed(4)} ms (no earlier result)`);
    continue;
  }
  const earlier = meanOf(earlierFile);
  const ratio = current / earlier;
  rows.push(`${name}: ${current.toFixed(4)} ms, earlier ${earlier.toFixed(4)} ms, x${ratio.toFixed(2)}`);
  if (ratio > factor) slower.push(`${name} is ${ratio.toFixed(2)} times slower (limit ${factor})`);
}

console.log(rows.join("\n"));
if (slower.length > 0) {
  console.error(`\n${slower.join("\n")}`);
  process.exit(1);
}
console.log(`\nNo benchmark is more than ${factor} times slower.`);
