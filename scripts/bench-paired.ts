#!/usr/bin/env node
/**
 * This script is the paired A/B bench of the base and the head (O83), with paired-time/1.
 *
 *   node scripts/bench-paired.ts run --base <folder> --head <folder> [--repeats 10] [--warmup 2]
 *        [--budget 0.1] [--sample 1] [--base-ref <sha>] [--head-ref <sha>] [--only <id,id>] [--out <file>]
 *   node scripts/bench-paired.ts aggregate <folder>... [--runs 5] [--budget 0.1] [--out <file>]
 *
 * `run` times the two trees in one job, on one runner. The arms are `base`, `head` and the A/A
 * arm `base~aa` (the base against itself). Mode `fresh`: each arm, input and round is a new process
 * (`scripts/bench-paired-child.ts`), and the order of the arms changes each round. The record is
 * JSON: the paired-time/1 report, the analysis of each benchmark and the runner context of
 * `scripts/bench-context.ts`. The script appends a table to `GITHUB_STEP_SUMMARY`.
 *
 * `aggregate` reads the records of the runs, and gives the verdict of each benchmark from the first
 * `--runs` runs that count. A run of a benchmark counts only when its A/A band contains 1.0. Else
 * the run measured the runner: a new run replaces it, and the record keeps both run ids.
 *
 * The verdict is an interval rule (2026-11-02, the shape of an
 * equivalence test). Over the counted runs of a benchmark:
 *
 *   h = max over the counted runs of (p90 - p10) / 2 of the A/A band (the worst A/A half-spread)
 *   E = [min ratio - h, max ratio + h] (the effect interval)
 *   slower: lo(E) > 1 + budget. faster: hi(E) < 1 - budget.
 *   no change: 1 - budget <= lo(E) and hi(E) <= 1 + budget. Else: cannot decide, and the record gives E.
 *
 * Thus a verdict of "no change" needs noise smaller than the budget, and "slower" or "faster" needs
 * only an effect larger than the budget plus the noise.
 *
 * Each ratio is the time of the head over the time of the base: lower is better. The script gives
 * no gate and no required check. It only reports.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerContext } from "./bench-context.ts";
import { WORKLOADS } from "./bench-paired-child.ts";
import { aaId, measureIsolated, quantileOf, type PairedInput } from "./lib/paired-time.ts";

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

/** A verdict of the interval rule. */
export type Verdict = "faster" | "slower" | "no change" | "cannot decide";

/** A band of ratios: p10, the median and p90. */
export interface Band {
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
}

/** An effect interval: the lowest and the highest ratio, each widened by the A/A half-spread. */
export interface Effect {
  readonly lo: number;
  readonly hi: number;
}

/**
 * This function gives the ratio of each round: the time of the arm over the time of the base in
 * the same round. The arms of one round of one input run one after the other, so each ratio is a pair.
 */
export function roundRatios(arm: readonly number[], base: readonly number[]): number[] {
  const ratios: number[] = [];
  for (let round = 0; round < Math.min(arm.length, base.length); round++) if (base[round] > 0) ratios.push(arm[round] / base[round]);
  return ratios;
}

/** This function gives the band of a list of ratios: p10, the median and p90. */
export function bandOf(values: readonly number[]): Band {
  return { p10: quantileOf(values, 0.1), median: quantileOf(values, 0.5), p90: quantileOf(values, 0.9) };
}

/** This function tells if a band contains 1.0. A band with a NaN bound does not. */
export const containsOne = (band: { readonly p10: number; readonly p90: number }): boolean => band.p10 <= 1 && band.p90 >= 1;

/**
 * This function gives the A/A spread of a band: the largest distance of its bounds from 1.0.
 * The spread of a median decision is the A/A p90 (the policy budget rule of 11-01).
 */
export const spreadOf = (band: { readonly p10: number; readonly p90: number }): number => Math.max(band.p90 - 1, 1 - band.p10, 0);

/** This function gives the A/A half-spread of a band: half of the distance from p10 to p90. */
export const halfSpreadOf = (band: { readonly p10: number; readonly p90: number }): number => (band.p90 - band.p10) / 2;

/**
 * This function gives the effect interval: the lowest and the highest ratio, each widened by the
 * half-spread `h`.
 */
export function effectOf(ratios: readonly number[], h: number): Effect {
  if (ratios.length === 0 || !Number.isFinite(h)) return { lo: Number.NaN, hi: Number.NaN };
  return { lo: Math.min(...ratios) - h, hi: Math.max(...ratios) + h };
}

