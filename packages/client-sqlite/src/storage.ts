/**
 * A collection storage in SQLite (roadmap R45).
 *
 * `SqliteStorage` keeps the items of one collection in one table of a SQLite database: a file,
 * or `:memory:`. It implements `CollectionStorage` of `@procedures/client`, so a
 * `ProcedureServer`, an `ApiStorage` server and a `HybridStorage` can use it.
 *
 * - The storage has two engines (the option `engine`). The engine `node` is `node:sqlite` of
 *   Node.js: it writes only the changed pages of the file. The engine `sqljs` is sql.js (SQLite in
 *   WebAssembly) through `@mark1russell7/docker-sqlite`: it keeps the database in memory and
 *   writes the whole file after a write. The default `auto` uses `node` when Node.js has it.
 * - The two engines use the same file format: a file of one engine opens with the other.
 * - The table of a collection has the columns `id` (the key) and `value` (the JSON text of the
 *   item). A value goes through `JSON.stringify` and `JSON.parse`.
 * - A change log gives `getChangesSince()`. The table `_storage_log` has the last change of each
 *   id, and `_storage_versions` has the version of each collection: `<epoch>:<seq>`, as
 *   `InMemoryStorage` has. The epoch stays in the file, so a version stays valid after a restart.
 * - Each write runs in a transaction. A batch that fails changes nothing.
 * - `query()` runs a JSON selector of `@procedures/client/query` on the rows of one read, under a
 *   query policy. `patch()` changes an item in one transaction, so two processes keep the fields
 *   of each patch.
 * - The storages of one file in one process share one database. Thus the storages of two tables
 *   in one file keep the changes of each other.
 * - A storage that only reads does not make the file.
 * - With the option `versionOf`, `set`, `delete` and `setBatch` take an expected version (roadmap
 *   CLI-16). The test of the versions and the write are one transaction, also for two processes.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  optionalMs,
  type CollectionStorage,
  type Duration,
  type StorageBatchWriteOptions,
  type StorageChanges,
  type StorageItemWriteOptions,
  type StorageMetadata,
  type StoragePatch,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
} from "@procedures/client";
import { VersionConflictError, applyPatch, patchProblems, preconditionNotSupported, queryEntries, versionConflicts, type CurrentItem } from "@procedures/client/query";
import {
  MEMORY_PATH,
  checkEngine,
  openEngine,
  type CopySchema,
  type EngineDatabase,
  type OpenDatabase,
  type SqliteEngine,
  type SqliteEngineName,
  type SqlValue,
} from "./engines.js";

export { MEMORY_PATH, isNodeSqliteAvailable, type SqliteEngine, type SqliteEngineName } from "./engines.js";

/** The options of a `SqliteStorage`. */
export interface SqliteStorageOptions<T = unknown> {
  /**
   * The database file, or `:memory:` for a database that lives as long as the storage. The
   * storage makes the file, and its folder, at the first write that changes an item.
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
  /**
   * The SQLite engine.
   *
   * - `node`: the module `node:sqlite` of Node.js 22.13 or later. It writes only the changes, and
   *   the file is in WAL mode. Two processes can use one file.
   * - `sqljs`: sql.js, SQLite in WebAssembly. It keeps the database in memory, and it writes the
   *   whole file after a write.
   * - `auto`: `node` when Node.js has `node:sqlite`, and else `sqljs`.
   *
   * The storages of one file in one process share one database, and thus one engine. The first
   * storage of the file sets it. A storage with another engine than `auto` refuses a database
   * of the other engine.
   * @default "auto"
   */
  engine?: SqliteEngine;
  /**
   * The time that a write of the engine `node` waits for the lock of another process, for example
   * `seconds(5)`. After it, the write fails with the error `database is locked`. The first
   * storage of a file sets it.
   * @default 5 seconds
   */
  busyTimeout?: Duration;
  /**
   * The query policy of `query()` for a call without a policy. The procedure `find` gives the
   * policy of its host.
   * @default DEFAULT_QUERY_POLICY: no `$regex`
   */
  queryPolicy?: StorageQueryPolicy | undefined;
  /**
   * The version of an item, for example `(item) => item.rev` (roadmap CLI-16). With it, `set`,
   * `delete` and `setBatch` take an expected version: a write whose current item has another
   * version changes nothing and rejects with `VersionConflictError`. The test and the write are
   * one transaction. Without it, a write with an expected version rejects with a `TypeError`.
   */
  versionOf?: ((item: T) => string | undefined) | undefined;
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

/**
 * This function runs the work in a transaction. An error rolls back each change of the work.
 * With `keep` false, the transaction always rolls back: the work only tests a change.
 */
function transaction<R>(db: EngineDatabase, work: () => R, keep = true): R {
  // IMMEDIATE takes the write lock at the start, so the busy timeout applies to it. A deferred
  // transaction of the engine node that reads and then writes can fail at once in WAL mode.
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec(keep ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // SQLite rolled back the transaction already
    }
    throw error;
  }
}

