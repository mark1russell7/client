/**
 * A program store on a collection storage: `InMemoryStorage` of client-collections, or a remote
 * one, `ApiStorage` (the collection procedures of a server) or `HybridStorage` (a local cache with
 * a remote copy). The key of each record is the key of the program.
 */

import type { CollectionStorage } from "@procedures/client";
import { byKey, checkStoredProgram, keyMatches, type ProgramStore, type StoredProgram } from "./types.js";

export class CollectionProgramStore implements ProgramStore {
  readonly kind = "collection";

  /** @param storage - The storage of the records. The store closes it in `close()`. */
  constructor(private readonly storage: CollectionStorage<StoredProgram>) {}

  async get(key: string): Promise<StoredProgram | undefined> {
    const record = await this.storage.get(key);
    // A copy: a local storage (InMemoryStorage) gives its own object
    return record === undefined ? undefined : checkStoredProgram(structuredClone(record));
  }

  async list(prefix?: string): Promise<StoredProgram[]> {
    const records = await this.storage.getAll();
    return byKey(records.map((record) => checkStoredProgram(structuredClone(record))).filter((p) => keyMatches(p.key, prefix)));
  }

  async put(program: StoredProgram): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    await this.storage.set(checked.key, checked);
  }

  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}
