#!/usr/bin/env node
/**
 * This script is the paired A/B bench of the base and the head (O83), with paired-time/1.
 *
 *   node scripts/bench-paired.mjs run --base <folder> --head <folder> [--repeats 10] [--warmup 2]
 *        [--budget 0.1] [--sample 1] [--base-ref <sha>] [--head-ref <sha>] [--only <id,id>] [--out <file>]
 *   node scripts/bench-paired.mjs aggregate <folder>... [--runs 5] [--budget 0.1] [--out <file>]
 *
 * `run` times the two trees in one job, on one runner. The arms are `base`, `head` and the A/A
 * arm `base~aa` (the base against itself). Mode `fresh`: each arm, input and round is a new process
 * (`scripts/bench-paired-child.mjs`), and the order of the arms rotates each round. The record is
 * JSON: the paired-time/1 report, the analysis of each benchmark and the runner context of
 * `scripts/bench-context.mjs`. The script appends a table to `GITHUB_STEP_SUMMARY`.
 *
 * `aggregate` reads the records of the runs, and gives the verdict of each benchmark from the first
 * `--runs` runs that count. A run of a benchmark counts only when its A/A band contains 1.0. Else
 * the run measured the runner: a new run replaces it, and the record keeps both run ids.
 *
 * Each ratio is the time of the head over the time of the base: lower is better. The script gives
 * no gate and no required check. It only reports.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerContext } from "./bench-context.mjs";
import { WORKLOADS } from "./bench-paired-child.mjs";
import { aaId, measureIsolated, quantileOf } from "./lib/paired-time.mjs";

/** The schema of a record of one run. */
export const RUN_SCHEMA = "client-bench-paired/1";

/** The schema of the record of the verdicts of all runs. */
export const VERDICT_SCHEMA = "client-bench-paired-verdicts/1";

/** The direction of each ratio of the report. */
export const DIRECTION = "head/base time, lower is better";

/** The budget: a change smaller than 10 % is no change (the default regression of the 10-30 rule). */
export const DEFAULT_BUDGET = 0.1;

/** The runs that a verdict needs (the limit rule of 11-02). */
export const DEFAULT_RUNS = 5;

/** The factor of the validity check: the budget is more than the worst A/A spread times 1.1 (11-01). */
export const VALIDITY_FACTOR = 1.1;

/**
 * This function gives the ratio of each round: the time of the arm over the time of the base in
 * the same round. The arms of one round of one input run one after the other, so each ratio is a pair.
 * @param {readonly number[]} arm
 * @param {readonly number[]} base
 */
export function roundRatios(arm, base) {
  const ratios = [];
  for (let round = 0; round < Math.min(arm.length, base.length); round++) if (base[round] > 0) ratios.push(arm[round] / base[round]);
  return ratios;
}

/**
 * This function gives the band of a list of ratios: p10, the median and p90.
 * @param {readonly number[]} values
 */
export function bandOf(values) {
  return { p10: quantileOf(values, 0.1), median: quantileOf(values, 0.5), p90: quantileOf(values, 0.9) };
}

/** This function tells if a band contains 1.0. A band with a NaN bound does not. */
export const containsOne = (/** @type {{ p10: number, p90: number }} */ band) => band.p10 <= 1 && band.p90 >= 1;

/**
 * This function gives the A/A spread of a band: the largest distance of its bounds from 1.0.
 * The spread of a median decision is the A/A p90 (the policy budget rule of 11-01).
 * @param {{ p10: number, p90: number }} band
 */
export const spreadOf = (band) => Math.max(band.p90 - 1, 1 - band.p10, 0);

/**
 * This function tells if the test can resolve the budget: the budget is more than the worst A/A
 * spread times 1.1.
 * @param {number} budget
 * @param {number} spread
 */
export const resolves = (budget, spread) => budget > spread * VALIDITY_FACTOR;

/**
 * This function gives the verdict of one ratio against the budget, when the test is valid:
 * `slower` above 1 + budget, `faster` below 1 / (1 + budget), else `no change`.
 * @param {number} ratio
 * @param {number} budget
 */
export function sideOf(ratio, budget) {
  if (ratio > 1 + budget) return "slower";
  if (ratio < 1 / (1 + budget)) return "faster";
  return "no change";
}

