#!/usr/bin/env node
/**
 * This script times one request of the procedures server, the I/O included, and the share of the
 * exec calls in it (O90). The requests are synthetic: no record of real traffic exists (O91).
 *
 *   node scripts/server-request.ts --tree <folder> [--ref <sha>] [--rounds <n>] --out <file.json>
 *
 * The folder is a checkout of this repository with a build of `@procedures/server`. The script
 * loads the built modules of that folder. It has two cases and two arms:
 *
 * - `one-call`: the request `client.add`. Its exec is `exec-one-call` of the paired bench.
 * - `chain-50`: the request `client.chain` with 50 steps of `client.add`. Its exec is `exec-chain-50`.
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
 * The script writes the JSON record (`server-request/2`) to `--out`, and the Markdown next to it (`.md`).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bootstrapMedianRatio, type Interval } from "@mark1russell7/rigor-statistics";
import { runnerContext } from "./bench-context.mjs";
import { bandOf, roundRatios, type Band } from "./bench-paired.mjs";
import { aaId, measureIsolated, quantileOf, type PairedInput, type PairedReport } from "./lib/paired-time.mjs";

/** The format of the record. */
export const FORMAT = "server-request/2";

/** The cases: the warm-up calls of one warm-up pass, and the timed calls of one sample process. */
export const REQUESTS = {
  "one-call": { label: "`client.add` of 1 and 2", warmup: 2000, calls: 2000 },
  "chain-50": { label: "`client.chain` of 50 steps of `client.add`", warmup: 200, calls: 500 },
} as const;

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
  readonly requests: typeof REQUESTS;
  readonly cases: Readonly<Record<string, CaseResult>>;
  /** The paired-time/1 report, with the raw sample of each round */
  readonly report: PairedReport;
}

/** This function gives the Markdown of a record. */
export function markdownOf(record: Pick<ServerRequestRecord, "refs" | "node" | "rounds" | "warmupPasses" | "requests" | "cases">): string {
  const us = (ms: number) => (Number.isFinite(ms) ? (ms * 1000).toFixed(1) : "none");
  const pc = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : "none");
  const r3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "none");
  const lines = [
    "# Server request (O90)",
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
    "",
  ];
  for (const [id, x] of Object.entries(record.cases)) {
    const spec = record.requests[id as RequestId];
    lines.push(
      `## \`${id}\``,
      "",
      spec === undefined ? "" : `${spec.label}. Each process: ${spec.warmup * record.warmupPasses} warm-up calls, then ${spec.calls} timed calls.`,
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

/** This function makes a registry with the core procedures, and the exec inputs of the cases. */
function coreOf(c: Module) {
  const registry = new c.ProcedureRegistry();
  for (const procedure of c.allCoreProcedures) registry.register(procedure);
  const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
  const steps = [add(0, 1), ...Array.from({ length: 49 }, () => add({ $ref: "$last" }, 1))];
  return { registry, add, steps };
}

/** The host child: it starts the host, writes its address as one line of JSON, and runs until a signal. */
async function serve(tree: string): Promise<void> {
  const c = await load(tree, "packages/client/dist/index.js");
  const peer = await load(tree, "packages/client-server/dist/index.js");
  const server = await load(tree, "packages/server/dist/index.js");
  const { registry } = coreOf(c);
  const running = await server.runProcedureHost({
    name: "server-request",
    mode: "background",
    host: { registry, faces: { http: true }, listen: [{ port: 0, knobs: peer.LOCAL_LISTENER_KNOBS }] },
  });
  const endpoint = running.host.info.endpoints().find((e: { type: string }) => e.type === "http");
  console.log(JSON.stringify({ address: endpoint.address }));
}

/** This function starts a fresh host child, and gives the child and its address. */
async function startHost(tree: string): Promise<{ child: ChildProcess; address: string }> {
  const child = spawn(process.execPath, [SELF, "--serve", "--tree", tree], { stdio: ["ignore", "pipe", "inherit"] });
  const line = await new Promise<string>((done, fail) => {
    createInterface({ input: child.stdout! }).once("line", done);
    child.once("exit", (code) => fail(new Error(`The host exited with ${code} before it gave its address`)));
  });
  return { child, address: (JSON.parse(line) as { address: string }).address };
}

/** This function stops a host child, and waits for its exit. After 10 s, it kills the child. */
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
  const { registry, add, steps } = coreOf(c);
  const { warmup, calls } = REQUESTS[id];
  let times: number[];
  if (arm === "exec") {
    const local = new c.Client(new c.LocalTransport({ registry })).useRegistry(registry);
    const exec = id === "one-call" ? () => local.exec(add(1, 2)) : () => local.exec({ $proc: ["client", "chain"], input: { steps } });
    times = await timeCalls(exec, warmup * passes, calls);
  } else {
    // `Client.call` takes a method, not a path: the HTTP face gave "No handler found for undefined.undefined" (run 41506770786)
    const { pathToMethod } = await load(tree, "packages/client/dist/server/index.js");
    const host = await startHost(tree);
    try {
      const remote = new c.Client(new c.HttpTransport({ baseUrl: host.address }));
      const addMethod = pathToMethod(["client", "add"]);
      const chainMethod = pathToMethod(["client", "chain"]);
      const request = id === "one-call" ? () => remote.call(addMethod, { a: 1, b: 2 }) : () => remote.call(chainMethod, { steps });
      times = await timeCalls(request, warmup * passes, calls);
    } finally {
      await stopHost(host.child);
    }
  }
  // The value maxRSS of Node.js is in kilobytes. The peak is of this process only, without the host child
  const line = JSON.stringify({ ms: quantileOf(times, 0.5), peakRss: process.resourceUsage().maxRSS * 1024, calls, warmupCalls: warmup * passes });
  // An open socket of the HTTP client must not keep the process alive after the result
  process.stdout.write(`${line}\n`, () => process.exit(0));
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
    process.exit(2);
  }
  const tree = resolve(treeArg);
  const sampleArm = optionOf(argv, "--sample");
  if (argv.includes("--serve")) {
    await serve(tree);
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
    const report = await measure(tree, rounds);
    const cases = Object.fromEntries(report.inputs.map((input) => [input.id, caseOf(input)]));
    const runId = process.env.GITHUB_RUN_ID;
    const record: ServerRequestRecord = {
      format: FORMAT,
      refs: { head: optionOf(argv, "--ref") ?? tree },
      node: process.version,
      run: {
        label: runId ? `${runId}/${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : "local",
        ...(runId ? { id: runId } : {}),
        ...(runId && process.env.GITHUB_SERVER_URL ? { url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}` } : {}),
      },
      runner: runnerContext(),
      synthetic: true,
      rounds,
      warmupPasses: WARMUP_PASSES,
      requests: REQUESTS,
      cases,
      report,
    };
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(`${out.replace(/\.json$/, "")}.md`, markdownOf(record));
    for (const [id, x] of Object.entries(cases)) console.log(`${id}: request ${(x.request.median * 1000).toFixed(1)} µs, exec ${(x.exec.median * 1000).toFixed(1)} µs, share ${(x.share * 100).toFixed(1)} % [${(x.interval.low * 100).toFixed(1)}, ${(x.interval.high * 100).toFixed(1)}]`);
    // A probe that gives no number fails the run (the 10-30 rule: gates and probes fail closed)
    if (Object.values(cases).some((x) => !Number.isFinite(x.share))) {
      console.error("The measure is not valid: a case gave no share.");
      process.exitCode = 1;
    }
  }
}
