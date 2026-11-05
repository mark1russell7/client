#!/usr/bin/env node
/**
 * This script is the child of the paired A/B bench (O83): one arm, one input, one round, in a fresh process.
 *
 *   node scripts/bench-paired-child.ts --tree <folder> --list
 *   node scripts/bench-paired-child.ts --tree <folder> --input <id> --warmup <n> [--compile-cache <folder | fresh>]
 *
 * The folder is a checkout of this repository with a build of `@procedures/client` and
 * `@procedures/collections`. The script loads the built modules of that folder, and not of the
 * folder of the script. Thus the arms of a run use the same workloads, and only the code under test
 * changes.
 *
 * The workloads are the benchmarks of `packages/client/bench/core.bench.ts` and
 * `packages/client-collections/bench/storage.bench.ts`, with the same inputs. One pass is a fixed
 * count of calls (`calls`): the work of each arm is the same. The script does `--warmup` passes
 * untimed, then one timed pass. The last line of stdout is the child protocol of paired-time/1:
 * `{"ms": <milliseconds for one call>, "peakRss": <bytes>, "calls": <count>}`.
 *
 * Each core workload also has 3 measures of its own, each in a fresh process (O90):
 *
 * - `<id>-setup`: the time from the start of the process to the end of the first call: the import
 *   of the modules, the setup and call 1. A short `mark` command pays it each time. The clock is
 *   `performance.now()`, whose origin is the start of the process.
 * - `<id>-cold`: the time per call of the first `COLD_CALLS` (20) calls after the setup, with no
 *   warm-up. One `mark` CLI command or a short MCP session makes one to a few tens of calls.
 * - `<id>-warm`: the time per call after it is stable. The script times chunks of 1/5 of a pass.
 *   The time is stable when 3 consecutive chunks are within 5 % (max / min <= 1.05), after at
 *   least 10 chunks (the 2 warm-up passes of O83). The warm time is the median of those 3 chunks.
 *   After 60 chunks the script stops and gives the median of the last 3, with `"stable": false`.
 *
 * With `--list`, the script writes the ids of the workloads that the folder can run, as JSON. A
 * workload whose module or export is missing in the folder is not in the list.
 *
 * With `--compile-cache`, the script enables the V8 compile cache in that folder before it loads
 * the tree (O90). The value `fresh` gives a new empty folder, which the script removes at the end.
 * The setup measure then ends after `module.flushCompileCache()`, so a cold cache pays its write.
 * If the cache does not start, the script fails: a bench arm must not lose its cache silently.
 */

import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import module from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** A package of the code under test. */
export type Pkg = "client" | "collections";

/** The modules of each package that the workloads use, relative to the root of a tree. */
export const MODULES: Readonly<Record<Pkg, readonly string[]>> = {
  client: ["packages/client/dist/client/index.js", "packages/client/dist/adapters/local/client/index.js", "packages/client/dist/procedures/index.js"],
  collections: ["packages/client-collections/dist/storage/memory.js"],
};

/** The exports of each package that the workloads use. */
export const EXPORTS: Readonly<Record<Pkg, readonly string[]>> = {
  client: ["Client", "LocalTransport", "allCoreProcedures", "ProcedureRegistry", "createRefScope", "hydrateInput", "narrowCapability"],
  collections: ["InMemoryStorage"],
};

/** A procedure registry of a tree: the part that the workloads use. */
interface Registry {
  register(procedure: unknown): unknown;
}

/** A storage of a tree: the part that the workloads use. */
interface Storage {
  setBatch(items: readonly (readonly [string, unknown])[]): unknown;
  set(id: string, value: unknown): unknown;
  get(id: string): unknown;
  getAll(): unknown;
  getChangesSince(since?: string): Promise<{ readonly version: string }>;
}

/**
 * The exports of the modules of a tree that the workloads use (`EXPORTS`). The modules come from
 * the build of another checkout, so this type names only the parts that the workloads call.
 */
export interface TreeModules {
  readonly Client: new (transport: unknown) => { useRegistry(registry: Registry): { exec(proc: unknown): unknown } };
  readonly LocalTransport: new (options: { readonly registry: Registry }) => unknown;
  readonly allCoreProcedures: Iterable<unknown>;
  readonly ProcedureRegistry: new () => Registry;
  readonly createRefScope: () => { readonly outputs: Map<string, unknown> };
  readonly hydrateInput: (data: unknown, call: () => Promise<unknown>, options: { readonly scope: unknown }) => unknown;
  readonly narrowCapability: (...args: readonly unknown[]) => unknown;
  readonly InMemoryStorage: new (options: { readonly copies: boolean }) => Storage;
}