/**
 * @typedef {object} Analysis The analysis of one benchmark in one run.
 * @property {string} id
 * @property {number} baseMs The median time of one call of the base, in milliseconds
 * @property {number} headMs The median time of one call of the head, in milliseconds
 * @property {number} ratio The median of the head over the median of the base (paired-time/1)
 * @property {{ p10: number, median: number, p90: number }} band The band of the round ratios of the head
 * @property {{ ratio: number, band: { p10: number, median: number, p90: number }, containsOne: boolean, spread: number }} aa The A/A arm
 * @property {boolean} counts The run counts only when the A/A band contains 1.0
 * @property {boolean} valid The budget is more than the A/A spread times 1.1
 * @property {"faster" | "slower" | "no change" | "cannot decide"} verdict
 * @property {string} reason
 */

/**
 * This function gives the analysis of one input of a paired-time/1 report.
 * @param {import("./lib/paired-time.mjs").PairedInput} input
 * @param {number} budget
 * @param {{ base?: string, head?: string }} [ids] The ids of the arms
 * @returns {Analysis}
 */
export function analyzeInput(input, budget, ids = {}) {
  const base = ids.base ?? "base";
  const head = ids.head ?? "head";
  const aa = aaId(base);
  const band = bandOf(roundRatios(input.ms[head] ?? [], input.ms[base] ?? []));
  const aaBand = bandOf(roundRatios(input.ms[aa] ?? [], input.ms[base] ?? []));
  const aaContains = containsOne(aaBand);
  const spread = spreadOf(aaBand);
  const ratio = input.ratio[head] ?? Number.NaN;
  const valid = resolves(budget, spread);
  /** @type {Analysis["verdict"]} */
  let verdict = "cannot decide";
  let reason;
  if (!Number.isFinite(ratio) || Number.isNaN(aaBand.p10)) reason = "the run has no paired times";
  else if (!aaContains) reason = `the A/A band [${aaBand.p10.toFixed(3)}, ${aaBand.p90.toFixed(3)}] excludes 1.0: the run measured the runner, and does not count. A new run replaces it`;
  else if (!valid) reason = `the budget ${budget} is not more than ${VALIDITY_FACTOR} x the A/A spread ${spread.toFixed(3)}`;
  else {
    verdict = sideOf(ratio, budget);
    reason = `the ratio ${ratio.toFixed(3)} against the budget ${budget}`;
  }
  return {
    id: input.id,
    baseMs: input.median[base] ?? Number.NaN,
    headMs: input.median[head] ?? Number.NaN,
    ratio,
    band,
    aa: { ratio: input.ratio[aa] ?? Number.NaN, band: aaBand, containsOne: aaContains, spread },
    counts: aaContains,
    valid,
    verdict,
    reason,
  };
}

/**
 * @typedef {object} Sample One benchmark in one run, for the aggregate.
 * @property {string} run The id of the run: the run id of GitHub, the attempt and the sample
 * @property {Analysis} analysis
 */

/**
 * This function gives the verdict of one benchmark from the runs. The first `runs` samples whose A/A
 * band contains 1.0 count, in the order of the runs. The samples that do not count stay in the record.
 *
 * - Fewer counted samples than `runs`: `cannot decide`, and new runs replace the others.
 * - The budget is not more than the worst A/A spread times 1.1: `cannot decide`.
 * - Each counted ratio is above 1 + budget: `slower`. Each is below 1 / (1 + budget): `faster`.
 * - Each is between: `no change`. Else the runs disagree: `cannot decide`.
 * @param {string} id
 * @param {readonly Sample[]} samples
 * @param {number} budget
 * @param {number} runs
 */