/** This function runs several reads in one read transaction, so they see one state of the file. */
function readTransaction<R>(db: EngineDatabase, work: () => R): R {
  db.exec("BEGIN");
  try {
    return work();
  } finally {
    db.exec("COMMIT");
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
// The schema
// ---------------------------------------------------------------------------

const VERSIONS = "_storage_versions";
const LOG = "_storage_log";
const LOG_INDEX = `${LOG}_seq`;

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
  CREATE INDEX IF NOT EXISTS ${LOG_INDEX} ON ${LOG} (collection, seq);
`;

/** A new epoch: a version of another collection or of another file does not match it. */
function newEpoch(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

/** This function throws when the table exists without the columns of a storage. */
function checkColumns(db: EngineDatabase, table: string): void {
  const columns = new Set(db.all<{ name: string }>(`PRAGMA table_info("${table}")`).map((row) => row.name));
  if (!columns.has("id") || !columns.has("value")) {
    throw new Error(`The table ${table} exists, and it does not have the columns id and value of a SqliteStorage`);
  }
}

/** True when the database has the tables of the change log, the table and its version. */
function hasSchema(db: EngineDatabase, table: string): boolean {
  const names = db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE name IN (?, ?, ?, ?)`, [VERSIONS, LOG, LOG_INDEX, table]);
  return names.length === 4 && db.all(`SELECT 1 FROM ${VERSIONS} WHERE collection = ?`, [table]).length > 0;
}

/**
 * This function makes the tables of the change log and of a collection, and the version of the
 * collection. A database that has them already does not change, so a storage that only reads
 * does not write to an existing file.
 */
function prepareTable(db: EngineDatabase, table: string, epoch: string): void {
  if (hasSchema(db, table)) {
    checkColumns(db, table);
    return;
  }
  transaction(db, () => {
    db.exec(SCHEMA);
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    checkColumns(db, table);
    db.run(`INSERT OR IGNORE INTO ${VERSIONS} (collection, epoch, seq, floor) VALUES (?, ?, 0, 0)`, [table, epoch]);
  });
}

/**
 * This function copies the schema of each collection, with its epoch, to the file that the node
 * engine makes. A version that a storage gave before the file existed stays valid.
 */
const copySchema: CopySchema = (from, to) => {
  for (const { collection, epoch } of from.all<{ collection: string; epoch: string }>(`SELECT collection, epoch FROM ${VERSIONS}`)) {
    prepareTable(to, checkTableName(collection), epoch);
  }
};

// ---------------------------------------------------------------------------
// The databases of the files, shared in the process
// ---------------------------------------------------------------------------

/** One open database and its file writes. */
class SharedDatabase {
  /** The storages that use the database. */
  users = 0;
  closed = false;
  /**
   * The engine sqljs: true when the database has a change that is not in the file. The tables
   * that a storage makes when it opens are not a change: a storage that only reads does not make
   * the file.
   */
  dirty = false;
  /** The last file write. Its error is in the promise of the write that asked for it. */
  private saving: Promise<void> = Promise.resolve();
  /** A file write that waits for the running one. The writes that come before it starts share it. */
  private next: Promise<void> | undefined;

  constructor(
    readonly path: string,
    readonly open: OpenDatabase,
  ) {}

  get engine(): SqliteEngineName {
    return this.open.engine;
  }

  /** True when the engine writes the whole file after a write: sql.js with a file. */
  private get savesFile(): boolean {
    return this.open.engine === "sqljs" && this.path !== MEMORY_PATH;
  }

  /**
   * This method records a change, and gives the promise of the file write that holds it. The
   * engine node wrote the change at the commit of its transaction.
   */
  changed(): Promise<void> {
    if (!this.savesFile) return Promise.resolve();
    this.dirty = true;
    return this.save();
  }

