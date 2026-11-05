/**
 * One writer process of the tenant load bench: `--arm <arm> --case <case> --seed <seed> --me <n> --database <name>`.
 *
 * The writer takes each `processes`-th arrival of the plan, so a tenant writes through each process. It has one
 * `Db` object and one client, as an app on one connection has. It writes once to each tenant, prints `ready`, and
 * reads the time of the start from its stdin. It sends each arrival at its planned time and does not wait
 * for a reply, so a slow store cannot slow its load. At the end of the grace it prints its completions.
 */

import { monitorEventLoopDelay } from "node:perf_hooks";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import type { MongoDocumentStorage } from "../src/storage/document-storage.js";
import { BURST_AT_MS, BURST_MS, CONTROL_COLLECTIONS, COPY_ARMS, FIRST_LOAD_SPLIT, GRACE_MS, TENANT_ARMS, TENANT_BYTES, WARM_POOL, WINDOW_MS, WRITE_CONFLICT, firstLoadCollection, firstLoadOf, parseTenantCase, tenantOf, type FirstLoadWrite, type TenantArm } from "./tenant-cases.js";
import { planOf } from "./tenant-plan.js";

const { values } = parseArgs({
  options: {
    arm: { type: "string" },
    case: { type: "string" },
    seed: { type: "string" },
    me: { type: "string" },
    database: { type: "string" },
  },
});
const { arm, case: caseName, seed, me: meText, database } = values;
const url = process.env["MONGO_TEST_URL"];
if (!TENANT_ARMS.includes(arm as TenantArm) || !caseName || !seed || !meText || !database || !url) throw new RangeError("this writer needs --arm, --case, --seed, --me, --database and MONGO_TEST_URL");
const me = Number(meText);
// An arm of the suite `tenant-separate` or `tenant-forms` uses a copy of the store, which its run writes next to the source
const source = COPY_ARMS.includes(arm as string) ? `../src/storage/document-storage.${arm}.ts` : "../src/storage/document-storage.ts";
const { MongoDocumentStorage: Storage } = (await import(source)) as typeof import("../src/storage/document-storage.js");
const kase = parseTenantCase(caseName);
const WARM_LIMIT_MS = 30_000;
const plan = planOf(caseName, seed);

