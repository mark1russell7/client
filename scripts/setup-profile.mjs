#!/usr/bin/env node
/**
 * This script profiles the setup measure of the core workloads in two trees (O90): which files give
 * the time from the start of the process to the end of call 1, and how many bytes each one loads.
 *
 *   node scripts/setup-profile.mjs --base <folder> --head <folder> [--base-ref <sha>] [--head-ref <sha>]
 *     [--inputs <id>,<id>] [--repeats <n>] --out <file.json>
 *
 * Each repeat starts the child `bench-paired-child.mjs` once in each tree, with `--input <id>`,
 * `--cpu-prof` and the hook `setup-profile-hook.mjs`. The order of the trees changes at each repeat.
 * The self time of a file is the time of the CPU samples in the code of that file: its compile, its
 * evaluation and the calls of its functions. Samples with no file go to their name, for example
 * `(garbage collector)`. The bytes of a file are the bytes of its source. A file of a package of
 * `node_modules` counts as its package (`npm:<name>`).
 *
 * The profiler and the hook make the process slower, so the setup time of this script is not the
 * setup measure of the paired bench. Use the difference of the two trees, file by file, and the share
 * of each file in the added self time.
 *
 * The script writes the JSON record to `--out`, and the same tables as Markdown next to it (`.md`).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The setup measures that the script profiles when `--inputs` is not given. */
export const SETUP_INPUTS = ["exec-one-call-setup", "exec-chain-50-setup", "exec-map-100-setup", "hydrate-200-refs-setup"];

/**
 * This function gives the key of a file: its path in the tree with `/`, `npm:<name>` for a package
 * of `node_modules`, `node:internal` for a module of Node.js, or `other`.
 * @param {string} url
 * @param {string} tree
 */
export function keyOf(url, tree) {
  if (url.startsWith("node:")) return "node:internal";
  if (!url.startsWith("file:")) return "other";
  const path = fileURLToPath(url).split(sep).join("/");
  const at = path.lastIndexOf("/node_modules/");
  if (at !== -1) {
    const parts = path.slice(at + "/node_modules/".length).split("/");
    return `npm:${parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]}`;
  }
  const rel = relative(tree, fileURLToPath(url)).split(sep).join("/");
  return rel.startsWith("..") ? "other" : rel;
}

/**
 * This function gives the group of a key: `packages/<folder>` for a file of a package of the tree,
 * `npm` for a package of `node_modules`, or the key.
 * @param {string} key
 */
export function groupOf(key) {
  if (key.startsWith("npm:")) return "npm";
  const m = /^packages\/[^/]+/.exec(key);
  return m === null ? key : m[0];
}

/**
 * This function gives the self time of each key in a CPU profile, in milliseconds. The time of a
 * sample is the time to the next sample.
 * @param {{ nodes: { id: number, callFrame: { url: string, functionName: string } }[], samples: number[], timeDeltas: number[] }} profile
 * @param {string} tree
 */
