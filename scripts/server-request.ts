#!/usr/bin/env node
/**
 * This script times one request of the procedures server, the I/O included, and the share of the
 * exec calls in it (O90). It also fits the transport time of a request (O94). The fit has a fixed part,
 * a part for each byte of the input and a part for each byte of the result. The requests are synthetic:
 * no record of real traffic exists (O91).
 *
 *   node scripts/server-request.ts --tree <folder> [--ref <sha>] [--rounds <n>] --out <file.json>
 *
 * The folder is a checkout of this repository with a build of `@procedures/server`. The script
 * loads the built modules of that folder. It has the cases of `REQUESTS` and two arms:
 *
 * - `one-call`: the request `client.add`. Its exec is `exec-one-call` of the paired bench.
 * - `chain-1`, `chain-10`, `chain-50` and `chain-200`: the request `client.chain` with N steps of
 *   `client.add`. The exec of `chain-50` is `exec-chain-50`. The input grows with N, and the result stays small.
 * - `range-100`, `range-1000` and `range-10000`: the request `client.range` from 0 to M, without M.
 *   The input stays small, and the result grows with M.
 * - `identity-1000`: the request `client.identity` of 1000 numbers. The input and the result grow.
 * - The arm `request` calls a host of `runProcedureHost()` over loopback with `HttpTransport`.
 * - The arm `exec` does the same exec on `LocalTransport`, with no host.
 *
 * A sample is one fresh process for one case and one arm (`--sample`). The process does the
 * warm-up calls of `REQUESTS`, then the timed calls, one after the other. It gives the median time
 * per call. A `request` sample starts its own fresh host child (`--serve`) and stops it at the end.
 *
 * The rounds are `measureIsolated()` of `lib/paired-time.mjs` in mode `fresh`: each round has one
 * sample of each case and arm, with the A/A arm `request~aa`. The order of the arms rotates each round.
 * The share of a case is `shareOf()` of the samples of its two arms. Its 95 % interval is the percentile bootstrap
 * `bootstrapMedianRatio()` of rigor-statistics, with `SHARE_BOOTSTRAP` (10 000 runs, seed 1).
 *
 * The bytes of a case are the UTF-8 bytes of the JSON of its input and of its result (`bytesOf()`).
 * Before the rounds, the parent does one untimed exec of each case on `LocalTransport` to get the result.
 * The fit is `fitOf()` of the rows of `fitRowsOf()`: the least-squares fit of the transport time on the
 * bytes, with an intercept. The transport time is the request sample minus the exec sample of the
 * same round. The 95 % interval of each coefficient is `bootstrapLeastSquares()` of rigor-statistics,
 * with `FIT_BOOTSTRAP` (10 000 runs, seed 1).
 *
 * The script writes the JSON record (`server-request/3`) to `--out`, and the Markdown next to it (`.md`).
 *
 * The profile mode (O94) gives the functions of the host that spend the transport time of each step:
 *
 *   node scripts/server-request.ts --tree <folder> [--ref <sha>] --profile <case-a>,<case-b>
 *     [--profile-calls <n>] [--profile-warmup <n>] --profile-out <folder>
 *
 * For each of the two cases, the script starts a fresh host child and does `--profile-warmup` untimed
 * calls. Then the host child starts the CPU profiler of `node:inspector`, with a sampling interval of
 * `PROFILE_INTERVAL_US`. After `--profile-calls` calls, the host child stops the profiler and writes the
 * profile to `<folder>/<case>/host.cpuprofile`. Then the script stops the host with SIGTERM. The two
 * cases have the same counts. `profileAnalysisOf()` of `server-request-profile.ts` compares the two
 * profiles. The script writes the record (`server-request-profile/1`) and its Markdown to the folder.
 * The profile mode does no timed rounds.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bootstrapLeastSquares, bootstrapMedianRatio, leastSquares, type Interval } from "@mark1russell7/rigor-statistics";
import { runnerContext } from "./bench-context.mjs";
import { bandOf, roundRatios, type Band } from "./bench-paired.mjs";
import { aaId, measureIsolated, quantileOf, type PairedInput, type PairedReport } from "./lib/paired-time.mjs";
import { PROFILE_FORMAT, profileAnalysisOf, profileMarkdownOf, type CpuProfile, type ProfileRecord } from "./server-request-profile.ts";

/** The format of the record. The format 3 adds the bytes of each case and the fit (O94). */
export const FORMAT = "server-request/3";

/** A case: the path of the procedure, its input, and the counts of calls. Both arms do the same exec. */
export interface RequestCase {
  readonly label: string;
  readonly path: readonly string[];
  readonly input: unknown;
  /** The warm-up calls of one warm-up pass */
  readonly warmup: number;
  /** The timed calls of one sample process */
  readonly calls: number;
}

