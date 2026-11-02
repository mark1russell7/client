// A copy of paired-time/1: the paired time test of two or more arms (client O83).
//
// The source is packages/packing/bench/paired-time.ts of github.com/mark1russell7/packing, commit
// d4bc44aa372f02c2a4239c9e2708fcd987eb1496 (k127, docs/BENCH.md, "A paired time test of strategies").
// No shared npm package exists yet. The gates package of rigor joins the copies later. Until then,
// this repository keeps its own copy to the same interface, as highways does. Do not change the
// interface here: change the source, then copy it again.
//
// The copy is JavaScript with JSDoc types, because the scripts of this repository are .mjs files
// until O80, and the root has no typecheck of scripts. The logic and the report are the same as the
// source. The types of the source are the JSDoc typedefs below.
//
// The rule is STRATEGY.md 49537337 and 211125cd of the fleet: a comparison runs its arms in one
// job, interleaved per input, and an A/A arm (the base against itself) gives the noise floor.
//
// - Mode `process`: one process. In each round, the arms run in turn on each input. Odd rounds reverse the order (ABBA).
// - Mode `fresh`: a fresh process for each arm, each input and each round. Each input takes the arms in turn. The order rotates each round.

import { spawn } from "node:child_process";
import { arch, cpus, platform } from "node:os";

/** @typedef {"process" | "fresh"} Mode The mode of a paired time run. */
/** @typedef {{ id: string, run?: (input: any) => unknown, command?: readonly string[] }} Arm One arm. Mode `process` uses `run`, and mode `fresh` starts `command` with the child protocol. */
/** @typedef {{ id: string, group?: string, value?: any }} Input One input. The `group` is a fold of the inputs, for example a seed. */
/** @typedef {{ ms: number, peakRss?: number }} ChildResult The result of one child of mode `fresh`: its time in milliseconds, and its memory peak in bytes. */
/** @typedef {{ cpu: string, cores: number, os: string, arch: string, node: string, runner?: string }} PairedEnv The computer of a paired time run. The `cpu` is the model of the first CPU. */
/**
 * @typedef {object} PairedOptions The options of `measureIsolated`.
 * @property {readonly Arm[]} arms The arms. The arm 0 is the base: the denominator of each ratio.
 * @property {readonly Input[]} inputs
 * @property {number} repeats The timed rounds of each arm on each input
 * @property {number} [warmup] The untimed passes of each arm before its timed pass. The default is 1.
 * @property {Mode} mode
 * @property {boolean} [aa] The value `true` adds a second copy of the base with the id `${base}~aa`. The default is `true`.
 * @property {() => number} [clock] The clock in milliseconds for mode `process`. The default is `performance.now`.
 * @property {(command: readonly string[], input: string, warmup: number) => Promise<ChildResult>} [startChild] The start of a child for mode `fresh`. The default starts a process. A test gives its own.
 * @property {PairedEnv} [env] The computer. The default is the computer of this process.
 * @property {string} [context] The context of the run: `ci` or `local` (or `BENCH_MODE`), with the Node.js flags.
 */
/**
 * @typedef {object} PairedRatio The ratios of one arm over the base.
 * @property {number} inputs The inputs with a time of the arm and of the base
 * @property {number} median
 * @property {number} p10
 * @property {number} p90
 * @property {number | null} moved The share of the inputs whose ratio is outside [p10, p90] of the A/A arm. It is `null` without the A/A arm.
 * @property {Record<string, number>} groups The median ratio of the inputs of each group. An input with no group is in the group `all`.
 * @property {number} groupMean The mean of the group medians
 * @property {number} groupSD The sample SD of the group medians. Fewer than 2 groups give 0.
 */
/**
 * @typedef {object} PairedInput One input of a report.
 * @property {string} id
 * @property {string} [group]
 * @property {Record<string, number[]>} ms The raw times of each arm, one value for each round, in milliseconds
 * @property {Record<string, number>} median
 * @property {Record<string, number>} ratio The median time of the arm over the median time of the base, on this input
 * @property {Record<string, number>} [peakRss] The highest memory peak of each arm over its rounds, in bytes. Only mode `fresh` has it.
 */