  /**
   * This method writes the file after the running file write. It gives the promise of a file write that
   * starts after this call, so the file gets each change that came before the call.
   */
  save(): Promise<void> {
    if (!this.savesFile) return Promise.resolve();
    if (this.next) return this.next;
    const run = this.saving.then(async () => {
      // The file write reads the database now: a later change needs a new file write
      this.next = undefined;
      if (!this.dirty) return;
      this.dirty = false;
      try {
        await this.open.saveFile();
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

/** A database of a file that opens or is open, and the engine choice of the storage that opened it. */
interface FileEntry {
  engine: SqliteEngine;
  database: Promise<SharedDatabase>;
}

/** The databases of the files that open or are open, by the key of the file. */
const files = new Map<string, FileEntry>();
/** The open databases of the files, by the key of the file. */
const opened = new Map<string, SharedDatabase>();

/** The key of a file. Windows file names do not depend on case. */
function fileKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

async function openDatabase(path: string, engine: SqliteEngine, busyTimeoutMs: number): Promise<SharedDatabase> {
  return new SharedDatabase(path, await openEngine(path, engine, busyTimeoutMs));
}

/** This function opens the database of a path, or gives the open database of the same file. */
async function acquire(path: string, engine: SqliteEngine, busyTimeoutMs: number): Promise<SharedDatabase> {
  if (path === MEMORY_PATH) {
    const shared = await openDatabase(path, engine, busyTimeoutMs);
    shared.users++;
    return shared;
  }
  const key = fileKey(path);
  for (;;) {
    let entry = files.get(key);
    if (!entry) {
      const opening = openDatabase(path, engine, busyTimeoutMs);
      entry = { engine, database: opening };
      files.set(key, entry);
      const own = entry;
      opening.then(
        (shared) => opened.set(key, shared),
        () => {
          // A failed open does not stay: the next storage tries again
          if (files.get(key) === own) files.delete(key);
        },
      );
    }
    let shared: SharedDatabase;
    try {
      shared = await entry.database;
    } catch (error) {
      // A storage with another engine choice failed to open the file: try with this choice
      if (entry.engine !== engine) continue;
      throw error;
    }
    // The last storage closed the database while this one waited: open the file again
    if (shared.closed) continue;
    if (engine !== "auto" && shared.engine !== engine) {
      throw new Error(
        `The file ${path} is open with the SQLite engine ${shared.engine} in this process: a storage with the engine ${engine} cannot share it. Give the engine auto or ${shared.engine}.`,
      );
    }
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
  shared.open.close();
  if (failure !== undefined) throw failure;
}

// ---------------------------------------------------------------------------
// The storage
// ---------------------------------------------------------------------------

interface Counter {
  epoch: string;
  seq: number;
  floor: number;
}

/** The result of one write, and true when it changed an item. */
interface WriteResult<R> {
  value: R;
  changed: boolean;
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
 * await users.getEngine(); // "node" on Node.js 22.13 or later, else "sqljs"
 * await users.close();
 * ```
 */
export class SqliteStorage<T> implements CollectionStorage<T> {
  /** The database file, or `:memory:`. */
  readonly path: string;
  /** The table of the items. */
  readonly table: string;
  /** The engine choice of the options. `getEngine()` gives the engine that the storage uses. */
  readonly engine: SqliteEngine;
  private readonly maxTombstones: number;
  /** The query policy of a call without a policy */
  private readonly queryPolicy: StorageQueryPolicy | undefined;
  /** The version of an item, for the preconditions of the writes (roadmap CLI-16) */
  private readonly versionOf: ((item: T) => string | undefined) | undefined;
  /** The quoted table name, for the SQL text. */
  private readonly quoted: string;
  private readonly opening: Promise<SharedDatabase>;
  private closed = false;

  constructor(options: SqliteStorageOptions<T>) {
    if (typeof options?.path !== "string" || options.path === "") {
      throw new TypeError("SqliteStorage needs a path: a database file, or :memory:");
    }
    this.path = options.path;
    this.table = checkTableName(options.table);
    this.engine = checkEngine(options.engine ?? "auto");
    const busyTimeoutMs = optionalMs(options.busyTimeout, "busyTimeout") ?? 5000;
    this.quoted = `"${this.table}"`;
    this.maxTombstones = Math.max(0, options.maxTombstones ?? 10_000);
    this.queryPolicy = options.queryPolicy;
    this.versionOf = options.versionOf;
    this.opening = this.open(busyTimeoutMs);
    // An operation gives the error of the open. This handler only stops an unhandled rejection.
    this.opening.catch(() => undefined);
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    const db = await this.database();
    const [row] = db.all<{ value: string }>(`SELECT value FROM ${this.quoted} WHERE id = ?`, [checkId(id)]);
    return row === undefined ? undefined : (JSON.parse(row.value) as T);
  }

  async getAll(): Promise<T[]> {
    const db = await this.database();
    return db.all<{ value: string }>(`SELECT value FROM ${this.quoted} ORDER BY rowid`).map((row) => JSON.parse(row.value) as T);
  }

  /** Every item with its id, in the order of the first write of each id. */
  async getEntries(): Promise<Array<[string, T]>> {
    return this.entries(await this.database());
  }

  /** The ids of the items, in the order of the entries. The storage does not read the values. */
  async getIds(): Promise<string[]> {
    const db = await this.database();
    return db.all<{ id: string }>(`SELECT id FROM ${this.quoted} ORDER BY rowid`).map((row) => row.id);
  }

  /**
   * The changes after a version (roadmap R28). A version of another storage, of another database
   * file, or older than the dropped deletes gives all items (`full: true`). A version stays valid
   * after a restart, because the change log is in the file. The reads run in one read
   * transaction, so a write of another process does not come between them.
   */
  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    const db = await this.database();
    return readTransaction(db, () => {
      const { epoch, seq, floor } = this.counter(db);
      const version = `${epoch}:${seq}`;
      const from = parseVersion(since, epoch, seq);
      if (from === undefined || from < floor) {
        return { version, full: true, changed: this.entries(db), deleted: [] };
      }
      const changed = db
        .all<{ id: string; value: string }>(
          `SELECT l.id AS id, d.value AS value FROM ${LOG} l JOIN ${this.quoted} d ON d.id = l.id
           WHERE l.collection = ? AND l.deleted = 0 AND l.seq > ? ORDER BY l.seq`,
          [this.table, from],
        )
        .map((row): [string, T] => [row.id, JSON.parse(row.value) as T]);
      const deleted = db
        .all<{ id: string }>(`SELECT id FROM ${LOG} WHERE collection = ? AND deleted = 1 AND seq > ? ORDER BY seq`, [this.table, from])
        .map((row) => row.id);
      return { version, full: false, changed, deleted };
    });
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter((item) => predicate(item));
  }

  /**
   * The entries whose items match the selector, with the order, the skip and the limit of
   * `queryEntries()` (roadmap CLI-14), under the policy of the call or of the options. The storage
   * reads the rows in the order of the entries, and runs the query on them.
   */
  async query(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    return queryEntries(this.entries(await this.database()), selector, options, policy ?? this.queryPolicy);
  }

  async has(id: string): Promise<boolean> {
    const db = await this.database();
    return db.all(`SELECT 1 FROM ${this.quoted} WHERE id = ? LIMIT 1`, [checkId(id)]).length > 0;
  }

  async size(): Promise<number> {
    const db = await this.database();
    const [row] = db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${this.quoted}`);
    return Number(row?.n ?? 0);
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void> {
    const text = toJson(checkId(id), value);
    const expected = this.preconditions(options?.expectedVersion === undefined ? [] : [[id, options.expectedVersion]]);
    await this.write((db, next) => {
      this.checkVersions(db, expected);
      this.put(db, id, text, next);
    });
  }

  /**
   * This method changes the item of the id in one transaction (a JSON Merge Patch, or the
   * operations `$set` and `$unset`), and gives a copy of the new item. A missing id stays missing,
   * and the result is undefined. A patch that cannot apply to the item changes nothing.
   */
  async patch(id: string, fields: StoragePatch): Promise<T | undefined> {
    checkId(id);
    const [problem] = patchProblems(fields);
    if (problem !== undefined) throw new TypeError(`The patch of ${JSON.stringify(id)} is not correct: ${problem}`);
    return this.write((db, next) => {
      const [row] = db.all<{ value: string }>(`SELECT value FROM ${this.quoted} WHERE id = ?`, [id]);
      if (row === undefined) return undefined;
      const text = toJson(id, applyPatch(JSON.parse(row.value), fields));
      this.put(db, id, text, next);
      return JSON.parse(text) as T;
    });
  }

  async delete(id: string, options?: StorageItemWriteOptions): Promise<boolean> {
    checkId(id);
    const expected = this.preconditions(options?.expectedVersion === undefined ? [] : [[id, options.expectedVersion]]);
    return this.write((db, next) => {
      this.checkVersions(db, expected);
      return this.remove(db, id, next);
    });
  }

  async clear(): Promise<void> {
    await this.write((db, next) => {
      for (const { id } of db.all<{ id: string }>(`SELECT id FROM ${this.quoted} ORDER BY rowid`)) this.logChange(db, id, next(), true);
      db.run(`DELETE FROM ${this.quoted}`);
    });
  }

  //
  // ═══ Bulk Operations ═══
  //

  /**
   * This method sets several items in one transaction. When one value is not JSON, or one expected
   * version has a conflict, nothing changes.
   */
  async setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void> {
    // After close(), an empty batch rejects too
    this.checkOpen();
    const texts = items.map(([id, value]): [string, string] => [checkId(id), toJson(id, value)]);
    const expected = this.preconditions(options?.expectedVersions ?? []);
    if (texts.length === 0 && expected.length === 0) return;
    await this.write((db, next) => {
      this.checkVersions(db, expected);
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
    const rows = db.firstOfEach<{ value: string }>(`SELECT value FROM ${this.quoted} WHERE id = ?`, ids.map((id) => [checkId(id)]));
    const result = new Map<string, T>();
    rows.forEach((row, index) => {
      if (row !== undefined) result.set(ids[index]!, JSON.parse(row.value) as T);
    });
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /** The engine that the storage uses: `node` or `sqljs`. With the option `auto`, the open decides it. */
  async getEngine(): Promise<SqliteEngineName> {
    this.checkOpen();
    const shared = await this.opening;
    this.checkOpen();
    return shared.engine;
  }

  /**
   * This method writes the database file. Each write ends after its file write already, so a
   * caller needs it only after a failed file write of the engine `sqljs`. The engine `node`
   * writes each change at its commit.
   */
  async flush(): Promise<void> {
    this.checkOpen();
    const shared = await this.opening;
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
      shared = await this.opening;
    } catch {
      // The open failed: there is nothing to release
      return;
    }
    await release(shared);
  }

  async getMetadata(): Promise<StorageMetadata> {
    const size = await this.size();
    const engine = await this.getEngine();
    return {
      type: "custom",
      size,
      stats: { backend: "sqlite", engine, table: this.table, memory: this.path === MEMORY_PATH },
    };
  }

  //
  // ═══ Internal Helpers ═══
  //

  /** This method opens the database, and makes the tables of the collection and of the change log. */
  private async open(busyTimeoutMs: number): Promise<SharedDatabase> {
    const shared = await acquire(this.path, this.engine, busyTimeoutMs);
    try {
      prepareTable(shared.open.db, this.table, newEpoch());
      return shared;
    } catch (error) {
      await release(shared).catch(() => undefined);
      throw error;
    }
  }

  /** The open database. It throws after `close()`, so the promise of the operation rejects. */
  private async database(): Promise<EngineDatabase> {
    const shared = await this.sharedDatabase();
    // The engine node: another process made the file after the open
    shared.open.refresh(copySchema);
    return shared.open.db;
  }

  private async sharedDatabase(): Promise<SharedDatabase> {
    this.checkOpen();
    const shared = await this.opening;
    this.checkOpen();
    return shared;
  }

  private checkOpen(): void {
    if (this.closed) throw new Error(`The SQLite storage of the table ${this.table} is closed`);
  }

  /**
   * The preconditions of a write, after a check of their ids. A storage without `versionOf` throws
   * a `TypeError` before the write starts (roadmap CLI-16).
   */
  private preconditions(expected: ReadonlyArray<readonly [string, string | null]>): ReadonlyArray<readonly [string, string | null]> {
    if (expected.length === 0) return expected;
    if (!this.versionOf) throw preconditionNotSupported(`The SQLite storage of the table ${this.table}`);
    for (const [id] of expected) checkId(id);
    return expected;
  }

  /**
   * This method tests the expected versions in the transaction of the write (roadmap CLI-16). A
   * conflict throws `VersionConflictError`, and the transaction rolls back.
   */
  private checkVersions(db: EngineDatabase, expected: ReadonlyArray<readonly [string, string | null]>): void {
    if (expected.length === 0 || !this.versionOf) return;
    const rows = db.firstOfEach<{ value: string }>(`SELECT value FROM ${this.quoted} WHERE id = ?`, expected.map(([id]) => [id]));
    const current = new Map<string, CurrentItem<T>>();
    expected.forEach(([id], index) => {
      const row = rows[index];
      current.set(id, row === undefined ? { found: false } : { found: true, value: JSON.parse(row.value) as T });
    });
    const conflicts = versionConflicts(expected, (id) => current.get(id) ?? { found: false }, this.versionOf);
    if (conflicts.length > 0) throw new VersionConflictError(conflicts);
  }

  private entries(db: EngineDatabase): Array<[string, T]> {
    return db.all<{ id: string; value: string }>(`SELECT id, value FROM ${this.quoted} ORDER BY rowid`).map(
      (row): [string, T] => [row.id, JSON.parse(row.value) as T],
    );
  }

  private counter(db: EngineDatabase): Counter {
    const [row] = db.all<Counter>(`SELECT epoch, seq, floor FROM ${VERSIONS} WHERE collection = ?`, [this.table]);
    return { epoch: row?.epoch ?? "", seq: Number(row?.seq ?? 0), floor: Number(row?.floor ?? 0) };
  }

  /**
   * One write: the change in a transaction with the change log, then the file write of the engine
   * `sqljs`. `next` gives the next number of the change log. A write that changes nothing writes
   * no file.
   *
   * Before the first write, the engine `node` keeps the database of a missing file in memory, with
   * no item. A write first tests its change there. When it changes an item, the storage makes the
   * file and runs the write in it.
   */
  private async write<R>(change: (db: EngineDatabase, next: () => number) => R): Promise<R> {
    const shared = await this.sharedDatabase();
    const { open } = shared;
    open.refresh(copySchema);
    if (open.waiting) {
      const test = this.runWrite(open.db, change, false);
      if (!test.changed) return test.value;
      open.makeFile(copySchema);
    }
    const { value, changed } = this.runWrite(open.db, change, true);
    if (changed) await shared.changed();
    return value;
  }

  private runWrite<R>(db: EngineDatabase, change: (db: EngineDatabase, next: () => number) => R, keep: boolean): WriteResult<R> {
    let changed = false;
    const value = transaction(
      db,
      () => {
        const counter = this.counter(db);
        const next = (): number => {
          changed = true;
          return ++counter.seq;
        };
        const result = change(db, next);
        if (changed) {
          this.trimTombstones(db, counter);
          db.run(`UPDATE ${VERSIONS} SET seq = ?, floor = ? WHERE collection = ?`, [counter.seq, counter.floor, this.table]);
        }
        return result;
      },
      keep,
    );
    return { value, changed };
  }

  /** This method writes an item. An existing id keeps its place in the order. */
  private put(db: EngineDatabase, id: string, text: string, next: () => number): void {
    db.run(`INSERT INTO ${this.quoted} (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value`, [id, text]);
    this.logChange(db, id, next(), false);
  }

  /** This method deletes an item. True when it existed. */
  private remove(db: EngineDatabase, id: string, next: () => number): boolean {
    if (db.run(`DELETE FROM ${this.quoted} WHERE id = ?`, [id]) === 0) return false;
    this.logChange(db, id, next(), true);
    return true;
  }

  private logChange(db: EngineDatabase, id: string, seq: number, deleted: boolean): void {
    db.run(
      `INSERT INTO ${LOG} (collection, id, seq, deleted) VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET seq = excluded.seq, deleted = excluded.deleted`,
      [this.table, id, seq, deleted ? 1 : 0],
    );
  }

  /** This method drops the oldest deletes above the limit, and moves the floor of the change log. */
  private trimTombstones(db: EngineDatabase, counter: Counter): void {
    const [row] = db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${LOG} WHERE collection = ? AND deleted = 1`, [this.table]);
    const excess = Number(row?.n ?? 0) - this.maxTombstones;
    if (excess <= 0) return;
    const params: SqlValue[] = [this.table, excess - 1];
    const [cut] = db.all<{ seq: number }>(`SELECT seq FROM ${LOG} WHERE collection = ? AND deleted = 1 ORDER BY seq LIMIT 1 OFFSET ?`, params);
    if (cut === undefined) return;
    db.run(`DELETE FROM ${LOG} WHERE collection = ? AND deleted = 1 AND seq <= ?`, [this.table, cut.seq]);
    counter.floor = Math.max(counter.floor, Number(cut.seq));
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
