/**
 * sqlite.tables procedure (roadmap R44)
 *
 * The tables and the views of a database, without the internal `sqlite_` tables. The connection
 * is read only (PRAGMA query_only), and a missing file is an error: it does not make one.
 */

import type { DbTableInfo, DbTablesInput, DbTablesOutput } from "../../types.js";
import { databasePath, rowsOf, withDatabase } from "./shared.js";

/**
 * The tables and views of a database
 */
export async function dbTables(input: DbTablesInput): Promise<DbTablesOutput> {
  const path = databasePath(input.dbPath);
  const types = input.views === false ? "('table')" : "('table', 'view')";
  const mode = { procedure: "sqlite.tables", missing: "error", queryOnly: true, callerSql: false } as const;
  return withDatabase(path, mode, (db) => {
    const rows = rowsOf<DbTableInfo>(
      db,
      `SELECT name, type, sql FROM sqlite_master WHERE type IN ${types} AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`,
    );
    return { tables: rows.map((row) => ({ name: row.name, type: row.type, sql: row.sql ?? null })) };
  });
}
