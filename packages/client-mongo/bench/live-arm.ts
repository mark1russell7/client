/**
 * One arm of the live state bench, in its own process: `--arm store|live --case w<writers> --job <n> --counts <file>`.
 * The server, the writers and the reader share this process, over real WebSocket connections. The child prints the JSON
 * line of `freshRun`: its time is the reader p99.
 */

import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { quantile } from "@mark1russell7/rigor-statistics";
import {
  Client,
  ProcedureServer,
  WebSocketTransport,
  collectionChangeTopic,
  collectionTopicRule,
  createCollectionProcedures,
  createEventBus,
  createRegistry,
  liveTopic,
  pathToMethod,
  seconds,
  type LiveEvent,
} from "@procedures/client";
import { WebSocketServerTransport } from "@procedures/client/node";
import { MongoClient } from "mongodb";
import { MongoDocumentStorage } from "../src/storage/document-storage.js";
import { GRACE_MS, LOAD_MS, SETS_PER_SECOND, plannedSets, writersOf, type LiveArm, type LiveCount } from "./live-cases.js";

/** The name of the collection and of the live topic. */
const NAME = "bench_presence";

/** The filler of a value, so a value has about 200 bytes, as a value with a cursor and a name has. */
const FILLER = "x".repeat(140);

interface BenchValue {
  readonly sentAt: number;
  readonly writer: number;
  readonly x: number;
  readonly y: number;
  readonly filler: string;
}

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" } } });
const { arm, case: caseName, job, counts } = values;
if ((arm !== "store" && arm !== "live") || caseName === undefined || job === undefined || counts === undefined) {
  throw new RangeError("this child needs --arm store|live, --case, --job and --counts");
}
const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");
const writers = writersOf(caseName);

const database = `live_bench_${process.pid}`;
const mongo = new MongoClient(url);
await mongo.connect();
const db = mongo.db(database);
const admin = mongo.db("admin");
const storage = new MongoDocumentStorage<BenchValue>({ collection: NAME, db: () => db });

const registry = createRegistry();
registry.registerAll(createCollectionProcedures(NAME));
const server = new ProcedureServer({
  registry,
  autoRegister: true,
  collections: { [NAME]: storage },
  events: {
    bus: createEventBus(),
    topics: [...collectionTopicRule(NAME), "live.*"],
    live: { expiresAfter: seconds(15), admitSet: () => ({ by: "bench" }) },
  },
});
const http = createServer();
server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
await server.start();
await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
const { port } = http.address() as AddressInfo;

function connect(): Client {
  return new Client({
    transport: new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } }),
    throwOnError: true,
  });
}

/** This function adds the store writes of the bench database from the command `top`. */
async function storeWrites(): Promise<number> {
  const { totals } = await admin.command({ top: 1 });
  let sum = 0;
  for (const [namespace, row] of Object.entries(totals as Record<string, { insert?: { count: number }; update?: { count: number }; remove?: { count: number } }>)) {
    if (namespace.startsWith(`${database}.`)) sum += (row.insert?.count ?? 0) + (row.update?.count ?? 0) + (row.remove?.count ?? 0);
  }
  return sum;
}

const committed = async (): Promise<number> => Number((await admin.command({ serverStatus: 1 }))["transactions"]?.["totalCommitted"] ?? 0);

const readerTimes: number[] = [];
const replyTimes: number[] = [];
const errors: Record<string, { count: number; text: string }> = {};
let readerValues = 0;
let readerEvents = 0;
let readerReads = 0;
let readerBytes = 0;
let replied = 0;
let failures = 0;

function failed(error: unknown): void {
  failures += 1;
  const text = error instanceof Error ? error.message : String(error);
  const kind = (error as { code?: string }).code ?? text.slice(0, 40);
  const known = errors[kind];
  if (known) known.count += 1;
  else errors[kind] = { count: 1, text: text.slice(0, 300) };
}

function heardValue(value: BenchValue): void {
  readerValues += 1;
  readerTimes.push(performance.now() - value.sentAt);
}

const reader = connect();
let stopReader: () => void = () => undefined;

