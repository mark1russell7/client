/**
 * A program store in IndexedDB, for a browser (roadmap R45).
 *
 * The programs are in the object store `programs` of one database, with the key of each program
 * as the key of its record. IndexedDB keeps a structured clone of each record, so a caller that
 * changes a result does not change the store. The store checks each record that it reads: the
 * database of a browser can hold records of an older version or of another application.
 *
 * The version of a record is a counter. Each put gives one more than the highest version in the
 * store, in the transaction of the write. The database has no field for a counter. Thus after a
 * delete of the record with the highest version, a later put can give that version again.
 */

import {
  byKey,
  checkProgramVersion,
  checkStoredProgram,
  keyMatches,
  nextCounterVersion,
  type ProgramStore,
  type ProgramWriteOptions,
  type StoredProgram,
} from "../program-store/types.js";
import { IdbStoreConnection, onResult, type IndexedDbOptions } from "./idb.js";

/** The default name of the database of the programs. */
export const DEFAULT_PROGRAM_DATABASE = "procedures-programs";

/**
 * A program store in IndexedDB.
 *
 * @example
 * ```typescript
 * import { IndexedDbProgramStore } from "@procedures/store/indexeddb";
 *
 * const store = new IndexedDbProgramStore("my-app-programs");
 * await store.put({ key: "reports.weekly", path: ["reports", "weekly"], program, storedAt: Date.now() });
 * const programs = await store.list("reports");
 * ```
 */
export class IndexedDbProgramStore implements ProgramStore {
  readonly kind = "indexeddb";
  private readonly connection: IdbStoreConnection;

  /**
   * @param name - The name of the database. The store makes it at the first operation.
   * @param options - The IndexedDB factory. The default is the `indexedDB` of the global scope.
   */
  constructor(name: string = DEFAULT_PROGRAM_DATABASE, options: IndexedDbOptions = {}) {
    this.connection = new IdbStoreConnection(name, "programs", { keyPath: "key" }, options.indexedDB);
  }

  /** The name of the database. */
  get name(): string {
    return this.connection.database;
  }

  get(key: string): Promise<StoredProgram | undefined> {
    return this.connection.run("readonly", (store) => {
      const request = store.get(key);
      return () => (request.result === undefined ? undefined : checkStoredProgram(request.result));
    });
  }

  list(prefix?: string): Promise<StoredProgram[]> {
    return this.connection.run("readonly", (store) => {
      const request = store.getAll();
      return () => byKey(request.result.map((record) => checkStoredProgram(record)).filter((program) => keyMatches(program.key, prefix)));
    });
  }

  async put(program: StoredProgram, options?: ProgramWriteOptions): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    await this.connection.run("readwrite", (store, fail) => {
      // The read, the test and the write are one transaction: another tab cannot write between them
      onResult(store.getAll(), fail, (records) => {
        const programs = records.map((record) => checkStoredProgram(record));
        checkProgramVersion(checked.key, programs.find((current) => current.key === checked.key), options);
        store.put({ ...checked, version: nextCounterVersion(0, programs) });
      });
      return () => undefined;
    });
  }

  delete(key: string, options?: ProgramWriteOptions): Promise<boolean> {
    if (options?.expectedVersion !== undefined) {
      return this.connection.run("readwrite", (store, fail) => {
        let existed = false;
        onResult(store.get(key), fail, (record) => {
          const current = record === undefined ? undefined : checkStoredProgram(record);
          checkProgramVersion(key, current, options);
          existed = current !== undefined;
          if (existed) store.delete(key);
        });
        return () => existed;
      });
    }
    return this.connection.run("readwrite", (store) => {
      // The requests of one transaction run in order: the count sees the record before the delete
      const count = store.count(key);
      store.delete(key);
      return () => count.result > 0;
    });
  }

  /** This method closes the database. The programs stay in it. */
  close(): Promise<void> {
    return this.connection.close();
  }
}
