/**
 * A program store in IndexedDB, for a browser (roadmap R45).
 *
 * The programs are in the object store `programs` of one database, with the key of each program
 * as the key of its record. IndexedDB keeps a structured clone of each record, so a caller that
 * changes a result does not change the store. The store checks each record that it reads: the
 * database of a browser can hold records of an older version or of another application.
 */

import { byKey, checkStoredProgram, keyMatches, type ProgramStore, type StoredProgram } from "../program-store/types.js";
import { IdbStoreConnection, type IndexedDbOptions } from "./idb.js";

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

  async put(program: StoredProgram): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    await this.connection.run("readwrite", (store) => {
      store.put(checked);
      return () => undefined;
    });
  }

  delete(key: string): Promise<boolean> {
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
