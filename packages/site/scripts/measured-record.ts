#!/usr/bin/env node
/**
 * This script writes the record of the measured numbers of the site (CLI-124, schema `measured/1`).
 *
 *   node packages/site/scripts/measured-record.ts --out <file> --bench <prefix>=<results folder>... --engine <package>=<folder>...
 *   node packages/site/scripts/measured-record.ts --out <file> --merge <record>...
 *
 * Each `--bench` folder holds one JSON file for each benchmark, as `bench(name, { writeResult })` of
 * vitest writes it. Each number gets the key `<prefix>.<file name>` and the median of its latency
 * in ms. Each `--engine` gives the version of a package from its `package.json`. The run comes from
 * the environment of GitHub Actions. `--merge` joins the records of the jobs of one run.
 *
 * The site reads only this record for its measured numbers, so no number of a page is typed text.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The name of the record format. */
export const MEASURED_SCHEMA = "measured/1";

/** One measured number of a record. */
export interface MeasuredNumber {
  readonly value: number;
  readonly unit: "ms";
  /** The statistic of the samples that gives the value. */
  readonly stat: "p50";
  readonly samples: number;
  /** The file of the result, relative to the root of the repository. */
  readonly source: string;
}

/** The run that measured the numbers of a record. */
export interface MeasuredRun {
  readonly id: string;
  readonly url: string;
  readonly date: string;
  /** The full commit of the code that ran. */
  readonly commit: string;
  /** The path of the workflow of the run, from the root of the repository. */
  readonly workflow: string;
}

/** The record of the measured numbers of one run. */
export interface MeasuredRecord {
  readonly schema: typeof MEASURED_SCHEMA;
  readonly run: MeasuredRun;
  /** The version of each package that the numbers measure. */
  readonly engines: Readonly<Record<string, string>>;
  readonly numbers: Readonly<Record<string, MeasuredNumber>>;
}

/** The fields of a result file of vitest bench that the record reads. */
interface BenchResult {
  readonly latency?: { readonly p50?: unknown; readonly samplesCount?: unknown };
}

/** This function gives the number of one result file of vitest bench. It throws when a field is missing. */
export function numberOfBenchResult(result: BenchResult, source: string): MeasuredNumber {
  const p50 = result.latency?.p50;
  const samples = result.latency?.samplesCount;
  if (typeof p50 !== "number" || !Number.isFinite(p50) || p50 < 0) throw new Error(`${source}: no latency.p50 in ms`);
  if (typeof samples !== "number" || !Number.isInteger(samples) || samples < 1) throw new Error(`${source}: no latency.samplesCount`);
  return { value: p50, unit: "ms", stat: "p50", samples, source };
}

/** This function gives the numbers of each JSON file of a results folder, with the key `<prefix>.<name>`. */
export function numbersOfFolder(prefix: string, folder: string): Record<string, MeasuredNumber> {
  const files = readdirSync(folder).filter((name) => name.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`${folder}: no result file`);
  return Object.fromEntries(
    files.map((name) => {
      const source = join(folder, name).replaceAll("\\", "/");
      return [`${prefix}.${basename(name, ".json")}`, numberOfBenchResult(JSON.parse(readFileSync(source, "utf8")) as BenchResult, source)];
    }),
  );
}

/** This function gives the run from the environment of GitHub Actions. It throws outside a run. */
export function runOfEnvironment(env: NodeJS.ProcessEnv, now: Date): MeasuredRun {
  const id = env["GITHUB_RUN_ID"];
  const repository = env["GITHUB_REPOSITORY"];
  const commit = env["GITHUB_SHA"];
  if (!id || !repository || !commit) throw new Error("GITHUB_RUN_ID, GITHUB_REPOSITORY and GITHUB_SHA give the run: start the script in a workflow");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`GITHUB_SHA is not a full commit: ${commit}`);
  // GITHUB_WORKFLOW_REF has the form <owner>/<repo>/<path>@<ref>
  const ref = env["GITHUB_WORKFLOW_REF"] ?? "";
  const workflow = ref.startsWith(`${repository}/`) && ref.includes("@") ? ref.slice(repository.length + 1, ref.lastIndexOf("@")) : "";
  if (!workflow.startsWith(".github/workflows/")) throw new Error(`GITHUB_WORKFLOW_REF names no workflow of ${repository}: ${ref}`);
  const server = env["GITHUB_SERVER_URL"] ?? "https://github.com";
  return { id, url: `${server}/${repository}/actions/runs/${id}`, date: now.toISOString().replace(/\.\d{3}Z$/, "Z"), commit, workflow };
}

