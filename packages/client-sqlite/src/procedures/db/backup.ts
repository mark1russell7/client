/**
 * sqlite.backup procedure (roadmap R44)
 *
 * A copy of a database in a new file. The package runs SQLite in WebAssembly (sql.js): the
 * database is in the memory of the module, and `VACUUM INTO` and the backup API write into the
 * file system of the module, not to the disk. So the procedure takes the image of the database
 * (`export()`, the serialized database) in the file queue of the database, where no other call
 * of this process changes it. It writes the image to a file next to the target, checks it with
 * `PRAGMA integrity_check`, and renames it.
 *
 * - The procedure does not replace a file, and it does not write the source.
 * - With `vacuum: true`, it compacts the copy (VACUUM on the copy): the result of `VACUUM INTO`.
 */

import { existsSync } from "node:fs";
import { rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { query, withConnection } from "@mark1russell7/docker-sqlite";
import type { DbBackupInput, DbBackupOutput } from "../../types.js";
import { databasePath, requireDatabaseFile } from "./shared.js";

/** The key of a file path: Windows file names do not depend on case. */
function fileKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/**
 * Copy a database to a new file
 */
export async function dbBackup(input: DbBackupInput): Promise<DbBackupOutput> {
  const source = databasePath(input.dbPath);
  requireDatabaseFile("sqlite.backup", source);
  const target = resolve(input.to);
  if (source !== ":memory:" && fileKey(source) === fileKey(target)) {
    throw new Error("sqlite.backup: the copy cannot be the database file itself");
  }
  if (existsSync(target)) {
    const error = new Error(`sqlite.backup: the file exists already: ${target}. The procedure does not replace a file.`) as NodeJS.ErrnoException;
    error.code = "EEXIST";
    throw error;
  }

  const image = await withConnection({ dbPath: source }, (db) => db.export());
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, image);
    if (input.vacuum) {
      // The VACUUM changes the copy only: withConnection saves it to the temporary file
      await withConnection({ dbPath: temporary }, (db) => db.run("VACUUM"));
    }
    const check = await withConnection({ dbPath: temporary }, (db) => query<{ integrity_check: string }>(db, "PRAGMA integrity_check").rows);
    const verdict = check.map((row) => row.integrity_check).join("; ");
    if (verdict !== "ok") throw new Error(`sqlite.backup: the copy is not valid: ${verdict}`);
    if (existsSync(target)) throw new Error(`sqlite.backup: the file exists already: ${target}. The procedure does not replace a file.`);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { path: target, bytes: (await stat(target)).size };
}
