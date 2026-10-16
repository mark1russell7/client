/**
 * sqlite.tables procedure (roadmap R44)
 *
 * The tables and the views of a database, without the internal `sqlite_` tables. The connection
 * is read only (PRAGMA query_only), and a missing file is an error: it does not make one.
 */

import { query, withConnection } from "@mark1russell7/docker-sqlite";
import type { DbTableInfo, DbTablesInput, DbTablesOutput } from "../../types.js";
import { databasePath, requireDatabaseFile } from "./shared.js";

/**
 * The tables and views of a database
 */
export async function dbTables(input: DbTablesInput): Promise<DbTablesOutput> {
  const path = databasePath(input.dbPath);
  requireDatabaseFile("sqlite.tables", path);
  const types = input.views === false ? "('table')" : "('table', 'view')";
  return withConnection({ dbPath: path }, (db) => {
    db.run("PRAGMA query_only = 1");
    const result = query<DbTableInfo>(
      db,
      `SELECT name, type, sql FROM sqlite_master WHERE type IN ${types} AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`,
    );
    return { tables: result.rows.map((row) => ({ name: row.name, type: row.type, sql: row.sql ?? null })) };
  });
}
