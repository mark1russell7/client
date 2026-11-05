/**
 * One arm of the change read bench, in its own process:
 * `--arm before|after --case <case> --job <n> --counts <file>`.
 *
 * The child writes the documents of the case, and it reads one time alone with a count of its commands.
 * Then it sends a burst of reads at the same time. A second client reads the counters of the server. The
 * arm `after` is the source of this tree. The arm `before` is the same file at the base commit, which
 * the workflow writes next to it. The child prints the JSON line of `freshRun`, and adds one line to
 * the file of the counts.
 */

import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { BURST_READS, LARGE_BYTES, SMALL_BYTES, parseReadCase, type ReadCount } from "./read-cases.js";

/** The commands of the driver that write. */
const WRITE_COMMANDS = new Set(["insert", "update", "delete", "findAndModify", "bulkWrite"]);

/** The time between two queries of the probe. */
const PROBE_EVERY_MS = 50;

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" } } });
const { arm, case: caseName, job, counts } = values;
if ((arm !== "before" && arm !== "after") || caseName === undefined || job === undefined || counts === undefined) throw new RangeError("this child needs --arm before|after, --case, --job and --counts");
const { kind, documents } = parseReadCase(caseName);

const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");

const source = arm === "before" ? "../src/storage/document-storage.base.ts" : "../src/storage/document-storage.ts";
const { MongoDocumentStorage } = (await import(source)) as typeof import("../src/storage/document-storage.js");

const name = `read_bench_${process.pid}`;
const observer = new MongoClient(url);
const app = new MongoClient(url, { monitorCommands: true });
await Promise.all([observer.connect(), app.connect()]);

const shared = app.db(name);
const storage = new MongoDocumentStorage<{ text: string }>({ collection: "docs", db: () => (kind === "fresh" ? app.db(name) : shared), transactions: "never" });
const text = "x".repeat(documents === 1 ? LARGE_BYTES : SMALL_BYTES);
await storage.setBatch(Array.from({ length: documents }, (_, index): [string, { text: string }] => [`d${index}`, { text }]));

const current = await storage.getChangesSince();
let since = current.version;
if (kind === "one" || kind === "fresh") {
  await storage.set("d0", { text: "y".repeat(SMALL_BYTES) });
} else if (kind === "first") {
  since = "";
}
const version = since === "" ? undefined : since;

const commands: string[] = [];
const count = (event: { commandName: string }): void => void commands.push(event.commandName);
app.on("commandStarted", count);
await storage.getChangesSince(version);
app.off("commandStarted", count);

const connections = async (): Promise<number> => Number((await observer.db("admin").command({ serverStatus: 1 }))["connections"].current);
const connectionsBefore = await connections();

let running = true;
let probeMs = 0;
const probe = (async () => {
  const docs = app.db(name).collection("docs");
  while (running) {
    const began = performance.now();
    await docs.findOne({}, { projection: { _id: 1 } });
    probeMs = Math.max(probeMs, performance.now() - began);
    await sleep(PROBE_EVERY_MS);
  }
})();

const began = performance.now();
// The burst keeps no result: the bench measures the reads, not the memory of a list of results
await Promise.all(Array.from({ length: BURST_READS }, () => storage.getChangesSince(version).then(() => undefined)));
const burstMs = performance.now() - began;
running = false;
await probe;
const connectionsAfter = await connections();

const line: ReadCount = {
  job,
  arm,
  case: caseName,
  burstMs,
  readsPerSecond: (BURST_READS / burstMs) * 1000,
  commands: commands.length,
  writes: commands.filter((command) => WRITE_COMMANDS.has(command)).length,
  probeMs,
  connections: connectionsAfter - connectionsBefore,
};
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await observer.db(name).dropDatabase().catch(() => undefined);
console.log(JSON.stringify({ ms: burstMs }));
process.exit(0);
