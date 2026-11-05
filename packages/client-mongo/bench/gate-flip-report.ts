/**
 * The read of the flip of the speed gate of the store (roadmap CLI-94): `--jobs <folder> --out <file> [--run <id>] [--limits <file>]`.
 * For each case, the report gives the gate with the flip records of that case and the no-fault records of the other cases. The gate holds the case when the outcome is "block" and the case is in the blocks.
 * The report also gives the gate with only the no-fault records, which reads "pass" when the limits do not block a same-source head, and the largest limit of each case that still blocks its flip.
 * A case whose flip reads "no read" is report only. The file of `--limits` holds an object of limits by case, in place of the limits of `gate-limit.json`.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import type { JobRecords, PairedTime } from "@mark1russell7/rigor-bench";
import { flipFactor } from "./gate-flip-factor.js";
import { READ_CASES, WRITE_CASES, storeGate, type GateLimit } from "./gate-verdict.js";

interface FlipFile extends JobRecords {
  readonly flip: readonly PairedTime[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" }, limits: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const gate = JSON.parse(readFileSync(new URL("./gate-limit.json", import.meta.url), "utf8")) as GateLimit;
const limits = values.limits === undefined ? gate.limits : (JSON.parse(readFileSync(values.limits, "utf8")) as Record<string, number>);
const folder = values.jobs;
const files = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as FlipFile);

const round = (value: number): number => Number(value.toFixed(4));
const read = (jobs: readonly JobRecords[], at: Readonly<Record<string, number>>) => storeGate(jobs, { limits: at, reportOnly: gate.reportOnly, failures: 0, attempt: 1 });
const withFlip = (name: string): JobRecords[] =>
  files.map(({ job, candidate, flip, aa }) => ({ job, aa, candidate: [...candidate.filter((row) => row.case !== name), ...flip.filter((row) => row.case === name)] }));

/** This function gives the median over the rounds of the pair of the arm, which is its log ratio over the base less the log ratio of the A/A. */
function ratioOf(rows: (file: FlipFile) => readonly PairedTime[], name: string): number {
  const pairs = files.flatMap((file) => {
    const aa = new Map(file.aa.filter((row) => row.case === name).map((row) => [row.round, Math.log(row.b / row.a)]));
    return rows(file)
      .filter((row) => row.case === name && aa.has(row.round))
      .map((row) => Math.log(row.b / row.a) - (aa.get(row.round) ?? 0));
  });
  return Math.exp(median(pairs));
}

const blocks = (name: string, jobs: readonly JobRecords[], at: Readonly<Record<string, number>>): boolean => {
  const result = read(jobs, at);
  const entry = result.reported.find((row) => row.case === name);
  return entry === undefined ? result.outcome === "block" && result.verdict.blocks.includes(name) : entry.outcome === "beyond";
};

/** This function gives the largest limit of the case that still blocks its flip, to a thousandth of a log, or 1 when no limit over 1 blocks. */
function largestBlocking(name: string, jobs: readonly JobRecords[]): number {
  let low = 0;
  let high = Math.log(4);
  if (!blocks(name, jobs, { ...limits, [name]: Math.exp(0.001) })) return 1;
  while (high - low > 0.001) {
    const middle = (low + high) / 2;
    if (blocks(name, jobs, { ...limits, [name]: Math.exp(middle) })) low = middle;
    else high = middle;
  }
  return Math.exp(low);
}

const clean = read(files, limits);
const cases = [...READ_CASES, ...WRITE_CASES].map((name) => {
  const jobs = withFlip(name);
  const result = read(jobs, limits);
  const reportOnly = gate.reportOnly.includes(name);
  const entry = (reportOnly ? result.reported : result.verdict.cases).find((row) => row.case === name);
  return {
    case: name,
    reportOnly,
    factor: flipFactor(name),
    limit: limits[name],
    flipRatio: round(ratioOf((file) => file.flip, name)),
    cleanRatio: round(ratioOf((file) => file.candidate, name)),
    held: blocks(name, jobs, limits),
    outcome: entry?.outcome,
    read: entry?.read,
    look: entry?.look,
    gateOutcome: result.outcome,
    largestBlockingLimit: round(largestBlocking(name, jobs)),
  };
});

const report = { schema: "store-gate-flip/1", run: values.run ?? "", limits, clean: { outcome: clean.outcome, text: clean.text }, cases };
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`no-fault copy: ${clean.outcome}`);
for (const row of cases) console.log(`${row.case}: factor ${row.factor}, read ${row.flipRatio}, no-fault ${row.cleanRatio}, limit ${row.limit}, ${row.held ? "held" : "not held"} (${row.outcome}), blocks up to ${row.largestBlockingLimit}`);
