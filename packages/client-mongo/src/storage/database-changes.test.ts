/**
 * The change watcher of a whole database (roadmap CLI-88). The rules of the resume, the backoff, the
 * stop and the logger run against a fake change stream, so their tests always run. The tests against
 * a real server need a replica set: set `MONGO_TEST_URL` to one (CI has a replica-set job). On a
 * single server, they skip.
 */
import { EventEmitter } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi, type TestContext } from "vitest";
import { MongoClient, type Db, type Document } from "mongodb";
import { ms, type Clock, type LogFields, type Logger, type LogLevel } from "@procedures/client";
import { watchDatabaseChanges, type WatchDatabaseChangesOptions } from "./database-changes.js";

/** The error of a server, with its code. */
const serverError = (code: number, message: string): Error => Object.assign(new Error(message), { code });

/** The token of the event at an index of the log of the fake, and of a batch without events at a length of the log. */
const eventToken = (index: number): Document => ({ _data: `e${index}` });
const batchToken = (length: number): Document => ({ _data: `b${length}` });

/**
 * A stream of the fake: it gives the events of the log after its start, one for each `tryNext()`.
 * Without an event, `tryNext()` waits for the next event, an error or an empty batch. The first
 * `tryNext()` is the open: it fails with `openError` of the server, else it emits `resumeTokenChanged`.
 */
class FakeStream extends EventEmitter {
  closed = false;
  private started = false;
  resumeToken: unknown;
  private waiter: { resolve: (change: Document | null) => void; reject: (error: unknown) => void } | undefined;

  constructor(
    private readonly server: FakeChangeServer,
    private position: number,
    readonly pipeline: Document[],
    readonly options: Document
  ) {
    super();
  }

  async tryNext(): Promise<Document | null> {
    if (this.closed) throw new Error("the change stream is closed");
    if (!this.started) {
      this.started = true;
      if (this.server.openError !== undefined) throw this.server.openError;
      this.emit("resumeTokenChanged", batchToken(this.position));
    }
    const change = this.server.log[this.position];
    if (change) {
      this.position++;
      this.resumeToken = change["_id"];
      return change;
    }
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  /** This method ends the wait of `tryNext()`: with the next event, an empty batch, or an error. */
  wake(error?: unknown): void {
    const waiter = this.waiter;
    if (!waiter) return;
    this.waiter = undefined;
    if (error !== undefined) return waiter.reject(error);
    const change = this.server.log[this.position];
    if (change) {
      this.position++;
      this.resumeToken = change["_id"];
      return waiter.resolve(change);
    }
    this.resumeToken = batchToken(this.server.log.length);
    waiter.resolve(null);
  }

  get waiting(): boolean {
    return this.waiter !== undefined;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.wake(new Error("the change stream is closed"));
  }
}

/** The change log of a fake database: a stream starts after the token of its options. */
class FakeChangeServer {
  readonly log: Document[] = [];
  readonly streams: FakeStream[] = [];
  hello: Document = { setName: "rs" };
  /** The error of the open of each stream (the aggregate), or undefined. */
  openError: unknown;

  readonly db = {
    databaseName: "fake",
    command: async () => this.hello,
    watch: (pipeline: Document[], options: Document) => {
      const stream = new FakeStream(this, this.positionOf(options), pipeline, options);
      this.streams.push(stream);
      return stream;
    },
  } as unknown as Db;

  private positionOf(options: Document): number {
    const token = (options["startAfter"] ?? options["resumeAfter"]) as Document | undefined;
    if (token === undefined) return this.log.length;
    const data = String(token["_data"]);
    // The token of an event: the stream starts after it. The token of a batch: the length of the log then.
    return data.startsWith("e") ? Number(data.slice(1)) + 1 : Number(data.slice(1));
  }

  /** This method adds an event to the log, and gives it to the open stream that waits. */
  push(event: Document): Document {
    const change = { _id: eventToken(this.log.length), ...event };
    this.log.push(change);
    for (const stream of this.streams) if (!stream.closed) stream.wake();
    return change;
  }