/** This function gives the verdict of an effect interval against the budget (the interval rule). */
export function verdictOf(effect: Effect, budget: number): Verdict {
  if (!Number.isFinite(effect.lo) || !Number.isFinite(effect.hi)) return "cannot decide";
  if (effect.lo > 1 + budget) return "slower";
  if (effect.hi < 1 - budget) return "faster";
  if (effect.lo >= 1 - budget && effect.hi <= 1 + budget) return "no change";
  return "cannot decide";
}

/** This function gives an effect interval as text. */
const effectText = (e: Effect): string => `[${f3(e.lo)}, ${f3(e.hi)}]`;

/** The analysis of one benchmark in one run. */
export interface Analysis {
  readonly id: string;
  /** The median time of one call of the base, in milliseconds */
  readonly baseMs: number;
  /** The median time of one call of the head, in milliseconds */
  readonly headMs: number;
  /** The median of the head over the median of the base (paired-time/1) */
  readonly ratio: number;
  /** The band of the round ratios of the head */
  readonly band: Band;
  /** The A/A arm */
  readonly aa: { readonly ratio: number; readonly band: Band; readonly containsOne: boolean; readonly spread: number };
  /** The run counts only when the A/A band contains 1.0 */
  readonly counts: boolean;
  /** The ratio widened by the A/A half-spread of this run */
  readonly effect: Effect;
  readonly verdict: Verdict;
  readonly reason: string;
}

/** This function gives the analysis of one input of a paired-time/1 report. The `ids` are the ids of the arms. */
export function analyzeInput(input: PairedInput, budget: number, ids: { readonly base?: string; readonly head?: string } = {}): Analysis {
  const base = ids.base ?? "base";
  const head = ids.head ?? "head";
  const aa = aaId(base);
  const band = bandOf(roundRatios(input.ms[head] ?? [], input.ms[base] ?? []));
  const aaBand = bandOf(roundRatios(input.ms[aa] ?? [], input.ms[base] ?? []));
  const aaContains = containsOne(aaBand);
  const spread = spreadOf(aaBand);
  const ratio = input.ratio[head] ?? Number.NaN;
  const effect = Number.isFinite(ratio) ? effectOf([ratio], halfSpreadOf(aaBand)) : { lo: Number.NaN, hi: Number.NaN };
  let verdict: Verdict = "cannot decide";
  let reason: string;
  if (!Number.isFinite(ratio) || Number.isNaN(aaBand.p10)) reason = "the run has no paired times";
  else if (!aaContains) reason = `the A/A band [${aaBand.p10.toFixed(3)}, ${aaBand.p90.toFixed(3)}] excludes 1.0: the run measured the runner, and does not count. A new run replaces it`;
  else {
    verdict = verdictOf(effect, budget);
    reason = `the effect interval ${effectText(effect)} against the budget ${budget}`;
  }
  return {
    id: input.id,
    baseMs: input.median[base] ?? Number.NaN,
    headMs: input.median[head] ?? Number.NaN,
    ratio,
    band,
    aa: { ratio: input.ratio[aa] ?? Number.NaN, band: aaBand, containsOne: aaContains, spread },
    counts: aaContains,
    effect,
    verdict,
    reason,
  };
}

/** One benchmark in one run, for the aggregate. */
export interface Sample {
  /** The id of the run: the run id of GitHub, the attempt and the sample */
  readonly run: string;
  readonly analysis: Analysis;
}

/** The verdict of one benchmark over the runs. */
export interface AggregateVerdict {
  readonly id: string;
  /** The runs that the verdict uses */
  readonly runs: string[];
  /** The runs whose A/A band excludes 1.0 */
  readonly excluded: string[];
  /** The counted runs after the first `runs` */
  readonly extra: string[];
  readonly ratios: number[];
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly baseMs: number;
  readonly headMs: number;
  readonly aaBands: Band[];
  readonly worstSpread: number;
  readonly halfSpread: number;
  readonly effect: Effect;
  readonly budget: number;
  readonly verdict: Verdict;
  readonly reason: string;
}

/**
 * This function gives the verdict of one benchmark from the runs. The first `runs` samples whose A/A
 * band contains 1.0 count, in the order of the runs. The samples that do not count stay in the record.
 *
 * - Fewer counted samples than `runs`: `cannot decide`, and new runs replace the others.
 * - Else the interval rule of the header of this file gives the verdict from the effect interval.
 */
