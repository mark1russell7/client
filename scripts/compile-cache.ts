/**
 * This script measures the V8 compile cache on the setup of the core workloads (roadmap O90).
 *
 *   node scripts/compile-cache.ts --tree <folder> [--ref <sha>] [--inputs <id>,<id>] [--repeats <n>]
 *     [--warmup <n>] [--mark <bin.js>] --out <file.json>
 *
 * One paired run of paired-time/1 in mode `fresh` has 3 arms on one tree, and the A/A arm of `main`:
 *
 * - `main`: the child with no cache.
 * - `cold`: the child with a new empty cache folder in each process. It compiles and writes the cache.
 * - `warm`: the child with one cache folder for all processes. The script fills it before the run.
 *
 * The cache arms end the setup measure after `module.flushCompileCache()`, so the cold arm pays its
 * write. The script fails when the warm folder stays empty after it is filled.
 *
 * With `--mark`, a second paired run times the whole process of one `mark` call, from the spawn to
 * the exit: the time until the shell prompt comes back. The arms set `NODE_COMPILE_CACHE`, so the
 * cold arm writes the cache at exit, as a user sees it, with no forced flush.
 *
 * The run also splits the wall time of the arm `main` into its phases: the start of the process, the
 * start of Node.js up to the first line of the entry, the import of `cli.js`, the call, and the exit.
 * The entry is a copy of `bin.ts` with a mark after each step.
 *
 * For each input, the break-even is the cost of the cold arm over the saving of the warm arm. The
 * cold cost comes once for each installed version (a new Node.js or a changed file gives a new
 * entry), and the saving comes on each later run. The cache pays from run `ceil(1 + break-even)`.
 *
 * The record also gives the behavior of the cache on this Node.js: the default folder, a folder that
 * cannot be written, and `NODE_DISABLE_COMPILE_CACHE`. The script writes the JSON record to `--out`,
 * and the same tables as Markdown next to it (`.md`).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aaId, measureIsolated, pairedMarkdown, quantileOf, type PairedReport } from "./lib/paired-time.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, "bench-paired-child.mjs");

/** The setup measures of the 4 core workloads. */
export const SETUP_INPUTS = ["exec-one-call-setup", "exec-chain-50-setup", "exec-map-100-setup", "hydrate-200-refs-setup"] as const;

/** The arms of the run, in order. The arm 0 is the base. */
export const ARMS = ["main", "cold", "warm"] as const;

/** The result of the cache arms on one input, in milliseconds. */
export interface CacheRow {
  readonly id: string;
  /** The median setup of each arm, with the A/A arm */
  readonly medianMs: Readonly<Record<string, number>>;
  /** The median of `main` minus the median of `warm` */
  readonly warmSavingMs: number;
  /** The median of `cold` minus the median of `main` */
  readonly coldAddedMs: number;
  /** The ratio of the medians over `main` */
  readonly coldRatio: number;
  readonly warmRatio: number;
  /** The 10th and the 90th percentile of the ratio A/A over `main`, round by round */
  readonly aa: { readonly p10: number; readonly p90: number };
  /** The verdicts of the claims: a ratio inside the A/A band is not a result */
  readonly coldWithinNoise: boolean;
  readonly warmFaster: boolean;
  /** The cold cost over the warm saving: the median, and the interval from the round-paired differences (p10 and p90) */
  readonly breakEven: { readonly median: number; readonly low: number; readonly high: number };
  /** The first run after which the cache has saved more than its cold cost */
  readonly paysFromRun: number;
}

/** This function gives the cost over the saving, with infinity when the saving is not positive. */
const over = (cost: number, saving: number): number => (saving > 0 ? Math.max(0, cost) / saving : Number.POSITIVE_INFINITY);

