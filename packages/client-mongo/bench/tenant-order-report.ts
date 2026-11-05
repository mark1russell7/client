/**
 * The report of the suite `tenant-order` (roadmap CLI-96): `--jobs <folder> --out <file> [--run <id>]`.
 * The exit code is 1 when the copy `today` does not hold the order. That result is a fault of the test or of the queue.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ORDER_COPIES, type OrderRound } from "./tenant-order-cases.js";

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");
const folder = values.jobs;

const jobs = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as { job: string; env: unknown; results: OrderRound[] });
const rounds = jobs.flatMap((job) => job.results);

const copies = ORDER_COPIES.map((copy) => {
  const own = rounds.filter((round) => round.copy === copy);
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const round of own) {
    Object.assign(errors, round.errors);
    for (const [kind, count] of Object.entries(round.counts)) counts[kind] = (counts[kind] ?? 0) + count;
  }
  return {
    copy,
    rounds: own.length,
    wrongNew: own.reduce((sum, round) => sum + round.newIds.wrong, 0),
    wrongExisting: own.reduce((sum, round) => sum + round.existingIds.wrong, 0),
    absent: own.reduce((sum, round) => sum + round.newIds.absent + round.existingIds.absent, 0),
    examples: own.flatMap((round) => [...round.newIds.examples, ...round.existingIds.examples]).slice(0, 5),
    errors,
    counts,
  };
});

writeFileSync(values.out, `${JSON.stringify({ schema: "tenant-order/1", run: values.run ?? "", copies, env: jobs.map(({ job, env }) => ({ job, env })) }, null, 2)}\n`);
for (const one of copies) console.log(`${one.copy}: wrong on new ids ${String(one.wrongNew)}, wrong on existing ids ${String(one.wrongExisting)}, absent ${String(one.absent)}, errors ${String(Object.values(one.counts).reduce((sum, count) => sum + count, 0))}`);
const today = copies.find((one) => one.copy === "today");
if (today === undefined || today.rounds === 0 || today.wrongNew + today.wrongExisting > 0) process.exitCode = 1;