export function aggregateVerdict(id: string, samples: readonly Sample[], budget: number, runs: number): AggregateVerdict {
  const counted = samples.filter((s) => s.analysis.counts);
  const excluded = samples.filter((s) => !s.analysis.counts).map((s) => s.run);
  const used = counted.slice(0, runs);
  const ratios = used.map((s) => s.analysis.ratio);
  const worstSpread = used.length === 0 ? Number.NaN : Math.max(...used.map((s) => s.analysis.aa.spread));
  const halfSpread = used.length === 0 ? Number.NaN : Math.max(...used.map((s) => halfSpreadOf(s.analysis.aa.band)));
  const effect = effectOf(ratios, halfSpread);
  const min = ratios.length === 0 ? Number.NaN : Math.min(...ratios);
  const max = ratios.length === 0 ? Number.NaN : Math.max(...ratios);
  let verdict: Verdict = "cannot decide";
  let reason: string;
  if (used.length < runs) {
    reason = `${used.length} of ${runs} runs count${excluded.length > 0 ? ` (the A/A band of ${excluded.join(", ")} excludes 1.0)` : ""}: start new runs to replace them`;
  } else {
    verdict = verdictOf(effect, budget);
    reason = `the effect interval ${effectText(effect)} (the ratios ${f3(min)} to ${f3(max)}, widened by the worst A/A half-spread ${f3(halfSpread)})${verdict === "cannot decide" ? ` is not outside 1 ± ${budget}, and not inside it` : ` gives ${verdict} against 1 ± ${budget}`}`;
  }
  return {
    id,
    runs: used.map((s) => s.run),
    excluded,
    extra: counted.slice(runs).map((s) => s.run),
    ratios,
    median: quantileOf(ratios, 0.5),
    min,
    max,
    baseMs: quantileOf(used.map((s) => s.analysis.baseMs), 0.5),
    headMs: quantileOf(used.map((s) => s.analysis.headMs), 0.5),
    aaBands: used.map((s) => s.analysis.aa.band),
    worstSpread,
    halfSpread,
    effect,
    budget,
    verdict,
    reason,
  };
}

/** This function gives a number with 3 decimals, or a dash. */
const f3 = (value: number): string => (Number.isFinite(value) ? value.toFixed(3) : "—");

/** This function gives a time in milliseconds with 5 decimals, or a dash. */
const f5 = (value: number): string => (Number.isFinite(value) ? value.toFixed(5) : "—");

/** This function gives a band as text. */
const bandText = (band: { readonly p10: number; readonly p90: number }): string => `${f3(band.p10)} to ${f3(band.p90)}`;

/** The fields of the record of one run that the summary of the run reads. */
export interface RunSummary {
  readonly run: { readonly label: string };
  readonly refs: { readonly base: string; readonly head: string };
  readonly context: {
    readonly cpu: string;
    readonly cores: number;
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
    readonly runner?: { readonly name?: string; readonly imageVersion?: string };
  };
  readonly report: { readonly mode: string };
  readonly repeats: number;
  readonly warmup: number;
  readonly budget: number;
  readonly skipped: readonly string[];
  readonly analysis: readonly Analysis[];
}

/** The fields of the record of one run that the aggregate reads. */
export interface RunRecord extends RunSummary {
  readonly run: { readonly id?: string; readonly attempt?: string; readonly sample?: string; readonly label: string; readonly url?: string };
}

/** The record of the verdicts of all runs. */
export interface Verdicts {
  readonly schema: typeof VERDICT_SCHEMA;
  readonly direction: typeof DIRECTION;
  readonly budget: number;
  readonly runs: number;
  readonly refs: { readonly base?: string; readonly head?: string };
  readonly records: readonly { readonly label: string; readonly url?: string; readonly cpu: string }[];
  readonly benchmarks: readonly AggregateVerdict[];
}

/** This function gives the context lines of a run for a summary. */
function contextLines(record: RunSummary): string[] {
  const c = record.context;
  const lines = [`- Base \`${record.refs.base}\`, head \`${record.refs.head}\`. Each ratio is ${DIRECTION}.`];
  lines.push(`- Mode \`${record.report.mode}\`: a new process for each arm, input and round. ${record.repeats} rounds, ${record.warmup} warm-up passes. Budget ${record.budget}.`);
  lines.push(`- CPU: ${c.cpu} (${c.cores} cores), Node ${c.node}, ${c.platform}/${c.arch}${c.runner?.name ? `, runner ${c.runner.name}` : ""}${c.runner?.imageVersion ? ` (image ${c.runner.imageVersion})` : ""}.`);
  if (record.skipped.length > 0) lines.push(`- Not in both trees, not timed: ${record.skipped.join(", ")}.`);
  return lines;
}