/** This function gives the result of the cache arms on each input of a report. */
export function rowsOf(report: PairedReport): CacheRow[] {
  const aa = aaId("main");
  return report.inputs.map((input) => {
    const main = input.ms.main ?? [];
    const rounds = (input.ms[aa] ?? []).map((ms, r) => ms / main[r]);
    const band = { p10: quantileOf(rounds, 0.1), p90: quantileOf(rounds, 0.9) };
    const m = input.median;
    const coldRatio = m.cold / m.main;
    const warmRatio = m.warm / m.main;
    const costs = (input.ms.cold ?? []).map((ms, r) => ms - main[r]);
    const savings = (input.ms.warm ?? []).map((ms, r) => main[r] - ms);
    const breakEven = {
      median: over(m.cold - m.main, m.main - m.warm),
      low: over(quantileOf(costs, 0.1), quantileOf(savings, 0.9)),
      high: over(quantileOf(costs, 0.9), quantileOf(savings, 0.1)),
    };
    return {
      id: input.id,
      medianMs: m,
      warmSavingMs: m.main - m.warm,
      coldAddedMs: m.cold - m.main,
      coldRatio,
      warmRatio,
      aa: band,
      coldWithinNoise: coldRatio <= band.p90,
      warmFaster: warmRatio < band.p10,
      breakEven,
      paysFromRun: Number.isFinite(breakEven.median) ? Math.ceil(1 + breakEven.median) : Number.POSITIVE_INFINITY,
    };
  });
}

/** The behavior of the cache on one Node.js process. */
export interface Behavior {
  readonly status: string;
  readonly message?: string;
  readonly directory?: string;
  readonly exitCode: number | null;
}

/** This function starts Node.js once, enables the cache with `dir`, and gives the status and the exit code. */
function behaviorOf(dir: string | undefined, env: Record<string, string> = {}): Behavior {
  const code = `import m from "node:module"; const r = m.enableCompileCache(${dir === undefined ? "" : JSON.stringify(dir)}); const s = Object.entries(m.constants.compileCacheStatus).find(([, v]) => v === r.status)?.[0]; console.log(JSON.stringify({ status: s, message: r.message, directory: r.directory }));`;
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_COMPILE_CACHE" && k !== "NODE_DISABLE_COMPILE_CACHE"));
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { ...clean, ...env } });
  const last = r.stdout.trim().split("\n").at(-1) ?? "{}";
  return { ...(JSON.parse(last === "" ? "{}" : last) as Omit<Behavior, "exitCode">), exitCode: r.status };
}

/** This function gives the count of the files and their bytes under a folder. */
function sizeOf(dir: string): { files: number; bytes: number; folders: string[] } {
  let files = 0;
  let bytes = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      const s = statSync(path);
      if (s.isDirectory()) walk(path);
      else (files++, (bytes += s.size));
    }
  };
  walk(dir);
  return { files, bytes, folders: readdirSync(dir) };
}