// The server counter of write conflicts leaves out a conflict in a transaction, so the writer counts the replies.
const client = new MongoClient(url, { monitorCommands: true, ...(kase.warm ? { minPoolSize: WARM_POOL } : {}) });
let writeConflicts = 0;
client.on("commandFailed", (event) => {
  if ((event.failure as { code?: number }).code === WRITE_CONFLICT) writeConflicts++;
});
// The pool of the client: the connections that it makes and the calls that wait for a connection.
let connectionsMade = 0;
let checkoutWaiting = 0;
let checkoutWaitingPeak = 0;
client.on("connectionCreated", () => connectionsMade++);
client.on("connectionCheckOutStarted", () => {
  checkoutWaiting++;
  checkoutWaitingPeak = Math.max(checkoutWaitingPeak, checkoutWaiting);
});
client.on("connectionCheckedOut", () => checkoutWaiting--);
client.on("connectionCheckOutFailed", () => checkoutWaiting--);
// The times of the commands in the second that a read holds open. The driver gives each time, from the send to the reply.
let commandTimes: number[] | null = null;
client.on("commandSucceeded", (event) => commandTimes?.push(event.duration));
await client.connect();
const db = client.db(database);
// The pool of a case `-warm` makes its connections in the background, so this process waits for them, with a limit.
if (kase.warm) {
  const limit = Date.now() + WARM_LIMIT_MS;
  while (connectionsMade < WARM_POOL) {
    if (Date.now() > limit) throw new RangeError(`the pool has ${String(connectionsMade)} of ${String(WARM_POOL)} connections`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const percentileOf = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((one, other) => one - other);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
};

type Store = MongoDocumentStorage<{ text: string }>;
const stores: Store[] = Array.from({ length: kase.active }, (_, tenant) => {
  const collection = arm === "control" ? `docs${tenant % CONTROL_COLLECTIONS}` : "docs";
  return new Storage<{ text: string }>({ collection, partition: `t${tenant}`, db: () => db, client: () => client });
});
const text = "x".repeat(TENANT_BYTES);

// The first write of a store in a process notes its floor and makes its indexes. The bench measures the writes after it.
// One collection takes them one at a time, because an arm with no queue has nothing else that holds them back.
if (arm === "control") await Promise.all(stores.map((store) => store.set(`first${me}`, { text })));
else for (const store of stores) await store.set(`first${me}`, { text });

// A first load is the first write of its stores in this process, so its stores start in the load. Its collections exist, as they do in a live app.
if (kase.firstLoads > 0) {
  for (const collection of FIRST_LOAD_SPLIT.keys()) {
    const name = firstLoadCollection(arm as TenantArm, { load: 0, collection });
    await new Storage<{ text: string }>({ collection: name, partition: "warm", db: () => db, client: () => client }).set(`first${me}`, { text });
  }
}
const loadStores = new Map<string, Store>();
/** This function gives the store of a first load in one collection, and starts it at its first write. */
const loadStore = (write: FirstLoadWrite): Store => {
  const key = `${write.load}/${write.collection}`;
  const known = loadStores.get(key);
  if (known) return known;
  const store: Store = new Storage<{ text: string }>({ collection: firstLoadCollection(arm as TenantArm, write), partition: `f${write.load}`, db: () => db, client: () => client });
  loadStores.set(key, store);
  return store;
};

const lines = createInterface({ input: process.stdin });
const startAt = await new Promise<number>((resolve) => {
  lines.once("line", (line) => resolve(Number(line)));
  console.log("ready");
});
lines.close();

writeConflicts = 0;
const toStart = startAt - Date.now();
if (toStart > 0) await new Promise((resolve) => setTimeout(resolve, toStart));
const zero = performance.now();
const now = (): number => performance.now() - zero;

const end = WINDOW_MS + GRACE_MS;
const completions: { index: number; sent: number; done: number | null }[] = [];
let failures = 0;
const errors: Record<string, number> = {};
const cpuAtStart = process.cpuUsage();
let writerBusy = 0;
const busyTimer = setTimeout(() => {
  const used = process.cpuUsage(cpuAtStart);
  writerBusy = (used.user + used.system) / 1000 / WINDOW_MS;
}, WINDOW_MS);

/** The processor and the event loop of this process in one second of the load. */
interface SecondRead {
  busy: number;
  loopP99Ms: number;
  loopMaxMs: number;
  connectionsMade: number;
  checkoutWaitingPeak: number;
  sends: number;
  commands: number;
  commandP50Ms: number;
  commandP99Ms: number;
}
const loop = monitorEventLoopDelay({ resolution: 5 });
let sends = 0;
let worstLateMs = 0;
let worstLateAtMs = 0;
/** This function reads one second of the load. A late timer makes the second longer, so the share divides by the true time. */
const readSecond = (from: number): SecondRead => {
  const read: SecondRead = { busy: 0, loopP99Ms: 0, loopMaxMs: 0, connectionsMade: 0, checkoutWaitingPeak: 0, sends: 0, commands: 0, commandP50Ms: 0, commandP99Ms: 0 };
  setTimeout(() => {
    const startedAt = now();
    const cpu = process.cpuUsage();
    const connections = connectionsMade;
    const sendsBefore = sends;
    commandTimes = [];
    checkoutWaitingPeak = checkoutWaiting;
    loop.reset();
    loop.enable();
    setTimeout(() => {
      loop.disable();
      const used = process.cpuUsage(cpu);
      read.busy = (used.user + used.system) / 1000 / (now() - startedAt);
      read.loopP99Ms = loop.percentile(99) / 1e6;
      read.loopMaxMs = loop.max / 1e6;
      read.connectionsMade = connectionsMade - connections;
      read.checkoutWaitingPeak = checkoutWaitingPeak;
      read.sends = sends - sendsBefore;
      read.commands = commandTimes?.length ?? 0;
      read.commandP50Ms = percentileOf(commandTimes ?? [], 0.5);
      read.commandP99Ms = percentileOf(commandTimes ?? [], 0.99);
      commandTimes = null;
    }, BURST_MS);
  }, from);
  return read;
};
// One second lies between the two reads, because a late timer makes a read longer and the two share one monitor.
const secondBefore = readSecond(BURST_AT_MS - 2 * BURST_MS);
const burstSecond = readSecond(BURST_AT_MS);
const secondAfter = readSecond(BURST_AT_MS + 2 * BURST_MS);

for (let index = me; index < plan.times.length; index += kase.processes) {
  const planned = plan.times[index]!;
  const wait = planned - now();
  // Each turn gives the event loop a pass, so a driver that is behind does not hold back the replies.
  await new Promise((resolve) => (wait > 1 ? setTimeout(resolve, wait) : setImmediate(resolve)));
  const sent = now();
  if (sent > end) break;
  sends++;
  if (sent - planned > worstLateMs) {
    worstLateMs = sent - planned;
    worstLateAtMs = planned;
  }
  const completion: { index: number; sent: number; done: number | null } = { index, sent, done: null };
  completions.push(completion);
  const loadWrite = firstLoadOf(kase, index, planned);
  (loadWrite ? loadStore(loadWrite) : stores[tenantOf(kase, index, planned)]!).set(kase.oneId ? "d0" : `d${index}`, { text }).then(
    () => {
      const done = now();
      if (done <= end) completion.done = done;
    },
    (error: unknown) => {
      failures++;
      const kind = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      errors[kind] = (errors[kind] ?? 0) + 1;
    }
  );
}

// The grace: stop early when each write has its reply or its failure.
while (now() < end && completions.filter((entry) => entry.done === null).length > failures) await new Promise((resolve) => setTimeout(resolve, 100));

// A write to a pipe can still be in progress when the process ends, so the exit waits for its callback. The line of a high rate is long.
clearTimeout(busyTimer);
process.stdout.write(`${JSON.stringify({ completions, failures, writeConflicts, errors, writerBusy, secondBefore, burstSecond, secondAfter, worstLateMs, worstLateAtMs })}
`, () => process.exit(0));
