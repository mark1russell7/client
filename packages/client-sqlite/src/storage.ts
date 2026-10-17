/**
 * A collection storage in SQLite (roadmap R45).
 *
 * `SqliteStorage` keeps the items of one collection in one table of a SQLite database: a file,
 * or `:memory:`. It implements `CollectionStorage` of `@procedures/client`, so a
 * `ProcedureServer`, an `ApiStorage` server and a `HybridStorage` can use it. The engine is
 * sql.js (SQLite in WebAssembly), through `@mark1russell7/docker-sqlite`: no native build.
 *
 * - The table of a collection has the columns `id` (the key) and `value` (the JSON text of the
 *   item). A value goes through `JSON.stringify` and `JSON.parse`.
 * - A change log gives `getChangesSince()`. The table `_storage_log` has the last change of each
 *   id, and `_storage_versions` has the version of each collection: `<epoch>:<seq>`, as
 *   `InMemoryStorage` has. The epoch stays in the file, so a version stays valid after a restart.
 * - Each write runs in a transaction. A batch that fails changes nothing.
 * - The storage keeps the database in memory and writes the file after each write. A write ends
 *   after its file write. One file write can hold the changes of several writes.
 * - The storages of one file in one process share one database, so the storages of two tables in
 *   one file do not write over the changes of each other.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createConnection, type Database } from "@mark1russell7/docker-sqlite";
import type { CollectionStorage, StorageChanges, StorageMetadata } from "@procedures/client";

/** The path of a database that is only in memory. */
export const MEMORY_PATH = ":memory:";

/** The options of a `SqliteStorage`. */
export interface SqliteStorageOptions {
  /**
   * The database file, or `:memory:` for a database that lives as long as the storage. The
   * storage makes the file, and its folder, at the first write.
   */
  path: string;
  /**
   * The table of the collection. The name starts with a letter and has only letters, digits and
   * underscores, 64 characters or fewer. A name that starts with `sqlite_` is not permitted.
   */
  table: string;
  /**
   * The number of deletes that the change log keeps. After more deletes, the log drops the
   * oldest ones, and `getChangesSince` of an older version gives all items.
   * @default 10000
   */
  maxTombstones?: number;
}

/** The pattern of a table name: a letter, then letters, digits and underscores. */
const TABLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * This function gives the name when it is a permitted table name. Else it throws a `TypeError`. The name goes
 * into the SQL text, so the check is strict.
 */
export function checkTableName(name: unknown): string {
  if (typeof name !== "string" || !TABLE_NAME.test(name) || name.toLowerCase().startsWith("sqlite_")) {
    throw new TypeError(
      `Invalid table name ${JSON.stringify(name)}: use a letter, then letters, digits and underscores (64 characters or fewer), not the prefix sqlite_`,
    );
  }
  return name;
}

type SqlValue = string | number | null;

/** The rows of a query, as objects. */
function rows<R>(db: Database, sql: string, params: SqlValue[] = []): R[] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const out: R[] = [];
    while (statement.step()) out.push(statement.getAsObject() as R);
    return out;
  } finally {
    statement.free();
  }
}

/** This function runs the work in a transaction. An error rolls back each change of the work. */
function transaction<R>(db: Database, work: () => R): R {
  db.run("BEGIN");
  try {
    const result = work();
    db.run("COMMIT");
    return result;
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

/** The JSON text of a value. A value without JSON text is a `TypeError`. */
function toJson(id: string, value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`The value of ${JSON.stringify(id)} is not JSON: ${(error as Error).message}`);
  }
  if (text === undefined) throw new TypeError(`The value of ${JSON.stringify(id)} is not JSON: ${typeof value}`);
  return text;
}

/** An id must be a string: the `id` column holds text. */
function checkId(id: unknown): string {
  if (typeof id !== "string") throw new TypeError(`An id must be a string, not ${typeof id}`);
  return id;
}

