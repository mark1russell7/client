/**
 * The gate row of the partition store (roadmap CLI-96): `--jobs <folder> --report <file> --out <file> [--rerun <file>]`.
 * The report is the report of the suite `tenant-partition` over the same jobs. With `--rerun`, this script writes the cases
 * with no read to that file, as `rerun=<JSON list>`, so the workflow starts one more job for each of these cases.
 * The exit code is 0 for a pass, 1 for a block and 2 for no read.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { ModelLimitsFile } from "@mark1russell7/rigor-bench";
import { loadPartitionJobs, partitionGate, partitionReads, type LadderRung } from "./partition-limits.js";

const { values } = parseArgs({
  options: { jobs: { type: "string" }, report: { type: "string" }, out: { type: "string" }, limits: { type: "string" }, rerun: { type: "string" } },
});
if (values.jobs === undefined || values.report === undefined || values.out === undefined) throw new RangeError("this gate needs --jobs, --report and --out");

const limitsPath = values.limits ?? fileURLToPath(new URL("partition-limits.json", import.meta.url));
const limits = JSON.parse(readFileSync(limitsPath, "utf8")) as ModelLimitsFile;
const report = JSON.parse(readFileSync(values.report, "utf8")) as { ladder: readonly LadderRung[] };
const { reads, faults } = partitionReads(loadPartitionJobs([values.jobs]));
const gate = partitionGate(limits, reads, report.ladder);

writeFileSync(values.out, `${JSON.stringify({ ...gate, faults }, null, 2)}\n`);
for (const fault of faults) console.log(`no read: ${fault}`);
console.log(gate.text);
if (values.rerun !== undefined) appendFileSync(values.rerun, `rerun=${JSON.stringify(gate.rerun)}\n`);
process.exit(gate.exitCode);
