/**
 * A change event over the BSON limit (roadmap CLI-107). A write of a small field can make an event
 * of more than 16 MiB. The event holds the images of the document before and after the write. The
 * server fails the read of that event, so a stream that opens again at the same token fails again.
 *
 * Each row writes such an event, then a small write, and reads when the watcher reaches the small
 * write. Each row prints a line `large-event {json}`: the wait, the count of failures, the code and
 * the text of the first error. A flip row also prints the trace of its watcher: each log line with its time. The rows with no large event hold the other side: a row that cannot
 * pass proves nothing.
 *
 * The rows `-no-split` are the flip rows: the same write with `splitLargeEvents: false`. Without the
 * split stage, the watcher must stop with one call of `onError` and the code 10334, and the hints
 * stream must give a gap. A fix that hides the fault turns these rows red.
 *
 * These rows need `MONGO_TEST_URL` with a replica set. On a single server, they skip.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db, type Document } from "mongodb";
import { ms, type LogFields, type Logger, type LogLevel } from "@procedures/client";
import { watchDatabaseChanges, type WatchDatabaseChangesOptions } from "./database-changes.js";
import { MongoDocumentStorage } from "./document-storage.js";
import { ViewMaterializer, type MaterializedView } from "./materializer.js";
import { watchStorageChanges } from "./storage-hints.js";

const url = process.env["MONGO_TEST_URL"];

const MEGABYTE = 1024 * 1024;
/** Two images of this size pass the limit of 16 MiB. One image does not. */
const IMAGE_MEGABYTES = 9;
/** A document with two fields of this size holds under 16 MiB, and with its changed field the event does not. */
const FIELD_MEGABYTES = 7.9;
/** The longest wait of a row for the small write. A watcher that passes the event takes under 2 s. */
const REACH_MS = 8_000;
const ROW_TIMEOUT_MS = 60_000;
const ERROR_TEXT_CHARACTERS = 300;
const FAST_BACKOFF = { initialDelay: ms(20), maxDelay: ms(200), jitter: 0 };

const SMALL_ID = "small";
/** The count of stream ends that a row prints. */
const ENDS_SHOWN = 8;
/** The count of log lines in the trace of a flip row. */
const TRACE_SHOWN = 16;
const LARGE_ID = "large";

/** One log line of a watcher. `atMs` is the time since the start of the logger. */
type Line = { level: LogLevel; message: string; fields: LogFields; atMs: number };

let client: MongoClient;
let replicaSet = false;
const dbs: Db[] = [];
let next = 0;

function filler(megabytes: number): string {
  return "x".repeat(Math.floor(megabytes * MEGABYTE));
}

function newDb(): Db {
  next += 1;
  const db = client.db(`large_event_${process.pid}_${next}`);
  dbs.push(db);
  return db;
}

function recordingLogger(): Logger & { lines: Line[] } {
  const lines: Line[] = [];
  const from = Date.now();
  return { lines, log: (level, message, fields) => void lines.push({ level, message, fields, atMs: Date.now() - from }) };
}

/** The trace of a watcher: the level, the message, the time and the code of each of its first log lines. A gap in the times shows a wait. */
function traceOf(lines: readonly Line[]): Document[] {
  return lines.slice(0, TRACE_SHOWN).map(({ level, message, fields, atMs }) => ({ atMs, level, message: message.slice(0, ERROR_TEXT_CHARACTERS), code: fields["code"], attempt: fields["attempt"], resumeToken: fields["resumeToken"] }));
}