/** This function gives the Markdown of a record. */
export function markdownOf(record: {
  ref: string;
  node: string;
  rows: readonly CacheRow[];
  wall?: { readonly rows: readonly CacheRow[]; readonly split?: readonly PhaseRow[] };
  warmCache: { files: number; bytes: number };
  behavior: Readonly<Record<string, Behavior>>;
}): string {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "never");
  const table = (rows: readonly CacheRow[]) => [
    "| Input | Main ms | Cold ms | Warm ms | Warm saves ms | Cold adds ms | Cold / main | Warm / main | A/A p10 to p90 | Cold within noise | Warm faster | Break-even (p10 to p90) | Pays from run |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| \`${r.id}\` | ${f(r.medianMs.main)} | ${f(r.medianMs.cold)} | ${f(r.medianMs.warm)} | ${f(r.warmSavingMs)} | ${f(r.coldAddedMs)} | ${f(r.coldRatio, 3)} | ${f(r.warmRatio, 3)} | ${f(r.aa.p10, 3)} to ${f(r.aa.p90, 3)} | ${r.coldWithinNoise ? "yes" : "no"} | ${r.warmFaster ? "yes" : "no"} | ${f(r.breakEven.median, 2)} (${f(r.breakEven.low, 2)} to ${f(r.breakEven.high, 2)}) | ${f(r.paysFromRun, 0)} |`,
    ),
  ];
  const phaseNames: Record<Phase | "wall", string> = {
    spawn: "The start of the process, up to `performance.timeOrigin`",
    node: "The start of Node.js, up to the first line of the entry",
    import: "The import of `cli.js`",
    call: "The call `main()`, with its output",
    exit: "The exit, up to the end of the process",
    wall: "The sum: from the spawn to the exit",
  };
  const splitTable = (split: readonly PhaseRow[] | undefined, setupMs: number | undefined) => {
    if (split === undefined) return [];
    const wall = split.find((r) => r.phase === "wall")?.median ?? Number.NaN;
    return [
      "### The phases of one `mark` call with no cache",
      "",
      `One process for each round, with an entry that does what \`bin.ts\` does. The share is of the median sum.${setupMs === undefined ? "" : ` The setup of \`exec-one-call-setup\` (arm \`main\`) is ${f(setupMs)} ms, ${f((100 * setupMs) / wall)} % of the sum.`}`,
      "",
      "| Phase | Median ms | p10 ms | p90 ms | Share |",
      "|---|---|---|---|---|",
      ...split.map((r) => `| ${phaseNames[r.phase]} | ${f(r.median)} | ${f(r.p10)} | ${f(r.p90)} | ${f((100 * r.median) / wall)} % |`),
      "",
    ];
  };
  const lines = [
    "# Compile cache",
    "",
    `Tree \`${record.ref}\`, Node.js ${record.node}. Setup: the median of the rounds, in ms, from the start of the process to the end of call 1. The warm cache has ${record.warmCache.files} files, ${f(record.warmCache.bytes / 1024)} KB.`,
    "",
    ...table(record.rows),
    "",
    ...(record.wall === undefined
      ? []
      : [
          "## The whole process of one `mark` call",
          "",
          "The time from the spawn to the exit, in ms. The cold arm writes the cache at exit.",
          "",
          ...table(record.wall.rows),
          "",
          ...splitTable(record.wall.split, record.rows.find((r) => r.id === "exec-one-call-setup")?.medianMs.main),
        ]),
    "## The behavior of the cache",
    "",
    "| Case | Status | Exit code | Folder or message |",
    "|---|---|---|---|",
    ...Object.entries(record.behavior).map(([name, b]) => `| ${name} | ${b.status ?? ""} | ${b.exitCode ?? ""} | ${b.directory ?? b.message ?? ""} |`),
  ];
  return `${lines.join("\n")}\n`;
}

/** The input of the wall run: one call of `mark` with a procedure reference. */
export const MARK_CALL = { id: "mark-one-call", args: ["--json", JSON.stringify({ $proc: ["client", "add"], input: { a: 1, b: 2 } })], output: "3" } as const;

/** This function gives the environment of a child with no setting of the cache from this process. */
const cleanEnv = (): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_COMPILE_CACHE" && k !== "NODE_DISABLE_COMPILE_CACHE"));

/**
 * This function starts one `mark` call and gives its time from the spawn to the exit. The first
 * item of the command is the cache: `none`, `fresh` (a new folder, removed after the time) or a folder.
 */
function startMark(command: readonly string[]): Promise<{ ms: number }> {
  const [cache, ...argv] = command;
  const fresh = cache === "fresh" ? mkdtempSync(join(tmpdir(), "compile-cache-mark-")) : undefined;
  try {
    const env = { ...cleanEnv(), ...(cache === "none" ? {} : { NODE_COMPILE_CACHE: fresh ?? cache }) };
    const start = performance.now();
    const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", env });
    const ms = performance.now() - start;
    if (r.status !== 0 || r.stdout.trim().split("\n").at(-1) !== MARK_CALL.output) throw new Error(`mark exited with ${r.status}: ${r.stdout}${r.stderr}`);
    return Promise.resolve({ ms });
  } finally {
    if (fresh !== undefined) rmSync(fresh, { recursive: true, force: true });
  }
}

