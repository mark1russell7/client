#!/usr/bin/env node
/**
 * The flip tests of the checks of `ci.yml` that hold a measure (roadmap CLI-100).
 *
 * A check that cannot fail holds nothing, and a green run does not show that it can fail. This
 * script runs one check on a clean copy, then with one fault. A flip holds when the clean copy
 * passes and the fault fails the check with the message of that bound.
 *
 *   node scripts/check-flips.ts coverage [--out <file>]   the floors of `scripts/coverage.ts`
 *   node scripts/check-flips.ts size [--out <file>]       the three budgets of `seo.spec.ts`
 *   node scripts/check-flips.ts live-close [--out <file>] the end of a live key when its connection closes
 *
 * Each size fault goes just over its own budget, by `MARGIN` bytes. So a flip shows the bound of
 * that budget, not only that a very large page fails. The run reads the sizes from the clean copy.
 * The run also fails when a budget cannot fail on its own: when the page budget stops the test
 * first, or when no route loads a worker. The workflow `check-flips.yml` starts this script.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bytes that a size fault adds over its budget. */
export const MARGIN = 2048;

/** The result of one run of a check. */
export interface Run {
  readonly status: number | null;
  readonly log: string;
}

/** The result of one flip. */
export interface Flip {
  readonly name: string;
  readonly held: boolean;
  readonly reason: string;
}

/** The sizes that one route of `seo.spec.ts` logged, in bytes after gzip. */
export interface RouteSizes {
  readonly route: string;
  readonly total: number;
  readonly script: number;
  readonly worker: number;
  readonly workers: readonly string[];
}

/** The budgets of `seo.spec.ts`, in bytes after gzip. */
export interface Budgets {
  readonly page: number;
  readonly script: number;
  readonly worker: number;
}

/** This function gives the result of a flip from the two runs of a check. */
export function flipOf(name: string, clean: Run, faulty: Run, expected: RegExp): Flip {
  if (clean.status !== 0) return { name, held: false, reason: `the clean copy failed (exit ${clean.status})` };
  if (faulty.status === 0) return { name, held: false, reason: "the fault did not fail the check" };
  if (!expected.test(faulty.log)) return { name, held: false, reason: `the check failed with no message that matches ${expected}` };
  return { name, held: true, reason: `the clean copy passed, and the fault failed the check with ${expected}` };
}

/** This function reads the sizes of each route from the log of `seo.spec.ts`. The last line of a route wins. */
export function sizesOf(log: string): RouteSizes[] {
  const sizes = new Map<string, RouteSizes>();
  const line = /^\s*\/(\S*): (\d+) bytes of gzip, (\d+) bytes of scripts, (\d+) bytes of workers \(-?\d+ under the budget: (.*)\)\s*$/gm;
  for (const [, route, total, script, worker, workers] of log.matchAll(line)) {
    sizes.set(route, {
      route,
      total: Number(total),
      script: Number(script),
      worker: Number(worker),
      workers: workers === "none" ? [] : workers.split(", ").map((item) => item.split(" ")[0]),
    });
  }
  return [...sizes.values()];
}

/** This function reads the budgets from the text of `seo.spec.ts`, so that this script has no copy of them. */
export function budgetsOf(spec: string): Budgets {
  const read = (name: string): number => {
    const match = new RegExp(`const ${name} = (\\d+) \\* 1024;`).exec(spec);
    if (!match) throw new Error(`seo.spec.ts has no ${name}`);
    return Number(match[1]) * 1024;
  };
  return { page: read("PAGE_BUDGET"), script: read("SCRIPT_BUDGET"), worker: read("WORKER_BUDGET") };
}

/** This function gives the reason that a job of `ci.yml` cannot fail the required check, or undefined. */
export function cannotFail(workflow: string, job: string, command: string): string | undefined {
  if (workflow.includes("continue-on-error")) return "the workflow has continue-on-error";
  if (!workflow.includes(command)) return `the workflow does not start ${command}`;
  const needs = /^ {2}ci-ok:[\s\S]*?^ {4}needs: \[(.*)\]$/m.exec(workflow)?.[1].split(/,\s*/) ?? [];
  if (!needs.includes(job)) return `the job ci-ok does not need the job ${job}`;
  return undefined;
}

/** This function gives the bytes to add so that a size goes just over its budget. */
export function overBudget(budget: number, size: number): number {
  return budget - size + MARGIN;
}

/** This function gives the reason that the script budget cannot fail on its own, or undefined. */
export function scriptCannotFailAlone(route: RouteSizes, budgets: Budgets): string | undefined {
  const total = route.total + overBudget(budgets.script, route.script);
  if (total <= budgets.page) return undefined;
  return `/${route.route}: over the script budget the page has ${total} bytes, so the page budget ${budgets.page} stops the test first`;
}

/** This function gives text that gzip cannot make much smaller: its gzip size is near the argument. */
export function fillerOf(bytes: number): string {
  return randomBytes(bytes).toString("base64");
}

/** This function runs a command and keeps its output. */
function run(command: string, args: readonly string[]): Run {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0" } });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
  console.log(`$ ${command} ${args.join(" ")}\nexit ${result.status}\n${log}`);
  return { status: result.status, log };
}

/** This function runs a check with the files of a fault, and then puts the old files back. */
function withFault(files: ReadonlyMap<string, string>, check: () => Run): Run {
  const old = new Map([...files.keys()].map((file) => [file, readOrUndefined(file)]));
  try {
    for (const [file, text] of files) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return check();
  } finally {
    for (const [file, text] of old) {
      if (text === undefined) rmSync(file, { force: true });
      else writeFileSync(file, text);
    }
  }
}

