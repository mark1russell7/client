/**
 * A queue store in IndexedDB, for the `HybridStorage` of a browser (roadmap R28, R45).
 *
 * The operations are in the object store `operations` of one database, under keys that IndexedDB
 * makes in increasing order. `load` gives them in the order of the keys: the oldest first. A
 * `replace` clears the store and adds the operations in one transaction, so a reader never sees a
 * part of it. Give each storage its own database.
 */

import { isQueuedOperation, type QueuedOperation, type QueueStore } from "../storage/queue.js";
import { IdbStoreConnection, type IndexedDbOptions } from "./idb.js";

/**
 * A queue store in IndexedDB.
 *
 * @example
 * ```typescript
 * import { HybridStorage } from "@procedures/store";
 * import { IndexedDbQueueStore } from "@procedures/store/indexeddb";
 *
 * const users = new HybridStorage(remote, { mode: "write-back", queueStore: new IndexedDbQueueStore("users-queue") });
 * ```
 */
export class IndexedDbQueueStore implements QueueStore {
  private readonly connection: IdbStoreConnection;

  /**
   * @param name - The name of the database: one database for each storage. The store makes it at the first operation.
   * @param options - The IndexedDB factory. The default is the `indexedDB` of the global scope.
   */
  constructor(name: string, options: IndexedDbOptions = {}) {
    if (typeof name !== "string" || name === "") throw new TypeError("IndexedDbQueueStore needs the name of a database");
    this.connection = new IdbStoreConnection(name, "operations", { autoIncrement: true }, options.indexedDB);
  }

  /** The name of the database. */
  get name(): string {
    return this.connection.database;
  }

  load(): Promise<QueuedOperation[]> {
    return this.connection.run("readonly", (store) => {
      const request = store.getAll();
      return () =>
        request.result.map((value, index) => {
          if (!isQueuedOperation(value)) {
            throw new Error(`The queue database ${this.name} has a record that is not a queued operation (record ${index + 1})`);
          }
          return value;
        });
    });
  }

  async append(operation: QueuedOperation): Promise<void> {
    await this.connection.run("readwrite", (store) => {
      store.add(operation);
      return () => undefined;
    });
  }

  async replace(operations: QueuedOperation[]): Promise<void> {
    await this.connection.run("readwrite", (store) => {
      store.clear();
      for (const operation of operations) store.add(operation);
      return () => undefined;
    });
  }

  async clear(): Promise<void> {
    await this.connection.run("readwrite", (store) => {
      store.clear();
      return () => undefined;
    });
  }

  /** This method closes the database. The operations stay in it. */
  close(): Promise<void> {
    return this.connection.close();
  }
}
