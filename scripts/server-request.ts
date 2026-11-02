#!/usr/bin/env node
/**
 * This script times one request of the procedures server, the I/O included, and the share of the
 * exec calls in it (O90). The requests are synthetic: no record of real traffic exists (O91).
 *
 *   node scripts/server-request.ts --tree <folder> [--ref <sha>] [--repeats <n>] --out <file.json>
 *
 * The folder is a checkout of this repository with a build of `@procedures/server`. The script
 * starts a host of `runProcedureHost()` with the core procedures and the HTTP face in a child
 * process. The parent calls it over loopback with `HttpTransport`, one request after the other.
 *
 * - `one-call`: the request `client.add`. Its exec is `exec-one-call` of the paired bench.
 * - `chain-50`: the request `client.chain` with 50 steps of `client.add`. Its exec is `exec-chain-50`.
 *
 * For each request, the parent also times the same exec in its own process, on `LocalTransport`.
 * The share of the exec is the median exec time over the median request time. Each time is the
 * time per call after a warm-up, as the warm measure of the paired bench gives it.
 */

import { spawn } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The requests: the warm-up calls and the timed calls of each. */
export const REQUESTS = {
  "one-call": { warmup: 2000, calls: 5000 },
  "chain-50": { warmup: 200, calls: 1000 },
} as const;

/** The name of a request. */
export type RequestId = keyof typeof REQUESTS;

/** The quantiles of a list of times, in milliseconds. */
export interface Times {
  readonly calls: number;
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
  readonly mean: number;
}

/** The record of one request: the time of the request, the time of its exec, and the share. */
export interface RequestRecord {
  readonly request: Times;
  readonly exec: Times;
  /** The median exec time over the median request time. */
  readonly execShare: number;
}

/** This function gives a quantile of sorted values, with a linear step between two values. */
export function quantileOf(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** This function gives the quantiles and the mean of a list of times. */
export function timesOf(values: readonly number[]): Times {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    calls: values.length,
    p10: quantileOf(sorted, 0.1),
    median: quantileOf(sorted, 0.5),
    p90: quantileOf(sorted, 0.9),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
  };
}

/** This function gives the record of a request from the times of its requests and of its exec calls. */
export function recordOf(request: readonly number[], exec: readonly number[]): RequestRecord {
  const r = timesOf(request);
  const e = timesOf(exec);
  return { request: r, exec: e, execShare: e.median / r.median };
}

/** This function gives the Markdown table of the records. */
export function markdownOf(ref: string, records: Readonly<Record<string, RequestRecord>>): string {
  const us = (ms: number) => (ms * 1000).toFixed(1);
  return [
    "# Server request",
    "",
    `Head \`${ref}\`. Synthetic requests: no record of real traffic exists. Times per call in µs, after a warm-up.`,
    "",
    "| Request | Request median | Request p10 to p90 | Exec median | Exec p10 to p90 | Exec share |",
    "|---|---|---|---|---|---|",
    ...Object.entries(records).map(([id, x]) => `| \`${id}\` | ${us(x.request.median)} | ${us(x.request.p10)} to ${us(x.request.p90)} | ${us(x.exec.median)} | ${us(x.exec.p10)} to ${us(x.exec.p90)} | ${(x.execShare * 100).toFixed(1)} % |`),
    "",
  ].join("\n");
}

/** This function gives the time of each call, in milliseconds, after the warm-up calls. */
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

// The build of the packages under test has no types for this script
type Module = Record<string, any>;

const load = async (tree: string, file: string): Promise<Module> => import(pathToFileURL(join(tree, file)).href);

/** This function makes a registry with the core procedures, and the exec inputs of the requests. */
function coreOf(c: Module) {
  const registry = new c.ProcedureRegistry();
  for (const procedure of c.allCoreProcedures) registry.register(procedure);
  const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
  const steps = [add(0, 1), ...Array.from({ length: 49 }, () => add({ $ref: "$last" }, 1))];
  return { registry, add, steps };
}

/** The child: it starts the host, writes its address as one line of JSON, and runs until a signal. */
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

/** The parent: it starts the child, times the requests and the exec calls, and stops the child. */
async function measure(tree: string, repeats: number): Promise<Record<RequestId, RequestRecord>> {
  const c = await load(tree, "packages/client/dist/index.js");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve", "--tree", tree], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    const line = await new Promise<string>((done, fail) => {
      createInterface({ input: child.stdout }).once("line", done);
      child.once("exit", (code) => fail(new Error(`The host exited with ${code} before it gave its address`)));
    });
    const { address } = JSON.parse(line) as { address: string };
    const { registry, add, steps } = coreOf(c);
    const local = new c.Client(new c.LocalTransport({ registry })).useRegistry(registry);
    const remote = new c.Client(new c.HttpTransport({ baseUrl: address }));
    const pairs: Record<RequestId, { request: () => Promise<unknown>; exec: () => Promise<unknown> }> = {
      "one-call": { request: () => remote.call(["client", "add"], { a: 1, b: 2 }), exec: () => local.exec(add(1, 2)) },
      "chain-50": { request: () => remote.call(["client", "chain"], { steps }), exec: () => local.exec({ $proc: ["client", "chain"], input: { steps } }) },
    };
    const records = {} as Record<RequestId, RequestRecord>;
    for (const id of Object.keys(REQUESTS) as RequestId[]) {
      const { warmup, calls } = REQUESTS[id];
      const request: number[] = [];
      const exec: number[] = [];
      // The two kinds of call take turns, so a slow phase of the runner touches both
      for (let r = 0; r < repeats; r++) {
        request.push(...(await timeCalls(pairs[id].request, warmup, Math.ceil(calls / repeats))));
        exec.push(...(await timeCalls(pairs[id].exec, warmup, Math.ceil(calls / repeats))));
      }
      records[id] = recordOf(request, exec);
      console.log(`${id}: request ${(records[id].request.median * 1000).toFixed(1)} µs, exec ${(records[id].exec.median * 1000).toFixed(1)} µs`);
    }
    return records;
  } finally {
    child.kill("SIGTERM");
  }
}

const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const treeArg = optionOf(argv, "--tree");
  if (treeArg === undefined) {
    console.error("Usage: node scripts/server-request.ts --tree <folder> [--ref <sha>] [--repeats <n>] --out <file.json>");
    process.exit(2);
  }
  const tree = resolve(treeArg);
  if (argv.includes("--serve")) {
    await serve(tree);
  } else {
    const out = optionOf(argv, "--out");
    if (out === undefined) {
      console.error("The option --out is missing.");
      process.exit(2);
    }
    const ref = optionOf(argv, "--ref") ?? tree;
    const records = await measure(tree, Number(optionOf(argv, "--repeats") ?? "5"));
    writeFileSync(out, `${JSON.stringify({ format: "server-request/1", node: process.version, ref, synthetic: true, requests: REQUESTS, records }, null, 2)}\n`);
    writeFileSync(`${out.replace(/\.json$/, "")}.md`, markdownOf(ref, records));
  }
}
