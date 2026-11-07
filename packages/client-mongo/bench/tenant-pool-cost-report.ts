/**
 * The report of the suite `tenant-pool-cost`. For each rung of the ladder it gives the median and the range of each measure
 * over the jobs. It also gives the memory for each connection, as the growth from the first rung over the growth of the connections.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import type { PoolCostRung } from "./tenant-cases.js";

interface PoolCostJob {
  readonly job: string;
  readonly env: unknown;
  readonly rungs: readonly PoolCostRung[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");
const folder = values.jobs;

const jobs = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as PoolCostJob);
if (jobs.length === 0) throw new RangeError(`the folder ${folder} has no job`);

const round = (value: number): number => Math.round(value * 100) / 100;
const spread = (rows: readonly number[]): { median: number; low: number; high: number } => ({
  median: round(median(rows)),
  low: round(Math.min(...rows)),
  high: round(Math.max(...rows)),
});
/** This function gives kilobytes for each connection on a rung, from the growth in megabytes since the first rung of a job. */
const perConnection = (job: PoolCostJob, index: number, pick: (rung: PoolCostRung) => number): number => {
  const first = job.rungs[0]!;
  const rung = job.rungs[index]!;
  return ((pick(rung) - pick(first)) * 1024) / Math.max(rung.connections - first.connections, 1);
};

const rungs = jobs[0]!.rungs.map((rung, index) => {
  const of = (pick: (one: PoolCostRung) => number): { median: number; low: number; high: number } => spread(jobs.map((job) => pick(job.rungs[index]!)));
  return {
    connections: rung.connections,
    fillSeconds: of((one) => one.fillSeconds),
    serverConnections: of((one) => one.serverConnections),
    serverResidentMb: of((one) => one.serverResidentMb),
    serverAllocatedMb: of((one) => one.serverAllocatedMb),
    clientResidentMb: of((one) => one.clientResidentMb),
    pingP50Ms: of((one) => one.pingP50Ms),
    pingP99Ms: of((one) => one.pingP99Ms),
    insertP50Ms: of((one) => one.insertP50Ms),
    insertP99Ms: of((one) => one.insertP99Ms),
    serverResidentKbEach: spread(jobs.map((job) => perConnection(job, index, (one) => one.serverResidentMb))),
    clientResidentKbEach: spread(jobs.map((job) => perConnection(job, index, (one) => one.clientResidentMb))),
  };
});

writeFileSync(values.out, `${JSON.stringify({ schema: "store-pool-cost/1", run: values.run, env: jobs.map(({ job, env }) => ({ job, env })), rungs }, null, 2)}\n`);
