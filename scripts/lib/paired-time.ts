// A copy of paired-time/1: the paired time test of two or more arms (client O83).
//
// The source is packages/packing/bench/paired-time.ts of github.com/mark1russell7/packing, commit
// d4bc44aa372f02c2a4239c9e2708fcd987eb1496 (k127, docs/BENCH.md, "A paired time test of strategies").
// No shared npm package exists yet. The gates package of rigor joins the copies later. Until then,
// this repository keeps its own copy to the same interface, as highways does. Do not change the
// interface here: change the source, then copy it again.
//
// The copy is TypeScript since O80, as the source is. The logic and the report are the same as the
// source.
//
// The rule: a comparison runs its arms in one
// job, interleaved per input, and an A/A arm (the base against itself) gives the noise floor.
//
// - Mode `process`: one process. In each round, the arms run in turn on each input.
// - Mode `fresh`: a fresh process for each arm, each input and each round. Each input takes the arms in turn.
//
// In each mode, `armOrder` of @mark1russell7/rigor-bench gives the order of a round. So each pair of arms has each order
// within 1 after each count of rounds, at each count of arms. A measure loads that package when it starts, because
// the paired bench loads this module in a checkout with no install, for `quantileOf`.

import { spawn } from "node:child_process";
import { arch, cpus, platform } from "node:os";

/** The mode of a paired time run. */
export type Mode = "process" | "fresh";

/** One arm. Mode `process` uses `run`, and mode `fresh` starts `command` with the child protocol. */
export interface Arm<I = unknown> {
  readonly id: string;
  readonly run?: (input: I) => unknown;
  readonly command?: readonly string[];
}

/** The order of the arms in one round. */
type OrderOf = <T>(arms: readonly T[], round: number) => readonly T[];

/** One input. The `group` is a fold of the inputs, for example a seed. */
export interface Input<I = unknown> {
  readonly id: string;
  readonly group?: string;
  readonly value?: I;
}

/** The result of one child of mode `fresh`: its time in milliseconds, and its memory peak in bytes. */
export interface ChildResult {
  readonly ms: number;
  readonly peakRss?: number;
}

/** The computer of a paired time run. The `cpu` is the model of the first CPU. */
export interface PairedEnv {
  readonly cpu: string;
  readonly cores: number;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly runner?: string;
}

/** The options of `measureIsolated`. */
export interface PairedOptions<I = unknown> {
  /** The arms. The arm 0 is the base: the denominator of each ratio. */
  readonly arms: readonly Arm<I>[];
  readonly inputs: readonly Input<I>[];
  /** The timed rounds of each arm on each input */
  readonly repeats: number;
  /** The untimed passes of each arm before its timed pass. The default is 1. */
  readonly warmup?: number;
  readonly mode: Mode;
  /** The value `true` adds a second copy of the base with the id `${base}~aa`. The default is `true`. */
  readonly aa?: boolean;
  /** The clock in milliseconds for mode `process`. The default is `performance.now`. */
  readonly clock?: () => number;
  /** The start of a child for mode `fresh`. The default starts a process. A test gives its own. */
  readonly startChild?: (command: readonly string[], input: string, warmup: number) => Promise<ChildResult>;
  /** The computer. The default is the computer of this process. */
  readonly env?: PairedEnv;
  /** The context of the run: `ci` or `local` (or `BENCH_MODE`), with the Node.js flags. */
  readonly context?: string;
}

/** The ratios of one arm over the base. */
export interface PairedRatio {
  /** The inputs with a time of the arm and of the base */
  readonly inputs: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  /** The share of the inputs whose ratio is outside [p10, p90] of the A/A arm. It is `null` without the A/A arm. */
  readonly moved: number | null;
  /** The median ratio of the inputs of each group. An input with no group is in the group `all`. */
  readonly groups: Readonly<Record<string, number>>;
  /** The mean of the group medians */
  readonly groupMean: number;
  /** The sample SD of the group medians. Fewer than 2 groups give 0. */
  readonly groupSD: number;
}

/** One input of a report. */
export interface PairedInput {
  readonly id: string;
  readonly group?: string;
  /** The raw times of each arm, one value for each round, in milliseconds */
  readonly ms: Readonly<Record<string, readonly number[]>>;
  readonly median: Readonly<Record<string, number>>;
  /** The median time of the arm over the median time of the base, on this input */
  readonly ratio: Readonly<Record<string, number>>;
  /** The highest memory peak of each arm over its rounds, in bytes. Only mode `fresh` has it. */
  readonly peakRss?: Readonly<Record<string, number>>;
}

