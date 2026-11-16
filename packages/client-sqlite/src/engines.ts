/**
 * The two SQLite engines of `SqliteStorage`: `node:sqlite` and sql.js. Each engine gives a
 * `SqlConnection` of `@mark1russell7/sqlite`, so the storage has one set of queries and uses the
 * transactions of that package.
 *
 * - The engine `node` is `openDatabase` of `@mark1russell7/sqlite`, on the module `node:sqlite` of
 *   Node.js. It writes only the changed pages of the file, and SQLite locks the file for each write.
 * - The engine `sqljs` is sql.js (SQLite in WebAssembly), through `@mark1russell7/docker-sqlite`
 *   and the adapter `sqlJsConnection`. It keeps the database in memory and writes the whole file
 *   after a write. It is deprecated: its first open in a process shows a `DeprecationWarning`.
 * - The two engines read and write the same file format.
 *
 * This module loads the main entry of `@mark1russell7/sqlite`, and with it `node:sqlite`, only
 * when a storage opens. An import of this package does not load them.
 */

import { existsSync, statSync } from "node:fs";
import { createConnection } from "@mark1russell7/docker-sqlite";
import { sqlJsConnection, type SqlConnection, type SqlStatement } from "@mark1russell7/sqlite/portable";

/** The path of a database that is only in memory. */
export const MEMORY_PATH = ":memory:";

/**
 * The engine of a database: `node:sqlite` (`node`) or sql.js (`sqljs`). The engine `sqljs` is
 * deprecated. Version 0.61.0 removes it and needs Node.js 22.13 or later.
 */
export type SqliteEngineName = "node" | "sqljs";

/**
 * The engine choice of a `SqliteStorage`. With `auto`, the storage uses `node` when Node.js has
 * `node:sqlite`, and the deprecated engine `sqljs` when it does not.
 */
export type SqliteEngine = "auto" | SqliteEngineName;

/** The code of the deprecation warning of the engine `sqljs`. */
const SQLJS_DEPRECATION_CODE = "PROCEDURES_SQLITE_SQLJS";

let sqlJsWarned = false;

/**
 * This function shows the deprecation warning of the engine `sqljs`, one time in a process. The
 * flag `--no-deprecation` of Node.js hides it.
 */
function warnSqlJs(engine: SqliteEngine): void {
  if (sqlJsWarned) return;
  sqlJsWarned = true;
  const cause =
    engine === "sqljs"
      ? "The SQLite engine sqljs is deprecated"
      : `This Node.js (${process.version}) has no node:sqlite, so the engine auto uses the deprecated engine sqljs`;
  process.emitWarning(
    `${cause}. Version 0.61.0 of @procedures/sqlite removes it: use Node.js 22.13 or later, with the engine node or auto.`,
    { type: "DeprecationWarning", code: SQLJS_DEPRECATION_CODE },
  );
}

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

/** A connection of an engine: a `SqlConnection` that closes. */
type EngineConnection = SqlConnection & { close(): void };

/** The calls of an open database that a storage uses. Each call is synchronous. */
export interface EngineDatabase {
  /** The connection, for the transactions and the schema functions of `@mark1russell7/sqlite`. */
  readonly connection: SqlConnection;
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

/** A database of either engine. It keeps one prepared statement for each SQL text. */
class ConnectionDatabase implements EngineDatabase {
  readonly connection: EngineConnection;

  private readonly statements = new Map<string, SqlStatement>();

  constructor(connection: EngineConnection) {
    this.connection = connection;
  }

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
    this.connection.exec(sql);
  }

  close(): void {
    this.statements.clear();
    this.connection.close();
  }

  private statement(sql: string): SqlStatement {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.connection.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
}

// ---------------------------------------------------------------------------
// node:sqlite, through @mark1russell7/sqlite
// ---------------------------------------------------------------------------

/** The part of `@mark1russell7/sqlite` that the engine `node` uses. */
type NodeSqlite = Pick<typeof import("@mark1russell7/sqlite"), "openDatabase">;

let nodeModule: Promise<NodeSqlite | undefined> | undefined;

/**
 * This function loads `@mark1russell7/sqlite` one time, and opens a database in memory as a test.
 * The promise gives undefined when the import or the test fails. Node.js before 22.13 has
 * `node:sqlite` only with the flag `--experimental-sqlite`.
 */
function loadNodeSqlite(): Promise<NodeSqlite | undefined> {
  nodeModule ??= import("@mark1russell7/sqlite")
    .then((module: NodeSqlite) => {
      module.openDatabase(MEMORY_PATH, { wal: false }).close();
      return module;
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

/**
 * This function opens a database file with `node:sqlite`, and makes the file and its folder when
 * they are missing. The file gets WAL mode, so a read in another process does not wait for a
 * write. A read-only file keeps its journal mode: the reads work, and a write gives the error. The
 * busy timeout makes a write wait for the lock of another process. In WAL mode, `NORMAL` keeps the
 * file consistent after a crash, with fewer disk syncs.
 */
function openNodeFile(sqlite: NodeSqlite, path: string, busyTimeoutMs: number): ConnectionDatabase {
  return new ConnectionDatabase(
    sqlite.openDatabase(path, {
      wal: "when-writable",
      synchronous: "NORMAL",
      busyTimeoutMs: Math.max(0, Math.floor(busyTimeoutMs)),
      makeFolder: true,
    }),
  );
}

/** This function opens a database in memory with `node:sqlite`. */
function openNodeMemory(sqlite: NodeSqlite): ConnectionDatabase {
  return new ConnectionDatabase(sqlite.openDatabase(MEMORY_PATH, { wal: false }));
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
  private readonly sqlite: NodeSqlite;
  private readonly path: string;
  private readonly busyTimeoutMs: number;

  readonly engine = "node";
  db: EngineDatabase;
  waiting: boolean;

  constructor(sqlite: NodeSqlite, path: string, busyTimeoutMs: number) {
    this.sqlite = sqlite;
    this.path = path;
    this.busyTimeoutMs = busyTimeoutMs;
    if (path === MEMORY_PATH) {
      this.db = openNodeMemory(sqlite);
      this.waiting = false;
    } else if (existsSync(path)) {
      this.db = openNodeFile(sqlite, path, busyTimeoutMs);
      this.waiting = false;
    } else {
      this.db = openNodeMemory(sqlite);
      this.waiting = true;
    }
  }

  makeFile(copy: CopySchema): void {
    if (!this.waiting) return;
    const file = openNodeFile(this.sqlite, this.path, this.busyTimeoutMs);
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

// ---------------------------------------------------------------------------
// sql.js
// ---------------------------------------------------------------------------

/** A database of sql.js: the database is in memory, and `saveFile()` writes the whole file. */
class SqlJsOpenDatabase implements OpenDatabase {
  readonly db: ConnectionDatabase;
  private readonly save: () => Promise<void>;

  readonly engine = "sqljs";
  readonly waiting = false;

  constructor(db: ConnectionDatabase, save: () => Promise<void>) {
    this.db = db;
    this.save = save;
  }

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
    const sqlite = await loadNodeSqlite();
    if (sqlite) return new NodeOpenDatabase(sqlite, path, busyTimeoutMs);
    if (engine === "node") throw noNodeSqlite();
  }
  warnSqlJs(engine);
  if (path !== MEMORY_PATH) checkNoWriteAheadLog(path);
  const { db, save } = await createConnection({ dbPath: path });
  return new SqlJsOpenDatabase(new ConnectionDatabase(sqlJsConnection(db)), save);
}
