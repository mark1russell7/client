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
 * The run fails when `coverage-baseline.json` is missing or empty, when it finds no package, when a
 * package with a floor writes no coverage, and when a floor names no package of the run.
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

/**
 * The arguments of the test script of a package after `vitest run`, for example
 * an exclude of the integration tests. The coverage run uses them too: before, it ran the
 * integration tests that `pnpm test` leaves out.
 */
function testArguments(script) {
  const match = /vitest\s+run\s*(.*)$/.exec(script);
  if (!match) return [];
  const words = [];
  const pattern = /'([^']*)'|"([^"]*)"|(\S+)/g;
  for (let found = pattern.exec(match[1]); found; found = pattern.exec(match[1])) words.push(found[1] ?? found[2] ?? found[3]);
  return words;
}

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
      return test.includes("vitest") ? { folder: entry.name, name: manifest.name, dir: join(dir, entry.name), args: testArguments(test) } : undefined;
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
        // A package without tests (a bundle, the documentation) has no coverage and no floor
        "--passWithNoTests",
        ...pkg.args.filter((arg) => arg !== "--passWithNoTests"),
      ],
      { cwd: pkg.dir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } },
    );
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("close", (code) => {
      const summary = join(out, "coverage-summary.json");
      if (code !== 0) {
        resolve({ pkg, error: `the tests failed (exit ${code})`, log });
        return;
      }
      // A package with a floor and no summary is a problem (see below), not a pass
      if (!existsSync(summary)) {
        resolve({ pkg, skipped: "no tests" });
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
      const text = result.error ?? result.skipped ?? METRICS.map((metric) => `${metric} ${result.totals[metric]}`).join(", ");
      console.log(`${pkg.folder}: ${text}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, worker));
  return results.sort((a, b) => a.pkg.folder.localeCompare(b.pkg.folder));
}

/** This function writes the message to the standard error and stops the run with exit code 1. */
function stop(message) {
  console.error(message);
  process.exit(1);
}

// Only --update can start a new file of floors. Without floors, the check examines nothing.
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
if (!update && Object.keys(baseline).length === 0) {
  stop(`${existsSync(BASELINE) ? "coverage-baseline.json has no floors" : "coverage-baseline.json does not exist"}: the check needs the floor of each package. Start node scripts/coverage.mjs --update to write them.`);
}
const packages = packagesWithTests();
if (packages.length === 0) {
  stop(`No package to examine: the check expected the folders of packages/ whose test script runs vitest${only ? ` (with --packages ${[...only].join(",")})` : ""}.`);
}
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
  if (result.skipped) {
    // A floor shows that the package had coverage. Now its tests write no coverage.
    if (floor) problems.push(`${result.pkg.folder}: ${result.skipped}, but coverage-baseline.json has a floor for ${result.pkg.name}. Find the lost tests, or remove the floor.`);
    continue;
  }
  if (!floor) {
    if (!update && !allowMissing) {
      problems.push(
        `${result.pkg.folder}: no floor in coverage-baseline.json. Add the floor of ${result.pkg.name} to coverage-baseline.json in this change: ` +
          `start node scripts/coverage.mjs --update --packages ${result.pkg.folder}, or copy it from the artifact coverage-floors of CI.`,
      );
    }
    continue;
  }
  for (const metric of METRICS) {
    if (result.totals[metric] < floor[metric] - TOLERANCE) {
      problems.push(`${result.pkg.folder}: ${metric} ${result.totals[metric]} is below the floor ${floor[metric]}`);
    }
  }
}

// A floor of a renamed or removed package examines nothing. A run of only some packages does not check it.
if (!only) {
  const names = new Set(packages.map((pkg) => pkg.name));
  for (const name of Object.keys(baseline).filter((key) => !names.has(key))) {
    problems.push(`coverage-baseline.json: the floor ${name} names no package of the run. Remove the floor, or rename it to the new name of the package.`);
  }
}

if (update || out) {
  const next = { ...baseline };
  for (const result of results) {
    if (result.error || result.skipped) continue;
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
