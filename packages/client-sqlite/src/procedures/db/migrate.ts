/**
 * sqlite.migrate procedure (roadmap R44)
 *
 * The procedure applies the numbered migrations that the database does not have, in the order
 * of their numbers. The migrations come from a folder (files named `<number>_<name>.sql`) or
 * from the input. A table of the database (default `schema_migrations`) records each applied
 * migration with the sha256 of its SQL.
 *
 * - The pending migrations run in one transaction: when one fails, none is applied.
 * - A second call applies nothing, and does not write the file.
 * - The SQL of an applied migration must not change: a different sha256 is an error, and the
 *   call applies nothing. (The sha256 reads line ends as LF, so a checkout with CRLF is the same.)
 * - A migration must not hold BEGIN, COMMIT or ROLLBACK: the procedure runs the transaction.
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { query, withConnection } from "@mark1russell7/docker-sqlite";
import { MIGRATION_TABLE_PATTERN, type DbMigrateInput, type DbMigrateOutput, type DbMigration } from "../../types.js";
import { databasePath, runStatements } from "./shared.js";

/** The name of a migration file: a number, then "_" or "-", then a name, then ".sql". */
const MIGRATION_FILE = /^(\d+)[_-](.+)\.sql$/i;

/** The default table of the applied migrations. */
export const DEFAULT_MIGRATION_TABLE = "schema_migrations";

interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

/** The migrations of a folder: each file `<number>_<name>.sql`. Other files are not migrations. */
export async function migrationsOfFolder(folder: string): Promise<DbMigration[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const migrations: DbMigration[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".sql")) continue;
    const match = MIGRATION_FILE.exec(entry.name);
    if (!match) throw new Error(`sqlite.migrate: the file ${entry.name} has no number: name it <number>_<name>.sql`);
    migrations.push({ version: Number(match[1]), name: match[2]!, sql: await readFile(join(folder, entry.name), "utf8") });
  }
  return migrations;
}

/** The migrations in the order of their numbers. Two migrations with one number are an error. */
function ordered(migrations: DbMigration[]): Migration[] {
  const byVersion = new Map<number, Migration>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new Error(`sqlite.migrate: the version ${migration.version} is not a whole number of 1 or more`);
    }
    if (byVersion.has(migration.version)) throw new Error(`sqlite.migrate: two migrations have the version ${migration.version}`);
    const name = migration.name ?? `migration ${migration.version}`;
    byVersion.set(migration.version, { version: migration.version, name, sql: migration.sql, checksum: checksum(migration.sql) });
  }
  return [...byVersion.values()].sort((a, b) => a.version - b.version);
}

/**
 * Apply the numbered migrations that a database does not have
 */
export async function dbMigrate(input: DbMigrateInput): Promise<DbMigrateOutput> {
  if ((input.folder === undefined) === (input.migrations === undefined)) {
    throw new Error("sqlite.migrate: give exactly one of folder or migrations");
  }
  const table = input.table ?? DEFAULT_MIGRATION_TABLE;
  if (!MIGRATION_TABLE_PATTERN.test(table)) throw new Error(`sqlite.migrate: the table name ${JSON.stringify(table)} is not valid`);
  const migrations = ordered(input.folder !== undefined ? await migrationsOfFolder(input.folder) : input.migrations!);

  return withConnection({ dbPath: databasePath(input.dbPath) }, (db) => {
    db.run("BEGIN");
    try {
      db.run(
        `CREATE TABLE IF NOT EXISTS "${table}" (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      );
      const applied = new Map(
        query<{ version: number; checksum: string }>(db, `SELECT version, checksum FROM "${table}"`).rows.map((row) => [row.version, row.checksum]),
      );
      for (const migration of migrations) {
        const known = applied.get(migration.version);
        if (known !== undefined && known !== migration.checksum) {
          throw new Error(`sqlite.migrate: the migration ${migration.version} (${migration.name}) changed after it was applied: its sha256 is different`);
        }
      }
      const pending = migrations.filter((migration) => !applied.has(migration.version));
      for (const migration of pending) {
        const label = `the migration ${migration.version} (${migration.name})`;
        try {
          runStatements(db, migration.sql, [], label);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(message.startsWith(label) ? `sqlite.migrate: ${message}` : `sqlite.migrate: ${label} failed: ${message}`);
        }
        db.run(`INSERT INTO "${table}" (version, name, checksum) VALUES (?, ?, ?)`, [migration.version, migration.name, migration.checksum]);
      }
      db.run("COMMIT");
      const versions = [...applied.keys(), ...pending.map((migration) => migration.version)];
      return {
        applied: pending.map((migration) => ({ version: migration.version, name: migration.name })),
        skipped: migrations.length - pending.length,
        version: versions.length > 0 ? Math.max(...versions) : 0,
      };
    } catch (error) {
      try {
        db.run("ROLLBACK");
      } catch {
        // SQLite ended the transaction already
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}. No migration was applied.`);
    }
  });
}
