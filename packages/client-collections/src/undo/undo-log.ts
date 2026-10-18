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
  /** The changes with the same group undo together, for example the two items of a move. */
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

/** The newest entry first: by time, then by the order of the log. */
function newestFirst(a: UndoEntry, b: UndoEntry): number {
  return b.at - a.at || b.seq - a.seq;
}

/**
 * An undo log of the changes of items in collection storages (Graph's split, wave 2, W10). Each
 * entry keeps the patch that undoes one change (`inversePatch`), or the whole item before the
 * change when no patch can undo it. `undo()` applies the newest entry and the entries of its group
 * through the storage of each item, so an undo reaches the observers of the storage as a change.
 *
 * @example
 * ```ts
 * const log = new UndoLog(new InMemoryStorage<UndoEntry>(), (name) => storages[name]);
 * const before = await notes.get("n1");
 * await notes.patch!("n1", { $remove: ["tags.0"] });
 * await log.record({ collection: "notes", id: "n1", before, patch: { $remove: ["tags.0"] } });
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
   * when one exists, or else the whole item before the change. Then it removes the oldest entries
   * past the cap.
   *
   * @throws TypeError when `applyPatch` refuses the patch of the change
   */
  async record(change: UndoChange): Promise<UndoEntry> {
    const at = this.#now();
    const seq = ++this.#seq;
    const inverse = change.patch === undefined ? undefined : inversePatch(change.before, change.patch);
    const entry: UndoEntry = {
      key: `undo_${at}_${seq}_${Math.random().toString(36).slice(2, 8)}`,
      collection: change.collection,
      id: change.id,
      ...(inverse === undefined ? { item: change.before ?? null } : { inverse }),
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
   * @throws Error when the log has no storage for a collection, or when a storage refuses the undo.
   *   The entry of that change stays in the log.
   */
  async undo(): Promise<UndoEntry[]> {
    const all = await this.entries();
    const top = all[0];
    if (top === undefined) return [];
    const entries = top.group === undefined ? [top] : all.filter((e) => e.group === top.group);
    for (const entry of entries) {
      await this.#apply(entry);
      await this.#entries.delete(entry.key);
    }
    return entries;
  }

  /** This method applies the undo of one entry through the storage of its collection. */
  async #apply(entry: UndoEntry): Promise<void> {
    const storage = this.#storageOf(entry.collection);
    if (storage === undefined) throw new Error(`The undo log has no storage for the collection ${entry.collection}`);
    if (entry.inverse !== undefined) {
      if (storage.patch) {
        await storage.patch(entry.id, entry.inverse);
        return;
      }
      const current = await storage.get(entry.id);
      if (current !== undefined) await storage.set(entry.id, applyPatch(current, entry.inverse));
      return;
    }
    if (entry.item === null || entry.item === undefined) await storage.delete(entry.id);
    else await storage.set(entry.id, entry.item);
  }
}
