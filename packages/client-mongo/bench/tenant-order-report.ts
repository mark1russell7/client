/**
 * The report of the suite `tenant-order` (roadmap CLI-96): `--jobs <folder> --out <file> [--run <id>]`.
 * The exit code is 1 when the copy `today` or the copy with the rule of each id does not hold the order, or when the held row reads no fault on a copy with no rule. In the last case the row cannot fail.
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
    wrongHeldNew: own.reduce((sum, round) => sum + round.heldNew.wrong, 0),
    wrongHeldExisting: own.reduce((sum, round) => sum + round.heldExisting.wrong, 0),
    absent: own.reduce((sum, round) => sum + round.newIds.absent + round.existingIds.absent + round.heldNew.absent + round.heldExisting.absent, 0),
    examples: own.flatMap((round) => [...round.newIds.examples, ...round.existingIds.examples, ...round.heldNew.examples, ...round.heldExisting.examples]).slice(0, 5),
    errors,
    counts,
  };
});

writeFileSync(values.out, `${JSON.stringify({ schema: "tenant-order/2", run: values.run ?? "", copies, env: jobs.map(({ job, env }) => ({ job, env })) }, null, 2)}\n`);
for (const one of copies) console.log(`${one.copy}: wrong on new ids ${String(one.wrongNew)}, wrong on existing ids ${String(one.wrongExisting)}, wrong when held ${String(one.wrongHeldNew)} new and ${String(one.wrongHeldExisting)} existing, absent ${String(one.absent)}, errors ${String(Object.values(one.counts).reduce((sum, count) => sum + count, 0))}`);
const wrongOf = (one: (typeof copies)[number]): number => one.wrongNew + one.wrongExisting + one.wrongHeldNew + one.wrongHeldExisting;
const heldOf = (one: (typeof copies)[number]): number => one.wrongHeldNew + one.wrongHeldExisting;
const noFault = copies.filter((one) => one.copy === "today" || one.copy === "formbboundid");
const noRule = copies.filter((one) => one.copy === "formb" || one.copy === "formbbound");
if (noFault.some((one) => one.rounds === 0 || wrongOf(one) > 0) || noRule.some((one) => heldOf(one) === 0)) process.exitCode = 1;