/** The phases of one `mark` call with no cache, in order. Their sum is the time from the spawn to the exit. */
export const PHASES = ["spawn", "node", "import", "call", "exit"] as const;
export type Phase = (typeof PHASES)[number];

/** The marks of one call, in epoch milliseconds. The parent gives `spawn` and `closed`, and the child gives the others. */
export interface Marks {
  readonly spawn: number;
  /** The start of the child process: `performance.timeOrigin` */
  readonly origin: number;
  /** The first line of the entry */
  readonly first: number;
  /** The end of the import of `cli.js` */
  readonly imported: number;
  /** The end of `main()`, with its output */
  readonly called: number;
  /** The exit of the child, as the parent sees it */
  readonly closed: number;
}

/** This function gives the time of each phase of one call, in milliseconds. */
export function phasesOf(m: Marks): Record<Phase, number> {
  return { spawn: m.origin - m.spawn, node: m.first - m.origin, import: m.imported - m.first, call: m.called - m.imported, exit: m.closed - m.called };
}

/** The split of the wall time: the median, the 10th and the 90th percentile of each phase. */
export interface PhaseRow {
  readonly phase: Phase | "wall";
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
}

/** This function gives the split of the wall time over the rounds. The row `wall` is the sum of the phases. */
export function splitOf(rounds: readonly Record<Phase, number>[]): PhaseRow[] {
  const rowOf = (phase: Phase | "wall", values: number[]): PhaseRow => ({ phase, median: quantileOf(values, 0.5), p10: quantileOf(values, 0.1), p90: quantileOf(values, 0.9) });
  return [
    ...PHASES.map((phase) => rowOf(phase, rounds.map((r) => r[phase]))),
    rowOf("wall", rounds.map((r) => PHASES.reduce((sum, phase) => sum + r[phase], 0))),
  ];
}

/** This function gives the source of the entry that does what `bin.ts` does, with a mark after each step. */
export function phaseEntryOf(cliUrl: string): string {
  return [
    'import { writeFileSync } from "node:fs";',
    "const now = () => performance.timeOrigin + performance.now();",
    "const marks = { origin: performance.timeOrigin, first: now() };",
    'process.on("exit", () => writeFileSync(process.env.MARK_PHASES_OUT, JSON.stringify(marks)));',
    `const { main } = await import(${JSON.stringify(cliUrl)});`,
    "marks.imported = now();",
    "await main(process.argv.slice(2));",
    "marks.called = now();",
    "",
  ].join("\n");
}

/** This function starts one `mark` call with no cache through the entry with marks, and gives its phases. */
function phasesOnce(entry: string, args: readonly string[], marksFile: string): Record<Phase, number> {
  const epoch = () => performance.timeOrigin + performance.now();
  const spawn = epoch();
  const r = spawnSync(process.execPath, [entry, ...args], { encoding: "utf8", env: { ...cleanEnv(), MARK_PHASES_OUT: marksFile } });
  const closed = epoch();
  if (r.status !== 0 || r.stdout.trim().split("\n").at(-1) !== MARK_CALL.output) throw new Error(`mark exited with ${r.status}: ${r.stdout}${r.stderr}`);
  return phasesOf({ spawn, closed, ...(JSON.parse(readFileSync(marksFile, "utf8")) as Omit<Marks, "spawn" | "closed">) });
}