/** The report of a paired time run: schema `paired-time/1`. */
export interface PairedReport {
  readonly schema: "paired-time/1";
  readonly mode: Mode;
  readonly context?: string;
  readonly env: PairedEnv;
  readonly base: string;
  /** The ids of the arms, with the A/A arm */
  readonly arms: readonly string[];
  readonly inputs: readonly PairedInput[];
  readonly ratios: Readonly<Record<string, PairedRatio>>;
  /** The ratios of the A/A arm. It is `null` without the A/A arm. */
  readonly noiseFloor: { readonly median: number; readonly p10: number; readonly p90: number } | null;
}

/** The suffix of the id of the A/A arm. */
export const AA_SUFFIX = "~aa";

/** This function gives the id of the A/A arm of a base. */
export const aaId = (base: string): string => `${base}${AA_SUFFIX}`;

/** This function gives the computer of this process. The runner comes from `BENCH_RUNNER`, else `RUNNER_NAME`. An empty value takes the fallback. */
export function pairedEnv(): PairedEnv {
  const all = cpus();
  const env = { cpu: all[0]?.model.trim() || "unknown", cores: all.length, os: platform(), arch: arch(), node: process.version };
  const runner = process.env["BENCH_RUNNER"] || process.env["RUNNER_NAME"];
  return runner !== undefined && runner !== "" ? { ...env, runner } : env;
}

/** This function gives the context of this process: `BENCH_MODE`, else `ci` in CI and `local` on other computers, then the Node.js flags. */
export function pairedContext(): string {
  const where = process.env["BENCH_MODE"] || (process.env["CI"] ? "ci" : "local");
  return [where, ...process.execArgv].join(" ");
}

// The home of these 3 functions is `@mark1russell7/rigor-statistics`. They stay copies here, because the child of the
// paired bench imports this module in a checkout with no install. So this module has no static package import. The
// copies go with this module when the shared bench harness replaces it. `scripts/paired-time.test.ts` pins them
// against `quantile`, `mean` and `sd` of rigor-statistics. An empty list gives NaN here, but a RangeError there.
// Fewer than 2 values give an SD of 0 here, but a RangeError there.
/** This function gives the quantile `q` of a list, with a linear interpolation between the two nearest values. An empty list gives NaN. */
export function quantileOf(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/** This function gives the mean of a list. An empty list gives NaN. */
export const meanOf = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length);

