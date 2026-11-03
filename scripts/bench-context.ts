#!/usr/bin/env node
/**
 * This script adds the runner context to the results of the benchmarks, and writes a summary (O82).
 *
 *   node scripts/bench-context.ts <results folder>...
 *
 * Each folder holds one JSON file for each benchmark, as `bench(name, { writeResult })` of vitest
 * writes it. The script adds the field `context` to each file: the CPU, the core count, Node, the
 * platform, the GitHub runner and the mode. Vitest (`bench.from()`) and `scripts/bench-compare.ts`
 * read only the other fields, so the files stay valid for them.
 *
 * A folder without a JSON file fails the run: the benchmarks did not write their results. When
 * `GITHUB_STEP_SUMMARY` is set, the script appends a table of the times and the context lines.
 * The run gives no verdict: two runs on different runners do not compare (O82).
 */

import { appendFileSync, existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The line of the summary that says that the run gives no verdict. */
export const NO_VERDICT =
  "This run gives no verdict: two runs on different runners do not compare (O82). O83 adds a paired A/B in one job.";

/** The settings of tinybench when a bench file sets no options of its own. */
export const DEFAULT_SETTINGS =
  "the tinybench defaults (time 1000 ms, at least 64 iterations, warmup 250 ms and 16 iterations), unless the bench file sets its own options";

/** The GitHub runner of a context: the fields that the environment sets. */
export interface Runner {
  name?: string;
  image?: string;
  imageVersion?: string;
}

/** The context of a runner: the CPU, the core count, Node.js, the platform and the GitHub runner. */
export interface RunnerContext {
  readonly cpu: string;
  readonly cores: number;
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
  readonly runner?: Readonly<Runner>;
}

/** The system that `runnerContext` reads: the CPUs, the Node.js version, the platform and the arch. */
export interface RunnerSystem {
  readonly cpus: readonly { readonly model?: string }[];
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
}

/** The fields of a vitest bench record that this script reads. The record keeps all its other fields. */
export interface BenchRecord {
  readonly latency?: { readonly mean?: number; readonly p50?: number; readonly samplesCount?: number };
  readonly totalTime?: number;
  readonly context?: unknown;
  readonly [field: string]: unknown;
}

/** The options of `modeOf`: the vitest version, the bench files and CI or not. */
export interface ModeOptions {
  readonly vitest?: string;
  readonly benchFiles?: readonly string[];
  readonly ci?: boolean;
}

/** The mode of one record: the tool, its version, CI or not, the bench files, the samples, the time and the settings. */
export interface Mode {
  tool: string;
  ci: boolean;
  vitest?: string;
  benchFiles: readonly string[];
  samples?: number;
  totalTimeMs?: number;
  settings: string;
}

/** One row of the summary table: the name and the folder of a benchmark, its mean, median and samples. */
export interface SummaryRow {
  readonly name: string;
  readonly folder: string;
  readonly mean?: number | undefined;
  readonly median?: number | undefined;
  readonly samples?: number | undefined;
}

/**
 * This function returns the context of the runner: the CPU, the core count, Node, the platform and
 * the GitHub runner. The runner fields come from `RUNNER_NAME`, `ImageOS` and `ImageVersion`, when set.
 */
export function runnerContext(
  env: NodeJS.ProcessEnv = process.env,
  system: RunnerSystem = { cpus: cpus(), node: process.version, platform: process.platform, arch: process.arch },
): RunnerContext {
  const runner: Runner = {};
  if (env.RUNNER_NAME) runner.name = env.RUNNER_NAME;
  if (env.ImageOS) runner.image = env.ImageOS;
  if (env.ImageVersion) runner.imageVersion = env.ImageVersion;
  return {
    cpu: system.cpus[0]?.model?.trim() ?? "unknown",
    cores: system.cpus.length,
    node: system.node,
    platform: system.platform,
    arch: system.arch,
    ...(Object.keys(runner).length > 0 ? { runner } : {}),
  };
}

/**
 * This function returns the mode of one record: the tool, its version, CI or not, the bench files,
 * the samples and the total time that the record measured, and the settings.
 */
export function modeOf(record: BenchRecord, { vitest, benchFiles = [], ci = false }: ModeOptions = {}): Mode {
  const samples = record.latency?.samplesCount;
  return {
    tool: "vitest bench --run",
    ci,
    ...(vitest ? { vitest } : {}),
    benchFiles,
    ...(typeof samples === "number" ? { samples } : {}),
    ...(typeof record.totalTime === "number" ? { totalTimeMs: record.totalTime } : {}),
    settings: DEFAULT_SETTINGS,
  };
}

/** This function returns a copy of the record with the field `context`. The other fields do not change. */
export function withContext<C>(record: BenchRecord, context: C): Omit<BenchRecord, "context"> & { context: C } {
  const { context: _old, ...rest } = record;
  return { ...rest, context };
}

/** This function returns the time of a value in milliseconds as text, or a dash without a value. */
const ms = (value: number | undefined): string => (typeof value === "number" ? value.toFixed(4) : "—");

/**
 * This function returns the summary in Markdown: the context lines, a table with the mean and the
 * median of each benchmark, and the line `NO_VERDICT`.
 */
export function summaryOf(rows: readonly SummaryRow[], context: RunnerContext & { readonly ci?: boolean }): string {
  const lines = ["## Benchmarks", "", NO_VERDICT, ""];
  lines.push(`- CPU: ${context.cpu} (${context.cores} cores)`);
  lines.push(`- Node: ${context.node}, ${context.platform}/${context.arch}`);
  if (context.runner) {
    const { name, image, imageVersion } = context.runner;
    lines.push(`- Runner: ${[name, image && `image ${image}`, imageVersion && `version ${imageVersion}`].filter(Boolean).join(", ")}`);
  }
  lines.push(`- Mode: vitest bench --run${context.ci ? " in CI" : ""}, ${DEFAULT_SETTINGS}`);
  lines.push("", "| Benchmark | Folder | Mean (ms) | Median (ms) | Samples |", "| --- | --- | ---: | ---: | ---: |");
  for (const row of rows) lines.push(`| ${row.name} | ${row.folder} | ${ms(row.mean)} | ${ms(row.median)} | ${row.samples ?? "—"} |`);
  return `${lines.join("\n")}\n`;
}

/** The version of vitest of the package that holds the results folder, or undefined. */
function vitestOf(folder: string): string | undefined {
  const file = join(folder, "..", "..", "node_modules", "vitest", "package.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version : undefined;
}

/** The bench files next to the results folder, relative to the current folder. */
function benchFilesOf(folder: string): string[] {
  const benchDir = join(folder, "..");
  return readdirSync(benchDir)
    .filter((name) => name.endsWith(".bench.ts"))
    .sort()
    .map((name) => relative(process.cwd(), join(benchDir, name)).split(sep).join("/"));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const folders = process.argv.slice(2);
  if (folders.length === 0) {
    console.error("Usage: node scripts/bench-context.ts <results folder>...");
    process.exit(2);
  }
  const ci = process.env.CI === "true";
  const runner = runnerContext();
  const rows: SummaryRow[] = [];
  let failed = false;
  for (const folder of folders) {
    const files = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".json")).sort() : [];
    // Without results, the run examined nothing: the benchmarks did not write them
    if (files.length === 0) {
      console.error(`${folder}: ${existsSync(folder) ? "the folder has no .json file" : "the folder does not exist"}. Each benchmark writes one JSON file (bench(name, { writeResult }) of vitest).`);
      failed = true;
      continue;
    }
    const vitest = vitestOf(folder);
    const options: ModeOptions = { ...(vitest ? { vitest } : {}), benchFiles: benchFilesOf(folder), ci };
    for (const file of files) {
      const path = join(folder, file);
      const record = JSON.parse(readFileSync(path, "utf8")) as BenchRecord;
      writeFileSync(path, `${JSON.stringify(withContext(record, { ...runner, mode: modeOf(record, options) }), null, 2)}\n`, "utf8");
      rows.push({ name: file.replace(/\.json$/, ""), folder: relative(process.cwd(), resolve(folder)).split(sep).join("/"), mean: record.latency?.mean, median: record.latency?.p50, samples: record.latency?.samplesCount });
    }
  }
  const summary = summaryOf(rows, { ...runner, ci });
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (failed) process.exit(1);
}