export function aggregateVerdict(id, samples, budget, runs) {
  const counted = samples.filter((s) => s.analysis.counts);
  const excluded = samples.filter((s) => !s.analysis.counts).map((s) => s.run);
  const used = counted.slice(0, runs);
  const ratios = used.map((s) => s.analysis.ratio);
  const worstSpread = used.length === 0 ? Number.NaN : Math.max(...used.map((s) => s.analysis.aa.spread));
  const valid = used.length > 0 && resolves(budget, worstSpread);
  const out = {
    id,
    runs: used.map((s) => s.run),
    excluded,
    extra: counted.slice(runs).map((s) => s.run),
    ratios,
    median: quantileOf(ratios, 0.5),
    min: ratios.length === 0 ? Number.NaN : Math.min(...ratios),
    max: ratios.length === 0 ? Number.NaN : Math.max(...ratios),
    baseMs: quantileOf(used.map((s) => s.analysis.baseMs), 0.5),
    headMs: quantileOf(used.map((s) => s.analysis.headMs), 0.5),
    aaBands: used.map((s) => s.analysis.aa.band),
    worstSpread,
    budget,
    valid,
    /** @type {"faster" | "slower" | "no change" | "cannot decide"} */
    verdict: "cannot decide",
    reason: "",
  };
  if (used.length < runs) {
    out.reason = `${used.length} of ${runs} runs count${excluded.length > 0 ? ` (the A/A band of ${excluded.join(", ")} excludes 1.0)` : ""}: start new runs to replace them`;
    return out;
  }
  if (!valid) {
    out.reason = `the budget ${budget} is not more than ${VALIDITY_FACTOR} x the worst A/A spread ${worstSpread.toFixed(3)}`;
    return out;
  }
  const sides = new Set(ratios.map((ratio) => sideOf(ratio, budget)));
  if (sides.size === 1) {
    out.verdict = /** @type {"faster" | "slower" | "no change"} */ ([...sides][0]);
    out.reason = `each of the ${runs} runs is ${out.verdict === "no change" ? `within the budget ${budget}` : out.verdict}`;
  } else out.reason = `the runs disagree (${[...sides].sort().join(", ")})`;
  return out;
}

/** This function gives a number with 3 decimals, or a dash. */
const f3 = (/** @type {number} */ value) => (Number.isFinite(value) ? value.toFixed(3) : "—");

/** This function gives a time in milliseconds with 5 decimals, or a dash. */
const f5 = (/** @type {number} */ value) => (Number.isFinite(value) ? value.toFixed(5) : "—");

/** This function gives a band as text. */
const bandText = (/** @type {{ p10: number, p90: number }} */ band) => `${f3(band.p10)} to ${f3(band.p90)}`;

/** This function gives the context lines of a run for a summary. */
function contextLines(/** @type {Record<string, any>} */ record) {
  const c = record.context;
  const lines = [`- Base \`${record.refs.base}\`, head \`${record.refs.head}\`. Each ratio is ${DIRECTION}.`];
  lines.push(`- Mode \`${record.report.mode}\`: a new process for each arm, input and round. ${record.repeats} rounds, ${record.warmup} warm-up passes. Budget ${record.budget}.`);
  lines.push(`- CPU: ${c.cpu} (${c.cores} cores), Node ${c.node}, ${c.platform}/${c.arch}${c.runner?.name ? `, runner ${c.runner.name}` : ""}${c.runner?.imageVersion ? ` (image ${c.runner.imageVersion})` : ""}.`);
  if (record.skipped.length > 0) lines.push(`- Not in both trees, not timed: ${record.skipped.join(", ")}.`);
  return lines;
}

/**
 * This function gives the summary of one run in Markdown.
 * @param {Record<string, any>} record
 */
export function runMarkdown(record) {
  const lines = [`## Paired bench, run ${record.run.label}`, "", ...contextLines(record), ""];
  lines.push("| Benchmark | Base (ms/call) | Head (ms/call) | Head/base | Head/base p10 to p90 | A/A p10 to p90 | A/A has 1.0 | Valid | Verdict |");
  lines.push("| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |");
  for (const a of record.analysis) {
    lines.push(`| ${a.id} | ${f5(a.baseMs)} | ${f5(a.headMs)} | ${f3(a.ratio)} | ${bandText(a.band)} | ${bandText(a.aa.band)} | ${a.counts ? "yes" : "**no: does not count**"} | ${a.valid ? "yes" : "no"} | ${a.verdict} |`);
  }
  const notCounted = record.analysis.filter((/** @type {Analysis} */ a) => !a.counts).map((/** @type {Analysis} */ a) => a.id);
  lines.push("");
  if (notCounted.length > 0) lines.push(`Run ${record.run.label}: the A/A band of ${notCounted.join(", ")} excludes 1.0. The run measured the runner for these benchmarks. A new run replaces it, and the record keeps both run ids.`, "");
  return `${lines.join("\n")}\n`;
}

/**
 * This function gives the summary of the verdicts in Markdown.
 * @param {Record<string, any>} verdicts
 */