/** This function waits for the check, up to `REACH_MS`, and gives the result and the wait. */
async function reach(check: () => boolean | Promise<boolean>): Promise<{ reached: boolean; waitMs: number }> {
  const from = Date.now();
  for (;;) {
    if (await check()) return { reached: true, waitMs: Date.now() - from };
    if (Date.now() - from > REACH_MS) return { reached: false, waitMs: Date.now() - from };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The failures in the lines of a logger: the count, and the code and the text of the first. */
function failuresOf(lines: readonly Line[]): Document {
  const failures = lines.filter((line) => line.level === "warn" && line.fields["error"] !== undefined);
  const first = failures[0]?.fields;
  const error = first?.["error"] as { message?: unknown } | undefined;
  return {
    failures: failures.length,
    code: first?.["code"],
    text: String(error?.message ?? error ?? "").slice(0, ERROR_TEXT_CHARACTERS),
  };
}

/** The warn lines of a logger: the count, and the message of the first. A stream that ends with no error logs no field `error`. */
function warningsOf(lines: readonly Line[]): Document {
  const warnings = lines.filter((line) => line.level === "warn");
  return { warnings: warnings.length, firstWarning: warnings[0]?.message.slice(0, ERROR_TEXT_CHARACTERS) };
}

/** The first ends of a stream that a logger tells: the try, the code, the labels and the reason of each. */
function endsOf(lines: readonly Line[]): Document[] {
  return lines
    .filter((line) => line.level === "warn")
    .slice(0, ENDS_SHOWN)
    .map(({ message, fields }) => {
      const error = fields["error"] as { code?: unknown; codeName?: unknown; errorLabels?: unknown; name?: unknown } | undefined;
      return {
        message: message.slice(0, ERROR_TEXT_CHARACTERS),
        attempt: fields["attempt"],
        resumeToken: fields["resumeToken"],
        reason: typeof fields["reason"] === "string" ? fields["reason"].slice(0, ERROR_TEXT_CHARACTERS) : undefined,
        error: error === undefined ? undefined : { name: error.name, code: error.code, codeName: error.codeName, labels: error.errorLabels },
      };
    });
}

function printRow(row: Document): void {
  console.log(`large-event ${JSON.stringify(row)}`);
}

/** The write of a row: it gives a collection a document, and changes it. */
type Write = (db: Db, collection: string) => Promise<void>;

/** Two images of 9 MiB: the update changes one small field. */
const twoImages: Write = async (db, collection) => {
  await db.createCollection(collection, { changeStreamPreAndPostImages: { enabled: true } });
  await db.collection(collection).insertOne({ _id: LARGE_ID as never, _part: "t1", kind: "a", n: 1, body: filler(IMAGE_MEGABYTES) });
  await db.collection(collection).updateOne({ _id: LARGE_ID as never }, { $set: { n: 2 } });
};

/** A large changed field: the lookup and the description of the update each hold it. No image is stored. */
const largeField: Write = async (db, collection) => {
  await db.collection(collection).insertOne({ _id: LARGE_ID as never, body: filler(FIELD_MEGABYTES) });
  await db.collection(collection).updateOne({ _id: LARGE_ID as never }, { $set: { other: filler(FIELD_MEGABYTES) } });
};

/** The same steps as `twoImages`, with a small document. */
const smallImages: Write = async (db, collection) => {
  await db.createCollection(collection, { changeStreamPreAndPostImages: { enabled: true } });
  await db.collection(collection).insertOne({ _id: LARGE_ID as never, _part: "t1", kind: "a", n: 1 });
  await db.collection(collection).updateOne({ _id: LARGE_ID as never }, { $set: { n: 2 } });
};

const WATCHER_ROWS: readonly (readonly [name: string, write: Write, options: Partial<WatchDatabaseChangesOptions>])[] = [
  ["watcher-images", twoImages, { fullDocument: "updateLookup", fullDocumentBeforeChange: "whenAvailable" }],
  ["watcher-lookup", largeField, { fullDocument: "updateLookup" }],
  ["watcher-no-lookup", largeField, {}],
  ["watcher-no-fault", smallImages, { fullDocument: "updateLookup", fullDocumentBeforeChange: "whenAvailable" }],
];

const HINT_ROWS: readonly (readonly [name: string, write: Write])[] = [
  ["hints-images", twoImages],
  ["hints-no-fault", smallImages],
];

describe.runIf(url)("a change event over the BSON limit", () => {
  beforeAll(async () => {
    client = new MongoClient(url!);
    await client.connect();
    const hello = await client.db("admin").command({ hello: 1 });
    replicaSet = typeof hello["setName"] === "string";
  });

  afterAll(async () => {
    for (const db of dbs) await db.dropDatabase().catch(() => undefined);
    await client?.close();
  });

  it.each(WATCHER_ROWS)("watchDatabaseChanges reaches the next write: %s", { timeout: ROW_TIMEOUT_MS }, async (name, write, options) => {
    if (!replicaSet) return;
    const db = newDb();
    const collection = "items";
    const logger = recordingLogger();
    const changes: Document[] = [];
    const errors: unknown[] = [];
    const watch = watchDatabaseChanges(db, {
      ...options,
      onChange: (change) => void changes.push(change),
      onError: (error) => void errors.push(error),
      backoff: FAST_BACKOFF,
      logger,
    });
    try {
      await watch.ready;
      await write(db, collection);
      await db.collection(collection).insertOne({ _id: SMALL_ID as never });
      const { reached, waitMs } = await reach(() => changes.some((change) => change["documentKey"]?._id === SMALL_ID));
      const updates = changes.filter((change) => change["operationType"] === "update").length;
      printRow({ name, reached, waitMs, updates, onError: errors.length, stopped: watch.stopped, ...failuresOf(logger.lines) });
      expect(reached).toBe(true);
    } finally {
      await watch.stop();
    }
  });

  it.each(HINT_ROWS)("watchStorageChanges reaches the next write: %s", { timeout: ROW_TIMEOUT_MS }, async (name, write) => {
    if (!replicaSet) return;
    const db = newDb();
    const collection = "items";
    const logger = recordingLogger();
    const hints: string[] = [];
    const storage = new MongoDocumentStorage<Document>({ collection, db: async () => db });
    const watch = watchStorageChanges(storage, (_topic, hint) => void hints.push(JSON.stringify(hint)), { rawWrites: "ignore", backoff: FAST_BACKOFF, logger });
    try {
      await watch.ready;
      await write(db, collection);
      await db.collection(collection).insertOne({ _id: SMALL_ID as never });
      const { reached, waitMs } = await reach(() => hints.some((hint) => hint.includes(SMALL_ID)));
      printRow({ name, reached, waitMs, hints: hints.length, ...failuresOf(logger.lines), ...warningsOf(logger.lines) });
      expect(reached).toBe(true);
    } finally {
      await watch.stop();
    }
  });

  it("watchDatabaseChanges stops once with no split stage: watcher-images-no-split", { timeout: ROW_TIMEOUT_MS }, async () => {
    if (!replicaSet) return;
    const db = newDb();
    const collection = "items";
    const logger = recordingLogger();
    const changes: Document[] = [];
    const errors: unknown[] = [];
    const watch = watchDatabaseChanges(db, {
      fullDocument: "updateLookup",
      fullDocumentBeforeChange: "whenAvailable",
      splitLargeEvents: false,
      onChange: (change) => void changes.push(change),
      onError: (error) => void errors.push(error),
      backoff: FAST_BACKOFF,
      logger,
    });
    try {
      await watch.ready;
      await twoImages(db, collection);
      await db.collection(collection).insertOne({ _id: SMALL_ID as never });
      const { reached, waitMs } = await reach(() => watch.stopped);
      const error = errors[0] as { code?: unknown; resumeToken?: unknown } | undefined;
      printRow({ name: "watcher-images-no-split", reached, waitMs, onError: errors.length, stopped: watch.stopped, errorCode: error?.code, ...failuresOf(logger.lines), trace: traceOf(logger.lines) });
      expect(errors).toHaveLength(1);
      expect(error?.code).toBe(10334);
      expect(error?.resumeToken).toBeDefined();
      expect(watch.stopped).toBe(true);
    } finally {
      await watch.stop();
    }
  });

  it("watchStorageChanges gives a gap with no split stage: hints-images-no-split", { timeout: ROW_TIMEOUT_MS }, async () => {
    if (!replicaSet) return;
    const db = newDb();
    const collection = "items";
    const logger = recordingLogger();
    const hints: string[] = [];
    const storage = new MongoDocumentStorage<Document>({ collection, db: async () => db });
    const watch = watchStorageChanges(storage, (_topic, hint) => void hints.push(JSON.stringify(hint)), { rawWrites: "ignore", backoff: FAST_BACKOFF, logger, splitLargeEvents: false });
    try {
      await watch.ready;
      await twoImages(db, collection);
      await db.collection(collection).insertOne({ _id: SMALL_ID as never });
      const { reached, waitMs } = await reach(() => hints.some((hint) => hint.includes('"reset":true')));
      printRow({ name: "hints-images-no-split", reached, waitMs, hints: hints.length, ...failuresOf(logger.lines), ...warningsOf(logger.lines), ends: endsOf(logger.lines), trace: traceOf(logger.lines) });
      expect(reached).toBe(true);
    } finally {
      await watch.stop();
    }
  });

  it("the materializer reaches the next write: materializer-images", { timeout: ROW_TIMEOUT_MS }, async () => {
    if (!replicaSet) return;
    const db = newDb();
    const collection = "items";
    const logs: string[] = [];
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: (level, message) => void logs.push(`${level}: ${message}`) });
    const view: MaterializedView = {
      _id: "sums",
      _part: "t1",
      collections: [collection],
      pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }],
      targetCollection: "sums",
    };
    await db.collection("_aggregations").insertOne(view as never);
    await views.start();
    try {
      await twoImages(db, collection);
      await db.collection(collection).insertOne({ _id: SMALL_ID as never, _part: "t1", kind: "b", n: 5 });
      const totals = async (): Promise<unknown[]> => (await db.collection("sums").find({}).toArray()).map((row) => row["total"]);
      const { reached, waitMs } = await reach(async () => {
        const seen = await totals();
        return seen.includes(5) && seen.includes(2);
      });
      const ended = logs.filter((line) => line.startsWith("warn") && line.includes("ended"));
      printRow({ name: "materializer-images", reached, waitMs, totals: await totals(), ended: ended.length, text: ended[0]?.slice(0, ERROR_TEXT_CHARACTERS) });
      expect(reached).toBe(true);
    } finally {
      await views.stop();
    }
  });
});