/** This function gives `n` steps of `client.add`: 0 plus 1, then `n - 1` steps that add 1 to `$last`. */
export function chainSteps(n: number): unknown[] {
  const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
  return [add(0, 1), ...Array.from({ length: n - 1 }, () => add({ $ref: "$last" }, 1))];
}

const chainCase = (n: number, warmup: number, calls: number): RequestCase => ({
  label: `\`client.chain\` of ${n} ${n === 1 ? "step" : "steps"} of \`client.add\``,
  path: ["client", "chain"],
  input: { steps: chainSteps(n) },
  warmup,
  calls,
});

const rangeCase = (end: number, warmup: number, calls: number): RequestCase => ({
  label: `\`client.range\` from 0 to ${end}, without ${end}`,
  path: ["client", "range"],
  input: { start: 0, end },
  warmup,
  calls,
});

/**
 * The cases. The counts of `one-call` and `chain-50` are the counts of O90, thus the old records stay
 * comparable. The counts of the new cases come from the times of O90 (518 µs for one `client.add`,
 * 36 µs more for each step of a chain): each `request` sample takes about as long as a sample of `chain-50`.
 */
export const REQUESTS = {
  "one-call": { label: "`client.add` of 1 and 2", path: ["client", "add"], input: { a: 1, b: 2 }, warmup: 2000, calls: 2000 },
  "chain-1": chainCase(1, 1000, 2000),
  "chain-10": chainCase(10, 600, 1300),
  "chain-50": chainCase(50, 200, 500),
  "chain-200": chainCase(200, 60, 150),
  "range-100": rangeCase(100, 1000, 2000),
  "range-1000": rangeCase(1000, 600, 1400),
  "range-10000": rangeCase(10_000, 150, 400),
  "identity-1000": {
    label: "`client.identity` of the 1000 numbers 0 to 999",
    path: ["client", "identity"],
    input: { value: Array.from({ length: 1000 }, (_, i) => i) },
    warmup: 500,
    calls: 1100,
  },
} satisfies Record<string, RequestCase>;

/** The name of a case. */
export type RequestId = keyof typeof REQUESTS;

/** The arms. The arm 0 is the base of the paired run: the denominator of each ratio. */
export const ARMS = ["request", "exec"] as const;
export type ArmId = (typeof ARMS)[number];

/** The warm-up passes of each sample. One pass is the `warmup` calls of the case. */
export const WARMUP_PASSES = 1;

/** The fewest rounds, and the default. */
export const MIN_ROUNDS = 20;

/** The bootstrap of the share interval: each run draws the rounds of each arm with replacement. */
export const SHARE_BOOTSTRAP = { runs: 10_000, seed: 1, level: 0.95 } as const;

/** The bootstrap of the fit: each run draws the rows of the fit with replacement. */
export const FIT_BOOTSTRAP = { runs: 10_000, seed: 1, level: 0.95 } as const;

/** The sampling interval of the CPU profiler of the profile mode, in microseconds, as `--cpu-prof-interval 100`. */
export const PROFILE_INTERVAL_US = 100;

/** The default counts of the profile mode: the untimed calls before the profiler starts, and the calls in each profile. */
export const PROFILE_DEFAULTS = { warmup: 1000, calls: 1000 } as const;

/** The options of the profile mode, from `profileOptionsOf()`. */
export interface ProfileOptions {
  readonly cases: readonly [RequestId, RequestId];
  readonly warmup: number;
  readonly calls: number;
}

/**
 * This function gives the options of the profile mode from the values of `--profile`,
 * `--profile-warmup` and `--profile-calls`. It throws for a value that is not valid. The option
 * `--profile` names two different cases of `REQUESTS`. The warm-up is a whole number of 0 or more,
 * and the calls are a whole number above 0.
 */
export function profileOptionsOf(profile: string, warmup: string | undefined, calls: string | undefined): ProfileOptions {
  const cases = profile.split(",").map((id) => id.trim());
  if (cases.length !== 2 || cases[0] === cases[1] || !cases.every((id) => id in REQUESTS)) {
    throw new Error(`The option --profile names two different cases of ${Object.keys(REQUESTS).join(", ")}, not "${profile}".`);
  }
  const w = warmup === undefined ? PROFILE_DEFAULTS.warmup : Number(warmup);
  const n = calls === undefined ? PROFILE_DEFAULTS.calls : Number(calls);
  if (!Number.isInteger(w) || w < 0) throw new Error(`The option --profile-warmup is a whole number of 0 or more, not "${warmup}".`);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`The option --profile-calls is a whole number above 0, not "${calls}".`);
  return { cases: cases as [RequestId, RequestId], warmup: w, calls: n };
}

/** The model of the fit. The times are in milliseconds for each call. */
export const FIT_MODEL = "request - exec = fixedMs + msPerByteIn * bytesIn + msPerByteOut * bytesOut";

