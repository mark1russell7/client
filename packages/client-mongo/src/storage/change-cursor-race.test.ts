/**
 * The race of a change cursor and a write in flight (roadmap CLI-102). One write holds a number and
 * does not end. A second write holds the next number and ends. A reader moves its cursor past the
 * second write. With no rule that stops the cursor below it, the reader loses the first write.
 *
 * These tests hold the commit of each write, on seeded schedules. Some subscribers read a cursor, and
 * some subscribers follow the change events.
 *
 * The contract: no subscriber loses a write. A subscriber sees a write at least one time, and it can
 * see a write two times in two cases. A full answer takes its mark before it lists the items, so it
 * can hold a write above its mark. A write that ends after its lease moves to a new number. A second
 * time has the same value or a later value, so a subscriber applies a change by its id.
 *
 * A second time does not go back. Per id, the values of a subscriber keep the commit order of the
 * store, and its last value equals the store. Those rows hold the list of a full answer, so an event
 * with values can land between the mark and the list. The rows cover changes of a value, not deletes.
 *
 * A cursor that starts from a version and has only writes inside their lease sees each write one time.
 * Each row prints its counts. Each fault row has the same schedules and a reader or a writer with no
 * rule, and it must lose a write. So a green row is not green because the schedules miss the gap.
 *
 * The rows on memory always start. The rows on a real store need `MONGO_TEST_URL` and a replica set.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Collection, type Db } from "mongodb";
import { random, type Random } from "@mark1russell7/rigor-generators";
import {
  callerOf,
  collectionChangeTopic,
  createCollectionProcedures,
  createEventBus,
  ms,
  type CallerOptions,
  type CollectionChangeEvent,
  type StorageChanges,
} from "@procedures/client";
import { InMemoryStorage } from "@procedures/collections";
import { MongoDocumentStorage } from "./document-storage.js";

/** The value of a write. Each write has its own value, so a value tells the write. */
interface Item {
  readonly v: string;
}

/** The part of a storage that a race uses. */
interface RaceStorage {
  set(id: string, value: Item): Promise<void>;
  getChangesSince(since?: string): Promise<StorageChanges<Item>>;
}

/** A delay of a size that a schedule draws: turns of the event loop on memory, milliseconds on a store. */
type Wait = (size: number) => Promise<void>;

/** The holds of one process around the commit of each write. A hold gets the operations of the write. */
interface Holds {
  before(operations?: unknown): Promise<void>;
  after(): Promise<void>;
}

/** The counts of the holds of a schedule: a read during a hold shows that the schedule reached the gap. */
interface HoldCount {
  held: number;
  readsDuringHold: number;
}

/** The kind of ids of a schedule: each write has a new id, or the writes change a few ids. */
type IdFamily = "new" | "rewrite";

/** The counts of one row: its schedules and what the subscribers saw. */
interface RowCount {
  schedules: number;
  writes: number;
  subscribers: number;
  reads: number;
  readsDuringHold: number;
  fulls: number;
  lost: string[];
  twice: string[];
  /** The writes of one id and one value that a subscriber got with a different value. */
  changedValue: string[];
}

const NAME = "race";
const TOPIC = collectionChangeTopic(NAME);
const PATH = ["collections", NAME] as const;
const call = callerOf({ procedures: createCollectionProcedures(NAME) });
/** The same procedures with values in their events. */
const callWithValues = callerOf({ procedures: createCollectionProcedures(NAME, { changeEvents: { values: true } }) });

/** The sizes of a hold. A half of the holds are 0, so a later write can end first. */
const HOLD_SIZES = [0, 0, 1, 4] as const;
const PAUSE_SIZES = [0, 0, 1] as const;
const POLL_SIZES = [0, 1, 2] as const;
const REWRITE_IDS = 4;

/** One process of a race: a storage behind the procedures, and a bus for its subscribers. */
class Host {
  readonly bus = createEventBus();
  private readonly options: CallerOptions;
  private readonly caller: typeof call;

  constructor(storage: RaceStorage, caller: typeof call = call) {
    this.caller = caller;
    const repository = { getStorage: () => storage, hasCollection: () => true };
    this.options = { repository, bus: this.bus } as unknown as CallerOptions;
  }

  /** This method writes through the procedure `set`, which publishes the change events. */
  write(id: string, value: Item): Promise<unknown> {
    return this.caller([...PATH, "set"], { id, value }, this.options);
  }

  /** This method reads through the procedure `changes`, which starts the chain of the change events. */
  changes(since?: string): Promise<{ version: string; full: boolean; changed: Array<{ id: string; value: Item }> }> {
    return this.caller([...PATH, "changes"], since === undefined ? {} : { since }, this.options);
  }
}

/** What one subscriber saw: a count per write, its last value per id, and each value per id. */
class Seen {
  readonly counts = new Map<string, number>();
  readonly last = new Map<string, string>();
  readonly values = new Map<string, Set<string>>();
  fulls = 0;

