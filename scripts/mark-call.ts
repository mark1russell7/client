/**
 * This script compares one `mark` call on a base tree and a head tree (roadmap O93: a call loads
 * only the packages of its path).
 *
 *   node scripts/mark-call.ts --base <folder> --head <folder> [--base-ref <sha>] [--head-ref <sha>]
 *     [--repeats <n>] [--profile-repeats <n>] [--budget <share>] --out <file.json>
 *
 * The call is `MARK_CALL` of `compile-cache.ts`: `client.add` of 1 and 2, with the output 3. Each
 * process has no compile cache (`NODE_DISABLE_COMPILE_CACHE=1`), no auto-warm (`MARK_AUTO_WARM=never`)
 * and a temporary home folder for each tree. `startMark()` of `compile-cache.ts` starts each call,
 * times it from the spawn to the exit, and fails when the output is not 3.
 *
 * 1. The manifest: one call of each tree writes `dist/manifest.json` when it is stale. Then the
 *    `readFreshManifest()` of the tree must find it fresh. A stale manifest makes the head load each
 *    package, so the script then fails. After all calls, the manifest must not have changed.
 * 2. The rounds: `measureIsolated()` of `lib/paired-time.ts` in mode `fresh`, with the arms `base`
 *    and `head` and the A/A arm. `analyzeInput()` of `bench-paired.ts` gives the verdict at the budget.
 * 3. The named costs: CPU profiles of calls of each tree, grouped by file (`selfTimesOf()` of
 *    `setup-profile.ts`) and by the rows of `NAMED_ROWS`.
 * 4. The loaded packages: one call of each tree with the hook `setup-profile-hook.ts`.
 *
 * The script writes the JSON record (`mark-call/1`) to `--out`, and the Markdown next to it (`.md`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runnerContext } from "./bench-context.ts";
import { analyzeInput, runMarkdown, type Analysis } from "./bench-paired.ts";
import { MARK_CALL, optionOf, startMark } from "./compile-cache.ts";
import { measureIsolated, quantileOf, type PairedReport } from "./lib/paired-time.ts";
import { groupOf, keyOf, selfTimesOf, type CpuProfile } from "./setup-profile.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = pathToFileURL(join(HERE, "setup-profile-hook.ts")).href;

/** The schema of the record. */
export const SCHEMA = "mark-call/1";

/** The sides of the comparison. The base is the arm 0 of the paired run. */
export const SIDES = ["base", "head"] as const;
export type Side = (typeof SIDES)[number];

