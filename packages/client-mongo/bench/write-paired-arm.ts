/**
 * A paired write child of the speed gate (roadmap CLI-114): `--case <case> --job <n> --round <n> --index <n> --counts <file> --bursts <n>`.
 *
 * The child opens three sources of the store, each on its own database. They are the base (`../base/src`), this
 * tree (`../src`) and a second copy of the base (`../base-aa/src`). The child sends one burst of each source to warm it, and does
 * not count that burst. Then `pairedChild` of rigor-bench sends the bursts in its order. Thus a slow period of
 * the runner falls on each source of a pair. Each source of each pair sends at least `--bursts` bursts.
 *
 * The child adds one line for each source to the file of the counts, with the time of each burst in order.
 * Its last line on the standard output is the two records: `{ "candidate": PairedTime, "aa": PairedTime }`.
 */

import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CHILD_SOURCES, pairedChild, type ChildSource } from "@mark1russell7/rigor-bench";
import { openSource, type WriteSource } from "./write-burst.js";
import { parseWriteCase } from "./write-cases.js";

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

// The label of each source in the file of the counts: the labels of the fresh write children
const LABELS: Readonly<Record<ChildSource, string>> = { base: "before", candidate: "after", copy: "copy" };
const ROOTS: Readonly<Record<ChildSource, string>> = { base: "../base/src", candidate: "../src", copy: "../base-aa/src" };
const sources = {} as Record<ChildSource, WriteSource>;
for (const source of CHILD_SOURCES) sources[source] = await openSource(ROOTS[source], url, `write_bench_${process.pid}_${LABELS[source]}`, shape, writes);

// Each step gives each source of a pair two bursts
const child = await pairedChild({
  case: caseName,
  round,
  offset: index,
  steps: Math.ceil(bursts / 2),
  sample: { base: (tag) => sources.base.burst(tag), candidate: (tag) => sources.candidate.burst(tag), copy: (tag) => sources.copy.burst(tag) },
});

for (const source of CHILD_SOURCES) appendFileSync(counts, `${JSON.stringify({ ...sources[source].count(job, LABELS[source], caseName), round, warm: true })}\n`);
for (const source of CHILD_SOURCES) await sources[source].close();
console.log(JSON.stringify(child.records));
process.exit(0);
