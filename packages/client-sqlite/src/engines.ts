/**
 * The two SQLite engines of `SqliteStorage`: `node:sqlite` and sql.js.
 *
 * - The engine `node` is the module `node:sqlite` of Node.js. It writes only the changed pages of
 *   the file, and SQLite locks the file for each write.
 * - The engine `sqljs` is sql.js (SQLite in WebAssembly), through `@mark1russell7/docker-sqlite`.
 *   It keeps the database in memory and writes the whole file after a write.
 * - The two engines read and write the same file format.
 *
 * This module imports `node:sqlite` only when a storage opens: an import of the package does not
 * load it.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createConnection, type Database } from "@mark1russell7/docker-sqlite";

/** The path of a database that is only in memory. */
export const MEMORY_PATH = ":memory:";

/** The engine of a database: `node:sqlite` (`node`) or sql.js (`sqljs`). */
export type SqliteEngineName = "node" | "sqljs";

/**
 * The engine choice of a `SqliteStorage`. With `auto`, the storage uses `node` when Node.js has
 * `node:sqlite`, and `sqljs` when it does not.
 */
export type SqliteEngine = "auto" | SqliteEngineName;

const ENGINES: ReadonlySet<string> = new Set<SqliteEngine>(["auto", "node", "sqljs"]);

/** This function gives the engine choice when it is known. Else it throws a `TypeError`. */
export function checkEngine(engine: unknown): SqliteEngine {
  if (typeof engine !== "string" || !ENGINES.has(engine)) {
    throw new TypeError(`Unknown SQLite engine ${JSON.stringify(engine)}: use auto, node or sqljs`);
  }
  return engine as SqliteEngine;
}

/** A value that a statement takes or gives. */
export type SqlValue = string | number | null;

/** The calls of an open database that a storage uses. Each call is synchronous. */
export interface EngineDatabase {
  /** The rows of a query, as objects. */
  all<R>(sql: string, params?: SqlValue[]): R[];
  /** The first row of a statement for each list of parameters, or undefined for no row. */
  firstOfEach<R>(sql: string, params: SqlValue[][]): Array<R | undefined>;
  /** This method runs one statement, and gives the number of rows that it changed. */
  run(sql: string, params?: SqlValue[]): number;
  /** This method runs SQL text that can have several statements. */
  exec(sql: string): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// node:sqlite
// ---------------------------------------------------------------------------

/** The part of a statement of `node:sqlite` that the storage uses. */
interface NodeStatement {
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
  run(...params: SqlValue[]): { changes: number | bigint };
}

/** The part of a database of `node:sqlite` that the storage uses. */
interface NodeHandle {
  prepare(sql: string): NodeStatement;
  exec(sql: string): void;
  close(): void;
}

/** The database class of `node:sqlite`: `Database`, or `DatabaseSync` before Node.js 26.11. */
type NodeDatabaseClass = new (path: string) => NodeHandle;

let nodeModule: Promise<NodeDatabaseClass | undefined> | undefined;

/**
 * This function loads `node:sqlite` one time. The promise gives undefined when the import fails,
 * or when the module has no database class. Node.js before 22.13 has the module only with the
 * flag `--experimental-sqlite`.
 */
function loadNodeSqlite(): Promise<NodeDatabaseClass | undefined> {
  nodeModule ??= import("node:sqlite")
    .then((module: unknown) => {
      const exports = module as { Database?: unknown; DatabaseSync?: unknown };
      const found = "Database" in exports ? exports.Database : exports.DatabaseSync;
      return typeof found === "function" ? (found as NodeDatabaseClass) : undefined;
    })
    .catch(() => undefined);
  return nodeModule;
}

/**
 * This function gives true when this Node.js has `node:sqlite` without a flag (Node.js 22.13 or
 * later). Then the engine `auto` uses it.
 */
export async function isNodeSqliteAvailable(): Promise<boolean> {
  return (await loadNodeSqlite()) !== undefined;
}

/** A database of `node:sqlite`. It keeps the prepared statements of the storage. */
class NodeDatabase implements EngineDatabase {
  private readonly statements = new Map<string, NodeStatement>();

  constructor(private readonly handle: NodeHandle) {}

  all<R>(sql: string, params: SqlValue[] = []): R[] {
    return this.statement(sql).all(...params) as R[];
  }

  firstOfEach<R>(sql: string, params: SqlValue[][]): Array<R | undefined> {
    const statement = this.statement(sql);
    return params.map((list) => statement.get(...list) as R | undefined);
  }

  run(sql: string, params: SqlValue[] = []): number {
    return Number(this.statement(sql).run(...params).changes);
  }

  exec(sql: string): void {
    this.handle.exec(sql);
  }

  close(): void {
    this.statements.clear();
    this.handle.close();
  }