/** The heavy packages that a call of a core procedure must not load (the list of `lazy.e2e.test.ts`). */
export const HEAVY = [/^mongodb$/, /^@aws-sdk\//, /^@smithy\//, /^ts-morph$/, /^yaml$/, /^ws$/, /^cli-table3$/];

/**
 * This function gives the package key of a module URL: the package name under `node_modules`
 * (`@scope/name` or `name`), `packages/<folder>` for a file of a package of the tree, or the
 * path in the tree. A module of Node.js gives `undefined`, and a file outside the tree `(outside the tree)`.
 */
export function packageKeyOf(url: string, tree: string): string | undefined {
  const key = keyOf(url, tree);
  if (key === "node:internal") return undefined;
  if (key === "other") return url.startsWith("file:") ? "(outside the tree)" : undefined;
  return key.startsWith("npm:") ? key.slice("npm:".length) : groupOf(key);
}

/** The loaded packages of one call: the distinct package keys, sorted, and the heavy packages among them. */
export interface LoadedPackages {
  readonly modules: number;
  readonly packages: readonly string[];
  readonly heavy: readonly string[];
}

/** This function gives the loaded packages of a list of module URLs. */
export function loadedPackagesOf(urls: readonly string[], tree: string): LoadedPackages {
  const distinct = [...new Set(urls)];
  const packages = [...new Set(distinct.map((url) => packageKeyOf(url, tree)).filter((key): key is string => key !== undefined))].sort();
  return { modules: distinct.length, packages, heavy: packages.filter((name) => HEAVY.some((pattern) => pattern.test(name))) };
}

/** A CPU profile with the children of each node, as `--cpu-prof` writes it. */
export interface StackProfile extends CpuProfile {
  readonly nodes: readonly { readonly id: number; readonly callFrame: { readonly url: string; readonly functionName: string }; readonly children?: readonly number[] }[];
}

/**
 * This function gives the profile with a `file:` URL for each frame that has an absolute path. A
 * CommonJS module can have a path in place of a URL.
 */
export function withFileUrls(profile: StackProfile): StackProfile {
  const urlOf = (url: string) => (url !== "" && !url.includes("://") && !url.startsWith("node:") && isAbsolute(url) ? pathToFileURL(url).href : url);
  return { ...profile, nodes: profile.nodes.map((n) => ({ ...n, callFrame: { ...n.callFrame, url: urlOf(n.callFrame.url) } })) };
}

/** One frame of a row: a file key of `keyOf()` or its start, and the function names (none: each function of the file). */
export interface RowFrame {
  readonly file: string;
  readonly names?: readonly string[];
}

/** A named row: a cost that the prediction of O93 assumed small. */
export interface RowSpec {
  readonly id: string;
  readonly label: string;
  readonly frames: readonly RowFrame[];
}

/**
 * The named rows. A sample goes to the innermost frame of its stack that a row names. Thus the time
 * of a row is its frames and the calls under them, less the calls of an inner row.
 */
export const NAMED_ROWS: readonly RowSpec[] = [
  {
    id: "manifest",
    label: "The read and the `JSON.parse` of the manifest (`readFreshManifest`)",
    frames: [{ file: "packages/mark/dist/manifest.js", names: ["readFreshManifest", "manifestPath", "markRoot"] }],
  },
  {
    id: "fingerprint",
    label: "`computeFingerprint`, with its stat calls",
    frames: [{ file: "packages/mark/dist/manifest.js", names: ["computeFingerprint", "stamp"] }],
  },
  {
    id: "registry",
    label: "The build of the core registry (`createRegistry`, `createLazyRegistry`, `registerModules`)",
    frames: [
      { file: "packages/client/dist/procedures/module.js", names: ["createRegistry", "createLazyRegistry", "registerModules"] },
      { file: "packages/client/dist/procedures/registry.js", names: ["createRegistry", "createLazyRegistry", "registerModules"] },
    ],
  },
  {
    id: "loader",
    label: "The index lookup and the loader (`createLazyEcosystemRegistry`)",
    frames: [{ file: "packages/mark/dist/ecosystem.js", names: ["createLazyEcosystemRegistry", "indexOfCommands", "moduleOfPackage", "load"] }],
  },
  {
    id: "print",
    label: "The print (`print.js`, `format.js`, `formatOutput`)",
    frames: [{ file: "packages/mark/dist/print.js" }, { file: "packages/mark/dist/format.js" }, { file: "packages/cli-kit/dist/", names: ["formatOutput"] }],
  },
];

/** The time of the rows in one profile, in milliseconds. `found` names the rows with a frame in the profile. */
export interface RowTimes {
  readonly ms: Readonly<Record<string, number>>;
  readonly selfMs: Readonly<Record<string, number>>;
  readonly found: readonly string[];
}

/** This function gives the time of each row in a profile. The time of a sample is the time to the next sample, as in `selfTimesOf()`. */
export function rowTimesOf(profile: StackProfile, tree: string, rows: readonly RowSpec[] = NAMED_ROWS): RowTimes {
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);
  const rowOfNode = new Map<number, string>();
  for (const n of profile.nodes) {
    if (n.callFrame.url === "") continue;
    const key = keyOf(n.callFrame.url, tree);
    const row = rows.find((r) => r.frames.some((f) => key.startsWith(f.file) && (f.names === undefined || f.names.includes(n.callFrame.functionName))));
    if (row !== undefined) rowOfNode.set(n.id, row.id);
  }
  const ms: Record<string, number> = Object.fromEntries(rows.map((r) => [r.id, 0]));
  const selfMs: Record<string, number> = Object.fromEntries(rows.map((r) => [r.id, 0]));
  for (let i = 0; i < profile.samples.length; i++) {
    const leaf = profile.samples[i];
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const own = rowOfNode.get(leaf);
    if (own !== undefined) selfMs[own] += dt;
    for (let id: number | undefined = leaf; id !== undefined; id = parent.get(id)) {
      const row = rowOfNode.get(id);
      if (row !== undefined) {
        ms[row] += dt;
        break;
      }
    }
  }
  return { ms, selfMs, found: [...new Set(rowOfNode.values())] };
}

/** One profiled call: its time with the profiler, and the self time of each file key and the time of each row. */
export interface ProfileRepeat {
  readonly wallMs: number;
  readonly files: Readonly<Record<string, number>>;
  readonly rows: RowTimes;
}

