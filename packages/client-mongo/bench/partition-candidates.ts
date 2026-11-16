/**
 * The candidate limits of the gate row of the partition store (roadmap CLI-96): `--jobs <folder> ... --out <file>`. Each
 * option `--jobs` adds the jobs of one run. The report gives the candidate of each case and CPU model, and the change from
 * the frozen file. With `--freeze --commit <sha> --date <YYYY-MM-DD>`, this script also writes the frozen file. It refuses
 * a looser limit, because a looser limit needs a reason in the file. The nightly does not use `--freeze`. The commit of the
 * stamp is `--commit`, else `GITHUB_SHA`: the commit of the run. With neither, the script refuses, because a stamp names a real commit.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MODEL_LIMIT_RULE, candidateLimits, freezeLimits, limitChanges, type ModelLimitsFile } from "@mark1russell7/rigor-bench";
import { PARTITION_MEASURE, loadPartitionJobs, partitionReads } from "./partition-limits.js";

const { values } = parseArgs({
  options: {
    jobs: { type: "string", multiple: true },
    out: { type: "string" },
    limits: { type: "string" },
    freeze: { type: "boolean", default: false },
    commit: { type: "string" },
    date: { type: "string" },
  },
});
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");
if (values.freeze && (values.commit === undefined || values.date === undefined)) throw new RangeError("--freeze needs --commit and --date");

const limitsPath = values.limits ?? fileURLToPath(new URL("partition-limits.json", import.meta.url));
const frozen = existsSync(limitsPath) ? (JSON.parse(readFileSync(limitsPath, "utf8")) as ModelLimitsFile) : null;
const { reads, faults } = partitionReads(loadPartitionJobs(values.jobs));
const candidates = candidateLimits(reads, MODEL_LIMIT_RULE);
const commit = values.commit ?? process.env.GITHUB_SHA;
if (commit === undefined || commit === "") throw new RangeError("this report needs --commit, or GITHUB_SHA in CI: the commit of the records");
const next = freezeLimits(PARTITION_MEASURE, candidates, { commit, date: values.date ?? new Date().toISOString().slice(0, 10) }, MODEL_LIMIT_RULE);
const changes = frozen === null ? null : limitChanges(frozen, next);

writeFileSync(values.out, `${JSON.stringify({ measure: PARTITION_MEASURE, rule: MODEL_LIMIT_RULE, faults, candidates, changes }, null, 2)}\n`);
for (const fault of faults) console.log(`no read: ${fault}`);
for (const candidate of candidates) {
  const limit = candidate.limit === null ? candidate.status : `${candidate.limit.toFixed(3)} ms (mean ${candidate.mean?.toFixed(3)}, sd ${candidate.sd?.toFixed(3)})`;
  console.log(`${candidate.case} on ${candidate.model}: ${candidate.values.length} jobs, ${limit}`);
}
for (const change of changes?.changes ?? []) console.log(`${change.case} on ${change.model}: ${change.kind} (${change.from ?? "none"} to ${change.to ?? "none"})`);

if (values.freeze) {
  if (changes !== null && changes.refused.length > 0) {
    for (const refused of changes.refused) console.error(`refused: ${refused}`);
    console.error("Add the reason of each looser limit to the file by hand, then examine it again.");
    process.exit(1);
  }
  writeFileSync(limitsPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`The file ${limitsPath} has ${Object.keys(next.limits).length} cases.`);
}
