/**
 * A paired write child of the speed gate (roadmap CLI-114): `--case <case> --job <n> --round <n> --index <n> --counts <file> --bursts <n>`.
 *
 * The child opens three sources of the store, each on its own database. They are the base (`../base/src`), this
 * tree (`../src`) and a second copy of the base (`../base-aa/src`). The child sends one burst of each source to warm it, and does
 * not count that burst. Then it sends the bursts in the order of `pairedSchedule`, so a slow period of the runner
 * falls on each source of a pair. Each source of each pair sends at least `--bursts` bursts.
 *
 * The child adds one line for each source to the file of the counts, with the time of each burst in order.
 * Its last line on the standard output is the two records: `{ "candidate": PairedTime, "aa": PairedTime }`.
 */

import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openSource, type WriteSource } from "./write-burst.js";
import { parseWriteCase } from "./write-cases.js";
import { WRITE_LABELS, pairedRecords, pairedSchedule, type WriteLabel } from "./write-paired.js";

const { values } = parseArgs({ options: { case: { type: "string" }, job: { type: "string" }, round: { type: "string" }, index: { type: "string" }, counts: { type: "string" }, bursts: { type: "string" } } });
const { case: caseName, job, counts } = values;
const round = Number(values.round);
const index = Number(values.index);
const bursts = Number(values.bursts);
if (caseName === undefined || job === undefined || counts === undefined) throw new RangeError("this child needs --case, --job, --round, --index, --counts and --bursts");
if (!Number.isInteger(round) || round < 0 || !Number.isInteger(index) || index < 0 || !Number.isInteger(bursts) || bursts < 1) throw new RangeError("--round and --index need a whole number of 0 or more, and --bursts a whole number above 0");
const { shape, writes } = parseWriteCase(caseName);

const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");

const ROOTS: Readonly<Record<WriteLabel, string>> = { before: "../base/src", after: "../src", copy: "../base-aa/src" };
const sources = {} as Record<WriteLabel, WriteSource>;
for (const label of WRITE_LABELS) sources[label] = await openSource(ROOTS[label], url, `write_bench_${process.pid}_${label}`, shape, writes);

for (const label of WRITE_LABELS) await sources[label].burst("warm");
// Each step gives each source of a pair two bursts
const order = pairedSchedule(round, index, Math.ceil(bursts / 2));
const times: number[] = [];
for (const [step, { label }] of order.entries()) times.push(await sources[label].burst(`s${step}`));

for (const label of WRITE_LABELS) appendFileSync(counts, `${JSON.stringify({ ...sources[label].count(job, label, caseName), round, warm: true })}\n`);
for (const label of WRITE_LABELS) await sources[label].close();
console.log(JSON.stringify(pairedRecords(caseName, round, index, order, times)));
process.exit(0);
