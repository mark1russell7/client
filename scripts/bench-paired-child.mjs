#!/usr/bin/env node
/**
 * This script is the child of the paired A/B bench (O83): one arm, one input, one round, in a fresh process.
 *
 *   node scripts/bench-paired-child.mjs --tree <folder> --list
 *   node scripts/bench-paired-child.mjs --tree <folder> --input <id> --warmup <n>
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
 * With `--list`, the script writes the ids of the workloads that the folder can run, as JSON. A
 * workload whose module or export is missing in the folder is not in the list.
 */

import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The modules of each package that the workloads use, relative to the root of a tree. */
export const MODULES = {
  client: ["packages/client/dist/client/index.js", "packages/client/dist/adapters/local/client/index.js", "packages/client/dist/procedures/index.js"],
  collections: ["packages/client-collections/dist/storage/memory.js"],
};

/** The exports of each package that the workloads use. */
export const EXPORTS = {
  client: ["Client", "LocalTransport", "allCoreProcedures", "ProcedureRegistry", "createRefScope", "hydrateInput", "narrowCapability"],
  collections: ["InMemoryStorage"],
};

/** An item of the size of a procedure record, as in `storage.bench.ts`. */
const item = (/** @type {number} */ n) => ({
  path: ["bench", "items", `item${n}`],
  metadata: { description: `The item number ${n}`, tags: ["bench", "storage", `n${n % 10}`], effects: { reads: ["collection:items"], writes: [] } },
  storedAt: 1_760_000_000_000 + n,
});
const COUNT = 1000;

/** The core workloads of `core.bench.ts`. */
async function coreSetup(/** @type {Record<string, any>} */ m) {
  const registry = new m.ProcedureRegistry();
  for (const procedure of m.allCoreProcedures) registry.register(procedure);
  const client = new m.Client(new m.LocalTransport({ registry })).useRegistry(registry);
  const add = (/** @type {unknown} */ a, /** @type {unknown} */ b) => ({ $proc: ["client", "add"], input: { a, b } });
  const chain = { $proc: ["client", "chain"], input: { steps: [add(0, 1), ...Array.from({ length: 49 }, () => add({ $ref: "$last" }, 1))] } };
  const map = { $proc: ["client", "map"], input: { items: Array.from({ length: 100 }, (_, index) => index), fn: add({ $ref: "item" }, 1) } };
  const scope = m.createRefScope();
  scope.outputs.set("a", { b: { c: 1 } });
  const data = { list: Array.from({ length: 200 }, () => ({ value: { $ref: "a.b.c" }, other: [1, 2, 3] })) };
  return { client, add, chain, map, scope, data };
}

/** The storages of `storage.bench.ts`, with or without copies. */
async function storageSetup(/** @type {Record<string, any>} */ m, /** @type {boolean} */ copies) {
  const items = Array.from({ length: COUNT }, (_, n) => [`item${n}`, item(n)]);
  const storage = new m.InMemoryStorage({ copies });
  await storage.setBatch(items);
  return storage;
}

/** A storage with ten changes after a version, for a small delta. */
async function deltaSetup(/** @type {Record<string, any>} */ m, /** @type {boolean} */ copies) {
  const storage = await storageSetup(m, copies);
  const { version } = await storage.getChangesSince();
  for (let index = 0; index < 10; index++) await storage.set(`item${index}`, item(index + COUNT));
  return { storage, version };
}

/**
 * @typedef {object} Workload One workload: a benchmark of a bench file.
 * @property {string} id The name of the benchmark in its bench file
 * @property {"client" | "collections"} pkg The package of the code under test
 * @property {string} file The bench file of the benchmark
 * @property {number} calls The calls of one pass: about 100 ms on the runners of the nightly of 2026-11-02
 * @property {boolean} [sync] The value `true` calls without `await`, as the bench file does
 * @property {(m: Record<string, any>) => Promise<() => unknown>} make The setup: it gives one call
 */

/** @type {Workload[]} */
export const WORKLOADS = [
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

/**
 * This function loads the modules of a package from a tree, and gives their exports in one object.
 * A missing module file gives `undefined`.
 * @param {string} tree
 * @param {"client" | "collections"} pkg
 */
export async function loadPackage(tree, pkg) {
  const files = MODULES[pkg].map((file) => join(tree, file));
  if (!files.every((file) => existsSync(file))) return undefined;
  /** @type {Record<string, any>} */
  const merged = {};
  for (const file of files) Object.assign(merged, await import(pathToFileURL(file).href));
  return merged;
}

/** This function gives the ids of the workloads whose package and exports the tree has. */
export async function listOf(/** @type {string} */ tree) {
  const ids = [];
  for (const pkg of /** @type {const} */ (["client", "collections"])) {
    const m = await loadPackage(tree, pkg);
    if (m === undefined || !EXPORTS[pkg].every((name) => m[name] !== undefined)) continue;
    ids.push(...WORKLOADS.filter((w) => w.pkg === pkg).map((w) => w.id));
  }
  return ids;
}

/**
 * This function does one pass of a workload: `calls` calls, one after the other.
 * @param {() => unknown} call
 * @param {number} calls
 * @param {boolean} sync
 */
export async function pass(call, calls, sync) {
  if (sync) for (let i = 0; i < calls; i++) call();
  else for (let i = 0; i < calls; i++) await call();
}

/**
 * This function does the warm-up passes untimed, then one timed pass, and gives the time of one
 * call in milliseconds.
 * @param {Workload} workload
 * @param {() => unknown} call
 * @param {number} warmup
 * @param {() => number} [clock]
 */
export async function timeWorkload(workload, call, warmup, clock = () => performance.now()) {
  for (let w = 0; w < warmup; w++) await pass(call, workload.calls, workload.sync === true);
  const start = clock();
  await pass(call, workload.calls, workload.sync === true);
  return (clock() - start) / workload.calls;
}

/** This function gives the value of an option of the command line, or `undefined`. */
const optionOf = (/** @type {string[]} */ argv, /** @type {string} */ name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const treeArg = optionOf(argv, "--tree");
  if (treeArg === undefined) {
    console.error("Usage: node scripts/bench-paired-child.mjs --tree <folder> (--list | --input <id> --warmup <n>)");
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
    const m = await loadPackage(tree, workload.pkg);
    if (m === undefined) {
      console.error(`${tree}: the build of the package ${workload.pkg} is missing (${MODULES[workload.pkg].join(", ")}).`);
      process.exit(1);
    }
    const call = await workload.make(m);
    const ms = await timeWorkload(workload, call, warmup);
    // The value maxRSS of Node.js is in kilobytes
    console.log(JSON.stringify({ ms, peakRss: process.resourceUsage().maxRSS * 1024, calls: workload.calls }));
  }
}
