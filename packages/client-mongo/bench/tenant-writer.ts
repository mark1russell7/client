/**
 * One writer process of the tenant load bench: `--arm <arm> --case <case> --seed <seed> --me <n> --database <name>`.
 *
 * The writer takes each `processes`-th arrival of the plan, so a tenant writes through each process. It has one
 * `Db` object and one client, as an app on one connection has. It writes once to each tenant, prints `ready`, and
 * reads the time of the start from its stdin. It sends each arrival at its planned time and does not wait
 * for a reply, so a slow store cannot slow its load. At the end of the grace it prints its completions.
 */

import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { MongoDocumentStorage } from "../src/storage/document-storage.js";
import { CONTROL_COLLECTIONS, GRACE_MS, TENANT_BYTES, WINDOW_MS, WRITE_CONFLICT, parseTenantCase, tenantOf } from "./tenant-cases.js";
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
if ((arm !== "store" && arm !== "control") || !caseName || !seed || !meText || !database || !url) throw new RangeError("this writer needs --arm, --case, --seed, --me, --database and MONGO_TEST_URL");
const me = Number(meText);
const kase = parseTenantCase(caseName);
const plan = planOf(caseName, seed);

// The server counter of write conflicts leaves out a conflict in a transaction, so the writer counts the replies.
const client = await MongoClient.connect(url, { monitorCommands: true });
let writeConflicts = 0;
client.on("commandFailed", (event) => {
  if ((event.failure as { code?: number }).code === WRITE_CONFLICT) writeConflicts++;
});
const db = client.db(database);

type Store = MongoDocumentStorage<{ text: string }>;
const stores: Store[] = Array.from({ length: kase.active }, (_, tenant) => {
  const collection = arm === "store" ? "docs" : `docs${tenant % CONTROL_COLLECTIONS}`;
  return new MongoDocumentStorage<{ text: string }>({ collection, partition: `t${tenant}`, db: () => db, client: () => client });
});
const text = "x".repeat(TENANT_BYTES);

// The first write of a store in a process notes its floor and makes its indexes. The bench measures the writes after it.
await Promise.all(stores.map((store) => store.set(`first${me}`, { text })));

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

for (let index = me; index < plan.times.length; index += kase.processes) {
  const planned = plan.times[index]!;
  const wait = planned - now();
  // Each turn gives the event loop a pass, so a driver that is behind does not hold back the replies.
  await new Promise((resolve) => (wait > 1 ? setTimeout(resolve, wait) : setImmediate(resolve)));
  const sent = now();
  if (sent > end) break;
  const completion: { index: number; sent: number; done: number | null } = { index, sent, done: null };
  completions.push(completion);
  stores[tenantOf(kase, index, planned)]!.set(`d${index}`, { text }).then(
    () => {
      const done = now();
      if (done <= end) completion.done = done;
    },
    () => {
      failures++;
    }
  );
}

// The grace: stop early when each write has its reply or its failure.
while (now() < end && completions.filter((entry) => entry.done === null).length > failures) await new Promise((resolve) => setTimeout(resolve, 100));

// A write to a pipe can still be in progress when the process ends, so the exit waits for its callback. The line of a high rate is long.
process.stdout.write(`${JSON.stringify({ completions, failures, writeConflicts })}
`, () => process.exit(0));