/** This function gives the sample SD of a list. Fewer than 2 values give 0. */
export function sampleSD(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = meanOf(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/** This function checks the options, and gives the arms with the A/A arm. It throws a `RangeError` for a bad option. */
function armsOf<I>(o: PairedOptions<I>): Arm<I>[] {
  if (o.mode !== "process" && o.mode !== "fresh") throw new RangeError(`The mode is process or fresh, not "${String(o.mode)}".`);
  if (!Number.isInteger(o.repeats) || o.repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  const warmup = o.warmup ?? 1;
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  const base = o.arms[0];
  if (base === undefined) throw new RangeError("A paired time run needs a base arm.");
  const arms = o.aa === false ? [...o.arms] : [...o.arms, { ...base, id: aaId(base.id) }];
  if (arms.length < 2) throw new RangeError("A paired time run needs 2 arms or more, with the A/A arm.");
  if (new Set(arms.map((a) => a.id)).size !== arms.length) throw new RangeError("The ids of the arms are not unique.");
  for (const a of arms) {
    if (o.mode === "process" && a.run === undefined) throw new RangeError(`The arm ${a.id} has no run for mode process.`);
    if (o.mode === "fresh" && (a.command === undefined || a.command.length === 0)) throw new RangeError(`The arm ${a.id} has no command for mode fresh.`);
  }
  if (new Set(o.inputs.map((i) => i.id)).size !== o.inputs.length) throw new RangeError("The ids of the inputs are not unique.");
  if (o.inputs.length === 0) throw new RangeError("A paired time run needs 1 input or more.");
  return arms;
}

/** The raw times of a run, before the statistics. */
export interface RawTimes {
  readonly ms: Map<string, Map<string, number[]>>;
  readonly peak: Map<string, Map<string, number>>;
}

/** This function makes empty raw times for the inputs and the arms. */
function rawOf(inputs: readonly { readonly id: string }[], arms: readonly { readonly id: string }[]): RawTimes {
  const ms = new Map(inputs.map((i) => [i.id, new Map(arms.map((a) => [a.id, [] as number[]]))]));
  return { ms, peak: new Map(inputs.map((i) => [i.id, new Map<string, number>()])) };
}

/** This function gives the statistics of the ratios of one arm. */
function ratioOf(rows: readonly { readonly group?: string; readonly ratio: number }[], band: { readonly p10: number; readonly p90: number } | undefined): PairedRatio {
  const values = rows.map((r) => r.ratio);
  const median = quantileOf(values, 0.5);
  const byGroup = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.group ?? "all";
    byGroup.set(key, [...(byGroup.get(key) ?? []), r.ratio]);
  }
  const groups: Record<string, number> = {};
  for (const key of [...byGroup.keys()].sort()) groups[key] = quantileOf(byGroup.get(key) ?? [], 0.5);
  const medians = Object.values(groups);
  return {
    inputs: rows.length,
    median,
    p10: quantileOf(values, 0.1),
    p90: quantileOf(values, 0.9),
    groups,
    groupMean: meanOf(medians),
    groupSD: sampleSD(medians),
    moved: band === undefined ? null : rows.length === 0 ? 0 : values.filter((v) => v < band.p10 || v > band.p90).length / rows.length,
  };
}

/**
 * This function gives the report of the raw times of a run.
 *
 * - The ratio of an input is the median of the arm over the median of the base. An input with a base median of 0 or no time gets no ratio.
 * - With the A/A arm, the noise floor is its ratios, and `moved` of each arm uses the band [p10, p90] of the A/A ratios.
 */
export function pairedReport<I>(mode: Mode, env: PairedEnv, context: string | undefined, arms: readonly Arm<I>[], inputs: readonly Input<I>[], raw: RawTimes): PairedReport {
  const base = arms[0].id;
  const aa = arms.find((a) => a.id === aaId(base))?.id;
  const rows: PairedInput[] = inputs.map((input) => {
    const own = raw.ms.get(input.id);
    const ms: Record<string, number[]> = {};
    const median: Record<string, number> = {};
    for (const a of arms) {
      const times = own?.get(a.id) ?? [];
      ms[a.id] = times;
      if (times.length > 0) median[a.id] = quantileOf(times, 0.5);
    }
    const ratio: Record<string, number> = {};
    const b = median[base];
    if (b !== undefined && b > 0) for (const a of arms.slice(1)) if (median[a.id] !== undefined) ratio[a.id] = median[a.id] / b;
    const peak = raw.peak.get(input.id);
    return {
      id: input.id,
      ms,
      median,
      ratio,
      ...(input.group === undefined ? {} : { group: input.group }),
      ...(mode === "fresh" && peak !== undefined && peak.size > 0 ? { peakRss: Object.fromEntries(peak) } : {}),
    };
  });
  const rowsOf = (id: string) => rows.filter((r) => r.ratio[id] !== undefined).map((r) => ({ ...(r.group === undefined ? {} : { group: r.group }), ratio: r.ratio[id] }));
  const floor = aa === undefined ? undefined : ratioOf(rowsOf(aa), undefined);
  const band = floor === undefined ? undefined : { p10: floor.p10, p90: floor.p90 };
  const ratios: Record<string, PairedRatio> = {};
  for (const a of arms.slice(1)) ratios[a.id] = ratioOf(rowsOf(a.id), band);
  return { schema: "paired-time/1", mode, ...(context === undefined ? {} : { context }), env, base, arms: arms.map((a) => a.id), inputs: rows, ratios, noiseFloor: floor === undefined ? null : { median: floor.median, p10: floor.p10, p90: floor.p90 } };
}

/** This function does the warm-up passes of a child untimed, then one timed pass. It gives the time and the memory peak of the process. */
export function timeChild(run: () => unknown, warmup: number, clock: () => number = () => performance.now()): { readonly ms: number; readonly peakRss: number } {
  for (let w = 0; w < warmup; w++) run();
  const start = clock();
  run();
  const ms = clock() - start;
  // The value maxRSS of Node.js is in kilobytes
  return { ms, peakRss: process.resourceUsage().maxRSS * 1024 };
}

/** This function starts a child with the child protocol, and gives its result. A child that exits with a code other than 0 is an error. */
async function startProcess(command: readonly string[], input: string, warmup: number): Promise<ChildResult> {
  return childResult(await startArgv([...command, "--input", input, "--warmup", String(warmup)]));
}

/** This function starts a process, and gives its stdout. A process that exits with a code other than 0 is an error. */
function startArgv(argv: readonly string[]): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (out += chunk));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? done(out) : fail(new Error(`The child ${argv.join(" ")} exited with the code ${code}.`))));
  });
}

/** This function reads the last line of the stdout of a child: `{"ms": n, "peakRss"?: bytes}`. */
export function childResult(stdout: string): ChildResult {
  const line = stdout.trim().split("\n").at(-1) ?? "";
  const value = JSON.parse(line) as { readonly ms?: unknown; readonly peakRss?: unknown };
  if (typeof value.ms !== "number" || !Number.isFinite(value.ms)) throw new Error(`The child gave no time: ${line}`);
  return typeof value.peakRss === "number" ? { ms: value.ms, peakRss: value.peakRss } : { ms: value.ms };
}

