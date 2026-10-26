/**
 * The numbers of the writes of this process (roadmap CLI-77). Each write of a
 * `MongoDocumentStorage` takes numbers of the sequence of its collection (`_seq`). While a watcher
 * of the collection (`watchStorageChanges` with `ownWrites: "skip"`) tracks the collection, the
 * storage notes each number that it takes here. The watcher then knows the change events of the
 * writes of this process: the collection procedures of this process publish their events already.
 *
 * - Each watcher has its own tracker. A tracker takes each noted number once: the event of the
 *   write takes it. A later event with the same `_seq` (for example a raw `$set` that keeps the
 *   field) is not of this process, and the watcher publishes it.
 * - The storage notes numbers only while a tracker of the collection is open, so a process without
 *   a watcher keeps no numbers.
 * - A noted number without an event (for example of an aborted transaction) goes after
 *   `OWN_NUMBER_TTL_MS`, and a tracker keeps at most `MAX_OWN_NUMBERS` numbers: the oldest go
 *   first. A number that goes too early makes a second hint at most, never a lost hint.
 */
import type { Db } from "mongodb";

/** The longest time that a noted number waits for its change event: 5 minutes. */
const OWN_NUMBER_TTL_MS = 5 * 60_000;

/** The most noted numbers of one tracker. */
const MAX_OWN_NUMBERS = 100_000;

/** The noted numbers of one watcher of one collection. */
export interface OwnNumbers {
  /** True when a write of this process noted the number and no event took it yet. The number is then taken. */
  take(seq: number): boolean;
  /** This method ends the tracking: the storage notes no more numbers for it. */
  close(): void;
}

/** The trackers of each collection, by database name and collection name. */
const TRACKERS = new Map<string, Set<Map<number, number>>>();

function keyOf(db: Db, collection: string): string {
  return `${db.databaseName}\u0000${collection}`;
}

/** This function starts a tracker of the numbers that the writes of this process take in a collection. */
export function trackOwnNumbers(db: Db, collection: string): OwnNumbers {
  const key = keyOf(db, collection);
  const numbers = new Map<number, number>();
  let trackers = TRACKERS.get(key);
  if (!trackers) {
    trackers = new Set();
    TRACKERS.set(key, trackers);
  }
  trackers.add(numbers);
  return {
    take(seq: number): boolean {
      return numbers.delete(seq);
    },
    close(): void {
      const set = TRACKERS.get(key);
      set?.delete(numbers);
      if (set?.size === 0) TRACKERS.delete(key);
      numbers.clear();
    },
  };
}

/** This function notes the numbers `first` to `first + count - 1` of a write of this process, for each open tracker of the collection. */
export function noteOwnNumbers(db: Db, collection: string, first: number, count: number): void {
  const trackers = TRACKERS.get(keyOf(db, collection));
  if (!trackers || trackers.size === 0) return;
  const now = Date.now();
  for (const numbers of trackers) {
    for (let seq = first; seq < first + count; seq++) {
      // A number noted again (an aborted transaction gives its numbers again) moves to the end
      numbers.delete(seq);
      numbers.set(seq, now + OWN_NUMBER_TTL_MS);
    }
    // The map keeps the order of the notes: the oldest numbers are first
    for (const [seq, until] of numbers) {
      if (until > now && numbers.size <= MAX_OWN_NUMBERS) break;
      numbers.delete(seq);
    }
  }
}
