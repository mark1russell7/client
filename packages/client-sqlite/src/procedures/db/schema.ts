/**
 * sqlite.schema procedure (roadmap R44)
 *
 * The columns, the indexes and the foreign keys of a table (or the columns of a view). The
 * procedure reads them with the table-valued PRAGMA functions, so the name of the table is a
 * bound value, not a part of the SQL text. The connection is read only.
 */

import type { DbColumnInfo, DbForeignKeyInfo, DbIndexInfo, DbSchemaInput, DbSchemaOutput } from "../../types.js";
import { databasePath, rowsOf, withDatabase } from "./shared.js";

interface ColumnRow {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexRow {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface ForeignKeyRow {
  from: string;
  table: string;
  to: string | null;
  on_update: string;
  on_delete: string;
}

/**
 * The columns and indexes of a table
 */
export async function dbSchema(input: DbSchemaInput): Promise<DbSchemaOutput> {
  const path = databasePath(input.dbPath);
  const mode = { procedure: "sqlite.schema", missing: "error", queryOnly: true, callerSql: false } as const;
  return withDatabase(path, mode, (db) => {
    const found = rowsOf<{ type: "table" | "view"; sql: string | null }>(
      db,
      "SELECT type, sql FROM sqlite_master WHERE name = ? AND type IN ('table', 'view')",
      [input.table],
    )[0];
    if (!found) throw new Error(`sqlite.schema: no table or view named ${JSON.stringify(input.table)}`);

    const columns: DbColumnInfo[] = rowsOf<ColumnRow>(db, "SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info(?) ORDER BY cid", [input.table]).map(
      (row) => ({ name: row.name, type: row.type, notNull: row.notnull === 1, defaultValue: row.dflt_value, primaryKey: row.pk }),
    );
    const indexes: DbIndexInfo[] = rowsOf<IndexRow>(db, "SELECT name, \"unique\", origin, partial FROM pragma_index_list(?) ORDER BY name", [input.table]).map(
      (row) => ({
        name: row.name,
        unique: row.unique === 1,
        origin: row.origin,
        partial: row.partial === 1,
        columns: rowsOf<{ name: string | null }>(db, "SELECT name FROM pragma_index_info(?) ORDER BY seqno", [row.name]).map((column) => column.name ?? "<expression>"),
      }),
    );
    const foreignKeys: DbForeignKeyInfo[] = rowsOf<ForeignKeyRow>(
      db,
      "SELECT \"from\", \"table\", \"to\", on_update, on_delete FROM pragma_foreign_key_list(?) ORDER BY id, seq",
      [input.table],
    ).map((row) => ({ from: row.from, table: row.table, to: row.to, onUpdate: row.on_update, onDelete: row.on_delete }));

    return { table: input.table, type: found.type, sql: found.sql, columns, indexes, foreignKeys };
  });
}
