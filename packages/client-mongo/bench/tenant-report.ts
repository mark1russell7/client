/**
 * The report of the tenant load bench: `--jobs <folder> --out <file> [--run <id>]`. For each case and arm this script
 * gives the median and the worst of each measure over the children. It also gives a reading against the first guess of
 * the ladder, and the limit of each rung of the ladder. A rate that is a first guess gives only a provisional pass. A driver that lost its schedule gives no reading.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, poolRecords } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { TENANT_ARMS, parseTenantCase, type TenantCount } from "./tenant-cases.js";
import { mergeJobFiles, type JobFile } from "./tenant-jobs.js";
import { ABORT_RULE, LIMIT_RULE, READING_RULE, READING_RULE_CHANGE, abortReadingOf, abortShareOf, commitsPerWriteOf, cpuOf, limitOf, readingOf } from "./tenant-reading.js";

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const names = readdirSync(folder);
// A CI job of one case gives one file for each case of a job, so the files of a job join first.
const jobs = mergeJobFiles(names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile));
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as TenantCount);

const round = (value: number, digits = 1): number => Number(value.toFixed(digits));
const summary = (rows: readonly TenantCount[], pick: (row: TenantCount) => number): { median: number; worst: number } => ({
  median: round(median(rows.map(pick))),
  worst: round(Math.max(...rows.map(pick))),
});

/** This function gives the share of the transactions that met a write conflict, as the median over the children. */
const conflictShare = (rows: readonly TenantCount[]): number => round(median(rows.map((row) => row.writeConflicts / Math.max(row.transactionsStarted, 1))), 3);

/** This function gives the median share of each processor. A record from before this field has no processors. */
function coresOf(rows: readonly TenantCount[]): { core: number; busy: number; iowait: number }[] {
  const shares = rows.flatMap((row) => row.cores ?? []);
  return [...new Set(shares.map((share) => share.core))].sort((a, b) => a - b).map((core) => {
    const own = shares.filter((share) => share.core === core);
    return { core, busy: round(median(own.map((share) => share.busy)), 3), iowait: round(median(own.map((share) => share.iowait)), 3) };
  });
}

/** This function gives the middle reading of a field over the children, or null when no child has this reading. */
const fieldMedian = (rows: readonly TenantCount[], pick: (row: TenantCount) => number | undefined): number | null => {
  const values = rows.map(pick).filter((value): value is number => value !== undefined);
  return values.length === 0 ? null : round(median(values), 3);
};

/** This function gives the time of the first writes of the writers, before the load: the median and the worst. The value is null for old records. */
function warmSummary(rows: readonly TenantCount[]): { median: number; worst: number } | null {
  const values = rows.flatMap((row) => row.warmMs ?? []);
  return values.length === 0 ? null : { median: Math.round(median(values)), worst: Math.max(...values) };
}

/** This function gives the processor time of the children: the median for each write, and the worst share of the runner and of one writer. */
function cpuSummary(rows: readonly TenantCount[]): { writerMsPerWrite: number | null; runnerMsPerWrite: number | null; runnerFull: { median: number | null; worst: number | null }; writerWorst: number | null } {
  const readings = rows.map(cpuOf);
  const middle = (pick: (reading: ReturnType<typeof cpuOf>) => number | null): number | null => {
    const values = readings.map(pick).filter((value): value is number => value !== null);
    return values.length === 0 ? null : round(median(values), 3);
  };
  const worst = (pick: (reading: ReturnType<typeof cpuOf>) => number | null): number | null => {
    const values = readings.map(pick).filter((value): value is number => value !== null);
    return values.length === 0 ? null : Math.max(...values);
  };
  return {
    writerMsPerWrite: middle((reading) => reading.writerMsPerWrite),
    runnerMsPerWrite: middle((reading) => reading.runnerMsPerWrite),
    runnerFull: { median: middle((reading) => reading.runnerFull), worst: worst((reading) => reading.runnerFull) },
    writerWorst: worst((reading) => reading.writerWorst),
  };
}

