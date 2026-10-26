/**
 * The writes of this process (roadmap CLI-77). Each write of a `MongoDocumentStorage` takes
 * numbers of the sequence of its collection (`_seq`). While a watcher of the collection
 * (`watchStorageChanges`) tracks the collection, the storage notes here each number that it takes,
 * and the stored `_id` of each tombstone that it prunes. The watcher then knows the change events
 * of the writes of this process.
 *
 * - The numbers: the collection procedures of this process publish the events of these writes
 *   already, so a watcher with `ownWrites: "skip"` skips them.
 * - The pruned tombstones: the delete of a pruned tombstone deletes no item. Without the image
 *   before the change, the event of the delete has only the stored `_id`, so the watcher reads it
 *   here, and skips the event.
 * - Each watcher has its own tracker. A tracker takes each noted entry once: the event of the
 *   write takes it. A later event with the same `_seq` (for example a raw `$set` that keeps the
 *   field) is not of this process, and the watcher reads it as a raw write.
 * - The storage notes entries only while a tracker of the collection is open, so a process without
 *   a watcher keeps nothing.
 * - The trackers of a collection are by the `MongoClient` of the database and the names of the
 *   database and of the collection: two `Db` objects of one database share them.
 * - An entry without an event (for example of an aborted transaction) goes after
 *   `OWN_WRITE_TTL_MS` on the clock of the tracker, and a tracker keeps at most `MAX_OWN_WRITES`
 *   entries of each kind: the oldest go first. An entry that goes too early makes a second hint at
 *   most, never a lost hint.
 * - The numbers of an adoption of a raw write (D39) are never noted: the watcher publishes the
 *   hint of the adoption.
 */
import { BSON, type Db } from "mongodb";
import type { Clock } from "@procedures/client";

/** The longest time that a noted entry waits for its change event: 5 minutes. */
const OWN_WRITE_TTL_MS = 5 * 60_000;

/** The most noted entries of each kind of one tracker. */
const MAX_OWN_WRITES = 100_000;

/** The noted writes of one watcher of one collection. */
export interface OwnNumbers {
  /** True when a write of this process noted the number and no event took it yet. The number is then taken. */
  take(seq: number): boolean;
  /** True when this process pruned the tombstone of the stored `_id` and no event took it yet. The entry is then taken. */
  takePruned(storedId: unknown): boolean;
  /** This method ends the tracking: the storage notes no more entries for it. */
  close(): void;
}

/** The options of `trackOwnNumbers()`. */
export interface TrackOwnNumbersOptions {
  /** False: the tracker keeps only the pruned tombstones, not the numbers (default true). */
  readonly numbers?: boolean | undefined;
  /** The clock of the time limit of the entries (default `Date.now`). */
  readonly clock?: Pick<Clock, "now"> | undefined;
}

interface Tracker {
  readonly numbers: Map<number, number> | undefined;
  readonly pruned: Map<string, number>;
  readonly now: () => number;
}

/** The trackers of each collection: by the client (else the `Db` object), then by the names of the database and the collection. */
const TRACKERS = new WeakMap<object, Map<string, Set<Tracker>>>();

function ownerOf(db: Db): object {
  const client = (db as { client?: unknown }).client;
  return typeof client === "object" && client !== null ? client : db;
}

function nameOf(db: Db, collection: string): string {
  return `${db.databaseName}\u0000${collection}`;
}

function trackersOf(db: Db, collection: string): Set<Tracker> | undefined {
  return TRACKERS.get(ownerOf(db))?.get(nameOf(db, collection));
}

/** The key of a stored `_id` in a tracker: its extended JSON, so an `ObjectId` and a text never meet. */
function idKey(storedId: unknown): string {
  return BSON.EJSON.stringify({ v: storedId as never }, { relaxed: false });
}

/** This function notes some keys in a map with a time limit, and drops the old ones. */
function noteAll<K>(map: Map<K, number>, keys: Iterable<K>, now: number): void {
  for (const key of keys) {
    // A key noted again (an aborted transaction gives its numbers again) moves to the end
    map.delete(key);
    map.set(key, now + OWN_WRITE_TTL_MS);
  }
  // The map keeps the order of the notes: the oldest keys are first
  for (const [key, until] of map) {
    if (until > now && map.size <= MAX_OWN_WRITES) break;
    map.delete(key);
  }
}

/** This function starts a tracker of the writes of this process in a collection. */
export function trackOwnNumbers(db: Db, collection: string, options: TrackOwnNumbersOptions = {}): OwnNumbers {
  const owner = ownerOf(db);
  const name = nameOf(db, collection);
  const clock = options.clock;
  const tracker: Tracker = {
    numbers: options.numbers === false ? undefined : new Map(),
    pruned: new Map(),
    now: clock ? () => clock.now() : Date.now,
  };
  let byName = TRACKERS.get(owner);
  if (!byName) {
    byName = new Map();
    TRACKERS.set(owner, byName);
  }
  let trackers = byName.get(name);
  if (!trackers) {
    trackers = new Set();
    byName.set(name, trackers);
  }
  trackers.add(tracker);
  const live = (map: Map<unknown, number>, key: unknown): boolean => {
    const until = map.get(key);
    if (until === undefined) return false;
    map.delete(key);
    return until > tracker.now();
  };
  return {
    take(seq: number): boolean {
      return tracker.numbers !== undefined && live(tracker.numbers as Map<unknown, number>, seq);
    },
    takePruned(storedId: unknown): boolean {
      return live(tracker.pruned as Map<unknown, number>, idKey(storedId));
    },
    close(): void {
      const set = TRACKERS.get(owner)?.get(name);
      set?.delete(tracker);
      if (set?.size === 0) TRACKERS.get(owner)?.delete(name);
      tracker.numbers?.clear();
      tracker.pruned.clear();
    },
  };
}

/** This function notes the numbers `first` to `first + count - 1` of a write of this process, for each open tracker of the collection. */
export function noteOwnNumbers(db: Db, collection: string, first: number, count: number): void {
  const trackers = trackersOf(db, collection);
  if (!trackers) return;
  for (const tracker of trackers) {
    if (!tracker.numbers) continue;
    const numbers: number[] = [];
    for (let seq = first; seq < first + count; seq++) numbers.push(seq);
    noteAll(tracker.numbers, numbers, tracker.now());
  }
}

/** This function notes the stored `_id` of each tombstone that this process prunes, for each open tracker of the collection. Call it before the delete. */
export function notePrunedIds(db: Db, collection: string, storedIds: readonly unknown[]): void {
  const trackers = trackersOf(db, collection);
  if (!trackers) return;
  const keys = storedIds.map(idKey);
  for (const tracker of trackers) noteAll(tracker.pruned, keys, tracker.now());
}