/**
 * @typedef {object} PairedReport The report of a paired time run: schema `paired-time/1`.
 * @property {"paired-time/1"} schema
 * @property {Mode} mode
 * @property {string} [context]
 * @property {PairedEnv} env
 * @property {string} base
 * @property {string[]} arms The ids of the arms, with the A/A arm
 * @property {PairedInput[]} inputs
 * @property {Record<string, PairedRatio>} ratios
 * @property {{ median: number, p10: number, p90: number } | null} noiseFloor The ratios of the A/A arm. It is `null` without the A/A arm.
 */

/** The suffix of the id of the A/A arm. */
export const AA_SUFFIX = "~aa";

/** This function gives the id of the A/A arm of a base. */
export const aaId = (/** @type {string} */ base) => `${base}${AA_SUFFIX}`;

/**
 * This function gives the computer of this process. The runner comes from `BENCH_RUNNER`, else `RUNNER_NAME`. An empty value takes the fallback.
 * @returns {PairedEnv}
 */
export function pairedEnv() {
  const all = cpus();
  /** @type {PairedEnv} */
  const env = { cpu: all[0]?.model.trim() || "unknown", cores: all.length, os: platform(), arch: arch(), node: process.version };
  const runner = process.env["BENCH_RUNNER"] || process.env["RUNNER_NAME"];
  if (runner !== undefined && runner !== "") env.runner = runner;
  return env;
}

/** This function gives the context of this process: `BENCH_MODE`, else `ci` in CI and `local` on other computers, then the Node.js flags. */
export function pairedContext() {
  const where = process.env["BENCH_MODE"] || (process.env["CI"] ? "ci" : "local");
  return [where, ...process.execArgv].join(" ");
}

/**
 * This function gives the order of the arms in one round.
 *
 * - Mode `process`: the order of the arms, reversed in each odd round.
 * - Mode `fresh`: the order of the arms, rotated by the index of the round.
 * @param {number} arms
 * @param {number} round
 * @param {Mode} mode
 * @returns {number[]}
 */
export function armOrder(arms, round, mode) {
  const at = Array.from({ length: arms }, (_, i) => i);
  if (mode === "process") return round % 2 === 1 ? at.toReversed() : at;
  const shift = arms === 0 ? 0 : round % arms;
  return [...at.slice(shift), ...at.slice(0, shift)];
}

/**
 * This function gives the quantile `q` of a list, with a linear interpolation between the two nearest values. An empty list gives NaN.
 * @param {readonly number[]} values
 * @param {number} q
 */