/** An item of the size of a procedure record, as in `storage.bench.ts`. */
const item = (n: number) => ({
  path: ["bench", "items", `item${n}`],
  metadata: { description: `The item number ${n}`, tags: ["bench", "storage", `n${n % 10}`], effects: { reads: ["collection:items"], writes: [] } },
  storedAt: 1_760_000_000_000 + n,
});
const COUNT = 1000;

/** The core workloads of `core.bench.ts`. */
async function coreSetup(m: TreeModules) {
  const registry = new m.ProcedureRegistry();
  for (const procedure of m.allCoreProcedures) registry.register(procedure);
  const client = new m.Client(new m.LocalTransport({ registry })).useRegistry(registry);
  const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
  const chain = { $proc: ["client", "chain"], input: { steps: [add(0, 1), ...Array.from({ length: 49 }, () => add({ $ref: "$last" }, 1))] } };
  const map = { $proc: ["client", "map"], input: { items: Array.from({ length: 100 }, (_, index) => index), fn: add({ $ref: "item" }, 1) } };
  const scope = m.createRefScope();
  scope.outputs.set("a", { b: { c: 1 } });
  const data = { list: Array.from({ length: 200 }, () => ({ value: { $ref: "a.b.c" }, other: [1, 2, 3] })) };
  return { client, add, chain, map, scope, data };
}

/** The storages of `storage.bench.ts`, with or without copies. */
async function storageSetup(m: TreeModules, copies: boolean): Promise<Storage> {
  const items = Array.from({ length: COUNT }, (_, n) => [`item${n}`, item(n)] as const);
  const storage = new m.InMemoryStorage({ copies });
  await storage.setBatch(items);
  return storage;
}

/** A storage with ten changes after a version, for a small delta. */
async function deltaSetup(m: TreeModules, copies: boolean) {
  const storage = await storageSetup(m, copies);
  const { version } = await storage.getChangesSince();
  for (let index = 0; index < 10; index++) await storage.set(`item${index}`, item(index + COUNT));
  return { storage, version };
}

/** One workload: a benchmark of a bench file. */
export interface Workload {
  /** The name of the benchmark in its bench file */
  readonly id: string;
  /** The package of the code under test */
  readonly pkg: Pkg;
  /** The bench file of the benchmark */
  readonly file: string;
  /** The calls of one pass: about 100 ms on the runners of the nightly of 2026-11-02 */
  readonly calls: number;
  /** The value `true` calls without `await`, as the bench file does */
  readonly sync?: boolean;
  /** The setup, the cold or the warm measure of a core workload (O90). Without it, the fixed pass */
  readonly measure?: "setup" | "cold" | "warm";
  /** The setup: it gives one call */
  readonly make: (m: TreeModules) => Promise<() => unknown>;
}

