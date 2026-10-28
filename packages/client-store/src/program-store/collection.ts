/**
 * A program store on a collection storage: `InMemoryStorage` of client-collections, or a remote
 * one, `ApiStorage` (the collection procedures of a server) or `HybridStorage` (a local cache with
 * a remote copy). The key of each record is the key of the program.
 *
 * The version of a record is a revision string: a counter and a random part, for example
 * `"3-k2j9x0aq"`. The storage tests `expectedVersion` itself, with its own `versionOf`, in one
 * step with the write. So give the storage the option `versionOf: storedProgramVersion`. A storage
 * without `versionOf` rejects a write with `expectedVersion` (a `TypeError`). It accepts a write
 * without `expectedVersion`.
 */

import type { CollectionStorage } from "@procedures/client";
import {
  byKey,
  checkStoredProgram,
  expectedVersionOf,
  keyMatches,
  type ProgramStore,
  type ProgramWriteOptions,
  type StoredProgram,
} from "./types.js";

/** The counter of a revision string: the digits before the dash, or 0. */
function revisionCounter(version: string | number | null | undefined): number {
  const counter = Number.parseInt(String(version ?? "0"), 10);
  return Number.isSafeInteger(counter) && counter > 0 ? counter : 0;
}

/** A new revision string after a version. The random part makes two writes of one base differ. */
function nextRevision(version: string | number | null | undefined): string {
  return `${revisionCounter(version) + 1}-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
}

export class CollectionProgramStore implements ProgramStore {
  readonly kind = "collection";

  /**
   * @param storage - The storage of the records. The store closes it in `close()`. Give it the
   *   option `versionOf: storedProgramVersion`, so that it can test `expectedVersion`.
   */
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

  async put(program: StoredProgram, options?: ProgramWriteOptions): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    const expected = expectedVersionOf(options);
    // The expected version is the base of the write. Without it, the current record is the base.
    const base = expected !== undefined ? expected : (await this.storage.get(checked.key))?.version;
    const record: StoredProgram = { ...checked, version: nextRevision(base) };
    await this.storage.set(checked.key, record, expected === undefined ? undefined : { expectedVersion: expected });
  }

  async delete(key: string, options?: ProgramWriteOptions): Promise<boolean> {
    const expected = expectedVersionOf(options);
    return expected === undefined ? this.storage.delete(key) : this.storage.delete(key, { expectedVersion: expected });
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}
