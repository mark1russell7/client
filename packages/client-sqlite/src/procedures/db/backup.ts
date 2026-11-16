/**
 * sqlite.backup procedure (roadmap R44)
 *
 * A copy of a database in a new file. The procedure writes the copy with `snapshot` of `@mark1russell7/sqlite` (`VACUUM
 * INTO`) to a temporary file next to the target. It checks the copy with `PRAGMA integrity_check`, and renames it.
 *
 * - The copy is one consistent state of the database, with the changes in its WAL file. Writers can continue during the
 *   copy.
 * - The copy is compact: it has no free pages.
 * - The procedure does not replace a file, and it does not write the source.
 */

import { existsSync } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { DbBackupInput, DbBackupOutput } from "../../types.js";
import { databasePath, withDatabase } from "./shared.js";

/** The key of a file path: Windows file names do not depend on case. */
function fileKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/** The error for a target that exists. */
function targetExists(target: string): NodeJS.ErrnoException {
  const error = new Error(`sqlite.backup: the file exists already: ${target}. The procedure does not replace a file.`) as NodeJS.ErrnoException;
  error.code = "EEXIST";
  return error;
}

/**
 * Copy a database to a new file
 */
export async function dbBackup(input: DbBackupInput): Promise<DbBackupOutput> {
  const source = databasePath(input.dbPath);
  const target = resolve(input.to);
  if (source !== ":memory:" && fileKey(source) === fileKey(target)) {
    throw new Error("sqlite.backup: the copy cannot be the database file itself");
  }
  if (existsSync(target)) throw targetExists(target);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    const read = { procedure: "sqlite.backup", missing: "error", queryOnly: false, callerSql: false } as const;
    await withDatabase(source, read, (db, sqlite) => sqlite.snapshot(db, temporary));
    const check = { procedure: "sqlite.backup", missing: "error", queryOnly: true, callerSql: false } as const;
    const integrity = await withDatabase(temporary, check, (db, sqlite) => sqlite.checkIntegrity(db));
    if (!integrity.ok) throw new Error(`sqlite.backup: the copy is not valid: ${integrity.problems.join("; ")}`);
    if (existsSync(target)) throw targetExists(target);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { path: target, bytes: (await stat(target)).size };
}