const FIXED: readonly Workload[] = [
  { id: "exec-one-call", pkg: "client", file: "packages/client/bench/core.bench.ts", calls: 40_000, make: async (m) => { const s = await coreSetup(m); return () => s.client.exec(s.add(1, 2)); } },
  { id: "exec-chain-50", pkg: "client", file: "packages/client/bench/core.bench.ts", calls: 450, make: async (m) => { const s = await coreSetup(m); return () => s.client.exec(s.chain); } },
  { id: "exec-map-100", pkg: "client", file: "packages/client/bench/core.bench.ts", calls: 200, make: async (m) => { const s = await coreSetup(m); return () => s.client.exec(s.map); } },
  { id: "hydrate-200-refs", pkg: "client", file: "packages/client/bench/core.bench.ts", calls: 100, make: async (m) => { const s = await coreSetup(m); return () => m.hydrateInput(s.data, async () => undefined, { scope: s.scope }); } },
  {
    id: "narrow-capability", pkg: "client", file: "packages/client/bench/core.bench.ts", calls: 500_000, sync: true,
    make: async (m) => () => m.narrowCapability({ effects: { reads: ["fs", "network"], writes: ["fs"] }, deadline: 10_000 }, { effects: { writes: [] }, timeoutMs: 500 }, undefined, 0),
  },
  { id: "storage-structured-clone-one-item", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 40_000, sync: true, make: async () => { const one = item(1); return () => structuredClone(one); } },
  { id: "storage-memory-set-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 30_000, make: async (m) => { const s = await storageSetup(m, true); const one = item(1); let n = 0; return () => s.set(`item${n++ % COUNT}`, one); } },
  { id: "storage-memory-set-no-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 200_000, make: async (m) => { const s = await storageSetup(m, false); const one = item(1); let n = 0; return () => s.set(`item${n++ % COUNT}`, one); } },
  { id: "storage-memory-get-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 25_000, make: async (m) => { const s = await storageSetup(m, true); let n = 0; return () => s.get(`item${n++ % COUNT}`); } },
  { id: "storage-memory-get-no-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 200_000, make: async (m) => { const s = await storageSetup(m, false); let n = 0; return () => s.get(`item${n++ % COUNT}`); } },
  { id: "storage-memory-getall-1000-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 30, make: async (m) => { const s = await storageSetup(m, true); return () => s.getAll(); } },
  { id: "storage-memory-getall-1000-no-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 4_000, make: async (m) => { const s = await storageSetup(m, false); return () => s.getAll(); } },
  { id: "storage-memory-delta-10-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 2_500, make: async (m) => { const d = await deltaSetup(m, true); return () => d.storage.getChangesSince(d.version); } },
  { id: "storage-memory-delta-10-no-copies", pkg: "collections", file: "packages/client-collections/bench/storage.bench.ts", calls: 15_000, make: async (m) => { const d = await deltaSetup(m, false); return () => d.storage.getChangesSince(d.version); } },
];

/** The calls of the cold measure. */
export const COLD_CALLS = 20;
/** The warm measure: the chunks that agree, their largest max / min, the fewest and the most chunks. */
export const WARM = { agree: 3, ratio: 1.05, min: 10, max: 60 };

/** The core workloads, which also have a cold and a warm measure. */
export const CORE: readonly string[] = ["exec-one-call", "exec-chain-50", "exec-map-100", "hydrate-200-refs"];

/**
 * The workloads: the fixed passes, then the setup, the cold and the warm measure of each core
 * workload. The `calls` of a warm workload is the size of one chunk.
 */
export const WORKLOADS: readonly Workload[] = [
  ...FIXED,
  ...FIXED.filter((w) => CORE.includes(w.id)).flatMap((w): Workload[] => [
    { ...w, id: `${w.id}-setup`, measure: "setup", calls: 1 },
    { ...w, id: `${w.id}-cold`, measure: "cold", calls: COLD_CALLS },
    { ...w, id: `${w.id}-warm`, measure: "warm", calls: Math.max(1, Math.round(w.calls / 5)) },
  ]),
];

/**
 * This function loads the modules of a package from a tree, and gives their exports in one object.
 * A missing module file gives `undefined`.
 */
export async function loadPackage(tree: string, pkg: Pkg): Promise<Record<string, unknown> | undefined> {
  const files = MODULES[pkg].map((file) => join(tree, file));
  if (!files.every((file) => existsSync(file))) return undefined;
  const merged: Record<string, unknown> = {};
  for (const file of files) Object.assign(merged, await import(pathToFileURL(file).href));
  return merged;
}

/** This function gives the ids of the workloads whose package and exports the tree has. */
export async function listOf(tree: string): Promise<string[]> {
  const ids: string[] = [];
  for (const pkg of ["client", "collections"] as const) {
    const m = await loadPackage(tree, pkg);
    if (m === undefined || !EXPORTS[pkg].every((name) => m[name] !== undefined)) continue;
    ids.push(...WORKLOADS.filter((w) => w.pkg === pkg).map((w) => w.id));
  }
  return ids;
}

/** This function does one pass of a workload: `calls` calls, one after the other. */
export async function pass(call: () => unknown, calls: number, sync: boolean): Promise<void> {
  if (sync) for (let i = 0; i < calls; i++) call();
  else for (let i = 0; i < calls; i++) await call();
}

/**
 * This function does the warm-up passes untimed, then one timed pass, and gives the time of one
 * call in milliseconds.
 */
export async function timeWorkload(workload: Workload, call: () => unknown, warmup: number, clock: () => number = () => performance.now()): Promise<number> {
  if (workload.measure === "warm") return (await timeWarm(workload, call, clock)).ms;
  if (workload.measure !== "cold") for (let w = 0; w < warmup; w++) await pass(call, workload.calls, workload.sync === true);
  const start = clock();
  await pass(call, workload.calls, workload.sync === true);
  return (clock() - start) / workload.calls;
}

/**
 * This function tells if the last `WARM.agree` chunk times are stable: their max / min is at most
 * `WARM.ratio`, after at least `WARM.min` chunks. The `times` are the time per call of each chunk, in order.
 */
export function isStable(times: readonly number[]): boolean {
  if (times.length < Math.max(WARM.min, WARM.agree)) return false;
  const last = times.slice(-WARM.agree);
  return Math.max(...last) <= Math.min(...last) * WARM.ratio;
}

/**
 * This function times chunks of a workload until the time per call is stable, and gives the warm
 * time: the median of the last `WARM.agree` chunks.
 */
export async function timeWarm(workload: Workload, call: () => unknown, clock: () => number = () => performance.now()): Promise<{ ms: number; chunks: number; stable: boolean }> {
  const times: number[] = [];
  while (times.length < WARM.max && !isStable(times)) {
    const start = clock();
    await pass(call, workload.calls, workload.sync === true);
    times.push((clock() - start) / workload.calls);
  }
  // The import comes after the last chunk, thus no time of this process counts the load of the module.
  // The load of the module loads no dependency: the paired bench starts this file from a checkout with no install
  const { quantileOf } = await import("./lib/paired-time.ts");
  return { ms: quantileOf(times.slice(-WARM.agree), 0.5), chunks: times.length, stable: isStable(times) };
}

/**
 * This function does the first call of a workload, and gives the time from the start of the process
 * to its end, in milliseconds. The `clock` has its origin at the start of the process. The `end` is
 * the last step of the setup before the clock is read, for example the write of the compile cache.
 */
export async function timeSetup(workload: Workload, call: () => unknown, clock: () => number = () => performance.now(), end: () => void = () => {}): Promise<number> {
  await pass(call, 1, workload.sync === true);
  end();
  return clock();
}

/**
 * This function enables the compile cache in a folder, and gives the folder that Node.js uses.
 * It throws when the cache does not start: a bench arm with no cache must not pass as a cache arm.
 */
export function enableCompileCache(dir: string): string {
  if (typeof module.enableCompileCache !== "function") throw new Error(`Node.js ${process.version} has no module.enableCompileCache (22.1 or later)`);
  const result = module.enableCompileCache(dir);
  const { ENABLED, ALREADY_ENABLED } = module.constants.compileCacheStatus;
  if (result.status !== ENABLED && result.status !== ALREADY_ENABLED) throw new Error(`The compile cache did not start in ${dir}: ${result.message ?? result.status}`);
  return result.directory ?? dir;
}

/** This function gives the value of an option of the command line, or `undefined`. */
const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const treeArg = optionOf(argv, "--tree");
  if (treeArg === undefined) {
    console.error("Usage: node scripts/bench-paired-child.ts --tree <folder> (--list | --input <id> --warmup <n>)");
    process.exit(2);
  }
  const tree = resolve(treeArg);
  if (argv.includes("--list")) {
    console.log(JSON.stringify(await listOf(tree)));
  } else {
    const id = optionOf(argv, "--input");
    const workload = WORKLOADS.find((w) => w.id === id);
    if (workload === undefined) {
      console.error(`The input "${id}" is not a workload. The workloads: ${WORKLOADS.map((w) => w.id).join(", ")}.`);
      process.exit(2);
    }
    const warmup = Number(optionOf(argv, "--warmup") ?? "1");
    const cacheArg = optionOf(argv, "--compile-cache");
    const fresh = cacheArg === "fresh" ? mkdtempSync(join(tmpdir(), "bench-compile-cache-")) : undefined;
    // The exit handler also removes the new folder when the child fails
    if (fresh !== undefined) process.on("exit", () => rmSync(fresh, { recursive: true, force: true }));
    const cache = cacheArg === undefined ? undefined : enableCompileCache(fresh ?? resolve(cacheArg));
    const m = await loadPackage(tree, workload.pkg);
    if (m === undefined) {
      console.error(`${tree}: the build of the package ${workload.pkg} is missing (${MODULES[workload.pkg].join(", ")}).`);
      process.exit(1);
    }
    const call = await workload.make(m as unknown as TreeModules);
    // The value maxRSS of Node.js is in kilobytes
    if (workload.measure === "setup") {
      const ms = await timeSetup(workload, call, undefined, cache === undefined ? undefined : () => module.flushCompileCache());
      console.log(JSON.stringify({ ms, peakRss: process.resourceUsage().maxRSS * 1024, calls: 1, ...(cache === undefined ? {} : { cache }) }));
    } else if (workload.measure === "warm") {
      const warm = await timeWarm(workload, call);
      if (!warm.stable) console.error(`${workload.id}: the time per call is not stable after ${warm.chunks} chunks`);
      console.log(JSON.stringify({ ms: warm.ms, peakRss: process.resourceUsage().maxRSS * 1024, calls: workload.calls, chunks: warm.chunks, stable: warm.stable }));
    } else {
      const ms = await timeWorkload(workload, call, warmup);
      console.log(JSON.stringify({ ms, peakRss: process.resourceUsage().maxRSS * 1024, calls: workload.calls }));
    }
  }
}
