/**
 * A collection storage over the db of an artifact page.
 *
 * An artifact page gets a small document database from its host with `window.claude.use("db")`.
 * The database has documents at paths, for example `notes/a1`, and each document is a JSON object.
 * `ArtifactDbStorage` gives one collection of that database as a `CollectionStorage`. Thus a
 * `HybridStorage` can use it as its remote: the page keeps a local copy, and the db of the page
 * keeps the shared copy.
 *
 * - Each item is one document `<collection>/<id>` with the fields `value` and `order`. `value` is
 *   the item, so the storage keeps any JSON value, also `null`. `order` keeps the order of the
 *   first set of the id.
 * - The storage reads only its own documents. A document of the collection without these two
 *   fields is not an item: the storage does not read, count or delete it.
 * - An id can have each character. The storage escapes each character that the path grammar of
 *   the db refuses, as `~` and two hexadecimal digits for each UTF-8 byte.
 * - The storage cannot test a version: a write with an expected version rejects with a
 *   `TypeError` and changes nothing.
 * - A batch is a sequence of single writes, not one transaction.
 * - An error of the db gets a code of the store. The codes `unavailable` and
 *   `resource_exhausted` give `retryable: true`, so a `HybridStorage` keeps the write in its queue.
 *   The code `invalid_argument` gives `VALIDATION_ERROR`, a refusal.
 *
 * This module imports no module at run time. A page that loads it gets only this storage.
 */

import type {
  CollectionStorage,
  StorageBatchWriteOptions,
  StorageItemWriteOptions,
  StorageMetadata,
} from "@procedures/collections";

/** The body of a document of the db: a JSON object. */
export type ArtifactDbData = Record<string, unknown>;

/** A snapshot of one document. */
export interface ArtifactDbDocSnapshot {
  readonly id: string;
  readonly exists: boolean;
  data(): ArtifactDbData | undefined;
}

/** A snapshot of the documents of a collection. */
export interface ArtifactDbQuerySnapshot {
  readonly docs: readonly ArtifactDbDocSnapshot[];
}

/** The reference of one document: the part of the db that the storage uses. */
export interface ArtifactDbDocRef {
  get(): Promise<ArtifactDbDocSnapshot>;
  set(data: ArtifactDbData): Promise<void>;
  delete(): Promise<void>;
}

/** The reference of a collection: the part of the db that the storage uses. */
export interface ArtifactDbCollectionRef {
  get(): Promise<ArtifactDbQuerySnapshot>;
}

/** The db of an artifact page, as `window.claude.use("db")` gives it. */
export interface ArtifactDb {
  doc(path: string): ArtifactDbDocRef;
  collection(path: string): ArtifactDbCollectionRef;
}

/** The options of an `ArtifactDbStorage`. */
export interface ArtifactDbStorageOptions {
  /** The path of the collection in the db, for example `notes`. It has an odd number of segments. */
  readonly collection: string;
  /**
   * The clock of the order of a new id, in milliseconds. A new id gets a value above each value of
   * this storage.
   * @default Date.now
   */
  readonly now?: (() => number) | undefined;
}

/** An error of the db with the code of the store. */
export class ArtifactDbError extends Error {
  /** The code of the store: `UNAVAILABLE`, `VALIDATION_ERROR` or the code of the db in capitals. */
  readonly code: string;
  /** True when a later send of the same write can succeed. */
  readonly retryable: boolean;
  /** The code of the db, for example `unavailable`. */
  readonly dbCode: string;

  constructor(dbCode: string, message: string, cause: unknown) {
    super(message, { cause });
    this.name = "ArtifactDbError";
    this.dbCode = dbCode;
    this.retryable = RETRYABLE.has(dbCode);
    this.code = this.retryable ? "UNAVAILABLE" : dbCode === "invalid_argument" ? "VALIDATION_ERROR" : dbCode.toUpperCase();
  }
}

/** The codes of the db that tell "not available now". */
const RETRYABLE: ReadonlySet<string> = new Set(["unavailable", "resource_exhausted"]);

/** The characters of a segment of a db path. */
const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;

/** The longest segment of a db path. */
const MAX_SEGMENT = 200;

/** The characters that an id keeps as they are. The storage escapes `~` and each other character. */
const PLAIN = /^[A-Za-z0-9_\-.:@+]$/;

/** The text of an empty id. An escape always has two digits after `~`, so a single `~` is free. */
const EMPTY_ID = "~";

