/**
 * The procedures on a file in WAL mode that a second `node:sqlite` connection holds open. The second connection keeps
 * its changes in the WAL file. Each procedure sees those changes, and the second connection sees each write of a
 * procedure. Each file keeps its journal mode: a WAL file stays in WAL mode, and a file with a rollback journal keeps
 * it. The procedures that run the SQL of a caller need the guard, so their tests use the check of the procedures.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createRegistry, invokePath, outputValue, type ProcedurePath } from "@procedures/client";
import { openDatabase } from "@mark1russell7/sqlite";
import { loadSqlite } from "./load.js";
import { sqliteModule } from "./module.js";
import { isConfineAvailable } from "./procedures/db/shared.js";
import type { DbBackupOutput, DbExecuteOutput, DbQueryOutput, DbSchemaOutput, DbTablesOutput, LogsQueryOutput } from "./types.js";

const guard = isConfineAvailable(await loadSqlite());
const registry = createRegistry(sqliteModule);
const dirs: string[] = [];
const holders: DatabaseSync[] = [];

afterEach(() => {
  for (const db of holders.splice(0)) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-wal-"));
  dirs.push(dir);
  return dir;
}

async function call<T>(key: string, input: unknown): Promise<T> {
  const path: ProcedurePath = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** The rows of a statement on a connection. */
function rows(db: DatabaseSync, sql: string): unknown[] {
  return db.prepare(sql).all();
}

/** The journal mode of a connection. */
function journalMode(db: DatabaseSync): string {
  return String((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode);
}

/**
 * This function makes a file in WAL mode with the table `t` and one row, and keeps a second connection open on it. The
 * connection does no checkpoint, so its changes stay in the WAL file.
 */
function heldWalFile(): { dbPath: string; dir: string; holder: DatabaseSync } {
  const dir = tempDir();
  const dbPath = join(dir, "held.db");
  const holder = openDatabase(dbPath);
  holders.push(holder);
  holder.exec("PRAGMA wal_autocheckpoint = 0");
  holder.exec("CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1);");
  expect(journalMode(holder)).toBe("wal");
  expect(statSync(`${dbPath}-wal`).size).toBeGreaterThan(0);
  return { dbPath, dir, holder };
}

/** This function makes a file with a rollback journal (the mode `delete`) and the table `t`. */
function rollbackFile(): string {
  const dbPath = join(tempDir(), "plain.db");
  const db = openDatabase(dbPath, { wal: false });
  db.exec("CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1);");
  db.close();
  return dbPath;
}

/** The journal mode of a file, from a new connection that changes nothing. */
function journalModeOf(dbPath: string): string {
  const db = openDatabase(dbPath, { wal: false });
  try {
    return journalMode(db);
  } finally {
    db.close();
  }
}

describe("the procedures that run only their own SQL, on a WAL file that another connection holds open", () => {
  it("sqlite.tables and sqlite.schema see the changes in the WAL file", async () => {
    const { dbPath, holder } = heldWalFile();
    expect((await call<DbTablesOutput>("sqlite.tables", { dbPath })).tables.map((table) => table.name)).toEqual(["t"]);
    expect((await call<DbSchemaOutput>("sqlite.schema", { dbPath, table: "t" })).columns.map((column) => column.name)).toEqual(["n"]);
    expect(journalMode(holder)).toBe("wal");
  });

  it("sqlite.backup copies the changes in the WAL file, and a later change of the holder is not in the copy", async () => {
    const { dbPath, dir, holder } = heldWalFile();
    const copy = await call<DbBackupOutput>("sqlite.backup", { dbPath, to: join(dir, "copy.db") });
    holder.exec("INSERT INTO t VALUES (2)");
    const copied = openDatabase(copy.path, { wal: false, readOnly: true });
    try {
      expect(rows(copied, "SELECT n FROM t")).toEqual([{ n: 1 }]);
    } finally {
      copied.close();
    }
    expect(journalMode(holder)).toBe("wal");
  });

  it("logs.store writes into the WAL file, and logs.query and the holder see the entry", async () => {
    const { dbPath, holder } = heldWalFile();
    await call("logs.store", { dbPath, level: "warn", message: "held" });
    expect((await call<LogsQueryOutput>("logs.query", { dbPath })).logs.map((entry) => entry.message)).toEqual(["held"]);
    expect(rows(holder, "SELECT message FROM logs")).toEqual([{ message: "held" }]);
    expect(journalMode(holder)).toBe("wal");
  });
});

describe.runIf(guard)("the procedures that run the SQL of a caller, on a WAL file that another connection holds open", () => {
  it("sqlite.query sees the changes in the WAL file", async () => {
    const { dbPath } = heldWalFile();
    expect((await call<DbQueryOutput>("sqlite.query", { dbPath, sql: "SELECT n FROM t" })).rows).toEqual([{ n: 1 }]);
  });

  it("sqlite.execute, sqlite.transaction and sqlite.migrate write, and the holder sees each write", async () => {
    const { dbPath, holder } = heldWalFile();
    expect(await call<DbExecuteOutput>("sqlite.execute", { dbPath, sql: "INSERT INTO t VALUES (2)" })).toEqual({ changes: 1 });
    await call("sqlite.transaction", { dbPath, statements: [{ sql: "INSERT INTO t VALUES (3)" }, { sql: "UPDATE t SET n = n * 10 WHERE n = 1" }] });
    await call("sqlite.migrate", { dbPath, migrations: [{ version: 1, name: "m", sql: "CREATE TABLE m (x); INSERT INTO m VALUES (7);" }] });
    expect(rows(holder, "SELECT n FROM t ORDER BY n")).toEqual([{ n: 2 }, { n: 3 }, { n: 10 }]);
    expect(rows(holder, "SELECT x FROM m")).toEqual([{ x: 7 }]);
    expect(journalMode(holder)).toBe("wal");
  });
});

describe("the journal mode of a file with a rollback journal", () => {
  it("stays after logs.store, and a file that logs.store makes has a rollback journal", async () => {
    const dbPath = rollbackFile();
    await call("logs.store", { dbPath, level: "info", message: "x" });
    expect(journalModeOf(dbPath)).toBe("delete");
    const made = join(tempDir(), "made", "logs.db");
    await call("logs.store", { dbPath: made, level: "info", message: "x" });
    expect(journalModeOf(made)).toBe("delete");
  });

  it.runIf(guard)("stays after sqlite.execute, sqlite.transaction and sqlite.migrate", async () => {
    const dbPath = rollbackFile();
    await call("sqlite.execute", { dbPath, sql: "INSERT INTO t VALUES (2)" });
    await call("sqlite.transaction", { dbPath, statements: [{ sql: "INSERT INTO t VALUES (3)" }] });
    await call("sqlite.migrate", { dbPath, migrations: [{ version: 1, sql: "CREATE TABLE m (x)" }] });
    expect(journalModeOf(dbPath)).toBe("delete");
  });
});