/** This function gives the summary of one run in Markdown. */
export function runMarkdown(record: RunSummary): string {
  const lines = [`## Paired bench, run ${record.run.label}`, "", ...contextLines(record), ""];
  lines.push("| Benchmark | Base (ms/call) | Head (ms/call) | Head/base | Head/base p10 to p90 | A/A p10 to p90 | A/A has 1.0 | Effect interval | Verdict |");
  lines.push("| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |");
  for (const a of record.analysis) {
    lines.push(`| ${a.id} | ${f5(a.baseMs)} | ${f5(a.headMs)} | ${f3(a.ratio)} | ${bandText(a.band)} | ${bandText(a.aa.band)} | ${a.counts ? "yes" : "**no: does not count**"} | ${effectText(a.effect)} | ${a.verdict} |`);
  }
  const notCounted = record.analysis.filter((a) => !a.counts).map((a) => a.id);
  lines.push("");
  if (notCounted.length > 0) lines.push(`Run ${record.run.label}: the A/A band of ${notCounted.join(", ")} excludes 1.0. The run measured the runner for these benchmarks. A new run replaces it, and the record keeps both run ids.`, "");
  return `${lines.join("\n")}\n`;
}

/** This function gives the summary of the verdicts in Markdown. */
export function verdictMarkdown(verdicts: Verdicts): string {
  const lines = [`## Paired bench verdicts (${verdicts.runs} runs)`, ""];
  lines.push(`- Base \`${verdicts.refs.base}\`, head \`${verdicts.refs.head}\`. Each ratio is ${DIRECTION}.`);
  lines.push(`- A run of a benchmark counts only when its A/A band contains 1.0. The effect interval is [min ratio - h, max ratio + h], with h the worst A/A half-spread. slower: its low end is above 1 + ${verdicts.budget}. faster: its high end is below 1 - ${verdicts.budget}. no change: it is inside 1 ± ${verdicts.budget}. Else: cannot decide.`);
  lines.push(`- Records: ${verdicts.records.map((r) => `${r.label} (${r.cpu})`).join(", ")}.`, "");
  lines.push("| Benchmark | Base (ms/call) | Head (ms/call) | Head/base median | Min to max | Worst A/A spread | Effect interval | Verdict | Runs that do not count |");
  lines.push("| --- | ---: | ---: | ---: | --- | ---: | --- | --- | --- |");
  for (const v of verdicts.benchmarks) {
    lines.push(`| ${v.id} | ${f5(v.baseMs)} | ${f5(v.headMs)} | ${f3(v.median)} | ${f3(v.min)} to ${f3(v.max)} | ${f3(v.worstSpread)} | ${effectText(v.effect)} | ${v.verdict} | ${v.excluded.length > 0 ? v.excluded.join(", ") : "none"} |`);
  }
  lines.push("", ...verdicts.benchmarks.filter((v) => v.verdict === "cannot decide").map((v) => `- ${v.id}: cannot decide, ${v.reason}.`), "");
  return `${lines.join("\n")}\n`;
}

/**
 * This function gives the verdicts of the records of all runs. The records are in the order of the
 * runs: the run id of GitHub, then the attempt, then the sample.
 */