  /** The last stream that the watcher opened, after it waits for an event. */
  async waiting(index?: number): Promise<FakeStream> {
    await vi.waitFor(() => {
      const stream = this.streams[index ?? this.streams.length - 1];
      expect(stream?.waiting).toBe(true);
    });
    return this.streams[index ?? this.streams.length - 1]!;
  }
}

/** An insert event of a document of a collection. */
const insert = (id: string, coll = "notes"): Document => ({ operationType: "insert", ns: { db: "fake", coll }, documentKey: { _id: id }, fullDocument: { _id: id } });

/** A clock whose timers run at once (after a turn of the event loop), and that records each delay. */
function recordingClock(): { clock: Clock; delays: number[] } {
  const delays: number[] = [];
  const clock = {
    now: () => 0,
    after: (delay: number, run: () => void) => {
      delays.push(delay);
      const handle = setTimeout(run, 0);
      return () => clearTimeout(handle);
    },
  } as unknown as Clock;
  return { clock, delays };
}

/** A logger that keeps each line. */
function recordingLogger(): Logger & { lines: Array<{ level: LogLevel; message: string; fields: LogFields }> } {
  const lines: Array<{ level: LogLevel; message: string; fields: LogFields }> = [];
  return { lines, log: (level, message, fields) => void lines.push({ level, message, fields }) };
}

/** A fake server, a watcher of its database, the changes that `onChange` got and the errors of `onError`. */
function fakeWatch(options: Partial<WatchDatabaseChangesOptions> = {}) {
  const server = new FakeChangeServer();
  const { clock, delays } = recordingClock();
  const logger = recordingLogger();
  const changes: Document[] = [];
  const errors: unknown[] = [];
  const watch = watchDatabaseChanges(server.db, {
    onChange: (change) => void changes.push(change),
    onError: (error) => void errors.push(error),
    backoff: { initialDelay: ms(10), maxDelay: ms(40), jitter: 0 },
    clock,
    logger,
    ...options,
  });
  return { server, watch, delays, logger, changes, errors };
}

describe("watchDatabaseChanges without a server (CLI-88)", () => {
  it("gives each raw event to onChange in order, with the image before the change and each other field", async () => {
    const { server, watch, changes } = fakeWatch({
      fullDocument: "updateLookup",
      fullDocumentBeforeChange: "whenAvailable",
      pipeline: [{ $match: { "ns.coll": "notes" } }],
      streamOptions: { maxAwaitTimeMS: 500 },
    });
    await watch.ready;
    const stream = await server.waiting();
    expect(stream.pipeline).toEqual([{ $match: { "ns.coll": "notes" } }]);
    expect(stream.options).toEqual({ maxAwaitTimeMS: 500, fullDocument: "updateLookup", fullDocumentBeforeChange: "whenAvailable" });
    const update = server.push({
      operationType: "update",
      ns: { db: "fake", coll: "notes" },
      documentKey: { _id: "a" },
      updateDescription: { updatedFields: { title: "new" }, removedFields: [] },
      fullDocument: { _id: "a", title: "new" },
      fullDocumentBeforeChange: { _id: "a", title: "old" },
      trace: { span: "s1" },
    });
    const second = server.push(insert("b"));
    await vi.waitFor(() => expect(changes).toHaveLength(2));
    // The same objects: the watcher changes nothing
    expect(changes[0]).toBe(update);
    expect(changes[1]).toBe(second);
    expect(watch.resumeToken).toEqual(second["_id"]);
    await watch.stop();
  });

  it("opens the stream again from the token after a kill of the stream: no change is lost or given twice", async () => {
    const { server, watch, changes, delays, logger } = fakeWatch();
    await watch.ready;
    server.push(insert("a"));
    server.push(insert("b"));
    await vi.waitFor(() => expect(changes).toHaveLength(2));
    const first = await server.waiting(0);
    // The kill: the stream fails while it waits, and two writes come before the next stream opens
    first.wake(serverError(2, "the stream was killed"));
    server.push(insert("c"));
    server.push(insert("d"));
    await vi.waitFor(() => expect(changes).toHaveLength(4));
    server.push(insert("e"));
    await vi.waitFor(() => expect(changes).toHaveLength(5));
    expect(changes.map((change) => change["documentKey"]._id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(server.streams).toHaveLength(2);
    expect(first.closed).toBe(true);
    expect(server.streams[1]!.options["startAfter"]).toEqual(eventToken(1));
    expect(delays).toEqual([10]);
    const warn = logger.lines.find((line) => line.level === "warn");
    expect(warn).toMatchObject({
      message: "The change stream failed: it opens again after a backoff",
      fields: { component: "database-changes", database: "fake", resumeToken: true, attempt: 1, delayMs: 10, code: 2 },
    });
    expect((warn!.fields["error"] as Error).message).toBe("the stream was killed");
    expect(logger.lines.some((line) => line.level === "info" && line.message === "The change stream opened again")).toBe(true);
    await watch.stop();
  });

  it("keeps the token of a batch without events, and opens the next stream after it", async () => {
    const { server, watch, changes } = fakeWatch();
    await watch.ready;
    server.push(insert("a"));
    await vi.waitFor(() => expect(changes).toHaveLength(1));
    const first = await server.waiting(0);
    first.wake();
    await vi.waitFor(() => expect(watch.resumeToken).toEqual(batchToken(1)));
    (await server.waiting(0)).wake(serverError(6, "host unreachable"));
    await server.waiting(1);
    expect(server.streams[1]!.options["startAfter"]).toEqual(batchToken(1));
    server.push(insert("b"));
    await vi.waitFor(() => expect(changes).toHaveLength(2));
    expect(changes.map((change) => change["documentKey"]._id)).toEqual(["a", "b"]);
    await watch.stop();
  });

  it("bounds the backoff by maxDelay, and starts again at initialDelay after a success", async () => {
    const { server, watch, changes, delays } = fakeWatch();
    await watch.ready;
    for (let index = 0; index < 5; index++) (await server.waiting(index)).wake(serverError(6, "host unreachable"));
    await server.waiting(5);
    expect(delays).toEqual([10, 20, 40, 40, 40]);
    server.push(insert("a"));
    await vi.waitFor(() => expect(changes).toHaveLength(1));
    (await server.waiting(5)).wake(serverError(6, "host unreachable"));
    await server.waiting(6);
    expect(delays).toEqual([10, 20, 40, 40, 40, 10]);
    await watch.stop();
  });

  it("keeps each delay with jitter from 0 to the backoff", async () => {
    const { server, watch, delays } = fakeWatch({ backoff: { initialDelay: ms(10), maxDelay: ms(40) } });
    await watch.ready;
    for (let index = 0; index < 6; index++) (await server.waiting(index)).wake(serverError(6, "host unreachable"));
    await server.waiting(6);
    const bounds = [10, 20, 40, 40, 40, 40];
    delays.forEach((delay, index) => {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(bounds[index]!);
    });
    await watch.stop();
  });

  it("refuses a backoff out of its range, two starts, and no onChange", () => {
    const server = new FakeChangeServer();
    const onChange = (): void => undefined;
    expect(() => watchDatabaseChanges(server.db, { onChange, backoff: { initialDelay: ms(50), maxDelay: ms(10) } })).toThrow(RangeError);
    expect(() => watchDatabaseChanges(server.db, { onChange, backoff: { backoffMultiplier: 0.5 } })).toThrow(RangeError);
    expect(() => watchDatabaseChanges(server.db, { onChange, resumeAfter: eventToken(0), startAfter: eventToken(1) })).toThrow(TypeError);
    expect(() => watchDatabaseChanges(server.db, {} as WatchDatabaseChangesOptions)).toThrow(TypeError);
    expect(server.streams).toHaveLength(0);
  });

  it("gives the same change again after an error of onChange, and keeps the token before it", async () => {
    const server = new FakeChangeServer();
    const { clock, delays } = recordingClock();
    const logger = recordingLogger();
    const seen: string[] = [];
    let failures = 2;
    const watch = watchDatabaseChanges<Document>(server.db, {
      onChange: (change) => {
        seen.push(change["documentKey"]._id);
        if (change["documentKey"]._id === "b" && failures-- > 0) throw new Error("the handler failed");
      },
      backoff: { initialDelay: ms(10), jitter: 0 },
      clock,
      logger,
    });
    await watch.ready;
    server.push(insert("a"));
    server.push(insert("b", "tasks"));
    server.push(insert("c"));
    await vi.waitFor(() => expect(seen).toEqual(["a", "b", "b", "b", "c"]));
    expect(delays).toEqual([10, 20]);
    expect(server.streams.map((stream) => stream.options["startAfter"])).toEqual([undefined, eventToken(0), eventToken(0)]);
    expect(watch.resumeToken).toEqual(eventToken(2));
    expect(logger.lines.find((line) => line.level === "warn")).toMatchObject({
      message: "onChange failed: the same change comes again after a backoff",
      fields: { collection: "tasks", operationType: "insert", attempt: 1, delayMs: 10, resumeToken: true },
    });
    await watch.stop();
  });

  it("starts the first stream at resumeAfter, then after the token of each change", async () => {
    const server = new FakeChangeServer();
    server.push(insert("old"));
    server.push(insert("missed"));
    const changes: string[] = [];
    const { clock } = recordingClock();
    const watch = watchDatabaseChanges<Document>(server.db, { onChange: (change) => void changes.push(change["documentKey"]._id), resumeAfter: eventToken(0), clock, logger: recordingLogger() });
    await vi.waitFor(() => expect(changes).toEqual(["missed"]));
    expect(server.streams[0]!.options).toEqual({ resumeAfter: eventToken(0) });
    (await server.waiting(0)).wake(serverError(6, "host unreachable"));
    await server.waiting(1);
    expect(server.streams[1]!.options).toEqual({ startAfter: eventToken(1) });
    await watch.stop();
  });

  it("stops on an invalidate event: onError gets it, and the token is the token of that event", async () => {
    const { server, watch, changes, errors, delays, logger } = fakeWatch();
    await watch.ready;
    server.push({ operationType: "dropDatabase", ns: { db: "fake" } });
    const invalidate = server.push({ operationType: "invalidate" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(changes.map((change) => change["operationType"])).toEqual(["dropDatabase"]);
    expect(errors[0]).toMatchObject({ change: invalidate });
    expect(watch.stopped).toBe(true);
    expect(watch.resumeToken).toEqual(invalidate["_id"]);
    expect(delays).toEqual([]);
    expect(server.streams[0]!.closed).toBe(true);
    expect(logger.lines.filter((line) => line.level === "error")).toMatchObject([{ fields: { operationType: "invalidate", database: "fake" } }]);
    await watch.stop();
  });

  it("stops when the server does not know the token any more (ChangeStreamHistoryLost)", async () => {
    const { server, watch, errors, delays, logger } = fakeWatch();
    await watch.ready;
    const lost = serverError(286, "the resume point is no longer in the oplog");
    (await server.waiting(0)).wake(lost);
    await vi.waitFor(() => expect(errors).toEqual([lost]));
    expect(watch.stopped).toBe(true);
    expect(delays).toEqual([]);
    expect(server.streams).toHaveLength(1);
    expect(logger.lines.find((line) => line.level === "error")).toMatchObject({ fields: { code: 286, error: lost } });
  });

  it("rejects ready and stops when the first open fails with an error that does not go away", async () => {
    for (const code of [13, 18]) {
      const server = new FakeChangeServer();
      server.openError = serverError(code, `refused ${code}`);
      const errors: unknown[] = [];
      const { clock, delays } = recordingClock();
      const watch = watchDatabaseChanges(server.db, { onChange: () => undefined, onError: (error) => void errors.push(error), clock, logger: recordingLogger() });
      await expect(watch.ready).rejects.toMatchObject({ code });
      expect(errors).toHaveLength(1);
      expect(delays).toEqual([]);
    }
  });

  it("stops on a single server before it opens a stream", async () => {
    const server = new FakeChangeServer();
    server.hello = { isWritablePrimary: true };
    const watch = watchDatabaseChanges(server.db, { onChange: () => undefined, logger: recordingLogger() });
    await expect(watch.ready).rejects.toMatchObject({ code: 40573 });
    expect(server.streams).toHaveLength(0);
  });

  it("opens again after an error of a stream that was open, also for a code of a first open", async () => {
    const { server, watch, delays, errors } = fakeWatch();
    await watch.ready;
    (await server.waiting(0)).wake(serverError(13, "unauthorized"));
    await server.waiting(1);
    expect(delays).toEqual([10]);
    expect(errors).toEqual([]);
    await watch.stop();
  });

  it("stops on stop() and on an abort of the signal: it closes the stream and cancels the backoff", async () => {
    const { server, watch, changes } = fakeWatch();
    await watch.ready;
    const stream = await server.waiting(0);
    await watch.stop();
    expect(stream.closed).toBe(true);
    expect(watch.stopped).toBe(true);
    server.push(insert("late"));
    expect(changes).toEqual([]);

    const controller = new AbortController();
    const aborted = fakeWatch({ signal: controller.signal });
    await aborted.watch.ready;
    (await aborted.server.waiting(0)).wake(serverError(6, "host unreachable"));
    controller.abort();
    await vi.waitFor(() => expect(aborted.watch.stopped).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(aborted.server.streams).toHaveLength(1);

    const before = new AbortController();
    before.abort();
    const never = fakeWatch({ signal: before.signal });
    await expect(never.watch.ready).resolves.toBeUndefined();
    expect(never.watch.stopped).toBe(true);
    expect(never.server.streams).toHaveLength(0);
  });

  it("writes to the console without a logger", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const server = new FakeChangeServer();
      const { clock } = recordingClock();
      const watch = watchDatabaseChanges(server.db, { onChange: () => undefined, clock, backoff: { initialDelay: ms(10), jitter: 0 } });
      await watch.ready;
      (await server.waiting(0)).wake(serverError(6, "host unreachable"));
      await server.waiting(1);
      expect(warn).toHaveBeenCalledWith("[database-changes] The change stream failed: it opens again after a backoff", expect.objectContaining({ attempt: 1, delayMs: 10 }));
      await watch.stop();
    } finally {
      warn.mockRestore();
    }
  });

  it("takes a function that gives the database, and opens again when it fails", async () => {
    const server = new FakeChangeServer();
    const { clock, delays } = recordingClock();
    let calls = 0;
    const watch = watchDatabaseChanges(
      () => {
        if (calls++ === 0) throw serverError(6, "host unreachable");
        return server.db;
      },
      { onChange: () => undefined, clock, logger: recordingLogger(), backoff: { initialDelay: ms(10), jitter: 0 } }
    );
    await watch.ready;
    expect(delays).toEqual([10]);
    await watch.stop();
  });
});

const url = process.env["MONGO_TEST_URL"];
let client: MongoClient | undefined;
let db: Db;
let replicaSet = false;
let next = 0;

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url);
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  replicaSet = typeof hello["setName"] === "string";
  if (!replicaSet && process.env["MONGO_TEST_TOPOLOGY"] === "replica-set") throw new Error("MONGO_TEST_TOPOLOGY is replica-set, but the test database is a single server");
  db = client.db(`client_mongo_dbchanges_${process.pid}_${Date.now()}`);
});

afterAll(async () => {
  if (!client) return;
  await db.dropDatabase().catch(() => undefined);
  await client.close();
});

/** The longest wait of `eventually`. */
const EVENTUALLY_MS = 10_000;
/** The time limit of each test: more than the wait of `eventually`, with room for the setup. */
const TEST_TIMEOUT_MS = 30_000;
/** The longest wait for the lock of the failpoint. A lock that is older is stale: a waiter takes it. */
const LOCK_WAIT_MS = 45_000;

async function eventually(check: () => void | Promise<void>): Promise<void> {
  const until = Date.now() + EVENTUALLY_MS;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/**
 * The failpoint `failCommand` is global to the server, and the test files run at the same time.
 * This lock (a document in a shared database, the lock of `storage-hints.test.ts`) lets one test of
 * a failpoint run at a time. After LOCK_WAIT_MS, a waiter takes a stale lock.
 */
async function lockFailpoints(context: TestContext): Promise<void> {
  const locks = client!.db("client_mongo_test_locks").collection<{ _id: string; at: Date }>("locks");
  const until = Date.now() + LOCK_WAIT_MS;
  let at = new Date();
  for (;;) {
    at = new Date();
    try {
      await locks.insertOne({ _id: "failCommand", at });
      break;
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000 || Date.now() > until) throw error;
      const stale = await locks.deleteOne({ _id: "failCommand", at: { $lt: new Date(Date.now() - LOCK_WAIT_MS) } });
      if (stale.deletedCount === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  context.onTestFinished(async () => {
    await locks.deleteOne({ _id: "failCommand", at });
  });
}

/** The ids of the inserts of a collection that `onChange` got, in order. */
const insertedIds = (changes: readonly Document[], coll: string): unknown[] =>
  changes.filter((change) => change["operationType"] === "insert" && change["ns"]?.coll === coll).map((change) => change["documentKey"]._id);

describe.runIf(url)("watchDatabaseChanges against a real server (CLI-88)", () => {
  it("gives the changes of each collection of the database, with the image before the change when the collection has it", { timeout: TEST_TIMEOUT_MS }, async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const images = `images${++next}`;
    const plain = `plain${next}`;
    await db.createCollection(images, { changeStreamPreAndPostImages: { enabled: true } });
    await db.createCollection(plain);
    const changes: Document[] = [];
    const watch = watchDatabaseChanges(db, { onChange: (change) => void changes.push(change), fullDocument: "updateLookup", fullDocumentBeforeChange: "whenAvailable" });
    try {
      await watch.ready;
      await db.collection(images).insertOne({ _id: "a" as never, title: "old" });
      await db.collection(images).updateOne({ _id: "a" as never }, { $set: { title: "new" } });
      await db.collection(plain).insertOne({ _id: "b" as never, title: "old" });
      await db.collection(plain).updateOne({ _id: "b" as never }, { $set: { title: "new" } });
      await eventually(() => expect(changes.filter((change) => change["operationType"] === "update")).toHaveLength(2));
      const [withImage, withoutImage] = changes.filter((change) => change["operationType"] === "update");
      expect(withImage).toMatchObject({ ns: { coll: images }, fullDocument: { _id: "a", title: "new" }, fullDocumentBeforeChange: { _id: "a", title: "old" } });
      expect(withoutImage).toMatchObject({ ns: { coll: plain }, fullDocument: { _id: "b", title: "new" } });
      // With "whenAvailable", the server gives null when the collection keeps no image
      expect(withoutImage!["fullDocumentBeforeChange"]).toBeNull();
      expect(watch.resumeToken).toBeDefined();
    } finally {
      await watch.stop();
    }
  });

  it("resumes from its token after a kill of the stream: no change is lost or given twice", { timeout: LOCK_WAIT_MS + TEST_TIMEOUT_MS }, async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    await lockFailpoints(context);
    const admin = client!.db("admin");
    const failpoints = await admin.command({ configureFailPoint: "failCommand", mode: "off" }).then(
      () => true,
      () => false
    );
    if (!failpoints) {
      if (process.env["MONGO_TEST_FAILPOINTS"] === "1") throw new Error("MONGO_TEST_FAILPOINTS is 1, but the server has no test commands (enableTestCommands)");
      return context.skip?.("the failpoints need a server with enableTestCommands");
    }
    // Its own client, so the failpoint fails only the getMore of the stream of the watcher
    const appName = "database-changes-resume";
    const own = new MongoClient(url!, { appName });
    await own.connect();
    const collection = `killed${++next}`;
    const changes: Document[] = [];
    const logger = recordingLogger();
    const watch = watchDatabaseChanges(own.db(db.databaseName), { onChange: (change) => void changes.push(change), backoff: { initialDelay: ms(20), jitter: 0 }, logger });
    try {
      await watch.ready;
      await db.collection(collection).insertMany([{ _id: "r1" as never }, { _id: "r2" as never }]);
      await eventually(() => expect(insertedIds(changes, collection)).toEqual(["r1", "r2"]));
      // The kill: the next getMore of the stream fails with an error that the driver does not resume (BadValue, no error label)
      await admin.command({ configureFailPoint: "failCommand", mode: { times: 1 }, data: { failCommands: ["getMore"], appName, errorCode: 2, errorLabels: [] } });
      await db.collection(collection).insertMany([{ _id: "r3" as never }, { _id: "r4" as never }]);
      await eventually(() => expect(logger.lines.some((line) => line.message === "The change stream failed: it opens again after a backoff")).toBe(true));
      await db.collection(collection).insertOne({ _id: "r5" as never });
      await eventually(() => expect(insertedIds(changes, collection)).toContain("r5"));
      expect(insertedIds(changes, collection)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
      expect(logger.lines.find((line) => line.level === "warn")).toMatchObject({ fields: { database: db.databaseName, resumeToken: true, attempt: 1, delayMs: 20, code: 2 } });
      expect(watch.stopped).toBe(false);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await watch.stop();
      await own.close();
    }
  });

  it("starts at a saved token: a new watcher gets the changes after it", { timeout: TEST_TIMEOUT_MS }, async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const collection = `saved${++next}`;
    const first: Document[] = [];
    const watch = watchDatabaseChanges(db, { onChange: (change) => void first.push(change) });
    await watch.ready;
    await db.collection(collection).insertOne({ _id: "s1" as never });
    await eventually(() => expect(insertedIds(first, collection)).toEqual(["s1"]));
    await watch.stop();
    const saved = watch.resumeToken;
    await db.collection(collection).insertMany([{ _id: "s2" as never }, { _id: "s3" as never }]);
    const second: Document[] = [];
    const again = watchDatabaseChanges(db, { onChange: (change) => void second.push(change), resumeAfter: saved });
    try {
      await eventually(() => expect(insertedIds(second, collection)).toEqual(["s2", "s3"]));
    } finally {
      await again.stop();
    }
  });
});
