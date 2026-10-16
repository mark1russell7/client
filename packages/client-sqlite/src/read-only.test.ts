/**
 * db.query and logs.query only read (CAP-1, CAP-3, roadmap R7). Before, db.query ran any
 * statement and the file kept its changes, and the first logs.query made the database file.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, createRegistry } from "@procedures/client";
import { sqliteModule } from "./module.js";
import type { DbQueryOutput, LogsQueryOutput } from "./types.js";

const client = new Client(new LocalTransport({ registry: createRegistry(sqliteModule) }));
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-ro-"));
  dirs.push(dir);
  return join(dir, "test.db");
}

function call<T>(service: string, operation: string, input: unknown): Promise<T> {
  return client.call<unknown, T>({ service, operation }, input);
}

describe("db.query is read only (CAP-1)", () => {
  it("refuses a statement that changes data, and the file keeps its bytes", async () => {
    const dbPath = tempDb();
    await call("db", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER)" });
    await call("db", "execute", { dbPath, sql: "INSERT INTO t VALUES (1)" });
    const before = readFileSync(dbPath);
    for (const sql of ["INSERT INTO t VALUES (2)", "DELETE FROM t", "DROP TABLE t", "CREATE TABLE u (x)"]) {
      await expect(call("db", "query", { dbPath, sql })).rejects.toThrow(/readonly|read-only|query_only/i);
    }
    expect(readFileSync(dbPath).equals(before)).toBe(true);
    const rows = await call<DbQueryOutput>("db", "query", { dbPath, sql: "SELECT n FROM t" });
    expect(rows.rows).toEqual([{ n: 1 }]);
  });

  it("does not make a missing file", async () => {
    const dbPath = tempDb();
    await call<DbQueryOutput>("db", "query", { dbPath, sql: "SELECT 1 AS one" });
    expect(existsSync(dbPath)).toBe(false);
  });
});

describe("logs.query is read only (CAP-3)", () => {
  it("gives no entries for a missing file, and does not make it", async () => {
    const dbPath = tempDb();
    const result = await call<LogsQueryOutput>("logs", "query", { dbPath });
    expect(result.logs).toEqual([]);
    expect(existsSync(dbPath)).toBe(false);
  });

  it("reads the entries that logs.store wrote", async () => {
    const dbPath = tempDb();
    await call("logs", "store", { dbPath, level: "info", message: "hello" });
    const result = await call<LogsQueryOutput>("logs", "query", { dbPath });
    expect(result.logs.map((entry) => entry.message)).toEqual(["hello"]);
  });
});
