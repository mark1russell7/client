/**
 * The sync state of a `HybridStorage` and the store that keeps it (roadmap CLI-21).
 *
 * The sync state is the cursor (the remote version of the last pull) and the base versions (the
 * last known remote version of each id). A store keeps them after a reload. A new storage with the
 * same store then asks the remote only for the changes since the cursor, and it finds the conflicts
 * of the writes after the reload.
 *
 * - `MemorySyncStateStore` keeps the state in memory. A new storage that gets the same instance
 *   loads the state, so the tests can simulate a reload.
 * - `IndexedDbSyncStateStore` keeps the state in IndexedDB, for a browser. It is in
 *   `@procedures/store/indexeddb`.
 *
 * The state belongs to its local copy. Give a store only with a durable local copy, and give each
 * storage its own store.
 */

/** The sync state of a `HybridStorage`. Each field is JSON. */
export interface SyncState {
  /** The remote version of the last pull, or undefined: the next pull reads all items. */
  readonly cursor?: string | undefined;
  /** The last known remote version of each id. `null`: the remote has no item. */
  readonly bases: ReadonlyArray<readonly [string, string | null]>;
}

/** A change of the sync state, from a `HybridStorage` to its store. */
export interface SyncStateChange extends SyncState {
  /** True: the change replaces the whole state. False: it changes the cursor and the ids that it names. */
  readonly reset: boolean;
  /** The ids whose base is not known any more. Empty when `reset` is true. */
  readonly forgotten: readonly string[];
}

/**
 * The store of the sync state of a `HybridStorage` (roadmap CLI-21). The storage calls the methods
 * one at a time, in the order of the changes.
 */
export interface SyncStateStore {
  /** This method gives the state that the store holds, or undefined when it holds none. */
  load(): Promise<SyncState | undefined>;
  /** This method writes a change of the state. */
  write(change: SyncStateChange): Promise<void>;
  /** This method removes the state. */
  clear(): Promise<void>;
}

/** A sync state store in memory. Its state lives as long as the instance. */
export class MemorySyncStateStore implements SyncStateStore {
  private cursor: string | undefined;
  private readonly bases = new Map<string, string | null>();
  private written = false;

  load(): Promise<SyncState | undefined> {
    if (!this.written) return Promise.resolve(undefined);
    return Promise.resolve({ ...(this.cursor !== undefined && { cursor: this.cursor }), bases: [...this.bases] });
  }

  write(change: SyncStateChange): Promise<void> {
    if (change.reset) this.bases.clear();
    this.cursor = change.cursor;
    for (const [id, version] of change.bases) this.bases.set(id, version);
    for (const id of change.forgotten) this.bases.delete(id);
    this.written = true;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.cursor = undefined;
    this.bases.clear();
    this.written = false;
    return Promise.resolve();
  }

  /** The number of base versions that the store holds. */
  get size(): number {
    return this.bases.size;
  }
}

/** True when a value has the shape of a sync state. A loaded store can hold anything. */
export function isSyncState(value: unknown): value is SyncState {
  if (typeof value !== "object" || value === null) return false;
  const { cursor, bases } = value as { cursor?: unknown; bases?: unknown };
  return (
    (cursor === undefined || typeof cursor === "string") &&
    Array.isArray(bases) &&
    bases.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && (entry[1] === null || typeof entry[1] === "string"))
  );
}