/** The bytes of a case: the UTF-8 bytes of the JSON of its input and of its result. */
export interface CaseBytes {
  readonly bytesIn: number;
  readonly bytesOut: number;
}

/** This function gives the UTF-8 bytes of the JSON of a value. A value without JSON, for example `undefined`, has 0 bytes. */
export function jsonBytes(value: unknown): number {
  const json: string | undefined = JSON.stringify(value);
  return json === undefined ? 0 : Buffer.byteLength(json, "utf8");
}

/** This function gives the bytes of a case from its input and its result. */
export function bytesOf(input: unknown, result: unknown): CaseBytes {
  return { bytesIn: jsonBytes(input), bytesOut: jsonBytes(result) };
}

/** The share of the exec in one case, from the per-process medians of the rounds, in milliseconds. */
export interface Share {
  /** The rounds with a sample of the two arms */
  readonly rounds: number;
  readonly request: Band;
  readonly exec: Band;
  /** The per-process medians of each arm, one value for each round */
  readonly samples: { readonly request: readonly number[]; readonly exec: readonly number[] };
  /** The median exec time over the median request time */
  readonly share: number;
  /** The 95 % bootstrap interval of the share, from `SHARE_BOOTSTRAP` */
  readonly interval: Interval;
  /** The ratio exec / request of each round */
  readonly paired: readonly number[];
  readonly pairedBand: Band;
}

/**
 * This function gives the share of the exec from the samples of the two arms, one value for each round.
 * It uses only the quantiles of `quantileOf()` and the round ratios of `roundRatios()`.
 */
export function shareOf(request: readonly number[], exec: readonly number[]): Share {
  const paired = roundRatios(exec, request);
  return {
    rounds: Math.min(request.length, exec.length),
    request: bandOf(request),
    exec: bandOf(exec),
    samples: { request: [...request], exec: [...exec] },
    share: quantileOf(exec, 0.5) / quantileOf(request, 0.5),
    interval: bootstrapMedianRatio(exec, request, SHARE_BOOTSTRAP),
    paired,
    pairedBand: bandOf(paired),
  };
}

/** The result of one case: the share, and the A/A arm of the request (`null` without it). */
export interface CaseResult extends Share {
  readonly aa: { readonly ratio: number; readonly band: Band } | null;
}

/** This function gives the result of one input of the paired-time/1 report. */
export function caseOf(input: PairedInput): CaseResult {
  const request = input.ms.request ?? [];
  const aa = input.ms[aaId("request")];
  return {
    ...shareOf(request, input.ms.exec ?? []),
    aa: aa === undefined ? null : { ratio: input.ratio[aaId("request")] ?? Number.NaN, band: bandOf(roundRatios(aa, request)) },
  };
}

/** One row of the fit: one case in one round. */
export interface FitRow extends CaseBytes {
  readonly id: string;
  readonly round: number;
  /** The transport time: the request sample minus the exec sample of the round, in milliseconds for each call */
  readonly ms: number;
}

/**
 * This function gives the rows of the fit: one row for each case and round. It pairs the rounds as
 * `roundRatios()` pairs them. Each round of the request goes with the same round of the exec, up to the
 * shorter arm. A round whose request sample is not above 0 has no row. The function also skips a sample
 * that is not finite. It throws for a case without bytes.
 */
export function fitRowsOf(cases: Readonly<Record<string, Pick<Share, "samples">>>, bytes: Readonly<Record<string, CaseBytes>>): FitRow[] {
  const rows: FitRow[] = [];
  for (const [id, x] of Object.entries(cases)) {
    const b = bytes[id];
    if (b === undefined) throw new Error(`The case ${id} has no bytes.`);
    const { request, exec } = x.samples;
    for (let round = 0; round < Math.min(request.length, exec.length); round++) {
      const r = request[round];
      const e = exec[round];
      if (r > 0 && Number.isFinite(r) && Number.isFinite(e)) rows.push({ id, round, bytesIn: b.bytesIn, bytesOut: b.bytesOut, ms: r - e });
    }
  }
  return rows;
}

/** The fit of one case: its bytes, its rows, the median of its transport times, and the value of the fit at its bytes. */
export interface CaseFit extends CaseBytes {
  readonly rounds: number;
  readonly medianMs: number;
  readonly fittedMs: number;
}

/** The fit of the transport time on the bytes, from `fitOf()`. */
export interface Fit {
  readonly model: typeof FIT_MODEL;
  readonly bootstrap: typeof FIT_BOOTSTRAP;
  /** The coefficients: the estimate of each interval is the coefficient of the fit of all the rows */
  readonly coefficients: {
    /** The fixed part of a request, in milliseconds */
    readonly fixedMs: Interval;
    /** The part of each byte of the input, in milliseconds */
    readonly msPerByteIn: Interval;
    /** The part of each byte of the result, in milliseconds */
    readonly msPerByteOut: Interval;
  };
  readonly r2: number;
  /** The residual standard deviation, in milliseconds */
  readonly residualSd: number;
  /** The rows */
  readonly n: number;
  /** The coefficients, with the intercept */
  readonly k: number;
  readonly cases: Readonly<Record<string, CaseFit>>;
  readonly rows: readonly FitRow[];
}