/** The summary of the profiled calls of one tree: medians over the calls, in milliseconds. */
export interface ProfileSummary {
  readonly repeats: number;
  readonly wallMs: number;
  /** The median of the sum of the self times of a call */
  readonly sampledMs: number;
  readonly files: Readonly<Record<string, number>>;
  /** The time of each row, with `null` for a row that no profile has */
  readonly rows: Readonly<Record<string, { readonly ms: number | null; readonly selfMs: number | null }>>;
  /** The self time of each file of the rows */
  readonly rowFiles: readonly { readonly key: string; readonly ms: number }[];
  /** The 10 keys with the largest self time, without the files of the rows */
  readonly remaining: readonly { readonly key: string; readonly ms: number }[];
}

/** This function gives the summary of the profiled calls of one tree. A key that a call does not have counts as 0 ms. */
export function profileSummaryOf(repeats: readonly ProfileRepeat[], rows: readonly RowSpec[] = NAMED_ROWS, top = 10): ProfileSummary {
  const median = (values: readonly number[]) => quantileOf(values, 0.5);
  const keys = [...new Set(repeats.flatMap((r) => Object.keys(r.files)))];
  const files = Object.fromEntries(keys.map((key) => [key, median(repeats.map((r) => r.files[key] ?? 0))]));
  const found = new Set(repeats.flatMap((r) => r.rows.found));
  const rowTimes = Object.fromEntries(
    rows.map((row) => [
      row.id,
      found.has(row.id) ? { ms: median(repeats.map((r) => r.rows.ms[row.id] ?? 0)), selfMs: median(repeats.map((r) => r.rows.selfMs[row.id] ?? 0)) } : { ms: null, selfMs: null },
    ]),
  );
  const rowFileKeys = rows.flatMap((r) => r.frames.map((f) => f.file));
  const isRowFile = (key: string) => rowFileKeys.some((file) => key.startsWith(file));
  const byTime = (a: { ms: number }, b: { ms: number }) => b.ms - a.ms;
  const entries = Object.entries(files).map(([key, ms]) => ({ key, ms }));
  return {
    repeats: repeats.length,
    wallMs: median(repeats.map((r) => r.wallMs)),
    sampledMs: median(repeats.map((r) => Object.values(r.files).reduce((s, ms) => s + ms, 0))),
    files,
    rows: rowTimes,
    rowFiles: entries.filter((e) => isRowFile(e.key)).sort(byTime),
    remaining: entries.filter((e) => !isRowFile(e.key)).sort(byTime).slice(0, top),
  };
}

/** The paired difference of the rounds: the median of base minus head, and the interval of the round differences. */
export interface Difference {
  readonly medianBaseMinusHeadMs: number;
  readonly roundsMs: readonly number[];
  readonly p10: number;
  readonly p90: number;
}

/** This function gives the paired difference of the arms `base` and `head` of a paired-time/1 report. */
export function differenceOf(report: PairedReport): Difference {
  const input = report.inputs[0];
  const base = input?.ms.base ?? [];
  const head = input?.ms.head ?? [];
  const roundsMs = base.slice(0, Math.min(base.length, head.length)).map((ms, r) => ms - head[r]);
  return {
    medianBaseMinusHeadMs: (input?.median.base ?? Number.NaN) - (input?.median.head ?? Number.NaN),
    roundsMs,
    p10: quantileOf(roundsMs, 0.1),
    p90: quantileOf(roundsMs, 0.9),
  };
}

/** The state of the manifest of a tree. */
export interface ManifestState {
  readonly fresh: boolean;
  readonly version: number | null;
  readonly commands: number;
  /** The size and the modification time of `dist/manifest.json` */
  readonly stamp: string;
}

/** The record of a run, as `markdownOf()` reads it. */
export interface MarkCallRecord {
  readonly schema: typeof SCHEMA;
  readonly refs: { readonly base: string; readonly head: string };
  readonly node: string;
  readonly run: { readonly label: string; readonly id?: string; readonly url?: string };
  readonly context: ReturnType<typeof runnerContext>;
  readonly repeats: number;
  readonly warmup: number;
  readonly budget: number;
  readonly skipped: readonly string[];
  readonly call: { readonly args: readonly string[]; readonly output: string; readonly env: Readonly<Record<string, string>> };
  readonly manifest: Readonly<Record<Side, { readonly before: ManifestState; readonly after: ManifestState }>>;
  readonly analysis: readonly Analysis[];
  readonly difference: Difference;
  readonly report: PairedReport;
  readonly profile: { readonly repeats: number; readonly sides: Readonly<Record<Side, ProfileSummary>>; readonly raw: Readonly<Record<Side, readonly ProfileRepeat[]>> } | null;
  readonly packages: Readonly<Record<Side, LoadedPackages>>;
}