export function verdictMarkdown(verdicts) {
  const lines = [`## Paired bench verdicts (${verdicts.runs} runs)`, ""];
  lines.push(`- Base \`${verdicts.refs.base}\`, head \`${verdicts.refs.head}\`. Each ratio is ${DIRECTION}.`);
  lines.push(`- A run of a benchmark counts only when its A/A band contains 1.0. The test is valid only when the budget ${verdicts.budget} is more than ${VALIDITY_FACTOR} x the worst A/A spread.`);
  lines.push(`- Records: ${verdicts.records.map((/** @type {{ label: string, cpu: string }} */ r) => `${r.label} (${r.cpu})`).join(", ")}.`, "");
  lines.push("| Benchmark | Base (ms/call) | Head (ms/call) | Head/base median | Min to max | Worst A/A spread | Valid | Verdict | Runs that do not count |");
  lines.push("| --- | ---: | ---: | ---: | --- | ---: | --- | --- | --- |");
  for (const v of verdicts.benchmarks) {
    lines.push(`| ${v.id} | ${f5(v.baseMs)} | ${f5(v.headMs)} | ${f3(v.median)} | ${f3(v.min)} to ${f3(v.max)} | ${f3(v.worstSpread)} | ${v.valid ? "yes" : "no"} | ${v.verdict} | ${v.excluded.length > 0 ? v.excluded.join(", ") : "none"} |`);
  }
  lines.push("", ...verdicts.benchmarks.filter((/** @type {{ verdict: string }} */ v) => v.verdict === "cannot decide").map((/** @type {{ id: string, reason: string }} */ v) => `- ${v.id}: cannot decide, ${v.reason}.`), "");
  return `${lines.join("\n")}\n`;
}

/**
 * This function gives the verdicts of the records of all runs. The records are in the order of the
 * runs: the run id of GitHub, then the attempt, then the sample.
 * @param {readonly Record<string, any>[]} records
 * @param {number} budget
 * @param {number} runs
 */
export function verdictsOf(records, budget, runs) {
  const sorted = records.toSorted((a, b) => Number(a.run.id ?? 0) - Number(b.run.id ?? 0) || Number(a.run.attempt ?? 0) - Number(b.run.attempt ?? 0) || Number(a.run.sample ?? 0) - Number(b.run.sample ?? 0));
  const refs = new Set(sorted.map((r) => `${r.refs.base} ${r.refs.head}`));
  if (refs.size > 1) throw new Error(`The records compare different refs: ${[...refs].join("; ")}.`);
  const ids = [...new Set(sorted.flatMap((r) => r.analysis.map((/** @type {Analysis} */ a) => a.id)))];
  const benchmarks = ids.map((id) =>
    aggregateVerdict(
      id,
      sorted.flatMap((r) => r.analysis.filter((/** @type {Analysis} */ a) => a.id === id).map((/** @type {Analysis} */ analysis) => ({ run: r.run.label, analysis }))),
      budget,
      runs,
    ),
  );
  return {
    schema: VERDICT_SCHEMA,
    direction: DIRECTION,
    budget,
    runs,
    refs: sorted[0]?.refs ?? {},
    records: sorted.map((r) => ({ label: r.run.label, url: r.run.url, cpu: r.context.cpu })),
    benchmarks,
  };
}

/** This function gives the value of an option of the command line, or the fallback. */
const optionOf = (/** @type {string[]} */ argv, /** @type {string} */ name, /** @type {string | undefined} */ fallback = undefined) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};

/** This function gives the JSON files of a folder and its subfolders. */
function jsonFiles(/** @type {string} */ folder) {
  if (!existsSync(folder)) return [];
  if (statSync(folder).isFile()) return folder.endsWith(".json") ? [folder] : [];
  return readdirSync(folder).flatMap((name) => jsonFiles(join(folder, name)));
}