export function verdictsOf(records: readonly RunRecord[], budget: number, runs: number): Verdicts {
  const sorted = records.toSorted((a, b) => Number(a.run.id ?? 0) - Number(b.run.id ?? 0) || Number(a.run.attempt ?? 0) - Number(b.run.attempt ?? 0) || Number(a.run.sample ?? 0) - Number(b.run.sample ?? 0));
  const refs = new Set(sorted.map((r) => `${r.refs.base} ${r.refs.head}`));
  if (refs.size > 1) throw new Error(`The records compare different refs: ${[...refs].join("; ")}.`);
  const ids = [...new Set(sorted.flatMap((r) => r.analysis.map((a) => a.id)))];
  const benchmarks = ids.map((id) =>
    aggregateVerdict(
      id,
      sorted.flatMap((r) => r.analysis.filter((a) => a.id === id).map((analysis) => ({ run: r.run.label, analysis }))),
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
function optionOf(argv: readonly string[], name: string): string | undefined;
function optionOf(argv: readonly string[], name: string, fallback: string): string;
function optionOf(argv: readonly string[], name: string, fallback?: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
}

/** This function gives the JSON files of a folder and its subfolders. */
function jsonFiles(folder: string): string[] {
  if (!existsSync(folder)) return [];
  if (statSync(folder).isFile()) return folder.endsWith(".json") ? [folder] : [];
  return readdirSync(folder).flatMap((name) => jsonFiles(join(folder, name)));
}

/** This function writes a file, and appends the summary to `GITHUB_STEP_SUMMARY` when it is set. */
function emit(out: string | undefined, value: unknown, markdown: string): void {
  if (out !== undefined) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

/** The command `run`: one paired run of the base and the head. */
async function runCommand(argv: readonly string[]): Promise<void> {
  const baseDir = optionOf(argv, "--base");
  const headDir = optionOf(argv, "--head");
  if (baseDir === undefined || headDir === undefined) {
    console.error("Usage: node scripts/bench-paired.ts run --base <folder> --head <folder> [--repeats 10] [--warmup 2] [--budget 0.1] [--out <file>]");
    process.exit(2);
  }
  const repeats = Number(optionOf(argv, "--repeats", "10"));
  const warmup = Number(optionOf(argv, "--warmup", "2"));
  const budget = Number(optionOf(argv, "--budget", String(DEFAULT_BUDGET)));
  const only = optionOf(argv, "--only")?.split(",").filter(Boolean);
  const child = fileURLToPath(new URL("./bench-paired-child.ts", import.meta.url));
  const listOf = async (dir: string): Promise<string[]> => {
    const { execFileSync } = await import("node:child_process");
    return JSON.parse(execFileSync(process.execPath, [child, "--tree", resolve(dir), "--list"], { encoding: "utf8" }).trim().split("\n").at(-1) ?? "[]") as string[];
  };
  const inBase = await listOf(baseDir);
  const inHead = await listOf(headDir);
  const wanted = WORKLOADS.map((w) => w.id).filter((id) => only === undefined || only.includes(id));
  const ids = wanted.filter((id) => inBase.includes(id) && inHead.includes(id));
  const skipped = wanted.filter((id) => !ids.includes(id));
  // A skip is correct only when a tree has no bench file of the workload. A bench file with no loadable build is a build fault.
  const unbuilt = skipped.filter((id) => {
    const file = WORKLOADS.find((w) => w.id === id)?.file;
    return file !== undefined && existsSync(join(baseDir, file)) && existsSync(join(headDir, file));
  });
  if (unbuilt.length > 0) {
    console.error(`Both trees have the bench file, but a tree has no build of its package: ${unbuilt.join(", ")}. Build @procedures/client and @procedures/collections in each tree.`);
    process.exit(1);
  }
  if (ids.length === 0) {
    console.error(`No workload runs in both trees (base: ${inBase.length}, head: ${inHead.length}). Each tree needs the build of @procedures/client and @procedures/collections.`);
    process.exit(1);
  }
  const command = (dir: string) => [process.execPath, child, "--tree", resolve(dir)];
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
    context: { ...runnerContext(), ci: process.env.CI === "true", mode: { tool: "scripts/bench-paired.ts", pairedTime: report.mode, repeats, warmup } },
    repeats,
    warmup,
    budget,
    work: Object.fromEntries(
      ids.map((id) => {
        const w = WORKLOADS.find((x) => x.id === id);
        // A cold measure times its first calls with no warm-up. A warm measure times chunks until the time is stable
        if (w?.measure === "setup") return [id, { measure: "setup", rule: "the time from the start of the process to the end of call 1" }];
        if (w?.measure === "cold") return [id, { measure: "cold", calls: w.calls, warmupPasses: 0 }];
        if (w?.measure === "warm") return [id, { measure: "warm", callsPerChunk: w.calls, rule: "the median of the last 3 chunks within 5 %, after 10 to 60 chunks" }];
        return [id, { callsPerPass: w?.calls, warmupPasses: warmup, timedPasses: 1 }];
      }),
    ),
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
function aggregateCommand(argv: readonly string[]): void {
  const folders: string[] = [];
  for (let at = 0; at < argv.length; at++) {
    if (argv[at].startsWith("--")) at++;
    else folders.push(argv[at]);
  }
  const records = folders
    .flatMap(jsonFiles)
    .map((file): unknown => JSON.parse(readFileSync(file, "utf8")))
    .filter((r): r is RunRecord => (r as { readonly schema?: unknown }).schema === RUN_SCHEMA);
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
    console.error("Usage: node scripts/bench-paired.ts (run | aggregate) ... (see the comment at the top of the script)");
    process.exit(2);
  }
}
