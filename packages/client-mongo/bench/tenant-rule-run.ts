/**
 * One job of the test of the rule (roadmap CLI-96): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * A round of a case runs two writer processes and one reader process on a new database. Then it compares the ids of the replies with the ids that the reader saw.
 * The job also runs the two orders from the cluster time, with two clients in fixed steps, because the order of the steps is the test.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv } from "@mark1russell7/rigor-bench/fresh";
import { MongoClient, type Timestamp } from "mongodb";
import { writeFormCopies, type FormCopy } from "./tenant-form-copies.js";
import { RULE_CASES, RULE_HOLD_MS, type RuleCase, type RuleRound } from "./tenant-rule-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
const url = process.env["MONGO_TEST_URL"];
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || values.out === undefined || !url) throw new RangeError("this job needs --job, --rounds, --cap, --out and MONGO_TEST_URL");

writeFormCopies();

interface Child {
  readonly end: () => void;
  readonly result: Promise<string>;
}

/** This function starts one process and gives its last line of stdout. */
function start(file: string, args: readonly string[]): Child {
  const child = spawn(process.execPath, ["--import", "tsx", file, ...args], { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, FORM_HOLD_MS: String(RULE_HOLD_MS) } });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const timer = setTimeout(() => child.kill("SIGKILL"), cap * 1000);
  const result = new Promise<string>((resolve, reject) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim().split("\n").at(-1) ?? "");
      else reject(new Error(`${file} ended with the code ${String(code)}`));
    });
  });
  return { end: () => child.stdin.write("end\n"), result };
}

async function runRound(kase: RuleCase, round: number): Promise<RuleRound> {
  const database = `rule_${job}_${round}_${kase.id.replaceAll("-", "_")}`;
  const writer = (copy: FormCopy, me: number): Child => start("bench/tenant-rule-writer.ts", ["--copy", copy, "--me", String(me), "--database", database]);
  const reader = start("bench/tenant-rule-reader.ts", ["--copy", kase.reader, "--database", database]);
  const writers = kase.writers.map(writer);
  const written = (await Promise.all(writers.map((child) => child.result))).map((line) => JSON.parse(line) as { replied: string[]; errors: Record<string, number> });
  reader.end();
  const read = JSON.parse(await reader.result) as { seen: string[]; deltas: number; laterFulls: number };
  const seen = new Set(read.seen);
  const replied = written.flatMap((one) => one.replied);
  const missed = replied.filter((id) => !seen.has(id));
  const errors: Record<string, number> = {};
  for (const one of written) for (const [kind, count] of Object.entries(one.errors)) errors[kind] = (errors[kind] ?? 0) + count;
  return { case: kase.id, round, replied: replied.length, missed: missed.length, examples: missed.slice(0, 5), deltas: read.deltas, laterFulls: read.laterFulls, errors };
}

interface Stamped {
  readonly _id: string;
  readonly stamp: Timestamp;
}

/** This function gives the time of the cluster now. */
async function clusterTime(client: MongoClient): Promise<Timestamp> {
  const reply = await client.db("admin").command({ ping: 1 });
  return reply["operationTime"] as Timestamp;
}

/**
 * The order from a stamp of the cluster time, in fixed steps. A write takes its stamp and stays open. A later write ends.
 * A reader reads up to the time now. Then the first write ends. Its stamp is below the version of the reader, so the reader misses it.
 */
async function stampOrder(): Promise<RuleRound> {
  const first = await MongoClient.connect(url!);
  const second = await MongoClient.connect(url!);
  try {
    const name = `rule_${job}_stamp`;
    const docs = await first.db(name).createCollection<Stamped>("docs");
    const session = first.startSession();
    session.startTransaction();
    await docs.insertOne({ _id: "open", stamp: await clusterTime(first) }, { session });
    await second.db(name).collection<Stamped>("docs").insertOne({ _id: "later", stamp: await clusterTime(second) });
    const version = await clusterTime(second);
    const before = await docs.find({ stamp: { $lte: version } }).toArray();
    await session.commitTransaction();
    await session.endSession();
    const after = await docs.find({ stamp: { $gt: version } }).toArray();
    const seen = new Set([...before, ...after].map((doc) => doc._id));
    const missed = ["open", "later"].filter((id) => !seen.has(id));
    await first.db(name).dropDatabase();
    return { case: "formc-stamp", round: 0, replied: 2, missed: missed.length, examples: missed, deltas: 2, laterFulls: 0, errors: {} };
  } finally {
    await first.close();
    await second.close();
  }
}

/** The order from the commits, in the same steps: a change stream gives the events in the order of the commits, and its token is the version. */
async function streamOrder(): Promise<RuleRound> {
  const first = await MongoClient.connect(url!);
  const second = await MongoClient.connect(url!);
  try {
    const name = `rule_${job}_stream`;
    const docs = first.db(name).collection<Stamped>("docs");
    await docs.insertOne({ _id: "made", stamp: await clusterTime(first) });
    const stream = docs.watch();
    await stream.tryNext();
    const session = first.startSession();
    session.startTransaction();
    await docs.insertOne({ _id: "open", stamp: await clusterTime(first) }, { session });
    await second.db(name).collection<Stamped>("docs").insertOne({ _id: "later", stamp: await clusterTime(second) });
    const seen = new Set<string>();
    const event = await stream.next();
    if (event.operationType === "insert") seen.add(event.documentKey._id);
    const token = stream.resumeToken;
    await stream.close();
    await session.commitTransaction();
    await session.endSession();
    const resumed = docs.watch([], { resumeAfter: token });
    const next = await resumed.next();
    if (next.operationType === "insert") seen.add(next.documentKey._id);
    await resumed.close();
    const missed = ["open", "later"].filter((id) => !seen.has(id));
    await first.db(name).dropDatabase();
    return { case: "formc-stream", round: 0, replied: 2, missed: missed.length, examples: missed, deltas: 2, laterFulls: 0, errors: {} };
  } finally {
    await first.close();
    await second.close();
  }
}

const results: RuleRound[] = [await stampOrder(), await streamOrder()];
for (let round = 0; round < rounds; round++) {
  for (const kase of RULE_CASES) {
    const result = await runRound(kase, (job - 1) * rounds + round);
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), results })}\n`);
process.exit(0);
