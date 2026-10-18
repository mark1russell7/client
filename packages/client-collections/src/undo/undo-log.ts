import { applyPatch, type StoragePatch, type StoragePatchOperations } from "@procedures/client/query";
import type { CollectionStorage } from "../storage/interface.js";
import { inversePatch } from "./inverse.js";

/** One change of one item, as the caller gives it to `UndoLog.record`. */
export interface UndoChange {
  /** The name of the collection of the item. */
  readonly collection: string;
  /** The id of the item. */
  readonly id: string;
  /** The item before the change. `undefined` or `null`: the item did not exist. */
  readonly before: unknown;
  /** The patch of the change. Without a patch, the change replaced or removed the whole item. */
  readonly patch?: StoragePatch;
  /**
   * The item after the change, as the storage keeps it. `undefined` or `null`: the change removed
   * the item. With a patch, the default is `applyPatch(before, patch)`. Give the result of
   * `patch` of the storage when the storage changes the value, for example when it adds the id.
   */
  readonly after?: unknown;
  /**
   * The changes with the same group undo together, for example the two items of a move. Give each
   * action a new group id: two actions with one id undo as one.
   */
  readonly group?: string;
}

/** One entry of an undo log. */
export interface UndoEntry {
  /** The id of the entry in the storage of the log. */
  readonly key: string;
  /** The name of the collection of the item. */
  readonly collection: string;
  /** The id of the item. */
  readonly id: string;
  /** The patch that undoes the change. An entry without it restores `item`. */
  readonly inverse?: StoragePatchOperations;
  /** The whole item before the change, when the entry has no `inverse`. `null`: the item did not exist. */
  readonly item?: unknown;
  /** The fingerprint of the item after the change. The undo refuses an item that changed since. */
  readonly after: string;
  /** The group of the change. */
  readonly group?: string;
  /** The time of the change, in milliseconds. */
  readonly at: number;
  /** The order of the entries of one log with the same time. */
  readonly seq: number;
}

/** The options of an `UndoLog`. */
export interface UndoLogOptions {
  /** The most entries. The log removes the oldest entries past this number. The default is 50. */
  readonly cap?: number;
  /** The clock, in milliseconds. The default is `Date.now`. */
  readonly now?: () => number;
}

/**
 * The error of an undo of an item that changed after the recorded change, for example by another
 * writer. The undo writes nothing, and its entries stay in the log.
 */
export class UndoConflictError extends Error {
  /** The entry whose item changed. */
  readonly entry: UndoEntry;

  constructor(entry: UndoEntry) {
    super(`The undo of ${entry.collection}/${entry.id} is refused: the item changed after the recorded change`);
    this.name = "UndoConflictError";
    this.entry = entry;
  }
}

/** True for an object that is not an array and not null. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The JSON text of a value with the keys of each object in order. A missing item is `undefined`. */
function canonical(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : canonical(item))).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The fingerprint of an item: a 64-bit hash of its canonical JSON text, in hexadecimal. A missing
 * item and `null` have the same fingerprint. Two items with the same fields in another order have
 * the same fingerprint.
 */
export function fingerprintOf(item: unknown): string {
  const text = canonical(item);
  // Two 32-bit FNV-1a hashes with different offsets: no dependency, and the same in each runtime
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x01000193) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** The newest entry first: by time, then by the order of the log. */
function newestFirst(a: UndoEntry, b: UndoEntry): number {
  return b.at - a.at || b.seq - a.seq;
}

/**
 * An undo log of the changes of items in collection storages (Graph's split, wave 2, W10). Each
 * entry keeps the patch that undoes one change (`inversePatch`), or the whole item before the
 * change when no patch can undo it, and the fingerprint of the item after the change.
 *
 * `undo()` undoes the newest entry and the entries of its group. It first reads each item and
 * compares it with the fingerprint. When another writer changed an item after the recorded change,
 * the undo writes nothing and gives an `UndoConflictError`. Then each item gets one write through
 * its storage, so an undo reaches the observers of the storage as a change.
 *
 * @example
 * ```ts
 * const log = new UndoLog(new InMemoryStorage<UndoEntry>(), (name) => storages[name]);
 * const before = await notes.get("n1");
 * const after = await notes.patch!("n1", { $remove: ["tags.0"] });
 * await log.record({ collection: "notes", id: "n1", before, patch: { $remove: ["tags.0"] }, after });
 * await log.undo(); // the tag is back
 * ```
 */
