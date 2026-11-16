/**
 * The helpers of the sqlite.* and logs.* procedures. Each procedure opens the file through the engine of
 * `@mark1russell7/sqlite`: `openDatabase` on `node:sqlite`, one connection for each call.
 *
 * - A connection that runs the SQL of a caller gets `confineToFile`: the SQL works only on its file. The guard needs
 *   Node.js 24.10 or later. Before it, the call throws `ConfineUnavailableError` (`code: "CONFINE_UNAVAILABLE"`) before
 *   it opens the file.
 * - The open does not change the journal mode of a file: a file in WAL mode stays in WAL mode, and another file stays in
 *   its mode.
 * - A write waits for the lock of another connection for `BUSY_TIMEOUT_MS`.
 */

import { existsSync } from "node:fs";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { MEMORY_PATH } from "../../engines.js";
import { loadSqlite, type Sqlite } from "../../load.js";
import { DEFAULT_DB_PATH } from "../../types.js";

/** The time that a call waits for the lock of another connection, in milliseconds. */
export const BUSY_TIMEOUT_MS = 5000;

/** The database file of an input: `dbPath`, or the CLI log database. */
export function databasePath(dbPath: string | undefined): string {
  return dbPath ?? DEFAULT_DB_PATH;
}

/** This function throws ENOENT for a database file that does not exist. */
export function requireDatabaseFile(procedure: string, path: string): void {
  if (path === MEMORY_PATH || existsSync(path)) return;
  const error = new Error(`${procedure}: the database file does not exist: ${path}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  throw error;
}

/** How a procedure opens its database. */
export interface OpenMode {
  /** The name of the procedure, for the errors. */
  readonly procedure: string;
  /**
   * What a missing file does:
   * - `error`: the call throws ENOENT.
   * - `empty`: the call reads an empty database in memory, and does not make the file.
   * - `make`: the call makes the file and its folder at the open, also when its work then changes nothing or fails.
   */
  readonly missing: "error" | "empty" | "make";
  /** True when the connection only reads: `PRAGMA query_only` refuses each change. */
  readonly queryOnly: boolean;
  /** True when the call runs the SQL of its caller. Then `confineToFile` keeps that SQL on the file. */
  readonly callerSql: boolean;
}

/** True when this Node.js has the guard, false when it does not, undefined before the first check. */
let confineAvailable: boolean | undefined;

/**
 * This function tells if this Node.js has the guard `confineToFile`. It tries the guard one time on a database in
 * memory. The procedures and their tests use this one check.
 */
export function isConfineAvailable(sqlite: Sqlite): boolean {
  if (confineAvailable === undefined) {
    const probe = sqlite.openDatabase(MEMORY_PATH, { wal: false });
    try {
      sqlite.confineToFile(probe);
      confineAvailable = true;
    } catch (error) {
      if (!(error instanceof sqlite.ConfineUnavailableError)) throw error;
      confineAvailable = false;
    } finally {
      probe.close();
    }
  }
  return confineAvailable;
}

/** This function throws `ConfineUnavailableError` when this Node.js has no guard, before the call opens its file. */
function checkConfine(sqlite: Sqlite): void {
  if (!isConfineAvailable(sqlite)) throw new sqlite.ConfineUnavailableError();
}

/**
 * This function opens the database of a call, gives it to the work, and closes it. The work is synchronous, so no
 * other call of this process uses the connection.
 */
export async function withDatabase<T>(path: string, mode: OpenMode, work: (db: DatabaseSync, sqlite: Sqlite) => T): Promise<T> {
  const sqlite = await loadSqlite();
  if (mode.callerSql) checkConfine(sqlite);
  let memory = path === MEMORY_PATH;
  if (!memory && !existsSync(path)) {
    if (mode.missing === "error") requireDatabaseFile(mode.procedure, path);
    else if (mode.missing === "empty") memory = true;
  }
  const db = sqlite.openDatabase(memory ? MEMORY_PATH : path, {
    wal: false,
    busyTimeoutMs: BUSY_TIMEOUT_MS,
    makeFolder: !memory && mode.missing === "make",
  });
  try {
    if (mode.queryOnly) db.exec("PRAGMA query_only = 1");
    if (mode.callerSql) sqlite.confineToFile(db);
    return work(db, sqlite);
  } finally {
    db.close();
  }
}

/** A value that a statement takes. */
export type SqlParam = null | number | bigint | string | Uint8Array;

/**
 * This function gives the values of the `?` placeholders. A boolean becomes 1 or 0, and an undefined value becomes
 * null. Another value is an error: an object would bind as named parameters.
 */
export function toSqlParams(params: readonly unknown[] | undefined, label: string): SqlParam[] {
  return (params ?? []).map((value, index) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number" || typeof value === "string" || typeof value === "bigint" || value instanceof Uint8Array) return value;
    throw new TypeError(`${label}: params[${index}] is ${Array.isArray(value) ? "an array" : `a value of the type ${typeof value}`}. Give a number, a string, a boolean or null.`);
  });
}

/** The rows of one statement, as objects. */
export function rowsOf<T>(db: DatabaseSync, sql: string, params: readonly SqlParam[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/** The number of rows that the connection changed since it opened. */
export function totalChanges(db: DatabaseSync): number {
  return Number(rowsOf<{ n: number }>(db, "SELECT total_changes() AS n")[0]?.n ?? 0);
}

/** This function runs one statement to its end, and gives its rows when it has columns. */
export function runStatement(statement: StatementSync, params: readonly SqlParam[]): Record<string, unknown>[] | undefined {
  if (statement.columns().length > 0) return statement.all(...params) as Record<string, unknown>[];
  statement.run(...params);
  return undefined;
}

/** The text of an error. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The statements that control a transaction, which the procedures run themselves. */
const TRANSACTION_CONTROL = /^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/** The SQL of a statement without its leading spaces and comments. */
function withoutLeadingComments(sql: string): string {
  let rest = sql;
  for (;;) {
    const trimmed = rest.replace(/^\s+/, "");
    if (trimmed.startsWith("--")) {
      const end = trimmed.indexOf("\n");
      rest = end === -1 ? "" : trimmed.slice(end + 1);
    } else if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      rest = end === -1 ? "" : trimmed.slice(end + 2);
    } else {
      return trimmed;
    }
  }
}

/** True for a statement that starts, ends or names a transaction (BEGIN, COMMIT, SAVEPOINT, ...). */
export function controlsTransaction(sql: string): boolean {
  return TRANSACTION_CONTROL.test(withoutLeadingComments(sql));
}

/** The result of one SQL text: the rows that it changed, and the rows of its last statement that gives rows. */
export interface StatementRun {
  changes: number;
  rows?: Record<string, unknown>[];
}

/**
 * This function runs the statements of one SQL text in order, and gives one result for the text. The params bind to the
 * first statement, so a text with params must hold one statement.
 *
 * - With `control: "refuse"` (the default), the text runs in the transaction of the caller, and a statement that
 *   controls a transaction is an error.
 * - With `control: "allow"`, the text controls its own transactions.
 */
export function runStatements(
  sqlite: Sqlite,
  db: DatabaseSync,
  sql: string,
  params: readonly SqlParam[],
  label: string,
  control: "refuse" | "allow" = "refuse",
): StatementRun {
  const before = totalChanges(db);
  const result: StatementRun = { changes: 0 };
  let count = 0;
  for (const statement of sqlite.eachStatement(db, sql)) {
    count++;
    if (count > 1 && params.length > 0) {
      throw new Error(`${label}: the params bind to one statement, and the SQL has several. Send one statement for each call.`);
    }
    if (control === "refuse" && controlsTransaction(statement.sourceSQL)) {
      throw new Error(`${label}: the procedure runs the transaction: BEGIN, COMMIT, ROLLBACK, SAVEPOINT and RELEASE are refused`);
    }
    const rows = runStatement(statement, count === 1 ? params : []);
    if (rows) result.rows = rows;
  }
  if (count === 0) throw new Error(`${label}: the SQL has no statement`);
  result.changes = totalChanges(db) - before;
  return result;
}

/** The first statements of a SQL text, before a statement runs. */
export interface StatementCount {
  /** The number of statements: 0, 1, or 2 for two or more. */
  readonly count: 0 | 1 | 2;
  /** True when the first statement controls a transaction (BEGIN, COMMIT, SAVEPOINT, ...). */
  readonly firstControls: boolean;
}

/**
 * This function counts the statements of a SQL text up to two, and runs none. It compiles the first statement and asks
 * `eachStatement` for the second. A second statement that does not compile before the first one runs, for example an
 * `INSERT` into a table that the first one makes, also counts.
 */
export function countStatements(sqlite: Sqlite, db: DatabaseSync, sql: string): StatementCount {
  const statements = sqlite.eachStatement(db, sql);
  try {
    const first = statements.next();
    if (first.done) return { count: 0, firstControls: false };
    const firstControls = controlsTransaction(first.value.sourceSQL);
    try {
      return { count: statements.next().done ? 1 : 2, firstControls };
    } catch {
      return { count: 2, firstControls };
    }
  } finally {
    statements.return(undefined);
  }
}