/**
 * This function gives the least-squares fit of the transport time on the bytes of the input and of the
 * result, with an intercept. It also gives the bootstrap interval of each coefficient from `FIT_BOOTSTRAP`.
 * No rows give NaN coefficients. A design without full rank also gives NaN coefficients.
 */
export function fitOf(rows: readonly FitRow[]): Fit {
  const x = rows.map((r) => [r.bytesIn, r.bytesOut]);
  const y = rows.map((r) => r.ms);
  const none: Interval = { estimate: Number.NaN, low: Number.NaN, high: Number.NaN, level: FIT_BOOTSTRAP.level, runs: FIT_BOOTSTRAP.runs, finite: 0, seed: FIT_BOOTSTRAP.seed };
  const fit = rows.length === 0 ? { coefficients: [Number.NaN, Number.NaN, Number.NaN], residualSd: Number.NaN, r2: Number.NaN, n: 0, k: 3 } : leastSquares(x, y, { intercept: true });
  const [fixedMs = none, msPerByteIn = none, msPerByteOut = none] = rows.length === 0 ? [] : bootstrapLeastSquares(x, y, { ...FIT_BOOTSTRAP, intercept: true });
  const [c0 = Number.NaN, c1 = Number.NaN, c2 = Number.NaN] = fit.coefficients;
  const groups = new Map<string, FitRow[]>();
  for (const row of rows) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
  const cases = Object.fromEntries(
    [...groups].map(([id, group]) => {
      const { bytesIn, bytesOut } = group[0]!;
      return [id, { bytesIn, bytesOut, rounds: group.length, medianMs: quantileOf(group.map((r) => r.ms), 0.5), fittedMs: c0 + c1 * bytesIn + c2 * bytesOut }];
    }),
  );
  return {
    model: FIT_MODEL,
    bootstrap: FIT_BOOTSTRAP,
    coefficients: { fixedMs, msPerByteIn, msPerByteOut },
    r2: fit.r2,
    residualSd: fit.residualSd,
    n: fit.n,
    k: fit.k,
    cases,
    rows: [...rows],
  };
}

/** The record of a case: its label, path, counts and bytes. The record has no inputs: `REQUESTS` of the script makes them. */
export interface RequestSpec extends CaseBytes {
  readonly label: string;
  readonly path: readonly string[];
  readonly warmup: number;
  readonly calls: number;
}

/** The record of a run. */
export interface ServerRequestRecord {
  readonly format: typeof FORMAT;
  readonly refs: { readonly head: string };
  readonly node: string;
  readonly run: { readonly label: string; readonly id?: string; readonly url?: string };
  readonly runner: ReturnType<typeof runnerContext>;
  readonly synthetic: true;
  readonly rounds: number;
  readonly warmupPasses: number;
  readonly requests: Readonly<Record<string, RequestSpec>>;
  readonly cases: Readonly<Record<string, CaseResult>>;
  readonly fit: Fit;
  /** The paired-time/1 report, with the raw sample of each round */
  readonly report: PairedReport;
}

/** The context of a record: the parts that do not come from the report and the bytes. */
export type RecordContext = Pick<ServerRequestRecord, "refs" | "node" | "run" | "runner" | "rounds">;

/** This function gives the record of a run from its report and the bytes of each case. */
export function recordOf(report: PairedReport, bytes: Readonly<Record<string, CaseBytes>>, context: RecordContext): ServerRequestRecord {
  const cases = Object.fromEntries(report.inputs.map((input) => [input.id, caseOf(input)]));
  const requests = Object.fromEntries(
    Object.entries(REQUESTS).map(([id, { label, path, warmup, calls }]) => {
      const b = bytes[id];
      if (b === undefined) throw new Error(`The case ${id} has no bytes.`);
      return [id, { label, path, warmup, calls, bytesIn: b.bytesIn, bytesOut: b.bytesOut }];
    }),
  );
  return {
    format: FORMAT,
    ...context,
    synthetic: true,
    warmupPasses: WARMUP_PASSES,
    requests,
    cases,
    fit: fitOf(fitRowsOf(cases, bytes)),
    report,
  };
}