  private statement(sql: string): NodeStatement {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.handle.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
}

/** The error code of SQLite for a write to a read-only database. */
const SQLITE_READONLY = 8;

/**
 * This function opens a database file with `node:sqlite`, and makes the file when it is missing.
 * The file gets WAL mode, so a read in another process does not wait for a write. The busy
 * timeout makes a write wait for the lock of another process.
 */
function openNodeFile(Database: NodeDatabaseClass, path: string, busyTimeoutMs: number): NodeDatabase {
  const handle = new Database(path);
  try {
    handle.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(busyTimeoutMs))}`);
    try {
      handle.prepare("PRAGMA journal_mode = WAL").get();
    } catch (error) {
      // A read-only file keeps its journal mode: the reads work, and a write gives the error
      if ((error as { errcode?: unknown }).errcode !== SQLITE_READONLY) throw error;
    }
    // In WAL mode, NORMAL keeps the file consistent after a crash, with fewer disk syncs
    handle.exec("PRAGMA synchronous = NORMAL");
  } catch (error) {
    handle.close();
    throw error;
  }
  return new NodeDatabase(handle);
}

// ---------------------------------------------------------------------------
// sql.js
// ---------------------------------------------------------------------------

/** A database of sql.js. */
class SqlJsDatabase implements EngineDatabase {
  constructor(private readonly raw: Database) {}

  all<R>(sql: string, params: SqlValue[] = []): R[] {
    const statement = this.raw.prepare(sql);
    try {
      statement.bind(params);
      const out: R[] = [];
      while (statement.step()) out.push(statement.getAsObject() as R);
      return out;
    } finally {
      statement.free();
    }
  }

  firstOfEach<R>(sql: string, params: SqlValue[][]): Array<R | undefined> {
    const statement = this.raw.prepare(sql);
    try {
      return params.map((list) => {
        statement.bind(list);
        const row = statement.step() ? (statement.getAsObject() as R) : undefined;
        statement.reset();
        return row;
      });
    } finally {
      statement.free();
    }
  }

  run(sql: string, params: SqlValue[] = []): number {
    this.raw.run(sql, params);
    return this.raw.getRowsModified();
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  close(): void {
    this.raw.close();
  }
}

// ---------------------------------------------------------------------------
// An open database of a path, with the file work of its engine
// ---------------------------------------------------------------------------

/**
 * This function copies the schema of the storages from one database to another. The node engine
 * calls it when it makes the file at the first write.
 */
export type CopySchema = (from: EngineDatabase, to: EngineDatabase) => void;

/** An open database of a path, with the file work of its engine. */
export interface OpenDatabase {
  readonly engine: SqliteEngineName;
  /** The current database. The node engine changes it when it opens the file. */
  readonly db: EngineDatabase;
  /**
   * True when the node engine waits for the first write to make the file. Until then, the
   * database is in memory, and it has the tables and no item.
   */
  readonly waiting: boolean;
  /** This method opens the file and copies the schema to it. The node engine uses it before the first write. */
  makeFile(copy: CopySchema): void;
  /** This method opens a file that another process made after the open, before a read. */
  refresh(copy: CopySchema): void;
  /** This method writes the database to the file. Only sql.js has a write to do. */
  saveFile(): Promise<void>;
  close(): void;
}

/**
 * A database of `node:sqlite`. A missing file stays missing until the first write that changes
 * an item: until then, the database is in memory.
 */
class NodeOpenDatabase implements OpenDatabase {
  readonly engine = "node";
  db: EngineDatabase;
  waiting: boolean;

  constructor(
    private readonly Database: NodeDatabaseClass,
    private readonly path: string,
    private readonly busyTimeoutMs: number,
  ) {
    if (path === MEMORY_PATH) {
      this.db = new NodeDatabase(new Database(MEMORY_PATH));
      this.waiting = false;
    } else if (existsSync(path)) {
      this.db = openNodeFile(Database, path, busyTimeoutMs);
      this.waiting = false;
    } else {
      this.db = new NodeDatabase(new Database(MEMORY_PATH));
      this.waiting = true;
    }
  }

  makeFile(copy: CopySchema): void {
    if (!this.waiting) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const file = openNodeFile(this.Database, this.path, this.busyTimeoutMs);
    try {
      copy(this.db, file);
    } catch (error) {
      file.close();
      throw error;
    }
    this.db.close();
    this.db = file;
    this.waiting = false;
  }

  refresh(copy: CopySchema): void {
    if (this.waiting && existsSync(this.path)) this.makeFile(copy);
  }

  saveFile(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.db.close();
  }
}

/** A database of sql.js: the database is in memory, and `saveFile()` writes the whole file. */
class SqlJsOpenDatabase implements OpenDatabase {
  readonly engine = "sqljs";
  readonly waiting = false;

  constructor(
    readonly db: SqlJsDatabase,
    private readonly save: () => Promise<void>,
  ) {}

  makeFile(): void {}

  refresh(): void {}

  saveFile(): Promise<void> {
    return this.save();
  }

  close(): void {
    this.db.close();
  }
}

/**
 * sql.js reads only the main file. A write-ahead log of the node engine (`<file>-wal`) can hold
 * changes that are not in the main file yet. A whole-file write of sql.js does not agree with the
 * log. Thus sql.js refuses such a file.
 */
function checkNoWriteAheadLog(path: string): void {
  let size = 0;
  try {
    size = statSync(`${path}-wal`).size;
  } catch {
    return;
  }
  if (size > 0) {
    throw new Error(
      `The file ${path} has a write-ahead log (${path}-wal) of the engine node: open it with the engine node, or close the process that uses it`,
    );
  }
}

/** The error of the engine `node` when this Node.js has no `node:sqlite`. */
function noNodeSqlite(): Error {
  return new Error(
    `The SQLite engine node needs node:sqlite, and this Node.js (${process.version}) does not have it without a flag: use Node.js 22.13 or later, or the engine sqljs or auto`,
  );
}

/** This function opens the database of a path with an engine. `auto` uses `node` when it can. */
export async function openEngine(path: string, engine: SqliteEngine, busyTimeoutMs: number): Promise<OpenDatabase> {
  if (engine !== "sqljs") {
    const Database = await loadNodeSqlite();
    if (Database) return new NodeOpenDatabase(Database, path, busyTimeoutMs);
    if (engine === "node") throw noNodeSqlite();
  }
  if (path !== MEMORY_PATH) checkNoWriteAheadLog(path);
  const { db, save } = await createConnection({ dbPath: path });
  return new SqlJsOpenDatabase(new SqlJsDatabase(db), save);
}
