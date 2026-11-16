/**
 * The check of the file of frozen limits of the gate row (roadmap CLI-96): `[--before <file>]`. The script fails on a fault of
 * the file and on another measure. With the file of the base as `--before`, it also fails on each change that the rule refuses.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkModelLimits, limitChanges, type ModelLimitsFile } from "@mark1russell7/rigor-bench";
import { PARTITION_MEASURE } from "./partition-limits.js";

const { values } = parseArgs({ options: { before: { type: "string" }, limits: { type: "string" } } });
const read = (path: string): ModelLimitsFile => JSON.parse(readFileSync(path, "utf8")) as ModelLimitsFile;

const head = read(values.limits ?? fileURLToPath(new URL("partition-limits.json", import.meta.url)));
const faults = [...checkModelLimits(head)];
if (head.measure !== PARTITION_MEASURE) faults.push(`the measure of the file is "${head.measure}", not "${PARTITION_MEASURE}"`);
if (values.before !== undefined) {
  const changes = limitChanges(read(values.before), head);
  for (const change of changes.changes) console.log(`${change.case} on ${change.model}: ${change.kind} (${change.from ?? "none"} to ${change.to ?? "none"})${change.reason ? `, ${change.reason}` : ""}`);
  faults.push(...changes.refused);
}
for (const fault of faults) console.error(`fault: ${fault}`);
console.log(faults.length === 0 ? "The file of limits is valid." : `The file of limits has ${faults.length} faults.`);
process.exit(faults.length === 0 ? 0 : 1);
