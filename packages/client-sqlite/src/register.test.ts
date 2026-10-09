/**
 * The db.* and logs.* procedures against a temporary database file.
 * (client-sqlite had no tests: deep dive, data observations.)
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "./register.js";
import type { DbExecuteOutput, DbQueryOutput, LogsQueryOutput, LogsStoreOutput } from "./types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
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

describe("db.execute and db.query", () => {
  it("creates a table, inserts with parameters and reads the rows", async () => {
    const dbPath = tempDb();
    await call<DbExecuteOutput>("db", "execute", { dbPath, sql: "CREATE TABLE t (id INTEGER, name TEXT)" });
    const inserted = await call<DbExecuteOutput>("db", "execute", {
      dbPath,
      sql: "INSERT INTO t VALUES (?, ?)",
      params: [1, "Ann"],
    });
    expect(inserted.changes).toBe(1);

    const result = await call<DbQueryOutput>("db", "query", { dbPath, sql: "SELECT id, name FROM t WHERE id = ?", params: [1] });
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows).toEqual([{ id: 1, name: "Ann" }]);
  });

  it("keeps every row of concurrent inserts into one file", async () => {
    const dbPath = tempDb();
    await call("db", "execute", { dbPath, sql: "CREATE TABLE t (n INTEGER)" });
    await Promise.all(
      Array.from({ length: 20 }, (_, n) => call("db", "execute", { dbPath, sql: "INSERT INTO t VALUES (?)", params: [n] })),
    );

    const result = await call<DbQueryOutput>("db", "query", { dbPath, sql: "SELECT COUNT(*) AS c FROM t" });
    expect(result.rows).toEqual([{ c: 20 }]);
    // Each insert loads and saves the file in turn: on a loaded Windows machine 20 of them took more than 5 s
  }, 30_000);
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

  it("rejects an invalid level and an invalid limit", async () => {
    const dbPath = tempDb();
    await expect(call("logs", "store", { dbPath, level: "loud", message: "x" })).rejects.toThrow(/Invalid log level/);
    await expect(call("logs", "query", { dbPath, limit: "1; DROP TABLE logs" })).rejects.toThrow(/Invalid limit/);
  });
});
