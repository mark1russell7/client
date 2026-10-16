/**
 * The helpers of the db.* procedures of roadmap R44.
 */

import { existsSync } from "node:fs";
import type { Database } from "@mark1russell7/docker-sqlite";
import { DEFAULT_DB_PATH } from "../../types.js";

/** The database file of an input: `dbPath`, or the CLI log database. */
export function databasePath(dbPath: string | undefined): string {
  return dbPath ?? DEFAULT_DB_PATH;
}

/**
 * This function throws ENOENT for a database file that does not exist. A procedure that only
 * reads uses it: sql.js opens a missing file as an empty database, so a wrong path gave no tables.
 */
export function requireDatabaseFile(procedure: string, path: string): void {
  if (path === ":memory:" || existsSync(path)) return;
  const error = new Error(`${procedure}: the database file does not exist: ${path}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  throw error;
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

/** The result of one statement: the rows that it changed, and its rows when it gives rows. */
export interface StatementRun {
  changes: number;
  rows?: Record<string, unknown>[];
}

function totalChanges(db: Database): number {
  return Number(db.exec("SELECT total_changes()")[0]?.values[0]?.[0] ?? 0);
}

/**
 * This function runs the statements of one SQL text in order, and gives one result for the text.
 * The params bind to the first statement, so a text with params must hold one statement. A
 * statement that controls a transaction is refused: the caller owns the transaction.
 */
export function runStatements(db: Database, sql: string, params: unknown[], label: string): StatementRun {
  const before = totalChanges(db);
  const result: StatementRun = { changes: 0 };
  let count = 0;
  const iterator = db.iterateStatements(sql);
  try {
    for (let step = iterator.next(); !step.done; step = iterator.next()) {
      const statement = step.value;
      try {
        count++;
        if (count > 1 && params.length > 0) {
          throw new Error(`${label}: the params bind to one statement, and the SQL has several`);
        }
        if (controlsTransaction(statement.getSQL())) {
          throw new Error(`${label}: the procedure runs the transaction: BEGIN, COMMIT, ROLLBACK, SAVEPOINT and RELEASE are refused`);
        }
        if (count === 1 && params.length > 0) statement.bind(params as never);
        if (statement.getColumnNames().length > 0) {
          const rows: Record<string, unknown>[] = [];
          while (statement.step()) rows.push(statement.getAsObject() as Record<string, unknown>);
          result.rows = rows;
        } else {
          while (statement.step()) {
            // A statement without columns gives no rows: one step runs it
          }
        }
      } finally {
        statement.free();
      }
    }
  } catch (error) {
    // Read the iterator to its end: that frees its copy of the SQL (it only prepares the rest)
    try {
      while (!iterator.next().done) {
        // Prepare only
      }
    } catch {
      // A later statement did not prepare: the iterator ended
    }
    throw error;
  }
  if (count === 0) throw new Error(`${label}: the SQL has no statement`);
  result.changes = totalChanges(db) - before;
  return result;
}
