/**
 * One job of the suite `tenant-pool-cost` (roadmap CLI-96). It reads the cost of idle connections on a ladder.
 * The reading has the connections of the server, the memory of the server and of the client, and the time of other commands.
 * The ladder only goes up, because a server does not give all its memory back. So each job reads one ladder, and `--rounds` has no effect.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { benchEnv } from "@mark1russell7/rigor-bench/fresh";
import { quantile } from "@mark1russell7/rigor-statistics";
import { MongoClient } from "mongodb";
import { POOL_COST_LADDER, type PoolCostRung } from "./tenant-cases.js";

/** The time for the server and the client to settle after a pool opens, in milliseconds. */
const SETTLE_MS = 5000;
/** The commands of each kind that one rung times. */
const TIMED_COMMANDS = 200;

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const cap = Number(values.cap);
if (!Number.isInteger(job) || !(cap > 0) || values.out === undefined) throw new RangeError("this job needs --job, --cap and --out");
const url = process.env["MONGO_TEST_URL"];
if (!url) throw new RangeError("this job needs MONGO_TEST_URL");

const probe = await MongoClient.connect(url, { maxPoolSize: 1 });
const scratch = probe.db(`pool_cost_${String(job)}`).collection<{ at: number }>("timed");
const pools: MongoClient[] = [];
let held = 0;

/** This function gives the p50 and the p99 of one command, one call at a time. */
async function timed(command: () => Promise<unknown>): Promise<{ p50Ms: number; p99Ms: number }> {
  const times: number[] = [];
  for (let index = 0; index < TIMED_COMMANDS; index++) {
    const start = performance.now();
    await command();
    times.push(performance.now() - start);
  }
  return { p50Ms: quantile(times, 0.5), p99Ms: quantile(times, 0.99) };
}

const rungs: PoolCostRung[] = [];
for (const connections of POOL_COST_LADDER) {
  const more = connections - held;
  if (more > 0) {
    const pool = new MongoClient(url, { minPoolSize: more, maxPoolSize: more, maxConnecting: 16 });
    let made = 0;
    pool.on("connectionCreated", () => made++);
    await pool.connect();
    const limit = Date.now() + cap * 1000;
    while (made < more) {
      if (Date.now() > limit) throw new RangeError(`the pool has ${String(made)} of ${String(more)} connections after ${String(cap)} seconds`);
      await sleep(50);
    }
    pools.push(pool);
    held = connections;
  }
  await sleep(SETTLE_MS);
  const status = await probe.db("admin").command({ serverStatus: 1 });
  const ping = await timed(() => probe.db("admin").command({ ping: 1 }));
  const insert = await timed(() => scratch.insertOne({ at: Date.now() }));
  rungs.push({
    connections,
    serverConnections: Number(status["connections"]?.["current"] ?? 0),
    serverResidentMb: Number(status["mem"]?.["resident"] ?? 0),
    serverAllocatedMb: Number(status["tcmalloc"]?.["generic"]?.["current_allocated_bytes"] ?? 0) / 1024 / 1024,
    clientResidentMb: process.memoryUsage().rss / 1024 / 1024,
    pingP50Ms: ping.p50Ms,
    pingP99Ms: ping.p99Ms,
    insertP50Ms: insert.p50Ms,
    insertP99Ms: insert.p99Ms,
  });
}

await Promise.all(pools.map((pool) => pool.close()));
await probe.close();
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), rungs })}\n`);