export function quantileOf(values, q) {
  if (values.length === 0) return Number.NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/** This function gives the mean of a list. An empty list gives NaN. */
const meanOf = (/** @type {readonly number[]} */ values) => (values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length);

/** This function gives the sample SD of a list. Fewer than 2 values give 0. */
function sampleSD(/** @type {readonly number[]} */ values) {
  if (values.length < 2) return 0;
  const m = meanOf(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/**
 * This function checks the options, and gives the arms with the A/A arm. It throws a `RangeError` for a bad option.
 * @param {PairedOptions} o
 * @returns {Arm[]}
 */
function armsOf(o) {
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

/** @typedef {{ ms: Map<string, Map<string, number[]>>, peak: Map<string, Map<string, number>> }} RawTimes The raw times of a run, before the statistics. */

/**
 * This function makes empty raw times for the inputs and the arms.
 * @param {readonly { id: string }[]} inputs
 * @param {readonly { id: string }[]} arms
 * @returns {RawTimes}
 */
function rawOf(inputs, arms) {
  const ms = new Map(inputs.map((i) => [i.id, new Map(arms.map((a) => [a.id, /** @type {number[]} */ ([])]))]));
  return { ms, peak: new Map(inputs.map((i) => [i.id, new Map()])) };
}

/**
 * This function gives the statistics of the ratios of one arm.
 * @param {readonly { group?: string, ratio: number }[]} rows
 * @param {{ p10: number, p90: number } | undefined} band
 * @returns {PairedRatio}
 */
function ratioOf(rows, band) {
  const values = rows.map((r) => r.ratio);
  const median = quantileOf(values, 0.5);
  /** @type {Map<string, number[]>} */
  const byGroup = new Map();
  for (const r of rows) {
    const key = r.group ?? "all";
    byGroup.set(key, [...(byGroup.get(key) ?? []), r.ratio]);
  }
  /** @type {Record<string, number>} */
  const groups = {};
  for (const key of [...byGroup.keys()].sort()) groups[key] = quantileOf(byGroup.get(key), 0.5);
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
 * @param {Mode} mode
 * @param {PairedEnv} env
 * @param {string | undefined} context
 * @param {readonly Arm[]} arms
 * @param {readonly Input[]} inputs
 * @param {RawTimes} raw
 * @returns {PairedReport}
 */
export function pairedReport(mode, env, context, arms, inputs, raw) {
  const base = arms[0].id;
  const aa = arms.find((a) => a.id === aaId(base))?.id;
  /** @type {PairedInput[]} */
  const rows = inputs.map((input) => {
    const own = raw.ms.get(input.id);
    /** @type {Record<string, number[]>} */
    const ms = {};
    /** @type {Record<string, number>} */
    const median = {};
    for (const a of arms) {
      const times = own.get(a.id) ?? [];
      ms[a.id] = times;
      if (times.length > 0) median[a.id] = quantileOf(times, 0.5);
    }
    /** @type {Record<string, number>} */
    const ratio = {};
    const b = median[base];
    if (b !== undefined && b > 0) for (const a of arms.slice(1)) if (median[a.id] !== undefined) ratio[a.id] = median[a.id] / b;
    /** @type {PairedInput} */
    const row = { id: input.id, ms, median, ratio };
    if (input.group !== undefined) row.group = input.group;
    const peak = raw.peak.get(input.id);
    if (mode === "fresh" && peak.size > 0) row.peakRss = Object.fromEntries(peak);
    return row;
  });
  const rowsOf = (/** @type {string} */ id) => rows.filter((r) => r.ratio[id] !== undefined).map((r) => ({ ...(r.group === undefined ? {} : { group: r.group }), ratio: r.ratio[id] }));
  const floor = aa === undefined ? undefined : ratioOf(rowsOf(aa), undefined);
  const band = floor === undefined ? undefined : { p10: floor.p10, p90: floor.p90 };
  /** @type {Record<string, PairedRatio>} */
  const ratios = {};
  for (const a of arms.slice(1)) ratios[a.id] = ratioOf(rowsOf(a.id), band);
  return { schema: "paired-time/1", mode, ...(context === undefined ? {} : { context }), env, base, arms: arms.map((a) => a.id), inputs: rows, ratios, noiseFloor: floor === undefined ? null : { median: floor.median, p10: floor.p10, p90: floor.p90 } };
}

/**
 * This function does the warm-up passes of a child untimed, then one timed pass. It gives the time and the memory peak of the process.
 * @param {() => unknown} run
 * @param {number} warmup
 * @param {() => number} [clock]
 */
export function timeChild(run, warmup, clock = () => performance.now()) {
  for (let w = 0; w < warmup; w++) run();
  const start = clock();
  run();
  const ms = clock() - start;
  // The value maxRSS of Node.js is in kilobytes
  return { ms, peakRss: process.resourceUsage().maxRSS * 1024 };
}

/**
 * This function starts a child with the child protocol, and gives its result. A child that exits with a code other than 0 is an error.
 * @param {readonly string[]} command
 * @param {string} input
 * @param {number} warmup
 * @returns {Promise<ChildResult>}
 */
async function startProcess(command, input, warmup) {
  return childResult(await startArgv([...command, "--input", input, "--warmup", String(warmup)]));
}

/**
 * This function starts a process, and gives its stdout. A process that exits with a code other than 0 is an error.
 * @param {readonly string[]} argv
 * @returns {Promise<string>}
 */
function startArgv(argv) {
  return new Promise((done, fail) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? done(out) : fail(new Error(`The child ${argv.join(" ")} exited with the code ${code}.`))));
  });
}

/**
 * This function reads the last line of the stdout of a child: `{"ms": n, "peakRss"?: bytes}`.
 * @param {string} stdout
 * @returns {ChildResult}
 */
export function childResult(stdout) {
  const line = stdout.trim().split("\n").at(-1) ?? "";
  const value = JSON.parse(line);
  if (typeof value.ms !== "number" || !Number.isFinite(value.ms)) throw new Error(`The child gave no time: ${line}`);
  return typeof value.peakRss === "number" ? { ms: value.ms, peakRss: value.peakRss } : { ms: value.ms };
}

/**
 * This function times the arms in one process: in each round, the arms in turn on each input, with the order reversed in odd rounds.
 * @param {PairedOptions} o
 * @param {readonly Arm[]} arms
 * @returns {PairedReport}
 */
function measureProcess(o, arms) {
  const clock = o.clock ?? (() => performance.now());
  const warmup = o.warmup ?? 1;
  const raw = rawOf(o.inputs, arms);
  for (let round = 0; round < o.repeats; round++) {
    for (const input of o.inputs) {
      for (const at of armOrder(arms.length, round, "process")) {
        const arm = arms[at];
        const run = /** @type {(input: any) => unknown} */ (arm.run);
        for (let w = 0; w < warmup; w++) run(input.value);
        const start = clock();
        const out = run(input.value);
        raw.ms.get(input.id).get(arm.id).push(clock() - start);
        // Mode process has one process, so a memory peak of an arm has no meaning
        if (typeof out === "object" && out !== null && "peakRss" in out) throw new RangeError(`The arm ${arm.id} gave a peakRss in mode process.`);
      }
    }
  }
  return pairedReport("process", o.env ?? pairedEnv(), o.context ?? pairedContext(), arms, o.inputs, raw);
}

/**
 * This function times the arms with a fresh process for each arm, each input and each round. Each input takes the arms in turn, in an order that rotates each round.
 * @param {PairedOptions} o
 * @param {readonly Arm[]} arms
 * @returns {Promise<PairedReport>}
 */
async function measureFresh(o, arms) {
  const start = o.startChild ?? startProcess;
  const warmup = o.warmup ?? 1;
  const raw = rawOf(o.inputs, arms);
  for (let round = 0; round < o.repeats; round++) {
    for (const input of o.inputs) {
      for (const at of armOrder(arms.length, round, "fresh")) {
        const arm = arms[at];
        const result = await start(/** @type {readonly string[]} */ (arm.command), input.id, warmup);
        raw.ms.get(input.id).get(arm.id).push(result.ms);
        if (result.peakRss !== undefined) {
          const peak = raw.peak.get(input.id);
          peak.set(arm.id, Math.max(peak.get(arm.id) ?? 0, result.peakRss));
        }
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
 * @param {PairedOptions} options
 * @returns {PairedReport | Promise<PairedReport>}
 */
export function measureIsolated(options) {
  const arms = armsOf(options);
  return options.mode === "process" ? measureProcess(options, arms) : measureFresh(options, arms);
}

/** This function gives a number with 3 decimals for a table. */
const fmt = (/** @type {number | null | undefined} */ value) => (value === undefined || value === null || Number.isNaN(value) ? "" : value.toFixed(3));

/**
 * This function gives the Markdown table of a report.
 * @param {PairedReport} r
 * @param {string} [title]
 */
export function pairedMarkdown(r, title = "A paired time test") {
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
