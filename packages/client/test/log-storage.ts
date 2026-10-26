/**
 * A collection storage of a Map with a change log (`v:<number>`), for the tests. It has no import
 * at run time, so the tests of other packages can use it with their own copy of the client.
 */

import type { CollectionStorage, StorageChanges } from "../src/procedures/collection/storage.js";

export class LogStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  private seq = 0;
  private readonly changedAt = new Map<string, number>();
  private readonly deletedAt = new Map<string, number>();

  /** The items are in the storage before the first version: a delta does not have them. */
  constructor(items: Record<string, unknown> = {}) {
    for (const [id, value] of Object.entries(items)) this.data.set(id, value);
  }
  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
  }
  async getChangesSince(since?: string): Promise<StorageChanges<unknown>> {
    const version = `v:${this.seq}`;
    if (since === undefined) return { version, full: true, changed: [...this.data.entries()], deleted: [] };
    const from = Number(since.slice(2));
    const changed = [...this.changedAt].filter(([, at]) => at > from).map(([id]): [string, unknown] => [id, this.data.get(id)]);
    const deleted = [...this.deletedAt].filter(([, at]) => at > from).map(([id]) => id);
    return { version, full: false, changed, deleted };
  }
  async find(predicate: (item: unknown) => boolean) {
    return [...this.data.values()].filter(predicate);
  }
  async has(id: string) {
    return this.data.has(id);
  }
  async size() {
    return this.data.size;
  }
  async set(id: string, value: unknown) {
    this.data.set(id, value);
    this.changedAt.set(id, ++this.seq);
    this.deletedAt.delete(id);
  }
  async delete(id: string) {
    const existed = this.data.delete(id);
    if (existed) {
      this.deletedAt.set(id, ++this.seq);
      this.changedAt.delete(id);
    }
    return existed;
  }
  async clear() {
    for (const id of [...this.data.keys()]) await this.delete(id);
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) await this.set(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (await this.delete(id)) count++;
    return count;
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async close() {}
}