/** One stored document of this storage. */
interface Envelope {
  readonly value: unknown;
  readonly order: number;
}

/**
 * This function gives the segment of an id: the id with each character outside the path grammar
 * escaped. The id `.` and the id `..` get escaped dots.
 *
 * @param id - The id of an item
 * @returns The segment of the document
 * @throws TypeError when the segment is longer than the limit of the db
 */
export function artifactDbSegment(id: string): string {
  if (id === "") return EMPTY_ID;
  let out = "";
  for (const char of id) {
    if (PLAIN.test(char)) out += char;
    else for (const byte of new TextEncoder().encode(char)) out += `~${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  if (out === "." || out === "..") out = out.replace(/\./g, "~2E");
  if (out.length > MAX_SEGMENT) throw new TypeError(`The id "${id.slice(0, 40)}..." gives a segment of ${out.length} characters. The db takes at most ${MAX_SEGMENT}.`);
  return out;
}

/**
 * This function gives the id of a segment, the reverse of `artifactDbSegment`.
 *
 * @param segment - The segment of a document
 * @returns The id, or undefined when the segment has an escape that is not correct
 */
export function artifactDbId(segment: string): string | undefined {
  if (segment === EMPTY_ID) return "";
  const bytes: number[] = [];
  let out = "";
  const flush = (): boolean => {
    if (bytes.length === 0) return true;
    try {
      out += new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      return false;
    }
    bytes.length = 0;
    return true;
  };
  for (let index = 0; index < segment.length; index++) {
    const char = segment[index]!;
    if (char === "~") {
      const hex = segment.slice(index + 1, index + 3);
      if (!/^[0-9A-F]{2}$/.test(hex)) return undefined;
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
      continue;
    }
    if (!flush()) return undefined;
    out += char;
  }
  return flush() ? out : undefined;
}

/** True for a document that this storage wrote. */
function isEnvelope(data: ArtifactDbData | undefined): data is ArtifactDbData & Envelope {
  return data !== undefined && Object.prototype.hasOwnProperty.call(data, "value") && typeof data["order"] === "number" && Number.isFinite(data["order"]);
}

/** This function gives a copy of a JSON value. It throws a `TypeError` for a value that JSON cannot keep. */
function jsonCopy<T>(value: T): T {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError("The value of an item must be a JSON value.");
  return JSON.parse(text) as T;
}

/** This function gives the error of the store for an error of the db. An error without a code stays as it is. */
function storeError(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || error instanceof ArtifactDbError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ArtifactDbError(code, message, error);
}

/**
 * A `CollectionStorage` over one collection of the db of an artifact page. The module comment
 * gives the format of the documents and the limits.
 *
 * ```ts
 * const db = await window.claude.use("db");
 * const remote = new ArtifactDbStorage<Note>(db, { collection: "notes" });
 * const notes = new HybridStorage<Note>(remote, { mode: "write-back" });
 * ```
 */
export class ArtifactDbStorage<T> implements CollectionStorage<T> {
  /** The path of the collection in the db. */
  readonly collection: string;

  private readonly db: ArtifactDb;
  private readonly now: () => number;
  private lastOrder = 0;
  private closed = false;

  constructor(db: ArtifactDb, options: ArtifactDbStorageOptions) {
    if (db === null || typeof db !== "object" || typeof db.doc !== "function" || typeof db.collection !== "function") {
      throw new TypeError("ArtifactDbStorage needs the db of an artifact page, with doc() and collection()");
    }
    const collection = options?.collection;
    if (typeof collection !== "string") throw new TypeError("ArtifactDbStorage needs the path of a collection");
    const parts = collection.split("/");
    if (parts.length % 2 === 0 || parts.some((part) => !SEGMENT.test(part) || part === "." || part === ".." || part.length > MAX_SEGMENT)) {
      throw new TypeError(`The collection path "${collection}" is not correct: it needs an odd number of segments, each in the path grammar of the db`);
    }
    this.db = db;
    this.collection = collection;
    this.now = options.now ?? Date.now;
  }

  async get(id: string): Promise<T | undefined> {
    this.ensureOpen();
    const found = await this.read(id);
    return found === undefined ? undefined : (found.value as T);
  }

  async getAll(): Promise<T[]> {
    return (await this.getEntries()).map(([, value]) => value);
  }

  async getEntries(): Promise<Array<[string, T]>> {
    this.ensureOpen();
    return (await this.list()).map(({ id, value }) => [id, value as T]);
  }

  async getIds(): Promise<string[]> {
    this.ensureOpen();
    return (await this.list()).map(({ id }) => id);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter((item) => predicate(item));
  }

  async has(id: string): Promise<boolean> {
    this.ensureOpen();
    return (await this.read(id)) !== undefined;
  }

  async size(): Promise<number> {
    this.ensureOpen();
    return (await this.list()).length;
  }

  async set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void> {
    this.ensureOpen();
    if (options?.expectedVersion !== undefined) throw this.noVersions();
    await this.write(id, jsonCopy(value));
  }

  async delete(id: string, options?: StorageItemWriteOptions): Promise<boolean> {
    this.ensureOpen();
    if (options?.expectedVersion !== undefined) throw this.noVersions();
    return this.remove(id);
  }

  async clear(): Promise<void> {
    this.ensureOpen();
    for (const { id } of await this.list()) await this.remove(id);
  }

  async setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void> {
    this.ensureOpen();
    if (options?.expectedVersions !== undefined && options.expectedVersions.length > 0) throw this.noVersions();
    // The last value of an id wins. The ids keep the order of their first place in the batch.
    const last = new Map<string, T>();
    for (const [id, value] of items) last.set(id, jsonCopy(value));
    for (const [id, value] of last) await this.write(id, value);
  }

  async deleteBatch(ids: string[]): Promise<number> {
    this.ensureOpen();
    let count = 0;
    for (const id of new Set(ids)) if (await this.remove(id)) count += 1;
    return count;
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    this.ensureOpen();
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map((id) => this.read(id)));
    const out = new Map<string, T>();
    unique.forEach((id, index) => {
      const item = found[index];
      if (item !== undefined) out.set(id, item.value as T);
    });
    return out;
  }

  async getMetadata(): Promise<StorageMetadata> {
    this.ensureOpen();
    return { type: "custom", size: (await this.list()).length };
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** This method throws when the storage is closed. */
  private ensureOpen(): void {
    if (this.closed) throw new Error("The ArtifactDbStorage is closed");
  }

  /** The error of a write with a precondition. */
  private noVersions(): TypeError {
    return new TypeError("ArtifactDbStorage cannot test an expected version: the db of an artifact page has no versions");
  }

  /** The reference of the document of an id. */
  private ref(id: string): ArtifactDbDocRef {
    return this.db.doc(`${this.collection}/${artifactDbSegment(id)}`);
  }

  /** This method reads the document of an id. It gives undefined for a missing document and for a document of another writer. */
  private async read(id: string): Promise<Envelope | undefined> {
    const ref = this.ref(id);
    let snapshot: ArtifactDbDocSnapshot;
    try {
      snapshot = await ref.get();
    } catch (error) {
      throw storeError(error);
    }
    const data = snapshot.exists ? snapshot.data() : undefined;
    return isEnvelope(data) ? { value: jsonCopy(data.value), order: data.order } : undefined;
  }

  /** This method lists the items of the collection, in the order of the first set of each id. */
  private async list(): Promise<Array<{ id: string; value: unknown; order: number }>> {
    let snapshot: ArtifactDbQuerySnapshot;
    try {
      snapshot = await this.db.collection(this.collection).get();
    } catch (error) {
      throw storeError(error);
    }
    const out: Array<{ id: string; value: unknown; order: number }> = [];
    for (const doc of snapshot.docs) {
      const data = doc.exists ? doc.data() : undefined;
      const id = artifactDbId(doc.id);
      if (id === undefined || !isEnvelope(data)) continue;
      out.push({ id, value: jsonCopy(data.value), order: data.order });
    }
    return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** This method gives the order of a new id: the clock, and at least one more than the last order of this storage. */
  private nextOrder(): number {
    this.lastOrder = Math.max(this.now(), this.lastOrder + 1);
    return this.lastOrder;
  }

  /** This method writes the document of an id. An id that exists keeps its order. */
  private async write(id: string, value: unknown): Promise<void> {
    const old = await this.read(id);
    const order = old === undefined ? this.nextOrder() : old.order;
    if (old !== undefined && old.order > this.lastOrder) this.lastOrder = old.order;
    try {
      await this.ref(id).set({ value, order });
    } catch (error) {
      throw storeError(error);
    }
  }

  /** This method deletes the document of an id. It gives true when the item existed. */
  private async remove(id: string): Promise<boolean> {
    if ((await this.read(id)) === undefined) return false;
    try {
      await this.ref(id).delete();
    } catch (error) {
      throw storeError(error);
    }
    return true;
  }
}