const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const [treeArg, out] = [optionOf(argv, "--tree"), optionOf(argv, "--out")];
  if (treeArg === undefined || out === undefined) {
    console.error("Usage: node scripts/compile-cache.ts --tree <folder> [--ref <sha>] [--inputs <ids>] [--repeats <n>] [--warmup <n>] [--mark <bin.js>] --out <file.json>");
    process.exit(2);
  }
  const tree = resolve(treeArg);
  const inputs = (optionOf(argv, "--inputs") ?? SETUP_INPUTS.join(",")).split(",").filter((s) => s !== "");
  const repeats = Number(optionOf(argv, "--repeats") ?? "10");
  const warmup = Number(optionOf(argv, "--warmup") ?? "2");
  const warmDir = mkdtempSync(join(tmpdir(), "compile-cache-warm-"));
  try {
    for (const input of inputs) {
      const r = spawnSync(process.execPath, [CHILD, "--tree", tree, "--input", input, "--warmup", "0", "--compile-cache", warmDir], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`${input}: the child that fills the cache exited with ${r.status}: ${r.stderr}`);
    }
    const warmCache = sizeOf(warmDir);
    if (warmCache.files === 0) throw new Error(`The warm cache ${warmDir} has no files after it was filled`);
    const command = (...extra: string[]) => [process.execPath, CHILD, "--tree", tree, ...extra];
    const report = await measureIsolated({
      mode: "fresh",
      repeats,
      warmup,
      inputs: inputs.map((id) => ({ id })),
      arms: [
        { id: "main", command: command() },
        { id: "cold", command: command("--compile-cache", "fresh") },
        { id: "warm", command: command("--compile-cache", warmDir) },
      ],
    });
    const markArg = optionOf(argv, "--mark");
    let wall: { rows: CacheRow[]; report: PairedReport; split: PhaseRow[] } | undefined;
    if (markArg !== undefined) {
      const mark = [process.execPath, resolve(markArg), ...MARK_CALL.args];
      const markDir = join(warmDir, "mark");
      // The first call writes the warm cache of mark at its exit
      await startMark([markDir, ...mark]);
      if (sizeOf(markDir).files === 0) throw new Error(`The warm cache of mark ${markDir} has no files after one call`);
      const markReport = await measureIsolated({
        mode: "fresh",
        repeats,
        warmup: 0,
        inputs: [{ id: MARK_CALL.id }],
        arms: [
          { id: "main", command: ["none", ...mark] },
          { id: "cold", command: ["fresh", ...mark] },
          { id: "warm", command: [markDir, ...mark] },
        ],
        startChild: (command) => startMark(command),
      });
      // The split of the arm main: one process for each round, after the paired run
      const entry = join(warmDir, "mark-phases.mjs");
      writeFileSync(entry, phaseEntryOf(pathToFileURL(join(dirname(resolve(markArg)), "cli.js")).href));
      const split = splitOf(Array.from({ length: repeats }, () => phasesOnce(entry, MARK_CALL.args, join(warmDir, "marks.json"))));
      wall = { rows: rowsOf(markReport), report: markReport, split };
    }
    const blocked = join(warmDir, "not-a-folder");
    writeFileSync(blocked, "");
    const behavior = {
      "No folder (default)": behaviorOf(undefined),
      "A folder under a file": behaviorOf(join(blocked, "cache")),
      "NODE_DISABLE_COMPILE_CACHE=1": behaviorOf(join(warmDir, "disabled"), { NODE_DISABLE_COMPILE_CACHE: "1" }),
    };
    const rows = rowsOf(report);
    const record = {
      format: "compile-cache/1",
      ref: optionOf(argv, "--ref") ?? tree,
      node: process.version,
      repeats,
      warmup,
      warmCache,
      behavior,
      rows,
      report,
      ...(wall === undefined ? {} : { wall }),
    };
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(`${out.replace(/\.json$/, "")}.md`, `${markdownOf(record)}\n${pairedMarkdown(report, "The paired run")}`);
    for (const r of wall?.split ?? []) console.log(`phase ${r.phase}: ${r.median.toFixed(1)} ms`);
    for (const r of [...rows, ...(wall?.rows ?? [])]) console.log(`${r.id}: main ${r.medianMs.main.toFixed(1)} ms, cold ${r.medianMs.cold.toFixed(1)} ms, warm ${r.medianMs.warm.toFixed(1)} ms, pays from run ${r.paysFromRun}`);
  } finally {
    rmSync(warmDir, { recursive: true, force: true });
  }
}
