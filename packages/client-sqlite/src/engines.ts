/**
 * The SQLite engine of `SqliteStorage`: `openDatabase` of `@mark1russell7/sqlite`, on the module
 * `node:sqlite` of Node.js. It gives a `SqlConnection` of that package, so the storage uses its
 * transactions. It writes only the changed pages of the file, and SQLite locks the file for each
 * write.
 *
 * Version 0.61.0 removed the engine `sqljs` (sql.js, SQLite in WebAssembly). A file that it wrote
 * opens with this engine, with its items and its versions.
 *
 * This module loads the main entry of `@mark1russell7/sqlite`, and with it `node:sqlite`, only
 * when a storage opens. An import of this package does not load them.
 */

import { existsSync } from "node:fs";
import type { SqlConnection, SqlStatement } from "@mark1russell7/sqlite/portable";
import { loadSqlite, type Sqlite } from "./load.js";

/** The path of a database that is only in memory. */
export const MEMORY_PATH = ":memory:";

/** The engine of a database: `node:sqlite` (`node`). Version 0.61.0 removed the engine `sqljs`. */
export type SqliteEngineName = "node";

/** The engine choice of a `SqliteStorage`. `auto` and `node` both use `node:sqlite`. */
export type SqliteEngine = "auto" | SqliteEngineName;

const ENGINES: ReadonlySet<string> = new Set<SqliteEngine>(["auto", "node"]);

/** This function gives the engine choice when it is known. Else it throws a `TypeError`. */
export function checkEngine(engine: unknown): SqliteEngine {
  if (engine === "sqljs") {
    throw new TypeError(
      "The SQLite engine sqljs was removed in version 0.61.0: use auto or node. A file of the engine sqljs opens with the engine node.",
    );
  }
  if (typeof engine !== "string" || !ENGINES.has(engine)) {
    throw new TypeError(`Unknown SQLite engine ${JSON.stringify(engine)}: use auto or node`);
  }
  return engine as SqliteEngine;
}

/** A value that a statement takes or gives. */
export type SqlValue = string | number | null;

/** A connection of the engine: a `SqlConnection` that closes. */
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

/** A database of the engine. It keeps one prepared statement for each SQL text. */
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

let nodeModule: Promise<Sqlite | undefined> | undefined;

/**
 * This function loads `@mark1russell7/sqlite` one time, and opens a database in memory as a test.
 * The promise gives undefined when the import or the test fails. Node.js before 22.13 has
 * `node:sqlite` only with the flag `--experimental-sqlite`.
 */
function loadNodeSqlite(): Promise<Sqlite | undefined> {
  nodeModule ??= loadSqlite()
    .then((module) => {
      module.openDatabase(MEMORY_PATH, { wal: false }).close();
      return module;
    })
    .catch(() => undefined);
  return nodeModule;
}

/**
 * This function gives true when this Node.js has `node:sqlite` without a flag. Node.js 22.13 and
 * later have it, and the package needs Node.js 22.13 or later.
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
function openNodeFile(sqlite: Sqlite, path: string, busyTimeoutMs: number): ConnectionDatabase {
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
function openNodeMemory(sqlite: Sqlite): ConnectionDatabase {
  return new ConnectionDatabase(sqlite.openDatabase(MEMORY_PATH, { wal: false }));
}

/**
 * This function copies the schema of the storages from one database to another. The engine
 * calls it when it makes the file at the first write.
 */
export type CopySchema = (from: EngineDatabase, to: EngineDatabase) => void;

/**
 * An open database of a path. A missing file stays missing until the first write that changes an
 * item: until then, the database is in memory.
 */
export class OpenDatabase {
  private readonly sqlite: Sqlite;
  private readonly path: string;
  private readonly busyTimeoutMs: number;

  readonly engine: SqliteEngineName = "node";
  /** The current database. It changes when the storage makes the file. */
  db: EngineDatabase;
  /**
   * True while the storage waits for the first write to make the file. Until then, the database
   * is in memory, and it has the tables and no item.
   */
  waiting: boolean;

  constructor(sqlite: Sqlite, path: string, busyTimeoutMs: number) {
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

  /** This method opens the file and copies the schema to it, before the first write. */
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

  /** This method opens a file that another process made after the open, before a read. */
  refresh(copy: CopySchema): void {
    if (this.waiting && existsSync(this.path)) this.makeFile(copy);
  }

  close(): void {
    this.db.close();
  }
}

/** The error when this Node.js has no `node:sqlite` without a flag. */
function noNodeSqlite(): Error {
  return new Error(
    `SqliteStorage needs node:sqlite, and this Node.js (${process.version}) does not have it without a flag: use Node.js 22.13 or later`,
  );
}

/** This function opens the database of a path. */
export async function openEngine(path: string, busyTimeoutMs: number): Promise<OpenDatabase> {
  const sqlite = await loadNodeSqlite();
  if (!sqlite) throw noNodeSqlite();
  return new OpenDatabase(sqlite, path, busyTimeoutMs);
}