/** This function gives the count of each kind of failure over the children. */
function errorsOf(rows: readonly TenantCount[]): Record<string, number> {
  const all: Record<string, number> = {};
  for (const row of rows) for (const [kind, count] of Object.entries(row.errors ?? {})) all[kind] = (all[kind] ?? 0) + count;
  return all;
}

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const ratios = new Map(caseIntervals(pool.candidate).map((entry) => [entry.case, entry]));
const aaRatios = new Map(caseIntervals(pool.aa).map((entry) => [entry.case, entry]));
// A band needs five cases, and the suite `tenant-separate` has four: its A/A stays beside each case
const band = aaRatios.size >= 5 ? aaBand(pool.aa) : null;
const baseOf = jobs[0]?.base ?? "control";
/** This function gives the ratio of the p99 of an arm to the p99 of the base in a case. */
const overBase = (arm: string, name: string): object | undefined => {
  if (arm === baseOf || jobs.some((job) => job.pairs?.[arm] === undefined)) return undefined;
  const own = poolRecords(jobs.map(({ job, aa, pairs }) => ({ job, candidate: pairs![arm]!, aa })));
  const entry = caseIntervals(own.candidate).find((interval) => interval.case === name);
  return entry ? { ratio: round(entry.ratio, 3), low: round(entry.low, 3), high: round(entry.high, 3) } : undefined;
};

const caseNames = [...new Set(counts.map((row) => row.case))];
const cases = caseNames.map((name) => {
  const { rate, processes, burst, apart, tmpfs, active, firstLoads } = parseTenantCase(name);
  const arms = TENANT_ARMS.filter((arm) => counts.some((row) => row.case === name && row.arm === arm)).map((arm) => {
    const rows = counts.filter((row) => row.case === name && row.arm === arm);
    return {
      arm,
      children: rows.length,
      reading: readingOf(rows),
      writesPerSecond: summary(rows, (row) => row.writesPerSecond),
      p50Ms: summary(rows, (row) => row.p50Ms),
      p95Ms: summary(rows, (row) => row.p95Ms),
      p99Ms: summary(rows, (row) => row.p99Ms),
      othersP99Ms: summary(rows, (row) => row.othersP99Ms),
      drift: summary(rows, (row) => row.drift),
      driverWorstMs: Math.max(...rows.map((row) => row.driverWorstMs ?? 0)),
      failures: rows.reduce((sum, row) => sum + row.failures, 0),
      unfinished: rows.reduce((sum, row) => sum + row.unfinished, 0),
      unsent: rows.reduce((sum, row) => sum + row.unsent, 0),
      writeConflicts: summary(rows, (row) => row.writeConflicts),
      transactionsStarted: summary(rows, (row) => row.transactionsStarted),
      transactionsAborted: summary(rows, (row) => row.transactionsAborted),
      commitsPerWrite: rows.map(commitsPerWriteOf),
      transactionsOpen: rows.map((row) => row.transactionsOpen ?? null),
      conflictShare: conflictShare(rows),
      abortShare: { median: round(median(rows.map(abortShareOf)), 4), worst: round(Math.max(...rows.map(abortShareOf)), 4) },
      aborts: abortReadingOf(rows, processes),
      cores: coresOf(rows),
      cpu: cpuSummary(rows),
      warmMs: warmSummary(rows),
      p99OverBase: overBase(arm, name),
      disk: {
        device: rows.find((row) => row.disk)?.disk?.device ?? null,
        writesPerSecond: fieldMedian(rows, (row) => row.disk?.writesPerSecond),
        mbPerSecond: fieldMedian(rows, (row) => row.disk?.mbPerSecond),
        msPerWrite: fieldMedian(rows, (row) => row.disk?.msPerWrite),
        busy: fieldMedian(rows, (row) => row.disk?.busy),
      },
      journal: { syncsPerSecond: fieldMedian(rows, (row) => row.journal?.syncsPerSecond), msPerSync: fieldMedian(rows, (row) => row.journal?.msPerSync) },
      writerBusy: fieldMedian(rows.flatMap((row) => (row.writerBusy ?? []).map((value) => ({ ...row, writerBusy: [value] }))), (row) => row.writerBusy?.[0]),
      errors: errorsOf(rows),
      server: rows.some((row) => row.server)
        ? {
            serverWriteMs: fieldMedian(rows, (row) => row.server?.serverWriteMs ?? undefined),
            serverWrites: fieldMedian(rows, (row) => row.server?.serverWrites ?? undefined),
            collectionLockWaitMs: fieldMedian(rows, (row) => row.server?.lockWaitMs.collection ?? undefined),
            globalLockWaitMs: fieldMedian(rows, (row) => row.server?.lockWaitMs.global ?? undefined),
            appEvictionMs: fieldMedian(rows, (row) => row.server?.appEvictionMs ?? undefined),
            queuedWritersMax: fieldMedian(rows, (row) => row.server?.queuedWritersMax ?? undefined),
            ticketsAvailableMin: fieldMedian(rows, (row) => row.server?.ticketsAvailableMin ?? undefined),
            dirtyMbMax: fieldMedian(rows, (row) => row.server?.dirtyMbMax ?? undefined),
          }
        : null,
      firstLoad: firstLoads === 0 ? undefined : {
        writes: fieldMedian(rows, (row) => row.firstLoadWrites),
        slowestLoadMs: summary(rows, (row) => row.firstLoadMs ?? 0),
        p99Ms: summary(rows, (row) => row.firstLoadP99Ms ?? 0),
      },
    };
  });
  const ratio = ratios.get(name);
  const aa = aaRatios.get(name);
  return {
    case: name,
    rate,
    processes,
    burst,
    firstLoads,
    apart,
    tmpfs,
    activeTenants: active,
    tenantsOfRung: active * 10,
    arms,
    p99StoreOverControl: ratio ? { ratio: round(ratio.ratio, 3), low: round(ratio.low, 3), high: round(ratio.high, 3) } : undefined,
    p99Aa: aa ? { ratio: round(aa.ratio, 3), low: round(aa.low, 3), high: round(aa.high, 3) } : undefined,
  };
});

