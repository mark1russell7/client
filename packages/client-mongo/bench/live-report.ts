/**
 * The report of the suite `live`: `--jobs <folder> --out <file> [--run <id>]`. For each case and arm this script gives
 * the median and the worst of each count over the children, the store writes for each set, and the processor time for
 * each set. The report only reports: no limit comes from one run.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { LIVE_ARMS, LIVE_CASES, keptUp, type LiveCount } from "./live-cases.js";

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const rows = readdirSync(folder)
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as LiveCount);

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const summary = (own: readonly LiveCount[], pick: (row: LiveCount) => number): { median: number; worst: number } => ({
  median: round(median(own.map(pick))),
  worst: round(Math.max(...own.map(pick))),
});

const cases = LIVE_CASES.map((name) => ({
  case: name,
  arms: LIVE_ARMS.map((arm) => {
    const own = rows.filter((row) => row.case === name && row.arm === arm);
    if (own.length === 0) return { arm, children: 0 };
    const errors = new Map<string, { count: number; text: string }>();
    for (const row of own) {
      for (const [kind, { count, text }] of Object.entries(row.errors)) {
        errors.set(kind, { count: (errors.get(kind)?.count ?? 0) + count, text });
      }
    }
    return {
      arm,
      children: own.length,
      keptUp: own.filter(keptUp).length,
      planned: own[0]!.planned,
      replied: summary(own, (row) => row.replied),
      failures: summary(own, (row) => row.failures),
      storeWrites: summary(own, (row) => row.storeWrites),
      storeWritesPerSet: summary(own, (row) => row.storeWrites / row.planned),
      transactions: summary(own, (row) => row.transactions),
      replyP50Ms: summary(own, (row) => row.replyP50Ms),
      replyP99Ms: summary(own, (row) => row.replyP99Ms),
      readerP50Ms: summary(own, (row) => row.readerP50Ms),
      readerP95Ms: summary(own, (row) => row.readerP95Ms),
      readerP99Ms: summary(own, (row) => row.readerP99Ms),
      readerValues: summary(own, (row) => row.readerValues),
      readerEvents: summary(own, (row) => row.readerEvents),
      readerReads: summary(own, (row) => row.readerReads),
      readerBytes: summary(own, (row) => row.readerBytes),
      cpuMsPerSet: summary(own, (row) => row.cpuMs / row.planned),
      loopP99Ms: summary(own, (row) => row.loopP99Ms),
      errors: Object.fromEntries(errors),
    };
  }),
}));

writeFileSync(values.out, `${JSON.stringify({ suite: "live", run: values.run, children: rows.length, cases }, null, 2)}\n`);
console.log(`The live state bench: ${rows.length} children in ${LIVE_CASES.length} cases.`);