/** This function gives the Markdown of a record. */
export function markdownOf(record: Pick<ServerRequestRecord, "refs" | "node" | "rounds" | "warmupPasses" | "requests" | "cases" | "fit">): string {
  const us = (ms: number) => (Number.isFinite(ms) ? (ms * 1000).toFixed(1) : "none");
  // One KB is 1000 bytes: a time in milliseconds for each byte, times 1000 µs/ms, times 1000 bytes/KB
  const usPerKb = (msPerByte: number) => (Number.isFinite(msPerByte) ? (msPerByte * 1e6).toFixed(2) : "none");
  const pc = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : "none");
  const r3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "none");
  const { fit } = record;
  const { fixedMs, msPerByteIn, msPerByteOut } = fit.coefficients;
  const lines = [
    "# Server request (O90, O94)",
    "",
    `Head \`${record.refs.head}\`, Node.js ${record.node}, ${record.rounds} rounds.`,
    "",
    "The requests are synthetic: no record of real traffic exists (O91).",
    "",
    "- A sample is one fresh process for one case and one arm. It gives the median time per call after its warm-up.",
    "- The arm `request` calls a fresh host child over loopback HTTP. The arm `exec` does the same exec on `LocalTransport`.",
    "- Each round has one sample of each case and arm. The order of the arms rotates each round.",
    "- The share is median(exec) / median(request) over the rounds.",
    `- The share interval is the 95 % percentile bootstrap of rigor-statistics: ${SHARE_BOOTSTRAP.runs} runs, seed ${SHARE_BOOTSTRAP.seed}. Each run draws the rounds of each arm with replacement.`,
    "- The round-paired ratio is exec / request in the same round.",
    "- The A/A ratio is a second `request` sample over the first, in the same round.",
    "- The bytes of a case are the UTF-8 bytes of the JSON of its input and of its result. One KB is 1000 bytes.",
    "- The transport time is the request sample minus the exec sample of the same round.",
    `- The fit is the least-squares fit of the transport time on the bytes, with an intercept: one row for each case and round. Its intervals are the 95 % percentile bootstrap of rigor-statistics: ${FIT_BOOTSTRAP.runs} runs, seed ${FIT_BOOTSTRAP.seed}. Each run draws the rows with replacement.`,
    "",
    "## The transport time per byte (O94)",
    "",
    `${fit.n} rows, r² ${r3(fit.r2)}, residual SD ${us(fit.residualSd)} µs.`,
    "",
    "| Coefficient | Estimate | 95 % interval |",
    "|---|---|---|",
    `| Fixed, µs | ${us(fixedMs.estimate)} | ${us(fixedMs.low)} to ${us(fixedMs.high)} |`,
    `| Each KB of the input, µs | ${usPerKb(msPerByteIn.estimate)} | ${usPerKb(msPerByteIn.low)} to ${usPerKb(msPerByteIn.high)} |`,
    `| Each KB of the result, µs | ${usPerKb(msPerByteOut.estimate)} | ${usPerKb(msPerByteOut.low)} to ${usPerKb(msPerByteOut.high)} |`,
    "",
    "| Case | Input bytes | Result bytes | Rounds | Transport median µs | Fitted µs |",
    "|---|---|---|---|---|---|",
    ...Object.entries(fit.cases).map(([id, x]) => `| \`${id}\` | ${x.bytesIn} | ${x.bytesOut} | ${x.rounds} | ${us(x.medianMs)} | ${us(x.fittedMs)} |`),
    "",
  ];
  for (const [id, x] of Object.entries(record.cases)) {
    const spec = record.requests[id];
    lines.push(
      `## \`${id}\``,
      "",
      spec === undefined
        ? ""
        : `${spec.label}. Input ${spec.bytesIn} bytes, result ${spec.bytesOut} bytes. Each process: ${spec.warmup * record.warmupPasses} warm-up calls, then ${spec.calls} timed calls.`,
      "",
      "| Request median µs | Exec median µs | Share | Share 95 % interval | Round-paired p10 to p90 | A/A p10 to p90 |",
      "|---|---|---|---|---|---|",
      `| ${us(x.request.median)} | ${us(x.exec.median)} | ${pc(x.share)} | ${pc(x.interval.low)} to ${pc(x.interval.high)} | ${pc(x.pairedBand.p10)} to ${pc(x.pairedBand.p90)} | ${x.aa === null ? "none" : `${r3(x.aa.band.p10)} to ${r3(x.aa.band.p90)}`} |`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

// The build of the packages under test has no types for this script
type Module = Record<string, any>;

const SELF = fileURLToPath(import.meta.url);

const load = async (tree: string, file: string): Promise<Module> => import(pathToFileURL(join(tree, file)).href);

/** This function makes a registry with the core procedures. */
function registryOf(c: Module) {
  const registry = new c.ProcedureRegistry();
  for (const procedure of c.allCoreProcedures) registry.register(procedure);
  return registry;
}

/** This function does one untimed exec of each case on `LocalTransport`, and gives the bytes of each case. */
async function measureBytes(tree: string): Promise<Record<string, CaseBytes>> {
  const c = await load(tree, "packages/client/dist/index.js");
  const registry = registryOf(c);
  const local = new c.Client(new c.LocalTransport({ registry })).useRegistry(registry);
  const bytes: Record<string, CaseBytes> = {};
  for (const [id, { path, input }] of Object.entries(REQUESTS)) bytes[id] = bytesOf(input, await local.exec({ $proc: path, input }));
  return bytes;
}

/**
 * The host child: it starts the host, writes its address as one line of JSON, and runs until a signal.
 * With a profile file, the child also obeys the lines of `controlProfiler()` on its stdin.
 */
async function serve(tree: string, profileFile: string | undefined): Promise<void> {
  const c = await load(tree, "packages/client/dist/index.js");
  const peer = await load(tree, "packages/client-server/dist/index.js");
  const server = await load(tree, "packages/server/dist/index.js");
  const registry = registryOf(c);
  const running = await server.runProcedureHost({
    name: "server-request",
    mode: "background",
    host: { registry, faces: { http: true }, listen: [{ port: 0, knobs: peer.LOCAL_LISTENER_KNOBS }] },
  });
  const endpoint = running.host.info.endpoints().find((e: { type: string }) => e.type === "http");
  console.log(JSON.stringify({ address: endpoint.address }));
  if (profileFile !== undefined) controlProfiler(profileFile);
}

/**
 * The profiler control of the host child. The line `start` starts the CPU profiler of
 * `node:inspector` in this process, with the interval `PROFILE_INTERVAL_US`. The line `stop` stops it
 * and writes the profile to the file. The child answers each line with one line of JSON: `started`,
 * `stopped` or `failed`. The profile has only the calls between the two lines, not the startup.
 */
function controlProfiler(file: string): void {
  const session = new Session();
  const answer = (profiler: string, more: Record<string, unknown> = {}) => console.log(JSON.stringify({ profiler, ...more }));
  createInterface({ input: process.stdin }).on("line", (line) => {
    const step = async () => {
      if (line === "start") {
        session.connect();
        await session.post("Profiler.enable");
        await session.post("Profiler.setSamplingInterval", { interval: PROFILE_INTERVAL_US });
        await session.post("Profiler.start");
        answer("started");
      } else if (line === "stop") {
        const { profile } = await session.post("Profiler.stop");
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(profile));
        session.disconnect();
        answer("stopped", { file });
      } else {
        answer("failed", { error: `The line "${line}" is not start or stop.` });
      }
    };
    step().catch((error: unknown) => answer("failed", { error: String(error) }));
  });
}

/** A host child: the process, its address, and `ask()`, which writes a line to its stdin and gives its answer. */
interface Host {
  readonly child: ChildProcess;
  readonly address: string;
  readonly ask: (line: string) => Promise<Record<string, unknown>>;
}

/** This function starts a fresh host child, and gives the child and its address. With arguments, the stdin of the child is a pipe for `ask()`. */
async function startHost(tree: string, args: readonly string[] = []): Promise<Host> {
  const child = spawn(process.execPath, [SELF, "--serve", "--tree", tree, ...args], { stdio: [args.length > 0 ? "pipe" : "ignore", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout! })[Symbol.asyncIterator]();
  const next = async (what: string): Promise<Record<string, unknown>> => {
    const { value, done } = await lines.next();
    if (done === true) throw new Error(`The host exited with ${child.exitCode ?? child.signalCode} before it gave ${what}`);
    return JSON.parse(value as string) as Record<string, unknown>;
  };
  const { address } = (await next("its address")) as { address: string };
  const ask = async (line: string) => {
    if (child.stdin === null) throw new Error("The host has no stdin: start it with arguments.");
    child.stdin.write(`${line}\n`);
    return next(`an answer to "${line}"`);
  };
  return { child, address, ask };
}

/** This function stops a host child, and waits for its exit. After 10 s, it stops the child with SIGKILL. */
async function stopHost(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await exited;
  clearTimeout(timer);
}

/** This function does the warm-up calls untimed, then times each timed call, and gives the times in milliseconds. */
async function timeCalls(call: () => Promise<unknown>, warmup: number, calls: number): Promise<number[]> {
  for (let i = 0; i < warmup; i++) await call();
  const times: number[] = [];
  for (let i = 0; i < calls; i++) {
    const start = performance.now();
    await call();
    times.push(performance.now() - start);
  }
  return times;
}

/** One sample: one case and one arm in this process. The last line of stdout is the child protocol of paired-time/1. */
async function sample(tree: string, arm: ArmId, id: RequestId, passes: number): Promise<void> {
  const c = await load(tree, "packages/client/dist/index.js");
  const registry = registryOf(c);
  const { path, input, warmup, calls }: RequestCase = REQUESTS[id];
  let times: number[];
  if (arm === "exec") {
    const local = new c.Client(new c.LocalTransport({ registry })).useRegistry(registry);
    times = await timeCalls(() => local.exec({ $proc: path, input }), warmup * passes, calls);
  } else {
    // `Client.call` takes a method, not a path: the HTTP face gave "No handler found for undefined.undefined" (run 41506770786)
    const { pathToMethod } = await load(tree, "packages/client/dist/server/index.js");
    const host = await startHost(tree);
    try {
      const remote = new c.Client(new c.HttpTransport({ baseUrl: host.address }));
      const method = pathToMethod(path);
      times = await timeCalls(() => remote.call(method, input), warmup * passes, calls);
    } finally {
      await stopHost(host.child);
    }
  }
  // The value maxRSS of Node.js is in kilobytes. The peak is of this process only, without the host child
  const line = JSON.stringify({ ms: quantileOf(times, 0.5), peakRss: process.resourceUsage().maxRSS * 1024, calls, warmupCalls: warmup * passes });
  // An open socket of the HTTP client must not keep the process alive after the result
  process.stdout.write(`${line}\n`, () => process.exit(0));
}

/**
 * This function profiles one case in a fresh host child. First it does the warm-up calls without the
 * profiler, then the calls with the profiler. Then it stops the host with SIGTERM. It gives the
 * profile file, and throws when the host gave no file.
 */
async function profileCase(tree: string, id: RequestId, options: ProfileOptions, out: string): Promise<string> {
  const c = await load(tree, "packages/client/dist/index.js");
  const { pathToMethod } = await load(tree, "packages/client/dist/server/index.js");
  const { path, input }: RequestCase = REQUESTS[id];
  const file = join(out, id, "host.cpuprofile");
  const host = await startHost(tree, ["--profile-file", file]);
  const expect = (reply: Record<string, unknown>, profiler: string) => {
    if (reply.profiler !== profiler) throw new Error(`The host gave ${JSON.stringify(reply)}, not the profiler state ${profiler}.`);
  };
  try {
    const remote = new c.Client(new c.HttpTransport({ baseUrl: host.address }));
    const method = pathToMethod(path);
    for (let i = 0; i < options.warmup; i++) await remote.call(method, input);
    expect(await host.ask("start"), "started");
    for (let i = 0; i < options.calls; i++) await remote.call(method, input);
    expect(await host.ask("stop"), "stopped");
  } finally {
    await stopHost(host.child);
  }
  if (!existsSync(file)) throw new Error(`The host gave no profile: the file ${file} does not exist.`);
  return file;
}

/** This function gives the run of a record: the run of GitHub Actions, or `local`. */
function runOf(): ServerRequestRecord["run"] {
  const runId = process.env.GITHUB_RUN_ID;
  return {
    label: runId ? `${runId}/${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : "local",
    ...(runId ? { id: runId } : {}),
    ...(runId && process.env.GITHUB_SERVER_URL ? { url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}` } : {}),
  };
}