  /** This method notes one change. A key is the id for new ids, and the id with the value for rewrites. */
  note(family: IdFamily, id: string, value?: Item): void {
    const key = family === "new" ? id : `${id}=${value?.v ?? ""}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    if (value === undefined) return;
    this.last.set(id, value.v);
    const values = this.values.get(id) ?? new Set<string>();
    this.values.set(id, values.add(value.v));
  }
}

/** This function makes the holds of one process from a seeded stream. */
function holdsOf(draw: Random, wait: Wait, count: HoldCount, sizes: readonly number[] = HOLD_SIZES): Holds {
  return {
    before: async () => {
      count.held += 1;
      await wait(draw.pick(sizes));
    },
    after: async () => {
      await wait(draw.pick(sizes));
      count.held -= 1;
    },
  };
}

/** This function counts a read of a subscriber. */
function noteRead(row: RowCount, count: HoldCount): void {
  row.reads += 1;
  if (count.held > 0) row.readsDuringHold += 1;
}

/** This function adds the changes of a read to what a subscriber saw. */
function applyRead(
  seen: Seen,
  family: IdFamily,
  changes: { full: boolean; changed: ReadonlyArray<{ id: string; value: Item }> },
): void {
  if (changes.full) seen.fulls += 1;
  for (const { id, value } of changes.changed) seen.note(family, id, value);
}

/**
 * This function follows the change events of a host, one at a time. An event at the cursor gives its
 * ids with no read, and each other event makes a read since the cursor.
 */
async function follower(host: Host, seen: Seen, family: IdFamily, row: RowCount, count: HoldCount): Promise<() => Promise<void>> {
  let cursor = (await host.changes()).version;
  let line: Promise<void> = Promise.resolve();
  const read = async (): Promise<void> => {
    noteRead(row, count);
    const changes = await host.changes(cursor);
    applyRead(seen, family, changes);
    cursor = changes.version;
  };
  host.bus.on<CollectionChangeEvent>(TOPIC, (event) => {
    line = line.then(async () => {
      if (event.since === cursor && event.version !== undefined) {
        for (const id of event.changed) seen.note(family, id);
        cursor = event.version;
        return;
      }
      await read();
    });
  });
  return async () => {
    await line;
    await read();
  };
}

/** This function reads a cursor until `done`, and then reads one more time. */
async function poller(
  host: Host,
  seen: Seen,
  family: IdFamily,
  draw: Random,
  wait: Wait,
  row: RowCount,
  count: HoldCount,
  isDone: () => boolean,
): Promise<void> {
  const first = await host.changes();
  for (const { id, value } of first.changed) seen.last.set(id, value.v);
  let cursor = first.version;
  for (;;) {
    const lastRead = isDone();
    noteRead(row, count);
    const changes = await host.changes(cursor);
    applyRead(seen, family, changes);
    cursor = changes.version;
    if (lastRead) return;
    await wait(draw.pick(POLL_SIZES));
  }
}

/** This function sends the writes of one writer. A half of the writes do not wait for the write before them. */
async function writer(
  host: Host,
  index: number,
  writes: number,
  family: IdFamily,
  draw: Random,
  wait: Wait,
): Promise<string[]> {
  const running: Array<Promise<unknown>> = [];
  const keys: string[] = [];
  for (let n = 0; n < writes; n += 1) {
    const id = family === "new" ? `w${index}-${n}` : `r${draw.below(REWRITE_IDS)}`;
    const value = `${index}.${n}`;
    keys.push(family === "new" ? id : `${id}=${value}`);
    const write = host.write(id, { v: value });
    running.push(write);
    if (draw.chance(0.5)) await write;
    await wait(draw.pick(PAUSE_SIZES));
  }
  await Promise.all(running);
  return keys;
}

/** The inputs of one schedule. */
interface Schedule {
  readonly seed: string;
  readonly hosts: readonly Host[];
  readonly wait: Wait;
  readonly family: IdFamily;
  readonly writes: number;
  readonly count: HoldCount;
}

/** This function starts one schedule and adds what each subscriber lost or saw twice to the row. */
async function race(schedule: Schedule, row: RowCount): Promise<void> {
  const { seed, hosts, wait, family, writes, count } = schedule;
  const draw = random(seed);
  if (family === "rewrite") {
    // Each id exists before the race: two first writes of one id are a race of the upsert, not of a cursor
    for (let id = 0; id < REWRITE_IDS; id += 1) await hosts[0]!.write(`r${id}`, { v: "first" });
  }
  let done = false;
  const seens: Seen[] = [];
  const started: Array<Promise<void>> = [];
  const drains: Array<() => Promise<void>> = [];
  for (const [index, host] of hosts.entries()) {
    const polled = new Seen();
    seens.push(polled);
    started.push(poller(host, polled, family, draw.fork(`poll${index}`), wait, row, count, () => done));
    // A follower gets its ids from the events, so it has no value to compare with the store
    if (family === "new") {
      const followed = new Seen();
      seens.push(followed);
      drains.push(await follower(host, followed, family, row, count));
    }
  }
  const sent = await Promise.all(hosts.map((host, index) => writer(host, index, writes, family, draw.fork(`write${index}`), wait)));
  done = true;
  await Promise.all(started);
  for (const drain of drains) await drain();

  const keys = sent.flat();
  row.schedules += 1;
  row.writes += keys.length;
  row.subscribers += seens.length;
  for (const [index, seen] of seens.entries()) {
    row.fulls += seen.fulls;
    for (const [key, times] of seen.counts) if (times > 1) row.twice.push(`${seed}/s${index}/${key}`);
    if (family === "new") {
      for (const key of keys) if (!seen.counts.has(key)) row.lost.push(`${seed}/s${index}/${key}`);
      for (const [id, values] of seen.values) if (values.size > 1) row.changedValue.push(`${seed}/s${index}/${id}`);
    }
  }
  if (family === "rewrite") {
    // The last value of each id at each subscriber equals the store
    const store = await hosts[0]!.changes();
    for (const [index, seen] of seens.entries()) {
      for (const { id, value } of store.changed) {
        if (seen.last.get(id) !== value.v) row.lost.push(`${seed}/s${index}/${id}=${value.v}`);
      }
    }
  }
}

/** This function makes an empty row. */
function newRow(): RowCount {
  return { schedules: 0, writes: 0, subscribers: 0, reads: 0, readsDuringHold: 0, fulls: 0, lost: [], twice: [], changedValue: [] };
}

/** This function prints the counts of a row, for the job log and the record of the item. */
function printRow(name: string, row: RowCount): void {
  const { lost, twice, changedValue, ...counts } = row;
  console.log(`race ${JSON.stringify({ name, ...counts, lost: lost.length, twice: twice.length, changedValue: changedValue.length, lostExamples: lost.slice(0, 3), twiceExamples: twice.slice(0, 3) })}`);
}

/** This function states the pass line of a cursor inside the leases. Its text has the seed of a failure. */
function expectClean(row: RowCount, schedules: number, writes: number): void {
  expect(row.lost).toEqual([]);
  expect(row.twice).toEqual([]);
  expect(row.changedValue).toEqual([]);
  expect(row.fulls).toBe(0);
  expect({ schedules: row.schedules, writes: row.writes }).toEqual({ schedules, writes });
  expect(row.readsDuringHold).toBeGreaterThan(0);
}

/**
 * A log of numbers with the gap of a real store. A write takes its number, and its item appears at the
 * commit, after the hold. With the rule, a read stops below the lowest number in flight.
 */
class GapLog {
  private seq = 0;
  private readonly rows = new Map<number, { id: string; value: Item }>();
  private readonly pending = new Set<number>();
  private readonly rule: boolean;

  constructor(rule: boolean) {
    this.rule = rule;
  }

  /** This method gives a view of the log, for one process with its holds. */
  view(holds: Holds): RaceStorage {
    return {
      set: async (id, value) => {
        const number = ++this.seq;
        this.pending.add(number);
        await holds.before();
        this.rows.set(number, { id, value });
        await holds.after();
        this.pending.delete(number);
      },
      getChangesSince: async (since) => {
        const mark = this.rule && this.pending.size > 0 ? Math.min(...this.pending) - 1 : this.seq;
        await Promise.resolve();
        const changed = new Map<string, Item>();
        for (let number = Number(since ?? 0) + 1; number <= mark; number += 1) {
          const row = this.rows.get(number);
          if (row) changed.set(row.id, row.value);
        }
        return { version: String(mark), full: since === undefined, changed: [...changed], deleted: [] };
      },
    };
  }
}

/** A delay in turns of the event loop: on memory, a schedule has no clock. */
const turns: Wait = async (size) => {
  for (let turn = 0; turn < size; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

const MEMORY_SCHEDULES = 200;
const MEMORY_HOSTS = 2;
const MEMORY_WRITES = 12;

describe("the race of a change cursor and a write in flight, on memory (CLI-102)", () => {
  const EXPECTED_WRITES = MEMORY_SCHEDULES * MEMORY_HOSTS * MEMORY_WRITES;

  it.each(["new", "rewrite"] as const)("a reader with no rule loses a write: %s ids", async (family) => {
    const row = await sharedLog(false, family);
    printRow(`memory no rule ${family}`, row);
    expect(row.lost.length).toBeGreaterThan(0);
  });

  it.each(["new", "rewrite"] as const)("the rule loses no write and shows no write twice: %s ids", async (family) => {
    const row = await sharedLog(true, family);
    printRow(`memory rule ${family}`, row);
    expectClean(row, MEMORY_SCHEDULES, EXPECTED_WRITES);
  });

  it.each(["new", "rewrite"] as const)("a storage whose write is one step has no gap: %s ids", async (family) => {
    const row = newRow();
    for (let n = 0; n < MEMORY_SCHEDULES; n += 1) {
      const seed = `memory-storage-${family}-${n}`;
      const draw = random(seed);
      const count: HoldCount = { held: 0, readsDuringHold: 0 };
      const store = new InMemoryStorage<Item>();
      const hosts = Array.from({ length: MEMORY_HOSTS }, (_, index) => {
        const holds = holdsOf(draw.fork(`holds${index}`), turns, count);
        const view: RaceStorage = {
          set: async (id, value) => {
            await holds.before();
            await store.set(id, value);
            await holds.after();
          },
          getChangesSince: (since) => store.getChangesSince(since),
        };
        return new Host(view);
      });
      await race({ seed, hosts, wait: turns, family, writes: MEMORY_WRITES, count }, row);
    }
    printRow(`memory storage ${family}`, row);
    expectClean(row, MEMORY_SCHEDULES, EXPECTED_WRITES);
  });

  it("one seed gives one result, so a failure replays from its seed", async () => {
    const first = await sharedLog(false, "new", 5);
    const second = await sharedLog(false, "new", 5);
    expect(second).toEqual(first);
  });
});

/** This function starts a row whose hosts are views of one log per schedule. */
async function sharedLog(rule: boolean, family: IdFamily, schedules = MEMORY_SCHEDULES): Promise<RowCount> {
  const row = newRow();
  for (let n = 0; n < schedules; n += 1) {
    const seed = `memory-log-${family}-${n}`;
    const draw = random(seed);
    const count: HoldCount = { held: 0, readsDuringHold: 0 };
    const log = new GapLog(rule);
    const hosts = Array.from({ length: MEMORY_HOSTS }, (_, index) => new Host(log.view(holdsOf(draw.fork(`holds${index}`), turns, count))));
    await race({ seed, hosts, wait: turns, family, writes: MEMORY_WRITES, count }, row);
  }
  return row;
}

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

const STORE_SCHEDULES = 20;
const FAULT_SCHEDULES = 8;
const STORE_PROCESSES = 3;
const STORE_WRITES = 8;
const STORE_MS_PER_SIZE = 5;
const COUNTERS = "__storage_counters";
const ROW_TIMEOUT_MS = 240_000;
const LATE_LEASE_MS = 50;
const FIRST_READ_ROUNDS = 10;
const LATE_HOLD_SIZES = [0, 0, 0, 30] as const;

/** The two ways of a store to take numbers: a transaction, or pending numbers. */
type StorePath = "transaction" | "pending";

/** The private parts of a store that a fault copy changes. */
interface StoreInternals {
  watermark(db: Db): Promise<{ seq: number; epoch: string; floor: number }>;
  withNumbers<R>(db: Db, collection: Collection<never>, count: number, write: (first: number) => Promise<R>): Promise<R>;
}

/** This function gives a cursor that waits for the hold before it gives its rows. */
function heldList(cursor: object, listHold: () => Promise<void>): object {
  return new Proxy(cursor, {
    get(target, key) {
      const value = Reflect.get(target, key, target) as unknown;
      if (typeof value !== "function") return value;
      const method = value as (...given: unknown[]) => unknown;
      if (key === "sort") return (...args: unknown[]) => heldList(method.apply(target, args) as object, listHold);
      if (key === "toArray") {
        return async () => {
          await listHold();
          return method.apply(target, []);
        };
      }
      return method.bind(target);
    },
  });
}

/** This function gives a `Db` that holds each bulk write of a collection around its commit, and each list of a full answer. */
function heldDb(db: Db, collection: string, holds: Holds, listHold?: () => Promise<void>): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "collection") {
        return (name: string) => {
          const real = target.collection(name);
          if (name !== collection) return real;
          return new Proxy(real, {
            get(items, key) {
              const value = Reflect.get(items, key, items) as unknown;
              if (key === "bulkWrite") {
                return async (...args: unknown[]) => {
                  await holds.before(args[0]);
                  try {
                    return (await (value as (...given: unknown[]) => Promise<unknown>).apply(items, args)) as unknown;
                  } finally {
                    await holds.after();
                  }
                };
              }
              if (key === "find" && listHold !== undefined) {
                return (...args: unknown[]) => {
                  const cursor: unknown = (value as (...given: unknown[]) => unknown).apply(items, args);
                  // A read of a delta has a range of numbers, and a read of places has a list of ids. A list of a full answer has neither.
                  return /"\$(gt|in)"/.test(JSON.stringify(args[0])) ? cursor : heldList(cursor as object, listHold);
                };
              }
              return typeof value === "function" ? (value as (...given: unknown[]) => unknown).bind(items) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? (value as (...given: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** The order of the commits of a store: one write at a time goes to the store, and each value notes its turn. */
class CommitOrder {
  private readonly turns = new Map<string, number>();
  private next = 0;
  private tail: Promise<void> = Promise.resolve();
  private free: () => void = () => undefined;

  /** This method gives the holds of one process, with the commits in one line. A retry of a value notes its later turn. */
  holds(inner: Holds): Holds {
    return {
      before: async (operations) => {
        await inner.before();
        const before = this.tail;
        let free: () => void = () => undefined;
        this.tail = new Promise<void>((resolve) => (free = resolve));
        await before;
        this.free = free;
        for (const [, value] of JSON.stringify(operations).matchAll(/\\?"v\\?":\\?"([^"\\]+)/g)) this.turns.set(value!, ++this.next);
      },
      after: async () => {
        this.free();
        await inner.after();
      },
    };
  }

  /** This method gives the turn of a value, or undefined when the store has no write with that value. */
  turnOf(value: string): number | undefined {
    return this.turns.get(value);
  }
}

/** What one subscriber got for each id, in order. */
class History {
  readonly values = new Map<string, string[]>();

  note(id: string, value: string): void {
    const values = this.values.get(id) ?? [];
    values.push(value);
    this.values.set(id, values);
  }

  /** This method gives the last value of each id. */
  last(): Map<string, string> {
    return new Map([...this.values].map(([id, values]) => [id, values.at(-1)!]));
  }
}

/**
 * A subscriber as the docs state. Events wait behind its read. An event at its cursor gives its values
 * with no read, and each other event makes a read since the cursor.
 */
class ValueFollower {
  readonly history = new History();
  private cursor: string | undefined;
  private line: Promise<void> = Promise.resolve();
  private readonly host: Host;

  constructor(host: Host) {
    this.host = host;
    host.bus.on<CollectionChangeEvent>(TOPIC, (event) => {
      this.line = this.line.then(() => this.apply(event));
    });
  }

  /** This method reads a full answer in the line of the events, and the cursor starts at its version. */
  join(): Promise<void> {
    this.line = this.line.then(() => this.read());
    return this.line;
  }

  /** This method waits for each event so far and reads one more time. */
  drain(): Promise<void> {
    this.line = this.line.then(() => this.read());
    return this.line;
  }

  private async read(): Promise<void> {
    const changes = await this.host.changes(this.cursor);
    for (const { id, value } of changes.changed) this.history.note(id, value.v);
    this.cursor = changes.version;
  }

  private async apply(event: CollectionChangeEvent): Promise<void> {
    if (this.cursor === undefined || event.version === this.cursor) return;
    if (event.since === this.cursor && event.version !== undefined && event.values !== undefined) {
      for (const { id, value } of event.values) this.history.note(id, (value as Item).v);
      this.cursor = event.version;
      return;
    }
    await this.read();
  }
}

/** This function makes a reader of a cursor with no events: its first read is a full answer. */
async function cursorReader(host: Host, history: History, wait: Wait, draw: Random, isDone: () => boolean): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const lastRead = isDone();
    const changes = await host.changes(cursor);
    for (const { id, value } of changes.changed) history.note(id, value.v);
    cursor = changes.version;
    if (lastRead) return;
    await wait(draw.pick(POLL_SIZES));
  }
}

/** The counts of a row of the order of values. */
interface OrderRow {
  schedules: number;
  writes: number;
  subscribers: number;
  fullsHeld: number;
  /** Each pair of values of one id, at one subscriber, whose second value is older than its first value. */
  back: string[];
  /** Each last value of a subscriber that is not the value of the store. */
  finalDiffers: string[];
  /** Each value that a subscriber got and the store has no write of. */
  unknown: string[];
}

/** This function adds what the subscribers of one schedule got to the row. */
function readOrder(row: OrderRow, seed: string, order: CommitOrder, histories: readonly (readonly [string, History])[], store: ReadonlyMap<string, string>): void {
  for (const [name, history] of histories) {
    row.subscribers += 1;
    for (const [id, values] of history.values) {
      let latest = -1;
      for (const value of values) {
        const turn = order.turnOf(value);
        if (turn === undefined) {
          row.unknown.push(`${seed}/${name}/${id}=${value}`);
          continue;
        }
        if (turn < latest) row.back.push(`${seed}/${name}/${id}=${value}`);
        else latest = turn;
      }
    }
    for (const [id, value] of store) {
      if (history.last().get(id) !== value) row.finalDiffers.push(`${seed}/${name}/${id}=${value}`);
    }
  }
}

/** This function prints the counts of a row of the order of values. */
function printOrder(name: string, row: OrderRow): void {
  const { back, finalDiffers, unknown, ...counts } = row;
  console.log(`race ${JSON.stringify({ name, ...counts, back: back.length, finalDiffers: finalDiffers.length, unknown: unknown.length, backExamples: back.slice(0, 3), finalExamples: finalDiffers.slice(0, 3) })}`);
}

/** This function makes a reader with no rule: its mark is the counter, past each write in flight. */
function readPastFlight(store: MongoDocumentStorage<Item>, db: Db, collection: string): void {
  const inner = store as unknown as StoreInternals;
  const rule = inner.watermark.bind(store);
  inner.watermark = async (given) => {
    const mark = await rule(given);
    const raw = await db.collection<{ _id: string; seq: number }>(COUNTERS).findOne({ _id: collection });
    return { ...mark, seq: raw?.seq ?? mark.seq };
  };
}

/** This function gives a store whose delta also gives the first value that it gave for an id. */
function replayingOld(store: RaceStorage): RaceStorage {
  const firstOf = new Map<string, Item>();
  return {
    set: (id, value) => store.set(id, value),
    getChangesSince: async (since) => {
      const changes = await store.getChangesSince(since);
      if (changes.full) return changes;
      const old: Array<[string, Item]> = [];
      for (const [id, value] of changes.changed) {
        const first = firstOf.get(id);
        if (first === undefined) firstOf.set(id, value);
        else if (first.v !== value.v) old.push([id, first]);
      }
      return { ...changes, changed: [...changes.changed, ...old] };
    },
  };
}

/** This function makes a writer with no rule: it takes its number outside its transaction. */
function numberOutside(store: MongoDocumentStorage<Item>, collection: string): void {
  (store as unknown as StoreInternals).withNumbers = async (db, _items, count, write) => {
    const counter = await db
      .collection<{ _id: string; seq: number }>(COUNTERS)
      .findOneAndUpdate({ _id: collection }, { $inc: { seq: count } }, { upsert: true, returnDocument: "after" });
    return write(counter!.seq - count + 1);
  };
}

withMongo("the race of a change cursor and a write in flight, on a real store (CLI-102)", { timeout: ROW_TIMEOUT_MS }, () => {
  const clients: MongoClient[] = [];
  const database = `race_test_${process.pid}`;
  let next = 0;
  let replicaSet = false;

  beforeAll(async () => {
    for (let index = 0; index < STORE_PROCESSES; index += 1) {
      const client = new MongoClient(url!);
      await client.connect();
      clients.push(client);
    }
    replicaSet = typeof (await clients[0]!.db("admin").command({ hello: 1 }))["setName"] === "string";
  });

  afterAll(async () => {
    await clients[0]?.db(database).dropDatabase();
    await Promise.all(clients.map((client) => client.close()));
  });

  /** A delay in milliseconds, from a size of a schedule. */
  const millis: Wait = async (size) => {
    if (size > 0) await new Promise((resolve) => setTimeout(resolve, size * STORE_MS_PER_SIZE));
    else await new Promise((resolve) => setImmediate(resolve));
  };

  /** This function makes one store per process, each a client of its own, with its holds. */
  function storesOf(path: StorePath, collection: string, holds: readonly Holds[], lease?: number, listHold?: () => Promise<void>): Array<MongoDocumentStorage<Item>> {
    return clients.map((client, index) => {
      const held = heldDb(client.db(database), collection, holds[index]!, listHold);
      return new MongoDocumentStorage<Item>({
        collection,
        db: () => held,
        client: () => client,
        ...(path === "pending" ? { transactions: "never" as const } : {}),
        ...(lease === undefined ? {} : { writeLease: ms(lease) }),
      });
    });
  }

  /** This function starts the schedules of a row on the store. */
  async function storeRow(options: {
    label: string;
    path: StorePath;
    family: IdFamily;
    schedules: number;
    sizes?: readonly number[];
    lease?: number;
    fault?: (stores: ReadonlyArray<MongoDocumentStorage<Item>>, collection: string) => void;
  }): Promise<RowCount> {
    const { label, path, family, schedules, sizes, lease, fault } = options;
    const row = newRow();
    for (let n = 0; n < schedules; n += 1) {
      const seed = `store-${label}-${n}`;
      const draw = random(seed);
      const count: HoldCount = { held: 0, readsDuringHold: 0 };
      const collection = `race${++next}`;
      const holds = clients.map((_, index) => holdsOf(draw.fork(`holds${index}`), millis, count, sizes));
      const stores = storesOf(path, collection, holds, lease);
      fault?.(stores, collection);
      const hosts = stores.map((store) => new Host(store as unknown as RaceStorage));
      await race({ seed, hosts, wait: millis, family, writes: STORE_WRITES, count }, row);
    }
    printRow(label, row);
    return row;
  }

  const WRITES_PER_SCHEDULE = STORE_PROCESSES * STORE_WRITES;

  /** A hold that stops one write until the test opens it, and tells when the write reached it. */
  function gate(): { holds: Holds; reached: Promise<void>; open: () => void } {
    let open: () => void = () => undefined;
    let reach: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => (open = resolve));
    const reached = new Promise<void>((resolve) => (reach = resolve));
    return {
      holds: {
        before: async () => {
          reach();
          await opened;
        },
        after: async () => undefined,
      },
      reached,
      open: () => open(),
    };
  }

  const FREE: Holds = { before: async () => undefined, after: async () => undefined };

  /**
   * This function holds write A on the commit, sends write B on another client, and reads with a third.
   * It gives the ids that the reader saw, and the ids at the first read.
   */
  async function gateRead(path: StorePath, fault?: (stores: ReadonlyArray<MongoDocumentStorage<Item>>, collection: string) => void) {
    const collection = `race${++next}`;
    const stopped = gate();
    const stores = storesOf(path, collection, [stopped.holds, FREE, FREE]);
    fault?.(stores, collection);
    const [writerA, writerB, reader] = stores as [MongoDocumentStorage<Item>, MongoDocumentStorage<Item>, MongoDocumentStorage<Item>];
    let cursor = (await reader.getChangesSince()).version;
    const writeA = writerA.set("a", { v: "a" });
    await stopped.reached;
    // On a transaction with the counter inside, B waits for A, so this test does not wait for B before the read
    const writeB = writerB.set("b", { v: "b" });
    if (path === "pending" || fault) await writeB;
    const during = await reader.getChangesSince(cursor);
    cursor = during.version;
    stopped.open();
    await Promise.all([writeA, writeB]);
    const drained = await reader.getChangesSince(cursor);
    const seen = [...during.changed, ...drained.changed].map(([id]) => id).sort();
    return { seen, during: during.changed.map(([id]) => id) };
  }

  /** The fault copy of a path: a reader past the flight on pending numbers, a number outside on a transaction. */
  const faultOf = (path: StorePath, database_: () => Db) =>
    path === "pending"
      ? (stores: ReadonlyArray<MongoDocumentStorage<Item>>, collection: string): void => {
          for (const store of stores) readPastFlight(store, database_(), collection);
        }
      : (stores: ReadonlyArray<MongoDocumentStorage<Item>>, collection: string): void => {
          for (const store of stores) numberOutside(store, collection);
        };

  const db = (): Db => clients[0]!.db(database);

  describe.each(["transaction", "pending"] as const)("%s path", (path) => {
    it("a read during a held commit stays below it, and the reader then sees both writes", async (context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const { seen, during } = await gateRead(path);
      expect(during).toEqual([]);
      expect(seen).toEqual(["a", "b"]);
    });

    it("with no rule, the same read passes the held commit and the reader loses it", async (context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const { seen, during } = await gateRead(path, faultOf(path, db));
      expect(during).toEqual(["b"]);
      expect(seen).toEqual(["b"]);
    });

    it.for(["new", "rewrite"] as const)("no subscriber loses a write or sees one twice, over seeded schedules: %s ids", async (family, context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const row = await storeRow({ label: `${path}-${family}`, path, family, schedules: STORE_SCHEDULES });
      expectClean(row, STORE_SCHEDULES, STORE_SCHEDULES * WRITES_PER_SCHEDULE);
    });

    it("with no rule, the same schedules lose a write", async (context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const row = await storeRow({ label: `${path}-no-rule`, path, family: "new", schedules: FAULT_SCHEDULES, fault: faultOf(path, db) });
      expect(row.lost.length).toBeGreaterThan(0);
    });
  });

  it.for(["transaction", "pending"] as const)("a read on the client of a held commit does not wait for it, and stays below it: %s path", async (path, context) => {
    if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
    const collection = `race${++next}`;
    const stopped = gate();
    const [store] = storesOf(path, collection, [stopped.holds, FREE, FREE]) as [MongoDocumentStorage<Item>];
    const start = await store.getChangesSince();
    const write = store.set("a", { v: "a" });
    await stopped.reached;
    const during = await store.getChangesSince(start.version);
    stopped.open();
    await write;
    const after = await store.getChangesSince(during.version);
    expect(during.changed).toEqual([]);
    expect(after.changed.map(([id]) => id)).toEqual(["a"]);
  });

  it.for(["transaction", "pending"] as const)("a first read beside a first write has no error and loses nothing, and a second time has one value: %s path", async (path, context) => {
    if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
    let twice = 0;
    for (let round = 0; round < FIRST_READ_ROUNDS; round += 1) {
      const collection = `race${++next}`;
      const [store] = storesOf(path, collection, [FREE, FREE, FREE]) as [MongoDocumentStorage<Item>];
      const [first] = await Promise.all([store.getChangesSince(), store.set("a", { v: "a" })]);
      const after = await store.getChangesSince(first.version);
      const given = [...first.changed, ...after.changed];
      expect(new Set(given.map(([id, item]) => `${id}=${item.v}`))).toEqual(new Set(["a=a"]));
      if (given.length > 1) twice += 1;
    }
    console.log(`race ${JSON.stringify({ name: `${path}-first-read`, rounds: FIRST_READ_ROUNDS, twice })}`);
  });

  /** The ids of a schedule of the order of values, and the value of the first write of each. */
  const ORDER_IDS = ["r0", "r1", "r2", "r3"] as const;
  const FIRST_VALUE = "first";
  const LIST_HOLD_SIZES = [0, 1, 4, 8] as const;

  /** The values of the store, from a read of its current rows. */
  const valuesOf = async (store: MongoDocumentStorage<Item>): Promise<Map<string, string>> =>
    new Map((await store.getChangesSince()).changed.map(([id, item]) => [id, item.v]));

  /** This function makes a new row of the order of values. */
  const newOrderRow = (): OrderRow => ({ schedules: 0, writes: 0, subscribers: 0, fullsHeld: 0, back: [], finalDiffers: [], unknown: [] });

  /** This function starts seeded schedules. The subscribers read during the writes, and a list of a full answer waits. */
  async function orderRow(options: {
    label: string;
    path: StorePath;
    schedules: number;
    sizes?: readonly number[];
    lease?: number;
    wrap?: (store: RaceStorage, draw: Random) => RaceStorage;
  }): Promise<OrderRow> {
    const { label, path, schedules, sizes, lease, wrap } = options;
    const row = newOrderRow();
    for (let n = 0; n < schedules; n += 1) {
      const seed = `order-${label}-${n}`;
      const draw = random(seed);
      const count: HoldCount = { held: 0, readsDuringHold: 0 };
      const collection = `race${++next}`;
      const order = new CommitOrder();
      const holds = clients.map((_, index) => order.holds(holdsOf(draw.fork(`holds${index}`), millis, count, sizes)));
      const listDraw = draw.fork("lists");
      const listHold = async (): Promise<void> => {
        row.fullsHeld += 1;
        await millis(listDraw.pick(LIST_HOLD_SIZES));
      };
      const stores = storesOf(path, collection, holds, lease, listHold);
      const hosts = stores.map((store, index) => {
        const given = store as unknown as RaceStorage;
        return new Host(wrap ? wrap(given, draw.fork(`wrap${index}`)) : given, callWithValues);
      });
      for (const id of ORDER_IDS) await hosts[0]!.write(id, { v: `${id}.${FIRST_VALUE}` });

      let done = false;
      const histories: Array<readonly [string, History]> = [];
      const readers: Array<Promise<void>> = [];
      const followers: ValueFollower[] = [];
      for (const [index, host] of hosts.entries()) {
        const subscriber = new ValueFollower(host);
        followers.push(subscriber);
        histories.push([`follower${index}`, subscriber.history]);
        const history = new History();
        histories.push([`reader${index}`, history]);
        readers.push(cursorReader(host, history, millis, draw.fork(`read${index}`), () => done));
      }
      // The chain of the events starts before a follower joins
      await Promise.all(hosts.map((host) => host.changes()));
      const writes = hosts.map(async (host, index) => {
        const writing = draw.fork(`write${index}`);
        const running: Array<Promise<unknown>> = [];
        for (let w = 0; w < STORE_WRITES; w += 1) {
          const write = host.write(writing.pick(ORDER_IDS), { v: `${index}.${w}` });
          running.push(write);
          if (writing.chance(0.5)) await write;
          await millis(writing.pick(PAUSE_SIZES));
        }
        await Promise.all(running);
      });
      // A follower joins in the middle of the writes, and a second reader of a cursor joins with it
      const joining = draw.fork("join");
      const joins = followers.map(async (subscriber) => {
        await millis(joining.pick(PAUSE_SIZES));
        await subscriber.join();
      });
      for (const [index, host] of hosts.entries()) {
        const history = new History();
        histories.push([`joiner${index}`, history]);
        const pause = joining.pick(PAUSE_SIZES);
        const read = draw.fork(`join${index}`);
        readers.push(millis(pause).then(() => cursorReader(host, history, millis, read, () => done)));
      }
      await Promise.all(writes);
      await Promise.all(joins);
      done = true;
      await Promise.all(readers);
      for (const subscriber of followers) await subscriber.drain();
      row.schedules += 1;
      row.writes += hosts.length * STORE_WRITES;
      readOrder(row, seed, order, histories, await valuesOf(stores[0]!));
    }
    printOrder(label, row);
    return row;
  }

  describe.each(["transaction", "pending"] as const)("the order of values, %s path", (path) => {
    it("a full answer beside two events with values: the values of a subscriber do not go back", async (context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const collection = `race${++next}`;
      const order = new CommitOrder();
      const list = gate();
      let armed = false;
      const listHold = async (): Promise<void> => {
        if (armed) await list.holds.before();
      };
      const [store] = storesOf(path, collection, [order.holds(FREE), FREE, FREE], undefined, listHold) as [MongoDocumentStorage<Item>];
      const host = new Host(store as unknown as RaceStorage, callWithValues);
      const subscriber = new ValueFollower(host);
      await host.write("x", { v: "v1" });
      // An earlier subscriber has started the chain of the events
      await host.changes();
      armed = true;
      const joining = subscriber.join();
      await list.reached;
      armed = false;
      await host.write("x", { v: "v2" });
      await host.write("x", { v: "v3" });
      list.open();
      await joining;
      await subscriber.drain();
      const row = newOrderRow();
      row.schedules = 1;
      row.writes = 3;
      row.fullsHeld = 1;
      readOrder(row, "held-list", order, [["follower", subscriber.history]], await valuesOf(store));
      console.log(`race ${JSON.stringify({ name: `${path}-held-list`, history: subscriber.history.values.get("x"), back: row.back.length, finalDiffers: row.finalDiffers.length })}`);
      expect(subscriber.history.values.get("x")?.at(0)).toBe("v3");
      expect(row.back).toEqual([]);
      expect(row.finalDiffers).toEqual([]);
    });

    it("seeded schedules with a held list: no value goes back, and the last value equals the store", async (context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const row = await orderRow({ label: `${path}-order`, path, schedules: STORE_SCHEDULES });
      expect(row.unknown).toEqual([]);
      expect(row.back).toEqual([]);
      expect(row.finalDiffers).toEqual([]);
      expect(row.fullsHeld).toBeGreaterThan(0);
    });

    it("the flip: a store that gives an old value again fails the row of the order of values", async (context) => {
      if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
      const row = await orderRow({
        label: `${path}-order-flip`,
        path,
        schedules: FAULT_SCHEDULES,
        wrap: (store) => replayingOld(store),
      });
      expect(row.back.length).toBeGreaterThan(0);
    });
  });

  it("the order of values, a write past its lease: no value goes back", async () => {
    const row = await orderRow({ label: "pending-late-order", path: "pending", schedules: FAULT_SCHEDULES, sizes: LATE_HOLD_SIZES, lease: LATE_LEASE_MS });
    expect(row.unknown).toEqual([]);
    expect(row.back).toEqual([]);
    expect(row.finalDiffers).toEqual([]);
  });

  it("a write past its lease loses nothing: a reader can see it twice, with one value", async () => {
    const row = await storeRow({
      label: "pending-late",
      path: "pending",
      family: "new",
      schedules: FAULT_SCHEDULES,
      sizes: LATE_HOLD_SIZES,
      lease: LATE_LEASE_MS,
    });
    expect(row.lost).toEqual([]);
    expect(row.changedValue).toEqual([]);
    expect(row.schedules).toBe(FAULT_SCHEDULES);
    // A row with no second time does not test the contract of a second time
    expect(row.twice.length).toBeGreaterThan(0);
  });
});
