/**
 * A sync state store in IndexedDB, for the `HybridStorage` of a browser (roadmap CLI-21).
 *
 * The state is in the object store `state` of one database: one record for the cursor, and one
 * record for the base version of each id. A change writes only the records that it names, in one
 * transaction, so a reader never sees a part of it. Give each storage its own database.
 */

import type { SyncState, SyncStateChange, SyncStateStore } from "../storage/sync-state.js";
import { IdbStoreConnection, type IndexedDbOptions } from "./idb.js";

/** The key of the record of the cursor. The keys of the bases start with `BASE`. */
const CURSOR_KEY = "cursor";
const BASE = "base:";

/** A record of the object store. */
type StateRecord = { readonly kind: "cursor"; readonly cursor?: string } | { readonly kind: "base"; readonly id: string; readonly version: string | null };

/** The state of the records, or an error for a record of another form. */
function stateOf(records: readonly unknown[], name: string): SyncState | undefined {
  if (records.length === 0) return undefined;
  let cursor: string | undefined;
  const bases: Array<[string, string | null]> = [];
  records.forEach((value, index) => {
    const record = value as Partial<{ kind: unknown; cursor: unknown; id: unknown; version: unknown }> | null;
    if (record?.kind === "cursor" && (record.cursor === undefined || typeof record.cursor === "string")) {
      cursor = record.cursor;
    } else if (record?.kind === "base" && typeof record.id === "string" && (record.version === null || typeof record.version === "string")) {
      bases.push([record.id, record.version]);
    } else {
      throw new Error(`The sync state database ${name} has a record that is not a sync state (record ${index + 1})`);
    }
  });
  return { ...(cursor !== undefined && { cursor }), bases };
}

/**
 * A sync state store in IndexedDB.
 *
 * @example
 * ```typescript
 * import { HybridStorage } from "@procedures/store";
 * import { IndexedDbQueueStore, IndexedDbSyncStateStore } from "@procedures/store/indexeddb";
 *
 * const users = new HybridStorage(remote, {
 *   local: durableLocalCopy,
 *   queueStore: new IndexedDbQueueStore("users-queue"),
 *   syncState: new IndexedDbSyncStateStore("users-sync"),
 * });
 * ```
 */
export class IndexedDbSyncStateStore implements SyncStateStore {
  private readonly connection: IdbStoreConnection;

  /**
   * @param name - The name of the database: one database for each storage. The store makes it at the first operation.
   * @param options - The IndexedDB factory. The default is the `indexedDB` of the global scope.
   */
  constructor(name: string, options: IndexedDbOptions = {}) {
    if (typeof name !== "string" || name === "") throw new TypeError("IndexedDbSyncStateStore needs the name of a database");
    this.connection = new IdbStoreConnection(name, "state", {}, options.indexedDB);
  }

  /** The name of the database. */
  get name(): string {
    return this.connection.database;
  }

  load(): Promise<SyncState | undefined> {
    return this.connection.run("readonly", (store) => {
      const request = store.getAll();
      return () => stateOf(request.result, this.name);
    });
  }

  async write(change: SyncStateChange): Promise<void> {
    await this.connection.run("readwrite", (store) => {
      if (change.reset) store.clear();
      const cursor: StateRecord = change.cursor === undefined ? { kind: "cursor" } : { kind: "cursor", cursor: change.cursor };
      store.put(cursor, CURSOR_KEY);
      for (const [id, version] of change.bases) {
        const record: StateRecord = { kind: "base", id, version };
        store.put(record, BASE + id);
      }
      for (const id of change.forgotten) store.delete(BASE + id);
      return () => undefined;
    });
  }

  async clear(): Promise<void> {
    await this.connection.run("readwrite", (store) => {
      store.clear();
      return () => undefined;
    });
  }

  /** This method closes the database. The state stays in it. */
  close(): Promise<void> {
    return this.connection.close();
  }
}