export function selfTimesOf(profile, tree) {
  /** @type {Map<number, string>} */
  // V8 gives names such as "(garbage collector)" and "(program)" to the samples with no file
  const nameOf = (/** @type {string} */ name) => (name.startsWith("(") ? name : `(${name || "native"})`);
  const keyOfNode = new Map(profile.nodes.map((n) => [n.id, n.callFrame.url === "" ? nameOf(n.callFrame.functionName) : keyOf(n.callFrame.url, tree)]));
  /** @type {Record<string, number>} */
  const ms = {};
  for (let i = 0; i < profile.samples.length; i++) {
    const key = keyOfNode.get(profile.samples[i]) ?? "other";
    ms[key] = (ms[key] ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000;
  }
  return ms;
}

/**
 * This function gives the bytes of each key, from the list of the hook.
 * @param {{ url: string, bytes: number }[]} modules
 * @param {string} tree
 */
export function bytesOf(modules, tree) {
  /** @type {Record<string, number>} */
  const bytes = {};
  for (const m of modules) {
    const key = keyOf(m.url, tree);
    bytes[key] = (bytes[key] ?? 0) + m.bytes;
  }
  return bytes;
}

const median = (/** @type {number[]} */ values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length === 0 ? NaN : s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * This function gives the summary of the repeats of one tree: the median setup time, and for each
 * key the mean self time and the bytes.
 * @param {{ setupMs: number, self: Record<string, number>, bytes: Record<string, number> }[]} repeats
 */
export function summaryOf(repeats) {
  /** @type {Record<string, { ms: number, bytes: number }>} */
  const files = {};
  for (const r of repeats) {
    for (const [key, ms] of Object.entries(r.self)) (files[key] ??= { ms: 0, bytes: 0 }).ms += ms / repeats.length;
    for (const [key, bytes] of Object.entries(r.bytes)) (files[key] ??= { ms: 0, bytes: 0 }).bytes = Math.max(files[key].bytes, bytes);
  }
  const totalMs = Object.values(files).reduce((s, f) => s + f.ms, 0);
  const totalBytes = Object.values(files).reduce((s, f) => s + f.bytes, 0);
  return { repeats: repeats.length, setupMs: median(repeats.map((r) => r.setupMs)), totalMs, totalBytes, files };
}

/**
 * This function gives the difference of the head and the base, for each key and for each group,
 * with the share of each row in the added self time. The rows go from the largest added time.
 * @param {ReturnType<typeof summaryOf>} base
 * @param {ReturnType<typeof summaryOf>} head
 */
export function diffOf(base, head) {
  const added = head.totalMs - base.totalMs;
  /** @param {(key: string) => string} by */
  const rowsBy = (by) => {
    /** @type {Map<string, { key: string, baseMs: number, headMs: number, baseBytes: number, headBytes: number }>} */
    const rows = new Map();
    for (const [side, summary] of /** @type {const} */ ([["base", base], ["head", head]])) {
      for (const [key, f] of Object.entries(summary.files)) {
        const row = rows.get(by(key)) ?? { key: by(key), baseMs: 0, headMs: 0, baseBytes: 0, headBytes: 0 };
        row[`${side}Ms`] += f.ms;
        row[`${side}Bytes`] += f.bytes;
        rows.set(row.key, row);
      }
    }
    return [...rows.values()]
      .map((r) => ({ ...r, addedMs: r.headMs - r.baseMs, addedBytes: r.headBytes - r.baseBytes, share: (r.headMs - r.baseMs) / added }))
      .sort((a, b) => b.addedMs - a.addedMs);
  };
  return { addedMs: added, addedBytes: head.totalBytes - base.totalBytes, files: rowsBy((k) => k), groups: rowsBy(groupOf) };
}

/**
 * This function gives the Markdown of a record: for each input, the totals, the groups and the
 * files with the largest added self time.
 * @param {{ base: { ref: string }, head: { ref: string }, inputs: Record<string, { base: ReturnType<typeof summaryOf>, head: ReturnType<typeof summaryOf>, diff: ReturnType<typeof diffOf> }> }} record
 * @param {number} [top]
 */
export function markdownOf(record, top = 25) {
  const f = (/** @type {number} */ x, /** @type {number} */ d = 2) => x.toFixed(d);
  const kb = (/** @type {number} */ b) => (b / 1024).toFixed(1);
  /** @type {string[]} */
  const lines = [`# Setup profile`, "", `Base \`${record.base.ref}\`, head \`${record.head.ref}\`. Self time: the mean of the repeats, in ms, with the profiler on.`];
  /** @param {ReturnType<typeof diffOf>["files"]} rows */
  const table = (rows) => [
    "| File | Base ms | Head ms | Added ms | Share | Base KB | Head KB | Added KB |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| \`${r.key}\` | ${f(r.baseMs)} | ${f(r.headMs)} | ${f(r.addedMs)} | ${f(r.share * 100, 1)} % | ${kb(r.baseBytes)} | ${kb(r.headBytes)} | ${kb(r.addedBytes)} |`),
  ];
  for (const [id, x] of Object.entries(record.inputs)) {
    lines.push(
      "",
      `## \`${id}\``,
      "",
      `Setup (median, profiler on): ${f(x.base.setupMs, 1)} ms to ${f(x.head.setupMs, 1)} ms. Self time of all samples: ${f(x.base.totalMs, 1)} ms to ${f(x.head.totalMs, 1)} ms (added ${f(x.diff.addedMs, 1)} ms). Loaded source: ${kb(x.base.totalBytes)} KB to ${kb(x.head.totalBytes)} KB. Repeats: ${x.head.repeats}.`,
      "",
      "### Groups",
      "",
      ...table(x.diff.groups),
      "",
      `### The ${top} files with the largest added self time`,
      "",
      ...table(x.diff.files.slice(0, top)),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * This function starts the setup child once in a tree, with the profiler and the hook, and gives
 * its setup time, the self time of each key and the bytes of each key.
 * @param {string} tree
 * @param {string} input
 */
function profileOnce(tree, input) {
  const dir = mkdtempSync(join(tmpdir(), "setup-profile-"));
  try {
    const modulesFile = join(dir, "modules.json");
    const r = spawnSync(
      process.execPath,
      ["--cpu-prof", "--cpu-prof-dir", dir, "--cpu-prof-interval", "100", "--import", pathToFileURL(join(HERE, "setup-profile-hook.mjs")).href, join(HERE, "bench-paired-child.mjs"), "--tree", tree, "--input", input, "--warmup", "0"],
      { encoding: "utf8", env: { ...process.env, SETUP_PROFILE_MODULES: modulesFile } },
    );
    if (r.status !== 0) throw new Error(`${tree} ${input}: the child exited with ${r.status}: ${r.stderr}`);
    const last = r.stdout.trim().split("\n").at(-1) ?? "{}";
    const profileFile = readdirSync(dir).find((name) => name.endsWith(".cpuprofile"));
    if (profileFile === undefined) throw new Error(`${tree} ${input}: the child wrote no CPU profile`);
    return {
      setupMs: JSON.parse(last).ms,
      self: selfTimesOf(JSON.parse(readFileSync(join(dir, profileFile), "utf8")), tree),
      bytes: bytesOf(JSON.parse(readFileSync(modulesFile, "utf8")), tree),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const optionOf = (/** @type {string[]} */ argv, /** @type {string} */ name) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const [baseArg, headArg, out] = [optionOf(argv, "--base"), optionOf(argv, "--head"), optionOf(argv, "--out")];
  if (baseArg === undefined || headArg === undefined || out === undefined) {
    console.error("Usage: node scripts/setup-profile.mjs --base <folder> --head <folder> [--inputs <ids>] [--repeats <n>] --out <file.json>");
    process.exit(2);
  }
  const trees = { base: resolve(baseArg), head: resolve(headArg) };
  const inputs = (optionOf(argv, "--inputs") ?? SETUP_INPUTS.join(",")).split(",").filter((s) => s !== "");
  const repeats = Number(optionOf(argv, "--repeats") ?? "10");
  /** @type {Record<string, any>} */
  const result = {};
  for (const input of inputs) {
    /** @type {{ base: ReturnType<typeof profileOnce>[], head: ReturnType<typeof profileOnce>[] }} */
    const runs = { base: [], head: [] };
    for (let r = 0; r < repeats; r++) {
      for (const side of /** @type {const} */ (r % 2 === 0 ? ["base", "head"] : ["head", "base"])) runs[side].push(profileOnce(trees[side], input));
    }
    const base = summaryOf(runs.base);
    const head = summaryOf(runs.head);
    result[input] = { base, head, diff: diffOf(base, head) };
    console.log(`${input}: self time ${base.totalMs.toFixed(1)} ms to ${head.totalMs.toFixed(1)} ms`);
  }
  const record = {
    format: "setup-profile/1",
    node: process.version,
    base: { ref: optionOf(argv, "--base-ref") ?? trees.base },
    head: { ref: optionOf(argv, "--head-ref") ?? trees.head },
    repeats,
    inputs: result,
  };
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(out.replace(/\.json$/, "") + ".md", markdownOf(record));
}