/** This function times the arms in one process: in each round, the arms in turn on each input, in the order that `orderOf` gives. */
function measureProcess<I>(o: PairedOptions<I>, arms: readonly Arm<I>[], orderOf: OrderOf): PairedReport {
  const clock = o.clock ?? (() => performance.now());
  const warmup = o.warmup ?? 1;
  const raw = rawOf(o.inputs, arms);
  for (let round = 0; round < o.repeats; round++) {
    for (const input of o.inputs) {
      for (const arm of orderOf(arms, round)) {
        const run = arm.run as (input: I) => unknown;
        const value = input.value as I;
        for (let w = 0; w < warmup; w++) run(value);
        const start = clock();
        const out = run(value);
        raw.ms.get(input.id)?.get(arm.id)?.push(clock() - start);
        // Mode process has one process, so a memory peak of an arm has no meaning
        if (typeof out === "object" && out !== null && "peakRss" in out) throw new RangeError(`The arm ${arm.id} gave a peakRss in mode process.`);
      }
    }
  }
  return pairedReport("process", o.env ?? pairedEnv(), o.context ?? pairedContext(), arms, o.inputs, raw);
}

/** This function times the arms with a fresh process for each arm, each input and each round. Each input takes the arms in turn, in an order that rotates each round. */
async function measureFresh<I>(o: PairedOptions<I>, arms: readonly Arm<I>[], orderOf: OrderOf): Promise<PairedReport> {
  const start = o.startChild ?? startProcess;
  const warmup = o.warmup ?? 1;
  const raw = rawOf(o.inputs, arms);
  for (let round = 0; round < o.repeats; round++) {
    for (const input of o.inputs) {
      for (const arm of orderOf(arms, round)) {
        const result = await start(arm.command as readonly string[], input.id, warmup);
        raw.ms.get(input.id)?.get(arm.id)?.push(result.ms);
        const peak = raw.peak.get(input.id);
        if (result.peakRss !== undefined && peak !== undefined) peak.set(arm.id, Math.max(peak.get(arm.id) ?? 0, result.peakRss));
      }
    }
  }
  return pairedReport("fresh", o.env ?? pairedEnv(), o.context ?? pairedContext(), arms, o.inputs, raw);
}

/**
 * This function times the arms of a comparison, and gives the report of schema `paired-time/1`.
 *
 * - Mode `process` gives the report. Mode `fresh` gives a promise of the report.
 * - With `aa` (the default), the report has an A/A arm and the noise floor.
 * - A bad option throws a `RangeError`.
 */
export async function measureIsolated<I>(options: PairedOptions<I>): Promise<PairedReport> {
  const arms = armsOf(options);
  const { armOrder } = await import("@mark1russell7/rigor-bench");
  return options.mode === "process" ? measureProcess(options, arms, armOrder) : measureFresh(options, arms, armOrder);
}

/** This function gives a number with 3 decimals for a table. */
const fmt = (value: number | null | undefined): string => (value === undefined || value === null || Number.isNaN(value) ? "" : value.toFixed(3));

/** This function gives the Markdown table of a report. */
export function pairedMarkdown(r: PairedReport, title = "A paired time test"): string {
  const groups = [...new Set(Object.values(r.ratios).flatMap((x) => Object.keys(x.groups)))].sort();
  const floor = r.noiseFloor === null ? "none (no A/A arm)" : `median ${fmt(r.noiseFloor.median)}, p10 ${fmt(r.noiseFloor.p10)}, p90 ${fmt(r.noiseFloor.p90)}`;
  return [
    `# ${title}`,
    "",
    `- Schema \`${r.schema}\`, mode \`${r.mode}\`${r.context === undefined ? "" : `, context \`${r.context}\``}, on ${r.env.cores} x ${r.env.cpu} (${r.env.os} ${r.env.arch}, Node.js ${r.env.node}${r.env.runner === undefined ? "" : `, ${r.env.runner}`}).`,
    `- Base \`${r.base}\`. The ratio of an input is the median time of the arm over the median time of the base.`,
    `- Noise floor (the A/A arm): ${floor}.`,
    "",
    `| Arm | Inputs | Median | p10 | p90 | Moved | ${groups.map((g) => `Group ${g}`).join(" | ")}${groups.length > 0 ? " | " : ""}Group mean | Group SD |`,
    `|---|---|---|---|---|---|${groups.map(() => "---|").join("")}---|---|`,
    ...Object.entries(r.ratios).map(
      ([id, x]) => `| \`${id}\` | ${x.inputs} | ${fmt(x.median)} | ${fmt(x.p10)} | ${fmt(x.p90)} | ${fmt(x.moved)} | ${groups.map((g) => fmt(x.groups[g])).join(" | ")}${groups.length > 0 ? " | " : ""}${fmt(x.groupMean)} | ${fmt(x.groupSD)} |`,
    ),
    "",
  ].join("\n");
}