// ---------------------------------------------------------------------------
// The databases of the files, shared in the process
// ---------------------------------------------------------------------------

/** One open database and its file writes. */
class SharedDatabase {
  /** The storages that use the database. */
  users = 0;
  closed = false;
  /**
   * True when the database has a change that is not in the file. The tables that a storage makes
   * when it opens are not a change: a storage that only reads does not make the file.
   */
  dirty = false;
  /** The last file write. Its error is in the promise of the write that asked for it. */
  private saving: Promise<void> = Promise.resolve();
  /** A file write that waits for the running one. The writes that come before it starts share it. */
  private next: Promise<void> | undefined;

  constructor(
    readonly path: string,
    readonly db: Database,
    private readonly saveFile: () => Promise<void>,
  ) {}

  /** This method records a change, and gives the promise of the file write that holds it. */
  changed(): Promise<void> {
    this.dirty = true;
    return this.save();
  }

  /**
   * This method writes the file after the running file write. It gives the promise of a file write that
   * starts after this call, so the file gets each change that came before the call.
   */
  save(): Promise<void> {
    if (this.path === MEMORY_PATH) return Promise.resolve();
    if (this.next) return this.next;
    const run = this.saving.then(async () => {
      // The file write reads the database now: a later change needs a new file write
      this.next = undefined;
      if (!this.dirty) return;
      this.dirty = false;
      try {
        await this.saveFile();
      } catch (error) {
        this.dirty = true;
        throw error;
      }
    });
    this.next = run;
    this.saving = run.catch(() => undefined);
    return run;
  }
}

/** The databases of the files that open or are open, by the key of the file. */
const files = new Map<string, Promise<SharedDatabase>>();
/** The open databases of the files, by the key of the file. */
const opened = new Map<string, SharedDatabase>();

/** The key of a file. Windows file names do not depend on case. */
function fileKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

async function openDatabase(path: string): Promise<SharedDatabase> {
  const { db, save } = await createConnection({ dbPath: path });
  return new SharedDatabase(path, db, save);
}

/** This function opens the database of a path, or gives the open database of the same file. */
async function acquire(path: string): Promise<SharedDatabase> {
  if (path === MEMORY_PATH) {
    const shared = await openDatabase(path);
    shared.users++;
    return shared;
  }
  const key = fileKey(path);
  for (;;) {
    let entry = files.get(key);
    if (!entry) {
      const opening = openDatabase(path);
      entry = opening;
      files.set(key, opening);
      opening.then(
        (shared) => opened.set(key, shared),
        () => {
          // A failed open does not stay: the next storage tries again
          if (files.get(key) === opening) files.delete(key);
        },
      );
    }
    const shared = await entry;
    // The last storage closed the database while this one waited: open the file again
    if (shared.closed) continue;
    shared.users++;
    return shared;
  }
}

/** This function releases a database. The last storage writes the file and closes the database. */
async function release(shared: SharedDatabase): Promise<void> {
  shared.users--;
  if (shared.users > 0) return;
  let failure: unknown;
  try {
    await shared.save();
  } catch (error) {
    failure = error;
  }
  // Another storage of the file opened while the file write ran
  if (shared.users > 0) {
    if (failure !== undefined) throw failure;
    return;
  }
  shared.closed = true;
  if (shared.path !== MEMORY_PATH) {
    const key = fileKey(shared.path);
    if (opened.get(key) === shared) {
      opened.delete(key);
      files.delete(key);
    }
  }
  shared.db.close();
  if (failure !== undefined) throw failure;
}

// ---------------------------------------------------------------------------
// The storage
// ---------------------------------------------------------------------------