/** This function joins the records of the jobs of one run. It throws when two records have different runs or the same key. */
export function mergeRecords(records: readonly MeasuredRecord[]): MeasuredRecord {
  const [first, ...rest] = records;
  if (!first) throw new Error("no record to merge");
  const engines: Record<string, string> = { ...first.engines };
  const numbers: Record<string, MeasuredNumber> = { ...first.numbers };
  let date = first.run.date;
  for (const record of rest) {
    if (record.run.id !== first.run.id || record.run.commit !== first.run.commit || record.run.workflow !== first.run.workflow) throw new Error(`the records are of the runs ${first.run.id} and ${record.run.id}`);
    for (const [name, version] of Object.entries(record.engines)) {
      if (engines[name] !== undefined && engines[name] !== version) throw new Error(`${name} has the versions ${engines[name]} and ${version}`);
      engines[name] = version;
    }
    for (const [key, number] of Object.entries(record.numbers)) {
      if (key in numbers) throw new Error(`the key ${key} is in two records`);
      numbers[key] = number;
    }
    // The run started at its first job: the date of the record is the earliest date.
    if (record.run.date < date) date = record.run.date;
  }
  return { schema: MEASURED_SCHEMA, run: { ...first.run, date }, engines, numbers };
}

/** This function reads and checks one record file. */
export function readRecord(file: string): MeasuredRecord {
  const record = JSON.parse(readFileSync(file, "utf8")) as MeasuredRecord;
  if (record.schema !== MEASURED_SCHEMA) throw new Error(`${file}: the schema is not ${MEASURED_SCHEMA}`);
  return record;
}

/** This function gives the pairs `<name>=<value>` of each use of a flag. */
function pairsOf(argv: readonly string[], flag: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  argv.forEach((arg, index) => {
    if (arg !== flag) return;
    const value = argv[index + 1] ?? "";
    const split = value.indexOf("=");
    if (split < 1) throw new Error(`${flag} needs <name>=<value>, not "${value}"`);
    pairs.push([value.slice(0, split), value.slice(split + 1)]);
  });
  return pairs;
}

/** This function runs the command line. */
export function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, now = new Date()): MeasuredRecord {
  const outAt = argv.indexOf("--out");
  const out = outAt >= 0 ? argv[outAt + 1] : undefined;
  if (!out) throw new Error("--out <file> is necessary");
  const mergeAt = argv.indexOf("--merge");
  let record: MeasuredRecord;
  if (mergeAt >= 0) {
    record = mergeRecords(argv.slice(mergeAt + 1).filter((arg) => !arg.startsWith("--")).map(readRecord));
  } else {
    const numbers = Object.assign({}, ...pairsOf(argv, "--bench").map(([prefix, folder]) => numbersOfFolder(prefix, folder))) as Record<string, MeasuredNumber>;
    if (Object.keys(numbers).length === 0) throw new Error("give at least one --bench <prefix>=<folder>");
    const engines = Object.fromEntries(
      pairsOf(argv, "--engine").map(([name, folder]) => {
        const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { name?: string; version?: string };
        if (pkg.name !== name || !pkg.version) throw new Error(`${folder}/package.json is not the package ${name}`);
        return [name, pkg.version];
      }),
    );
    record = { schema: MEASURED_SCHEMA, run: runOfEnvironment(env, now), engines, numbers };
  }
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const record = main(process.argv.slice(2));
    console.log(`measured-record: ${Object.keys(record.numbers).length} numbers of the run ${record.run.id}`);
  } catch (error) {
    console.error(`measured-record: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
