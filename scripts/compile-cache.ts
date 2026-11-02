/**
 * This script measures the V8 compile cache on the setup of the core workloads (roadmap O90).
 *
 *   node scripts/compile-cache.ts --tree <folder> [--ref <sha>] [--inputs <id>,<id>] [--repeats <n>]
 *     [--warmup <n>] --out <file.json>
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
 * The record also gives the behavior of the cache on this Node.js: the default folder, a folder that
 * cannot be written, and `NODE_DISABLE_COMPILE_CACHE`. The script writes the JSON record to `--out`,
 * and the same tables as Markdown next to it (`.md`).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
}

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
export function markdownOf(record: { ref: string; node: string; rows: readonly CacheRow[]; warmCache: { files: number; bytes: number }; behavior: Readonly<Record<string, Behavior>> }): string {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "");
  const lines = [
    "# Compile cache",
    "",
    `Tree \`${record.ref}\`, Node.js ${record.node}. Setup: the median of the rounds, in ms, from the start of the process to the end of call 1. The warm cache has ${record.warmCache.files} files, ${f(record.warmCache.bytes / 1024)} KB.`,
    "",
    "| Input | Main ms | Cold ms | Warm ms | Warm saves ms | Cold adds ms | Cold / main | Warm / main | A/A p10 to p90 | Cold within noise | Warm faster |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...record.rows.map((r) => `| \`${r.id}\` | ${f(r.medianMs.main)} | ${f(r.medianMs.cold)} | ${f(r.medianMs.warm)} | ${f(r.warmSavingMs)} | ${f(r.coldAddedMs)} | ${f(r.coldRatio, 3)} | ${f(r.warmRatio, 3)} | ${f(r.aa.p10, 3)} to ${f(r.aa.p90, 3)} | ${r.coldWithinNoise ? "yes" : "no"} | ${r.warmFaster ? "yes" : "no"} |`),
    "",
    "## The behavior of the cache",
    "",
    "| Case | Status | Exit code | Folder or message |",
    "|---|---|---|---|",
    ...Object.entries(record.behavior).map(([name, b]) => `| ${name} | ${b.status ?? ""} | ${b.exitCode ?? ""} | ${b.directory ?? b.message ?? ""} |`),
  ];
  return `${lines.join("\n")}\n`;
}

const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const [treeArg, out] = [optionOf(argv, "--tree"), optionOf(argv, "--out")];
  if (treeArg === undefined || out === undefined) {
    console.error("Usage: node scripts/compile-cache.ts --tree <folder> [--ref <sha>] [--inputs <ids>] [--repeats <n>] [--warmup <n>] --out <file.json>");
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
    };
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(`${out.replace(/\.json$/, "")}.md`, `${markdownOf(record)}\n${pairedMarkdown(report, "The paired run")}`);
    for (const r of rows) console.log(`${r.id}: main ${r.medianMs.main.toFixed(1)} ms, cold ${r.medianMs.cold.toFixed(1)} ms, warm ${r.medianMs.warm.toFixed(1)} ms`);
  } finally {
    rmSync(warmDir, { recursive: true, force: true });
  }
}