/** This function reads a file, or gives undefined when the file does not exist. */
function readOrUndefined(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** This function gives the flip of the coverage floors, on the package `access` with its floor of 100. */
function coverageFlips(): Flip[] {
  const source = join("packages", "access", "src", "access.ts");
  const check = (): Run => run(process.execPath, ["scripts/coverage.ts", "--packages", "access"]);
  const clean = check();
  const faulty = withFault(new Map([[source, `${readFileSync(source, "utf8")}\nexport function flipFault(): number {\n  return 1;\n}\n`]]), check);
  return [flipOf("the coverage floor", clean, faulty, /access: functions [\d.]+ is below the floor/)];
}

/** This function gives the flip of the end of a live key at a close, with the call of the WebSocket face removed. */
function liveCloseFlips(): Flip[] {
  const name = "the end of a live key at a close";
  const source = join("packages", "client-server", "src", "host", "faces.ts");
  const wiring = "server.publisher?.live?.connectionClosed(connection.id);";
  const check = (): Run => run("pnpm", ["--filter", "@procedures/peer", "exec", "vitest", "run", "src/host/live-state.test.ts"]);
  const clean = check();
  const text = readFileSync(source, "utf8");
  if (text.split(wiring).length !== 2) return [{ name, held: false, reason: "faces.ts does not have the wiring one time" }];
  const faulty = withFault(new Map([[source, text.replace(wiring, "")]]), check);
  return [flipOf(name, clean, faulty, /ends the keys of a connection at its close/)];
}

/** This function gives the flip of each size budget. */
function sizeFlips(): Flip[] {
  const dist = join("packages", "site", "dist");
  const base = "/client/";
  const budgets = budgetsOf(readFileSync(join("packages", "site", "e2e", "seo.spec.ts"), "utf8"));
  const check = (pattern: string): Run => run("pnpm", ["--filter", "@procedures/site", "exec", "playwright", "test", "e2e/seo.spec.ts", "-g", pattern]);
  const clean = check("stays within its budget");
  const sizes = sizesOf(clean.log);
  const docs = sizes.find((item) => item.route === "docs/");
  if (!docs) return [{ name: "the size budgets", held: false, reason: "the clean copy logged no size for /docs/" }];

  // A new file in the head of the page of the route. The test counts each response.
  const withAsset = (tag: (url: string) => string, name: string, text: string): ReadonlyMap<string, string> => {
    const page = join(dist, "docs", "index.html");
    const html = readFileSync(page, "utf8");
    if (!html.includes("</head>")) throw new Error(`${page} has no head`);
    return new Map([
      [join(dist, name), text],
      [page, html.replace("</head>", `${tag(`${base}${name}`)}</head>`)],
    ]);
  };
  const flips: Flip[] = [];
  const page = withAsset((url) => `<link rel="stylesheet" href="${url}">`, "flip-fault.css", `/*${fillerOf(overBudget(budgets.page, docs.total))}*/`);
  flips.push(flipOf("the page budget", clean, withFault(page, () => check("/docs/ stays within its budget")), /the page loads \d+ kB of gzip/));

  const alone = scriptCannotFailAlone(docs, budgets);
  if (alone) flips.push({ name: "the script budget", held: false, reason: alone });
  else {
    const script = withAsset((url) => `<script src="${url}"></script>`, "flip-fault.js", `globalThis.flipFault = "${fillerOf(overBudget(budgets.script, docs.script))}";\n`);
    flips.push(flipOf("the script budget", clean, withFault(script, () => check("/docs/ stays within its budget")), /the scripts are \d+ kB of gzip/));
  }

  const withWorker = sizes.find((item) => item.worker > 0 && item.workers.length > 0 && item.route !== "");
  if (!withWorker) flips.push({ name: "the worker budget", held: false, reason: "no route of the test loads a worker, so this budget cannot fail" });
  else {
    const file = join(dist, withWorker.workers[0].slice(base.length));
    const worker = new Map([[file, `${readFileSync(file, "utf8")}\n/*${fillerOf(overBudget(budgets.worker, withWorker.worker))}*/\n`]]);
    flips.push(flipOf("the worker budget", clean, withFault(worker, () => check(`/${withWorker.route} stays within its budget`)), /the workers are \d+ kB of gzip/));
  }
  return flips;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [kind, ...rest] = process.argv.slice(2);
  const outAt = rest.indexOf("--out");
  const out = outAt >= 0 ? rest[outAt + 1] : undefined;
  if (kind !== "coverage" && kind !== "size" && kind !== "live-close") {
    console.error("Usage: node scripts/check-flips.ts (coverage | size | live-close) [--out <file>]");
    process.exit(2);
  }
  const workflow = readFileSync(join(".github", "workflows", "ci.yml"), "utf8");
  const blocked = kind !== "size" ? cannotFail(workflow, "checks", "node scripts/coverage.ts") : cannotFail(workflow, "site", "@procedures/site test:e2e");
  const flips = blocked ? [{ name: kind, held: false, reason: blocked }] : kind === "coverage" ? coverageFlips() : kind === "live-close" ? liveCloseFlips() : sizeFlips();
  for (const flip of flips) console.log(`${flip.held ? "HELD" : "NOT HELD"}: ${flip.name}: ${flip.reason}`);
  if (out) writeFileSync(out, `${JSON.stringify({ schema: "check-flips/1", kind, flips }, null, 2)}\n`);
  if (!flips.every((flip) => flip.held)) process.exit(1);
}