export class UndoLog {
  readonly #entries: CollectionStorage<UndoEntry>;
  readonly #storageOf: (collection: string) => CollectionStorage<unknown> | undefined;
  readonly #cap: number;
  readonly #now: () => number;
  #seq = 0;

  /**
   * @param entries - The storage of the entries of the log
   * @param storageOf - The storage of each collection that the log can undo
   * @param options - The cap and the clock
   */
  constructor(
    entries: CollectionStorage<UndoEntry>,
    storageOf: (collection: string) => CollectionStorage<unknown> | undefined,
    options: UndoLogOptions = {},
  ) {
    this.#entries = entries;
    this.#storageOf = storageOf;
    this.#cap = Math.max(1, Math.floor(options.cap ?? 50));
    this.#now = options.now ?? Date.now;
  }

  /**
   * This method records one change, and gives its entry. It keeps the inverse patch of the change
   * when one exists, or else the whole item before the change, and the fingerprint of the item
   * after the change. Then it removes the oldest entries past the cap.
   *
   * @throws TypeError when `applyPatch` refuses the patch of the change
   */
  async record(change: UndoChange): Promise<UndoEntry> {
    const at = this.#now();
    const seq = ++this.#seq;
    const inverse = change.patch === undefined ? undefined : inversePatch(change.before, change.patch);
    const after = "after" in change || change.patch === undefined ? change.after : applyPatch(change.before, change.patch);
    const entry: UndoEntry = {
      key: `undo_${at}_${seq}_${Math.random().toString(36).slice(2, 8)}`,
      collection: change.collection,
      id: change.id,
      ...(inverse === undefined ? { item: change.before ?? null } : { inverse }),
      after: fingerprintOf(after),
      ...(change.group === undefined ? {} : { group: change.group }),
      at,
      seq,
    };
    await this.#entries.set(entry.key, entry);
    const all = (await this.#entries.getAll()).sort(newestFirst);
    const old = all.slice(this.#cap).map((e) => e.key);
    if (old.length > 0) await this.#entries.deleteBatch(old);
    return entry;
  }

  /** This method gives the entries, the newest first. */
  async entries(): Promise<UndoEntry[]> {
    return (await this.#entries.getAll()).sort(newestFirst);
  }

  /**
   * This method undoes the newest change, and each change of its group, the newest first. It
   * removes their entries, and gives them. An empty list means that the log is empty.
   *
   * It reads and checks each item before the first write. A refused undo writes nothing, and its
   * entries stay in the log.
   *
   * @throws UndoConflictError when an item changed after its recorded change
   * @throws Error when the log has no storage for a collection
   */
  async undo(): Promise<UndoEntry[]> {
    const all = await this.entries();
    const top = all[0];
    if (top === undefined) return [];
    const entries = top.group === undefined ? [top] : all.filter((e) => e.group === top.group);

    // The check, and the value of each item after the undo of its entries (newest first)
    const items = new Map<string, { storage: CollectionStorage<unknown>; id: string; value: unknown }>();
    for (const entry of entries) {
      const storage = this.#storageOf(entry.collection);
      if (storage === undefined) throw new Error(`The undo log has no storage for the collection ${entry.collection}`);
      const address = JSON.stringify([entry.collection, entry.id]);
      const item = items.get(address) ?? { storage, id: entry.id, value: await storage.get(entry.id) };
      if (fingerprintOf(item.value) !== entry.after) throw new UndoConflictError(entry);
      item.value = entry.inverse === undefined ? (entry.item ?? undefined) : applyPatch(item.value, entry.inverse);
      items.set(address, item);
    }

    // One write for each item
    for (const { storage, id, value } of items.values()) {
      if (value === undefined || value === null) await storage.delete(id);
      else await storage.set(id, value);
    }
    await this.#entries.deleteBatch(entries.map((e) => e.key));
    return entries;
  }
}