/** The profile mode: one profile of each of the two cases, then the analysis. It writes the record and its Markdown to the folder. */
async function profile(tree: string, options: ProfileOptions, outArg: string, head: string): Promise<ProfileRecord> {
  const out = resolve(outArg);
  mkdirSync(out, { recursive: true });
  const files: Record<string, string> = {};
  const sides = [];
  for (const id of options.cases) {
    const file = await profileCase(tree, id, options, out);
    files[id] = relative(out, file).replace(/\\/g, "/");
    sides.push({ id, profile: JSON.parse(readFileSync(file, "utf8")) as CpuProfile, calls: options.calls });
  }
  const record: ProfileRecord = {
    format: PROFILE_FORMAT,
    refs: { head },
    node: process.version,
    run: runOf(),
    intervalUs: PROFILE_INTERVAL_US,
    warmup: options.warmup,
    calls: options.calls,
    files,
    analysis: profileAnalysisOf(sides[0]!, sides[1]!, realpathSync(tree)),
  };
  writeFileSync(join(out, "server-request-profile.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(out, "server-request-profile.md"), profileMarkdownOf(record));
  return record;
}

/** The parent: the rounds of `measureIsolated()` in mode `fresh`, with one sample process for each case and arm. */
async function measure(tree: string, rounds: number): Promise<PairedReport> {
  const command = (arm: ArmId) => [process.execPath, SELF, "--sample", arm, "--tree", tree];
  return measureIsolated({
    mode: "fresh",
    repeats: rounds,
    warmup: WARMUP_PASSES,
    inputs: (Object.keys(REQUESTS) as RequestId[]).map((id) => ({ id })),
    arms: ARMS.map((arm) => ({ id: arm, command: command(arm) })),
  });
}

const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(SELF)) {
  const argv = process.argv.slice(2);
  const treeArg = optionOf(argv, "--tree");
  if (treeArg === undefined) {
    console.error("Usage: node scripts/server-request.ts --tree <folder> [--ref <sha>] [--rounds <n>] --out <file.json>");
    console.error("       node scripts/server-request.ts --tree <folder> [--ref <sha>] --profile <case-a>,<case-b> [--profile-calls <n>] [--profile-warmup <n>] --profile-out <folder>");
    process.exit(2);
  }
  const tree = resolve(treeArg);
  const sampleArm = optionOf(argv, "--sample");
  const profileArg = optionOf(argv, "--profile");
  if (argv.includes("--serve")) {
    await serve(tree, optionOf(argv, "--profile-file"));
  } else if (profileArg !== undefined) {
    const outArg = optionOf(argv, "--profile-out");
    let options: ProfileOptions;
    try {
      if (outArg === undefined) throw new Error("The option --profile-out is missing.");
      options = profileOptionsOf(profileArg, optionOf(argv, "--profile-warmup"), optionOf(argv, "--profile-calls"));
    } catch (error) {
      console.error((error as Error).message);
      process.exit(2);
    }
    const record = await profile(tree, options, outArg!, optionOf(argv, "--ref") ?? tree);
    const { a, b, totalExcessUs, outcomes } = record.analysis;
    for (const t of [a, b]) console.log(`${t.id}: ${t.samples} samples, ${t.perCallUs.toFixed(1)} µs of self time per call, median interval ${t.medianDeltaUs} µs`);
    console.log(`excess: ${totalExcessUs.toFixed(1)} µs per call; top ${outcomes.top} (${(outcomes.topShare * 100).toFixed(1)} %); zod ${(outcomes.zodShare * 100).toFixed(1)} %`);
    console.log(`outcomes: (a) host side ${outcomes.topOnHostSide}, (b) top 25 % or more ${outcomes.topShareAtLeast25}, (c) zod under 20 % ${outcomes.zodUnder20}`);
    // A probe that gives no number fails the run (the 10-30 rule: gates and probes fail closed)
    if (outcomes.topOnHostSide === null) {
      console.error("The profile is not valid: the total excess is not above 0.");
      process.exitCode = 1;
    }
  } else if (sampleArm !== undefined) {
    const id = optionOf(argv, "--input");
    if (!(ARMS as readonly string[]).includes(sampleArm) || id === undefined || !(id in REQUESTS)) {
      console.error(`The sample needs an arm (${ARMS.join(", ")}) and an input (${Object.keys(REQUESTS).join(", ")}).`);
      process.exit(2);
    }
    await sample(tree, sampleArm as ArmId, id as RequestId, Number(optionOf(argv, "--warmup") ?? String(WARMUP_PASSES)));
  } else {
    const out = optionOf(argv, "--out");
    if (out === undefined) {
      console.error("The option --out is missing.");
      process.exit(2);
    }
    const rounds = Number(optionOf(argv, "--rounds") ?? String(MIN_ROUNDS));
    if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS) {
      console.error(`The rounds are a whole number of ${MIN_ROUNDS} or more, not "${optionOf(argv, "--rounds")}".`);
      process.exit(2);
    }
    const bytes = await measureBytes(tree);
    for (const [id, b] of Object.entries(bytes)) console.log(`${id}: input ${b.bytesIn} bytes, result ${b.bytesOut} bytes`);
    const report = await measure(tree, rounds);
    const record = recordOf(report, bytes, {
      refs: { head: optionOf(argv, "--ref") ?? tree },
      node: process.version,
      run: runOf(),
      runner: runnerContext(),
      rounds,
    });
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(`${out.replace(/\.json$/, "")}.md`, markdownOf(record));
    for (const [id, x] of Object.entries(record.cases)) console.log(`${id}: request ${(x.request.median * 1000).toFixed(1)} µs, exec ${(x.exec.median * 1000).toFixed(1)} µs, share ${(x.share * 100).toFixed(1)} % [${(x.interval.low * 100).toFixed(1)}, ${(x.interval.high * 100).toFixed(1)}]`);
    const { fixedMs, msPerByteIn, msPerByteOut } = record.fit.coefficients;
    console.log(`fit: fixed ${(fixedMs.estimate * 1000).toFixed(1)} µs, input ${(msPerByteIn.estimate * 1e6).toFixed(2)} µs/KB, result ${(msPerByteOut.estimate * 1e6).toFixed(2)} µs/KB, r² ${record.fit.r2.toFixed(3)}`);
    // A probe that gives no number fails the run (the 10-30 rule: gates and probes fail closed)
    if (Object.values(record.cases).some((x) => !Number.isFinite(x.share))) {
      console.error("The measure is not valid: a case gave no share.");
      process.exitCode = 1;
    }
    if (![fixedMs, msPerByteIn, msPerByteOut].every((c) => Number.isFinite(c.estimate))) {
      console.error("The measure is not valid: the fit gave no coefficients.");
      process.exitCode = 1;
    }
  }
}