const VERSIONS = "_storage_versions";
const LOG = "_storage_log";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ${VERSIONS} (
    collection TEXT PRIMARY KEY,
    epoch TEXT NOT NULL,
    seq INTEGER NOT NULL,
    floor INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ${LOG} (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    deleted INTEGER NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE INDEX IF NOT EXISTS ${LOG}_seq ON ${LOG} (collection, seq);
`;

interface Counter {
  seq: number;
  floor: number;
}

/**
 * A collection storage in a table of a SQLite database (roadmap R45).
 *
 * @example
 * ```typescript
 * const users = new SqliteStorage<User>({ path: "./data/app.db", table: "users" });
 * await users.set("123", { id: "123", name: "John" });
 * const user = await users.get("123"); // { id: "123", name: "John" }
 * const changes = await users.getChangesSince(); // { version, full: true, changed, deleted: [] }
 * await users.close();
 * ```
 */
export class SqliteStorage<T> implements CollectionStorage<T> {
  /** The database file, or `:memory:`. */
  readonly path: string;
  /** The table of the items. */
  readonly table: string;
  private readonly maxTombstones: number;
  /** The quoted table name, for the SQL text. */
  private readonly quoted: string;
  private readonly opening: Promise<{ shared: SharedDatabase; epoch: string }>;
  private closed = false;

  constructor(options: SqliteStorageOptions) {
    if (typeof options?.path !== "string" || options.path === "") {
      throw new TypeError("SqliteStorage needs a path: a database file, or :memory:");
    }
    this.path = options.path;
    this.table = checkTableName(options.table);
    this.quoted = `"${this.table}"`;
    this.maxTombstones = Math.max(0, options.maxTombstones ?? 10_000);
    this.opening = this.open();
    // An operation gives the error of the open. This handler only stops an unhandled rejection.
    this.opening.catch(() => undefined);
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    const db = await this.database();
    const [row] = rows<{ value: string }>(db, `SELECT value FROM ${this.quoted} WHERE id = ?`, [checkId(id)]);
    return row === undefined ? undefined : (JSON.parse(row.value) as T);
  }

  async getAll(): Promise<T[]> {
    const db = await this.database();
    return rows<{ value: string }>(db, `SELECT value FROM ${this.quoted} ORDER BY rowid`).map((row) => JSON.parse(row.value) as T);
  }

  /** Every item with its id, in the order of the first write of each id. */
  async getEntries(): Promise<Array<[string, T]>> {
    return this.entries(await this.database());
  }

  /**
   * The changes after a version (roadmap R28). A version of another storage, of another database
   * file, or older than the dropped deletes gives all items (`full: true`). A version stays valid
   * after a restart, because the change log is in the file.
   */
  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    const db = await this.database();
    const { epoch } = await this.opening;
    const { seq, floor } = this.counter(db);
    const version = `${epoch}:${seq}`;
    const from = parseVersion(since, epoch, seq);
    if (from === undefined || from < floor) {
      return { version, full: true, changed: this.entries(db), deleted: [] };
    }
    const changed = rows<{ id: string; value: string }>(
      db,
      `SELECT l.id AS id, d.value AS value FROM ${LOG} l JOIN ${this.quoted} d ON d.id = l.id
       WHERE l.collection = ? AND l.deleted = 0 AND l.seq > ? ORDER BY l.seq`,
      [this.table, from],
    ).map((row): [string, T] => [row.id, JSON.parse(row.value) as T]);
    const deleted = rows<{ id: string }>(
      db,
      `SELECT id FROM ${LOG} WHERE collection = ? AND deleted = 1 AND seq > ? ORDER BY seq`,
      [this.table, from],
    ).map((row) => row.id);
    return { version, full: false, changed, deleted };
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter((item) => predicate(item));
  }

  async has(id: string): Promise<boolean> {
    const db = await this.database();
    return rows(db, `SELECT 1 FROM ${this.quoted} WHERE id = ? LIMIT 1`, [checkId(id)]).length > 0;
  }

  async size(): Promise<number> {
    const db = await this.database();
    const [row] = rows<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${this.quoted}`);
    return row?.n ?? 0;
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    const text = toJson(checkId(id), value);
    await this.write((db, next) => this.put(db, id, text, next));
  }

  async delete(id: string): Promise<boolean> {
    checkId(id);
    return this.write((db, next) => this.remove(db, id, next));
  }

  async clear(): Promise<void> {
    await this.write((db, next) => {
      for (const { id } of rows<{ id: string }>(db, `SELECT id FROM ${this.quoted} ORDER BY rowid`)) this.logChange(db, id, next(), true);
      db.run(`DELETE FROM ${this.quoted}`);
    });
  }

  //
  // ═══ Bulk Operations ═══
  //

  /** This method sets several items in one transaction. When one value is not JSON, nothing changes. */
  async setBatch(items: Array<[string, T]>): Promise<void> {
    // After close(), an empty batch rejects too
    this.checkOpen();
    const texts = items.map(([id, value]): [string, string] => [checkId(id), toJson(id, value)]);
    if (texts.length === 0) return;
    await this.write((db, next) => {
      for (const [id, text] of texts) this.put(db, id, text, next);
    });
  }

  /** This method deletes several items in one transaction. */
  async deleteBatch(ids: string[]): Promise<number> {
    this.checkOpen();
    for (const id of ids) checkId(id);
    if (ids.length === 0) return 0;
    return this.write((db, next) => {
      let deleted = 0;
      for (const id of ids) if (this.remove(db, id, next)) deleted++;
      return deleted;
    });
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    const db = await this.database();
    const result = new Map<string, T>();
    const statement = db.prepare(`SELECT value FROM ${this.quoted} WHERE id = ?`);
    try {
      for (const id of ids) {
        statement.bind([checkId(id)]);
        if (statement.step()) result.set(id, JSON.parse(statement.getAsObject()["value"] as string) as T);
        statement.reset();
      }
    } finally {
      statement.free();
    }
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /**
   * This method writes the database file. Each write ends after its file write already, so a
   * caller needs it only after a failed file write.
   */
  async flush(): Promise<void> {
    this.checkOpen();
    const { shared } = await this.opening;
    this.checkOpen();
    await shared.save();
  }

  /**
   * This method writes the file and releases the database. The items stay in the file. A new
   * storage of the same file and table reads them, and the versions of this storage stay valid.
   * After `close()`, each operation rejects, and a second `close()` does nothing.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    let shared: SharedDatabase;
    try {
      ({ shared } = await this.opening);
    } catch {
      // The open failed: there is nothing to release
      return;
    }
    await release(shared);
  }

  async getMetadata(): Promise<StorageMetadata> {
    return {
      type: "custom",
      size: await this.size(),
      stats: { backend: "sqlite", table: this.table, memory: this.path === MEMORY_PATH },
    };
  }

  //
  // ═══ Internal Helpers ═══
  //

  /** This method opens the database, and makes the tables of the collection and of the change log. */
  private async open(): Promise<{ shared: SharedDatabase; epoch: string }> {
    const shared = await acquire(this.path);
    try {
      const db = shared.db;
      db.exec(SCHEMA);
      db.exec(`CREATE TABLE IF NOT EXISTS ${this.quoted} (id TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      const columns = new Set(rows<{ name: string }>(db, `PRAGMA table_info(${this.quoted})`).map((row) => row.name));
      if (!columns.has("id") || !columns.has("value")) {
        throw new Error(`The table ${this.table} exists, and it does not have the columns id and value of a SqliteStorage`);
      }
      db.run(`INSERT OR IGNORE INTO ${VERSIONS} (collection, epoch, seq, floor) VALUES (?, ?, 0, 0)`, [
        this.table,
        randomUUID().replaceAll("-", "").slice(0, 12),
      ]);
      const [row] = rows<{ epoch: string }>(db, `SELECT epoch FROM ${VERSIONS} WHERE collection = ?`, [this.table]);
      return { shared, epoch: row!.epoch };
    } catch (error) {
      await release(shared).catch(() => undefined);
      throw error;
    }
  }

  /** The open database. It throws after `close()`, so the promise of the operation rejects. */
  private async database(): Promise<Database> {
    this.checkOpen();
    const { shared } = await this.opening;
    this.checkOpen();
    return shared.db;
  }

  private checkOpen(): void {
    if (this.closed) throw new Error(`The SQLite storage of the table ${this.table} is closed`);
  }

  private entries(db: Database): Array<[string, T]> {
    return rows<{ id: string; value: string }>(db, `SELECT id, value FROM ${this.quoted} ORDER BY rowid`).map(
      (row): [string, T] => [row.id, JSON.parse(row.value) as T],
    );
  }

  private counter(db: Database): Counter {
    const [row] = rows<Counter>(db, `SELECT seq, floor FROM ${VERSIONS} WHERE collection = ?`, [this.table]);
    return { seq: row?.seq ?? 0, floor: row?.floor ?? 0 };
  }

  /**
   * One write: the change in a transaction with the change log, then the file write. `next` gives
   * the next number of the change log. A write that changes nothing writes no file.
   */
  private async write<R>(change: (db: Database, next: () => number) => R): Promise<R> {
    const db = await this.database();
    let changed = false;
    const result = transaction(db, () => {
      const counter = this.counter(db);
      const next = (): number => {
        changed = true;
        return ++counter.seq;
      };
      const value = change(db, next);
      if (changed) {
        this.trimTombstones(db, counter);
        db.run(`UPDATE ${VERSIONS} SET seq = ?, floor = ? WHERE collection = ?`, [counter.seq, counter.floor, this.table]);
      }
      return value;
    });
    if (changed) {
      const { shared } = await this.opening;
      await shared.changed();
    }
    return result;
  }

  /** This method writes an item. An existing id keeps its place in the order. */
  private put(db: Database, id: string, text: string, next: () => number): void {
    db.run(`INSERT INTO ${this.quoted} (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value`, [id, text]);
    this.logChange(db, id, next(), false);
  }

  /** This method deletes an item. True when it existed. */
  private remove(db: Database, id: string, next: () => number): boolean {
    db.run(`DELETE FROM ${this.quoted} WHERE id = ?`, [id]);
    if (db.getRowsModified() === 0) return false;
    this.logChange(db, id, next(), true);
    return true;
  }

  private logChange(db: Database, id: string, seq: number, deleted: boolean): void {
    db.run(
      `INSERT INTO ${LOG} (collection, id, seq, deleted) VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET seq = excluded.seq, deleted = excluded.deleted`,
      [this.table, id, seq, deleted ? 1 : 0],
    );
  }

  /** This method drops the oldest deletes above the limit, and moves the floor of the change log. */
  private trimTombstones(db: Database, counter: Counter): void {
    const [row] = rows<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${LOG} WHERE collection = ? AND deleted = 1`, [this.table]);
    const excess = (row?.n ?? 0) - this.maxTombstones;
    if (excess <= 0) return;
    const [cut] = rows<{ seq: number }>(
      db,
      `SELECT seq FROM ${LOG} WHERE collection = ? AND deleted = 1 ORDER BY seq LIMIT 1 OFFSET ?`,
      [this.table, excess - 1],
    );
    if (cut === undefined) return;
    db.run(`DELETE FROM ${LOG} WHERE collection = ? AND deleted = 1 AND seq <= ?`, [this.table, cut.seq]);
    counter.floor = Math.max(counter.floor, cut.seq);
  }
}

/** The number of a version of this collection, or undefined for another or an unknown version. */
function parseVersion(since: string | undefined, epoch: string, seq: number): number | undefined {
  if (since === undefined) return undefined;
  const separator = since.lastIndexOf(":");
  if (separator < 0 || since.slice(0, separator) !== epoch) return undefined;
  const at = Number(since.slice(separator + 1));
  return Number.isInteger(at) && at >= 0 && at <= seq ? at : undefined;
}
