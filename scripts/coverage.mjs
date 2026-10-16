#!/usr/bin/env node
/**
 * The coverage ratchet (roadmap R31).
 *
 * This script runs the tests of each package with `@vitest/coverage-v8`, and compares the
 * coverage of each package with its floor in `coverage-baseline.json`. A package below its floor
 * fails the run. The floors only go up: `--update` raises each floor to the current coverage, and
 * it never lowers one.
 *
 *   node scripts/coverage.mjs                    examine each package
 *   node scripts/coverage.mjs --update           raise the floors
 *   node scripts/coverage.mjs --packages a,b     only these folders of packages/
 *   node scripts/coverage.mjs --out <file>       also write the raised floors to this file
 *   node scripts/coverage.mjs --allow-missing    a package without a floor does not fail
 *
 * CI writes the raised floors with `--out` and uploads them. The floors come from the machines of
 * CI: copy the file of a green run to `coverage-baseline.json` to raise them.
 *
 * `COVERAGE_CONCURRENCY` sets the number of packages that run at the same time (default 2).
 * A drop of less than `TOLERANCE` points does not fail: a test that depends on time can take
 * another path.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASELINE = join(ROOT, "coverage-baseline.json");
const METRICS = ["lines", "statements", "functions", "branches"];
const TOLERANCE = 0.5;

const args = process.argv.slice(2);
const update = args.includes("--update");
const allowMissing = args.includes("--allow-missing");
const out = (() => {
  const index = args.indexOf("--out");
  return index >= 0 ? args[index + 1] : undefined;
})();
const only = (() => {
  const index = args.indexOf("--packages");
  return index >= 0 && args[index + 1] ? new Set(args[index + 1].split(",")) : undefined;
})();
const concurrency = Math.max(1, Number(process.env.COVERAGE_CONCURRENCY ?? 2));

/** The packages whose test script runs vitest. */
function packagesWithTests() {
  const dir = join(ROOT, "packages");
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (!only || only.has(entry.name)))
    .map((entry) => {
      const file = join(dir, entry.name, "package.json");
      if (!existsSync(file)) return undefined;
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      const test = manifest.scripts?.test ?? "";
      return test.includes("vitest") ? { folder: entry.name, name: manifest.name, dir: join(dir, entry.name) } : undefined;
    })
    .filter(Boolean)
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

/** This function runs the tests of one package with coverage, and gives its totals. */
function measure(pkg, reports) {
  const out = join(reports, pkg.folder);
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        // The vitest of the package: the root does not depend on it
        join(pkg.dir, "node_modules", "vitest", "vitest.mjs"),
        "run",
        "--coverage.enabled",
        "--coverage.provider=v8",
        "--coverage.reporter=json-summary",
        `--coverage.reportsDirectory=${out}`,
        "--coverage.include=src/**",
        "--maxWorkers=2",
      ],
      { cwd: pkg.dir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } },
    );
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("close", (code) => {
      const summary = join(out, "coverage-summary.json");
      if (code !== 0 || !existsSync(summary)) {
        resolve({ pkg, error: `the tests failed (exit ${code})`, log });
        return;
      }
      const total = JSON.parse(readFileSync(summary, "utf8")).total;
      resolve({ pkg, totals: Object.fromEntries(METRICS.map((metric) => [metric, total[metric].pct])) });
    });
  });
}

async function runAll(packages, reports) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < packages.length) {
      const pkg = packages[next++];
      const result = await measure(pkg, reports);
      results.push(result);
      const text = result.error ?? METRICS.map((metric) => `${metric} ${result.totals[metric]}`).join(", ");
      console.log(`${pkg.folder}: ${text}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, worker));
  return results.sort((a, b) => a.pkg.folder.localeCompare(b.pkg.folder));
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const packages = packagesWithTests();
const reports = mkdtempSync(join(tmpdir(), "coverage-"));
let results;
try {
  results = await runAll(packages, reports);
} finally {
  rmSync(reports, { recursive: true, force: true });
}

const problems = [];
for (const result of results) {
  if (result.error) {
    problems.push(`${result.pkg.folder}: ${result.error}\n${result.log.split("\n").slice(-30).join("\n")}`);
    continue;
  }
  const floor = baseline[result.pkg.name];
  if (!floor) {
    if (!update && !allowMissing) problems.push(`${result.pkg.folder}: no floor in coverage-baseline.json (start with --update)`);
    continue;
  }
  for (const metric of METRICS) {
    if (result.totals[metric] < floor[metric] - TOLERANCE) {
      problems.push(`${result.pkg.folder}: ${metric} ${result.totals[metric]} is below the floor ${floor[metric]}`);
    }
  }
}

if (update || out) {
  const next = { ...baseline };
  for (const result of results) {
    if (result.error) continue;
    const old = baseline[result.pkg.name] ?? {};
    // A floor goes up to the current value, rounded down to one decimal, and never goes down
    next[result.pkg.name] = Object.fromEntries(
      METRICS.map((metric) => [metric, Math.max(old[metric] ?? 0, Math.floor(result.totals[metric] * 10) / 10)]),
    );
  }
  const sorted = Object.fromEntries(Object.keys(next).sort().map((key) => [key, next[key]]));
  const text = JSON.stringify(sorted, null, 2) + "\n";
  if (update) writeFileSync(BASELINE, text);
  if (out) writeFileSync(out, text);
  console.log(`${update ? "coverage-baseline.json" : out}: ${Object.keys(sorted).length} packages`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`\nThe coverage of ${results.length} packages is at or above the floors.`);