/** This function writes a file, and appends the summary to `GITHUB_STEP_SUMMARY` when it is set. */
function emit(/** @type {string | undefined} */ out, /** @type {unknown} */ value, /** @type {string} */ markdown) {
  if (out !== undefined) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

/** The command `run`: one paired run of the base and the head. */
async function runCommand(/** @type {string[]} */ argv) {
  const baseDir = optionOf(argv, "--base");
  const headDir = optionOf(argv, "--head");
  if (baseDir === undefined || headDir === undefined) {
    console.error("Usage: node scripts/bench-paired.mjs run --base <folder> --head <folder> [--repeats 10] [--warmup 2] [--budget 0.1] [--out <file>]");
    process.exit(2);
  }
  const repeats = Number(optionOf(argv, "--repeats", "10"));
  const warmup = Number(optionOf(argv, "--warmup", "2"));
  const budget = Number(optionOf(argv, "--budget", String(DEFAULT_BUDGET)));
  const only = optionOf(argv, "--only")?.split(",").filter(Boolean);
  const child = fileURLToPath(new URL("./bench-paired-child.mjs", import.meta.url));
  const listOf = async (/** @type {string} */ dir) => {
    const { execFileSync } = await import("node:child_process");
    return /** @type {string[]} */ (JSON.parse(execFileSync(process.execPath, [child, "--tree", resolve(dir), "--list"], { encoding: "utf8" }).trim().split("\n").at(-1) ?? "[]"));
  };
  const inBase = await listOf(baseDir);
  const inHead = await listOf(headDir);
  const wanted = WORKLOADS.map((w) => w.id).filter((id) => only === undefined || only.includes(id));
  const ids = wanted.filter((id) => inBase.includes(id) && inHead.includes(id));
  const skipped = wanted.filter((id) => !ids.includes(id));
  if (ids.length === 0) {
    console.error(`No workload runs in both trees (base: ${inBase.length}, head: ${inHead.length}). Each tree needs the build of @procedures/client and @procedures/collections.`);
    process.exit(1);
  }
  const command = (/** @type {string} */ dir) => [process.execPath, child, "--tree", resolve(dir)];
  const report = await measureIsolated({
    mode: "fresh",
    repeats,
    warmup,
    inputs: ids.map((id) => ({ id })),
    arms: [
      { id: "base", command: command(baseDir) },
      { id: "head", command: command(headDir) },
    ],
  });
  const analysis = report.inputs.map((input) => analyzeInput(input, budget));
  // A probe that gives no number fails the run (the 10-30 rule: gates and probes fail closed)
  const broken = analysis.filter((a) => !Number.isFinite(a.ratio) || !Number.isFinite(a.aa.ratio));
  const sample = optionOf(argv, "--sample", "1");
  const runId = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT;
  const record = {
    schema: RUN_SCHEMA,
    direction: DIRECTION,
    refs: { base: optionOf(argv, "--base-ref", baseDir), head: optionOf(argv, "--head-ref", headDir) },
    run: {
      id: runId,
      attempt,
      sample,
      label: runId ? `${runId}/${attempt ?? 1}/${sample}` : `local/${sample}`,
      url: runId && process.env.GITHUB_SERVER_URL ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}` : undefined,
    },
    context: { ...runnerContext(), ci: process.env.CI === "true", mode: { tool: "scripts/bench-paired.mjs", pairedTime: report.mode, repeats, warmup } },
    repeats,
    warmup,
    budget,
    work: Object.fromEntries(ids.map((id) => [id, { callsPerPass: WORKLOADS.find((w) => w.id === id)?.calls, warmupPasses: warmup, timedPasses: 1 }])),
    skipped,
    analysis,
    report,
  };
  emit(optionOf(argv, "--out"), record, runMarkdown(record));
  if (broken.length > 0) {
    console.error(`The run gave no ratio for ${broken.map((a) => a.id).join(", ")}.`);
    process.exit(1);
  }
}

/** The command `aggregate`: the verdicts of the records of all runs. */
function aggregateCommand(/** @type {string[]} */ argv) {
  const folders = [];
  for (let at = 0; at < argv.length; at++) {
    if (argv[at].startsWith("--")) at++;
    else folders.push(argv[at]);
  }
  const records = folders.flatMap(jsonFiles).map((file) => JSON.parse(readFileSync(file, "utf8"))).filter((r) => r.schema === RUN_SCHEMA);
  if (records.length === 0) {
    console.error(`${folders.join(", ") || "(no folder)"}: no record of schema ${RUN_SCHEMA}. Each paired run writes one.`);
    process.exit(1);
  }
  const budget = Number(optionOf(argv, "--budget", String(records[0].budget ?? DEFAULT_BUDGET)));
  const runs = Number(optionOf(argv, "--runs", String(DEFAULT_RUNS)));
  const verdicts = verdictsOf(records, budget, runs);
  emit(optionOf(argv, "--out"), verdicts, verdictMarkdown(verdicts));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "run") await runCommand(rest);
  else if (command === "aggregate") aggregateCommand(rest);
  else {
    console.error("Usage: node scripts/bench-paired.mjs (run | aggregate) ... (see the comment at the top of the script)");
    process.exit(2);
  }
}