// The cost of the conflicts is in the tail, so each row sets the p99 beside the conflict share of its process count
const tail = cases
  .filter((entry) => !entry.burst && entry.firstLoads === 0)
  .flatMap((entry) => entry.arms.map((arm) => ({ rate: entry.rate, processes: entry.processes, apart: entry.apart, tmpfs: entry.tmpfs, arm: arm.arm, conflictShare: arm.conflictShare, p50Ms: arm.p50Ms.median, p99Ms: arm.p99Ms.median, reading: arm.reading.outcome })))
  .sort((a, b) => a.arm.localeCompare(b.arm) || Number(a.apart) - Number(b.apart) || Number(a.tmpfs) - Number(b.tmpfs) || a.rate - b.rate || a.processes - b.processes);

// The rungs of the arm `partition` (roadmap CLI-96). A rung passes with a provisional pass and, with two processes or more, the abort rule.
// A rung that does not pass names its limit: a full runner says nothing about the partition, so that rung gives no reading.
const ladder = cases.flatMap((entry) =>
  entry.arms
    .filter((arm) => arm.arm === "partition")
    .map((arm) => ({ arm, limit: limitOf({ outcome: arm.reading.outcome, abortsHold: arm.aborts?.holds ?? null, runnerFull: arm.cpu.runnerFull.worst, writerWorst: arm.cpu.writerWorst }) }))
    .map(({ arm, limit }) => ({
      case: entry.case,
      rate: entry.rate,
      processes: entry.processes,
      activeTenants: entry.activeTenants,
      reading: arm.reading.outcome,
      reasons: [...arm.reading.reasons, ...(arm.aborts && !arm.aborts.holds ? [`a child aborted ${arm.aborts.worst} of its transactions, over ${arm.aborts.limit}`] : [])],
      p99Ms: arm.p99Ms,
      writesPerSecond: arm.writesPerSecond,
      abortShare: arm.abortShare,
      cpu: arm.cpu,
      limit: limit.limit,
      limitReasons: limit.reasons,
      outcome: limit.limit === null ? "provisional pass" : limit.limit === "runner" ? "no reading" : "fail",
    }))
);

const report = {
  schema: "tenant-bench/1",
  run: values.run ?? "",
  rule: READING_RULE,
  abortRule: ABORT_RULE,
  limitRule: LIMIT_RULE,
  ruleChange: READING_RULE_CHANGE,
  aa: band ? { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases } : null,
  tail,
  ladder,
  cases,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
