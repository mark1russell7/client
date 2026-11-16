/**
 * The sqlite.* and logs.* procedures against a temporary database file.
 * (client-sqlite had no tests: deep dive, data observations.)
 * `sqlite.execute` and `sqlite.query` need the guard: `confine.test.ts` tests a Node.js without it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import { openDatabase } from "@mark1russell7/sqlite";
import "./register.js";
import { loadSqlite } from "./load.js";
import { isConfineAvailable } from "./procedures/db/shared.js";
import type { DbExecuteOutput, DbQueryOutput, LogsQueryOutput, LogsStoreOutput } from "./types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
const guard = isConfineAvailable(await loadSqlite());
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-"));
  dirs.push(dir);
  return join(dir, "test.db");
}

function call<T>(service: string, operation: string, input: unknown): Promise<T> {
  return client.call<unknown, T>({ service, operation }, input);
}

describe.runIf(guard)("sqlite.execute and sqlite.query", () => {
  it("creates a table, inserts with parameters and reads the rows", async () => {
    const dbPath = tempDb();
    await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (id INTEGER, name TEXT)" });
    const inserted = await call<DbExecuteOutput>("sqlite", "execute", {
      dbPath,
      sql: "INSERT INTO t VALUES (?, ?)",
      params: [1, "Ann"],
    });
    expect(inserted.changes).toBe(1);

    const result = await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT id, name FROM t WHERE id = ?", params: [1] });
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows).toEqual([{ id: 1, name: "Ann" }]);
  });

  it("keeps every row of concurrent inserts into one file", async () => {
    const dbPath = tempDb();
    await call("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER)" });
    await Promise.all(
      Array.from({ length: 20 }, (_, n) => call("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (?)", params: [n] })),
    );

    const result = await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT COUNT(*) AS c FROM t" });
    expect(result.rows).toEqual([{ c: 20 }]);
    // Each insert opens the file and waits for the write lock in turn: a loaded Windows machine is slow
  }, 30_000);

  it("gives the number of changed rows: 0 for a change of the schema", async () => {
    const dbPath = tempDb();
    expect(await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER)" })).toEqual({ changes: 0 });
    await call("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (1), (2), (3)" });
    expect(await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: "DELETE FROM t WHERE n > 1" })).toEqual({ changes: 2 });
    expect(await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: "CREATE INDEX t_n ON t(n)" })).toEqual({ changes: 0 });
  });

  it("binds a boolean as 1 or 0, and null as NULL", async () => {
    const dbPath = tempDb();
    await call("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (a, b, c)" });
    await call("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (?, ?, ?)", params: [true, false, null] });
    expect((await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT a, b, c FROM t" })).rows).toEqual([{ a: 1, b: 0, c: null }]);
  });

  it("runs a script of several statements in one transaction: all of it, or none of it", async () => {
    const dbPath = tempDb();
    const script = "CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1); INSERT INTO t VALUES (2);";
    expect(await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: script })).toEqual({ changes: 2 });
    await expect(
      call("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (3); INSERT INTO missing VALUES (4);" }),
    ).rejects.toThrow(/missing/);
    expect((await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT n FROM t ORDER BY n" })).rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("runs a script that starts with BEGIN as written, and rolls back its open transaction after an error", async () => {
    const dbPath = tempDb();
    await call("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER)" });
    await call("sqlite", "execute", { dbPath, sql: "BEGIN; INSERT INTO t VALUES (1); COMMIT; BEGIN; INSERT INTO t VALUES (2); COMMIT;" });
    await expect(
      call("sqlite", "execute", { dbPath, sql: "BEGIN IMMEDIATE; INSERT INTO t VALUES (3); INSERT INTO missing VALUES (4); COMMIT;" }),
    ).rejects.toThrow(/missing/);
    expect((await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT n FROM t ORDER BY n" })).rows).toEqual([{ n: 1 }, { n: 2 }]);
    // No transaction stays open: the next write works
    expect(await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (5)" })).toEqual({ changes: 1 });
  });

  it("refuses a later statement that controls a transaction in a script, params for a script, and SQL with no statement", async () => {
    const dbPath = tempDb();
    await call("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER)" });
    await expect(call("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (1); COMMIT;" })).rejects.toThrow(
      /BEGIN, COMMIT, ROLLBACK, SAVEPOINT and RELEASE are refused/,
    );
    await expect(call("sqlite", "execute", { dbPath, sql: "INSERT INTO t VALUES (?); INSERT INTO t VALUES (?);", params: [1] })).rejects.toThrow(
      /params bind to one statement/,
    );
    await expect(call("sqlite", "execute", { dbPath, sql: "-- nothing" })).rejects.toThrow(/no statement/);
    expect((await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT COUNT(*) AS c FROM t" })).rows).toEqual([{ c: 0 }]);
  });

  it("runs one statement alone, so VACUUM works", async () => {
    const dbPath = tempDb();
    await call("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1);" });
    expect(await call<DbExecuteOutput>("sqlite", "execute", { dbPath, sql: "VACUUM" })).toEqual({ changes: 0 });
    expect((await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT n FROM t" })).rows).toEqual([{ n: 1 }]);
  });

  it("sqlite.query runs only the first statement of the text", async () => {
    const dbPath = tempDb();
    await call("sqlite", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1);" });
    const result = await call<DbQueryOutput>("sqlite", "query", { dbPath, sql: "SELECT n FROM t; SELECT 2 AS two;" });
    expect(result).toEqual({ columns: ["n"], rows: [{ n: 1 }] });
  });
});

describe("logs.store and logs.query", () => {
  it("stores entries and filters them by session and level", async () => {
    const dbPath = tempDb();
    const first = await call<LogsStoreOutput>("logs", "store", {
      dbPath,
      level: "info",
      message: "started",
      sessionId: "s1",
      data: { step: 1 },
    });
    await call("logs", "store", { dbPath, level: "error", message: "failed", sessionId: "s1" });
    await call("logs", "store", { dbPath, level: "info", message: "other", sessionId: "s2" });
    expect(first.id).toBeGreaterThan(0);

    const result = await call<LogsQueryOutput>("logs", "query", { dbPath, sessionId: "s1", level: "error" });
    expect(result.logs.map((entry) => entry.message)).toEqual(["failed"]);
  });

  it("continues a log file of version 0.60: its entries stay, and the migration table keeps one row", async () => {
    const dbPath = tempDb();
    // The tables and the rows that version 0.60 (on sql.js) wrote
    const old = openDatabase(dbPath, { wal: false });
    old.exec(`
      CREATE TABLE _migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL CHECK (level IN ('trace', 'debug', 'info', 'warn', 'error')),
        message TEXT NOT NULL,
        data TEXT,
        session_id TEXT,
        command TEXT,
        context TEXT,
        error_stack TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO _migrations (version, description, applied_at) VALUES (1, 'Create logs table', '2026-10-01 12:00:00');
      INSERT INTO logs (level, message, session_id) VALUES ('warn', 'from 0.60', 's0');
    `);
    old.close();

    const stored = await call<LogsStoreOutput>("logs", "store", { dbPath, level: "info", message: "from 0.61", sessionId: "s0" });
    expect(stored.id).toBe(2);
    const result = await call<LogsQueryOutput>("logs", "query", { dbPath, sessionId: "s0" });
    expect(result.logs.map((entry) => entry.message).sort()).toEqual(["from 0.60", "from 0.61"]);
    const check = openDatabase(dbPath, { wal: false, readOnly: true });
    try {
      expect(check.prepare("SELECT version, description, applied_at FROM _migrations").all()).toEqual([
        { version: 1, description: "Create logs table", applied_at: "2026-10-01 12:00:00" },
      ]);
    } finally {
      check.close();
    }
  });

  it("rejects an invalid level and an invalid limit", async () => {
    const dbPath = tempDb();
    await expect(call("logs", "store", { dbPath, level: "loud", message: "x" })).rejects.toThrow(/Invalid log level/);
    await expect(call("logs", "query", { dbPath, limit: "1; DROP TABLE logs" })).rejects.toThrow(/Invalid limit/);
  });

  it("gives pages with limit and offset, and an offset with no limit", async () => {
    const dbPath = tempDb();
    for (const message of ["a", "b", "c"]) await call("logs", "store", { dbPath, level: "info", message, command: "build" });
    await call("logs", "store", { dbPath, level: "info", message: "other", command: "test" });
    // The entries can have one timestamp, so the test counts the entries of each page and does not read their order
    const page = async (input: { limit?: number; offset?: number }): Promise<string[]> =>
      (await call<LogsQueryOutput>("logs", "query", { dbPath, command: "build", ...input })).logs.map((entry) => entry.message);

    expect(await page({ limit: 2 })).toHaveLength(2);
    expect(await page({ limit: 1, offset: 2 })).toHaveLength(1);
    // SQLite refuses OFFSET with no LIMIT: the procedure adds LIMIT -1
    const rest = await page({ offset: 1 });
    expect(rest).toHaveLength(2);
    expect(rest.every((message) => ["a", "b", "c"].includes(message))).toBe(true);
    expect(await page({ offset: 3 })).toEqual([]);
  });
});