/** This function gives the Markdown of a record. */
export function markdownOf(record: MarkCallRecord): string {
  const f = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "not found" : x.toFixed(d));
  const a = record.analysis[0];
  const d = record.difference;
  const lines = [
    "# One `mark` call: the base against the head (O93)",
    "",
    `The call \`mark ${record.call.args.join(" ")}\`, timed from the spawn to the exit, with no compile cache and no auto-warm. Node.js ${record.node}.`,
    "",
    "## The verdict",
    "",
    `The verdict at the budget ${record.budget} is the gate. The interval rule of STRATEGY gives it (\`analyzeInput\` of \`scripts/bench-paired.ts\`).`,
    "",
    "| Base median ms | Head median ms | Base - head (median) ms | Round differences p10 to p90 ms | Head/base | A/A p10 to p90 | Effect interval | Verdict |",
    "|---|---|---|---|---|---|---|---|",
    a === undefined
      ? "| | | | | | | | no analysis |"
      : `| ${f(a.baseMs)} | ${f(a.headMs)} | ${f(d.medianBaseMinusHeadMs)} | ${f(d.p10)} to ${f(d.p90)} | ${f(a.ratio, 3)} | ${f(a.aa.band.p10, 3)} to ${f(a.aa.band.p90, 3)} | ${f(a.effect.lo, 3)} to ${f(a.effect.hi, 3)} | ${a.verdict} |`,
    "",
    a === undefined ? "" : `Reason: ${a.reason}.`,
    "",
    "## The manifest",
    "",
    "| Tree | Fresh before the rounds | Fresh after all calls | Version | Commands | Not changed |",
    "|---|---|---|---|---|---|",
    ...SIDES.map((side) => {
      const m = record.manifest[side];
      return `| ${side} | ${m.before.fresh ? "yes" : "no"} | ${m.after.fresh ? "yes" : "no"} | ${m.before.version ?? ""} | ${m.before.commands} | ${m.before.stamp === m.after.stamp ? "yes" : "no"} |`;
    }),
    "",
  ];
  if (record.profile === null) lines.push("## The named costs", "", "No profile (`profile-repeats` is 0).", "");
  else {
    const p = record.profile.sides;
    lines.push(
      "## The named costs",
      "",
      `The median over ${record.profile.repeats} CPU-profiled calls of each tree, in ms, with the profiler on. A sample goes to the innermost row of its stack. "Self" is the time in the frames of the row only. Sampled time of a call: base ${f(p.base.sampledMs)} ms, head ${f(p.head.sampledMs)} ms. Wall time with the profiler: base ${f(p.base.wallMs)} ms, head ${f(p.head.wallMs)} ms.`,
      "",
      "| Row | Head ms | Head self ms | Base ms | Base self ms |",
      "|---|---|---|---|---|",
      ...NAMED_ROWS.map((row) => `| ${row.label} | ${f(p.head.rows[row.id]?.ms)} | ${f(p.head.rows[row.id]?.selfMs)} | ${f(p.base.rows[row.id]?.ms)} | ${f(p.base.rows[row.id]?.selfMs)} |`),
      "",
      "### The self time of the files of the rows",
      "",
      "| File | Head ms | Base ms |",
      "|---|---|---|",
      ...[...new Set([...p.head.rowFiles, ...p.base.rowFiles].map((r) => r.key))].map((key) => `| \`${key}\` | ${f(p.head.files[key] ?? 0, 2)} | ${f(p.base.files[key] ?? 0, 2)} |`),
      "",
    );
    for (const side of ["head", "base"] as const) {
      lines.push(
        `### The remaining top 10 of the ${side}, by self time`,
        "",
        "| File or group | Self ms |",
        "|---|---|",
        ...p[side].remaining.map((r) => `| \`${r.key}\` | ${f(r.ms, 2)} |`),
        "",
      );
    }
  }
  lines.push("## The loaded packages", "", "One call of each tree with the hook `setup-profile-hook.ts`.", "", "| Tree | Modules | Packages | Heavy packages |", "|---|---|---|---|");
  for (const side of SIDES) {
    const l = record.packages[side];
    lines.push(`| ${side} | ${l.modules} | ${l.packages.length} | ${l.heavy.length === 0 ? "none" : l.heavy.map((name) => `\`${name}\``).join(", ")} |`);
  }
  lines.push("");
  for (const side of SIDES) lines.push(`- The packages of the ${side}: ${record.packages[side].packages.map((name) => `\`${name}\``).join(", ")}.`);
  lines.push("", runMarkdown(record));
  return `${lines.join("\n")}\n`;
}

/** This function gives the environment of a call in a tree with the home folder `home`. */
export function callEnv(home: string): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    XDG_CACHE_HOME: join(home, ".cache"),
    NODE_DISABLE_COMPILE_CACHE: "1",
    MARK_AUTO_WARM: "never",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
}

/** This function gives the state of the manifest of a tree, from the `readFreshManifest()` of the tree. */
function manifestOf(tree: string, env: Readonly<Record<string, string>>): ManifestState {
  const dist = join(tree, "packages", "mark", "dist");
  const url = pathToFileURL(join(dist, "manifest.js")).href;
  const code = `const m = await import(${JSON.stringify(url)}); const x = m.readFreshManifest(); console.log(JSON.stringify({ fresh: x !== null, version: x?.version ?? null, commands: x?.commands?.length ?? 0 }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${tree}: the check of the manifest exited with ${r.status}: ${r.stderr}`);
  const file = join(dist, "manifest.json");
  const stamp = existsSync(file) ? `${statSync(file).size}:${statSync(file).mtimeMs}` : "-";
  return { ...(JSON.parse(r.stdout.trim().split("\n").at(-1) ?? "{}") as Omit<ManifestState, "stamp">), stamp };
}

/** This function starts one call with the CPU profiler and gives its time, the self time of each file and the rows. */
async function profileOnce(tree: string, bin: string, env: Readonly<Record<string, string>>, work: string): Promise<ProfileRepeat> {
  const dir = mkdtempSync(join(work, "profile-"));
  try {
    const { ms } = await startMark(["none", process.execPath, "--cpu-prof", "--cpu-prof-dir", dir, "--cpu-prof-interval", "100", bin, ...MARK_CALL.args], env);
    const file = readdirSync(dir).find((name) => name.endsWith(".cpuprofile"));
    if (file === undefined) throw new Error(`${tree}: the call wrote no CPU profile`);
    const profile = withFileUrls(JSON.parse(readFileSync(join(dir, file), "utf8")) as StackProfile);
    return { wallMs: ms, files: selfTimesOf(profile, tree), rows: rowTimesOf(profile, tree) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** This function starts one call with the module hook and gives its loaded packages. */
async function packagesOnce(tree: string, bin: string, env: Readonly<Record<string, string>>, work: string): Promise<LoadedPackages> {
  const file = join(work, `modules-${Date.now()}.json`);
  await startMark(["none", process.execPath, "--import", HOOK, bin, ...MARK_CALL.args], { ...env, SETUP_PROFILE_MODULES: file });
  const loaded = JSON.parse(readFileSync(file, "utf8")) as { url: string }[];
  return loadedPackagesOf(
    loaded.map((m) => m.url),
    tree,
  );
}

/** This function gives the count of the files under a folder, or 0 when it does not exist. */
const filesUnder = (dir: string): number => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0);

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const [baseArg, headArg, out] = [optionOf(argv, "--base"), optionOf(argv, "--head"), optionOf(argv, "--out")];
  if (baseArg === undefined || headArg === undefined || out === undefined) {
    console.error("Usage: node scripts/mark-call.ts --base <folder> --head <folder> [--base-ref <sha>] [--head-ref <sha>] [--repeats <n>] [--profile-repeats <n>] [--budget <share>] --out <file.json>");
    process.exit(2);
  }
  const trees: Record<Side, string> = { base: realpathSync(resolve(baseArg)), head: realpathSync(resolve(headArg)) };
  const bins: Record<Side, string> = { base: join(trees.base, "packages", "mark", "dist", "bin.js"), head: join(trees.head, "packages", "mark", "dist", "bin.js") };
  const repeats = Number(optionOf(argv, "--repeats") ?? "20");
  const profileRepeats = Number(optionOf(argv, "--profile-repeats") ?? "10");
  const budget = Number(optionOf(argv, "--budget") ?? "0.1");
  const work = mkdtempSync(join(tmpdir(), "mark-call-"));
  try {
    const envs = Object.fromEntries(
      SIDES.map((side) => {
        const home = join(work, `home-${side}`);
        mkdirSync(home);
        return [side, callEnv(home)];
      }),
    ) as Record<Side, Record<string, string>>;
    const command = (side: Side) => ["none", process.execPath, bins[side], ...MARK_CALL.args];

    // The manifest: the first call of a tree writes it when it is stale. A stale manifest makes the measure wrong
    const before = {} as Record<Side, ManifestState>;
    for (const side of SIDES) {
      await startMark(command(side), envs[side]);
      before[side] = manifestOf(trees[side], envs[side]);
      if (!before[side].fresh) throw new Error(`The manifest of the ${side} ${trees[side]} is not fresh after one call. The measure stops.`);
    }

    // The rounds: the A/A arm repeats the command of the base, so the same array gives the same environment
    const commands = { base: command("base"), head: command("head") };
    const envOf = new Map<readonly string[], Record<string, string>>(SIDES.map((side) => [commands[side], envs[side]]));
    const report = await measureIsolated({
      mode: "fresh",
      repeats,
      warmup: 0,
      inputs: [{ id: MARK_CALL.id }],
      arms: SIDES.map((side) => ({ id: side, command: commands[side] })),
      startChild: (cmd) => startMark(cmd, envOf.get(cmd) ?? {}),
    });
    const analysis = report.inputs.map((input) => analyzeInput(input, budget));

    // The named costs: the order of the trees changes at each repeat, as in setup-profile.ts
    let profile: MarkCallRecord["profile"] = null;
    if (profileRepeats > 0) {
      const raw: Record<Side, ProfileRepeat[]> = { base: [], head: [] };
      for (let r = 0; r < profileRepeats; r++) {
        for (const side of r % 2 === 0 ? SIDES : ([...SIDES].reverse() as Side[])) raw[side].push(await profileOnce(trees[side], bins[side], envs[side], work));
      }
      profile = { repeats: profileRepeats, sides: { base: profileSummaryOf(raw.base), head: profileSummaryOf(raw.head) }, raw };
    }

    const packages = {} as Record<Side, LoadedPackages>;
    for (const side of SIDES) packages[side] = await packagesOnce(trees[side], bins[side], envs[side], work);

    // After all calls: the manifest did not change, and the calls wrote no compile cache
    const manifest = {} as Record<Side, { before: ManifestState; after: ManifestState }>;
    const problems: string[] = [];
    for (const side of SIDES) {
      const after = manifestOf(trees[side], envs[side]);
      manifest[side] = { before: before[side], after };
      if (!after.fresh || after.stamp !== before[side].stamp) problems.push(`the manifest of the ${side} changed during the calls (${before[side].stamp} to ${after.stamp})`);
      const cache = filesUnder(join(envs[side].XDG_CACHE_HOME, "mark", "compile-cache"));
      if (cache > 0) problems.push(`the calls of the ${side} wrote ${cache} files of the compile cache`);
    }

    const runId = process.env.GITHUB_RUN_ID;
    const record: MarkCallRecord = {
      schema: SCHEMA,
      refs: { base: optionOf(argv, "--base-ref") ?? trees.base, head: optionOf(argv, "--head-ref") ?? trees.head },
      node: process.version,
      run: {
        label: runId ? `${runId}/${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : "local",
        ...(runId ? { id: runId } : {}),
        ...(runId && process.env.GITHUB_SERVER_URL ? { url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}` } : {}),
      },
      context: runnerContext(),
      repeats,
      warmup: 0,
      budget,
      skipped: [],
      call: { args: MARK_CALL.args, output: MARK_CALL.output, env: envs.head },
      manifest,
      analysis,
      difference: differenceOf(report),
      report,
      profile,
      packages,
    };
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(`${out.replace(/\.json$/, "")}.md`, markdownOf(record));
    for (const a of analysis) console.log(`${a.id}: base ${a.baseMs.toFixed(1)} ms, head ${a.headMs.toFixed(1)} ms, head/base ${a.ratio.toFixed(3)}, verdict ${a.verdict}`);
    // A probe that gives no number fails the run (the 10-30 rule: gates and probes fail closed)
    if (analysis.some((a) => !Number.isFinite(a.ratio) || !Number.isFinite(a.aa.ratio))) problems.push("the run gave no ratio");
    if (problems.length > 0) {
      console.error(`The measure is not valid: ${problems.join(", ")}.`);
      process.exitCode = 1;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