if (arm === "live") {
  const subscription = reader.subscribe<LiveEvent<BenchValue>>([liveTopic(NAME)], (event) => {
    readerEvents += 1;
    readerBytes += JSON.stringify(event).length;
    for (const { value } of event.set) heardValue(value);
  }, { onError: failed });
  await subscription.ready;
  stopReader = () => subscription();
} else {
  // The reader reads after each hint, and one more time when a hint comes during a read. It has no window of its own.
  const changes = pathToMethod(["collections", NAME, "changes"]);
  interface Changes { readonly version: string; readonly changed: ReadonlyArray<{ readonly id: string; readonly value: BenchValue }> }
  let since = (await reader.call<Record<string, never>, Changes>(changes, {})).version;
  let reading = false;
  let again = false;
  const read = async (): Promise<void> => {
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    do {
      again = false;
      try {
        const delta = await reader.call<{ since: string }, Changes>(changes, { since });
        since = delta.version;
        readerReads += 1;
        readerBytes += JSON.stringify(delta).length;
        for (const { value } of delta.changed) heardValue(value);
      } catch (error) {
        failed(error);
      }
    } while (again);
    reading = false;
  };
  const subscription = reader.subscribe<unknown>([collectionChangeTopic(NAME)], () => {
    readerEvents += 1;
    void read();
  }, { onError: failed });
  await subscription.ready;
  stopReader = () => subscription();
}

const clients = Array.from({ length: writers }, connect);
const setMethod = arm === "live" ? pathToMethod(["live", "set"]) : pathToMethod(["collections", NAME, "set"]);
const topic = liveTopic(NAME);

function send(client: Client, writer: number, round: number): void {
  const sentAt = performance.now();
  const value: BenchValue = { sentAt, writer, x: round, y: writer, filler: FILLER };
  const payload = arm === "live" ? { topic, key: `w${writer}`, value } : { id: `w${writer}`, value };
  void client.call<typeof payload, unknown>(setMethod, payload).then(
    () => {
      replied += 1;
      replyTimes.push(performance.now() - sentAt);
    },
    failed,
  );
}

const beforeWrites = await storeWrites();
const beforeCommitted = await committed();
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const beforeCpu = process.cpuUsage();

// Each writer has its own turn in the period, and sends on a fixed schedule whatever the replies do
const period = 1000 / SETS_PER_SECOND;
const start = performance.now();
await Promise.all(clients.map(async (client, writer) => {
  const offset = (writer / writers) * period;
  for (let round = 0; round < (LOAD_MS / 1000) * SETS_PER_SECOND; round += 1) {
    const wait = start + offset + round * period - performance.now();
    if (wait > 0) await sleep(wait);
    send(client, writer, round);
  }
}));
await sleep(GRACE_MS);

const cpu = process.cpuUsage(beforeCpu);
loop.disable();
stopReader();
const afterWrites = await storeWrites();
const afterCommitted = await committed();

const at = (list: readonly number[], p: number): number => (list.length === 0 ? Number.POSITIVE_INFINITY : quantile(list, p));
const readerP99Ms = at(readerTimes, 0.99);
const line: LiveCount = {
  job: Number(job),
  arm: arm as LiveArm,
  case: caseName,
  planned: plannedSets(writers),
  replied,
  failures,
  storeWrites: afterWrites - beforeWrites,
  transactions: afterCommitted - beforeCommitted,
  replyP50Ms: at(replyTimes, 0.5),
  replyP99Ms: at(replyTimes, 0.99),
  readerP50Ms: at(readerTimes, 0.5),
  readerP95Ms: at(readerTimes, 0.95),
  readerP99Ms,
  readerValues,
  readerEvents,
  readerReads,
  readerBytes,
  cpuMs: (cpu.user + cpu.system) / 1000,
  loopP99Ms: loop.percentile(99) / 1e6,
  errors,
};
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await mongo.db(database).dropDatabase().catch(() => undefined);
const ms = Number.isFinite(readerP99Ms) ? Math.max(readerP99Ms, 0.001) : LOAD_MS + GRACE_MS;
process.stdout.write(`${JSON.stringify({ ms })}\n`, () => process.exit(0));
