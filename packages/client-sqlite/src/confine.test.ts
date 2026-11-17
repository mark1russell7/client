/**
 * The guard of the four procedures that run the SQL of a caller: `sqlite.query`, `sqlite.execute`,
 * `sqlite.transaction` and `sqlite.migrate`. On a Node.js with the guard (24.10 or later), each of them puts
 * `confineToFile` on its connection. On an earlier Node.js, each of them refuses with `CONFINE_UNAVAILABLE` and does
 * not make the file. The other procedures run only their own SQL, so they work on each Node.js.
 *
 * The suites use the check of the procedures (`isConfineAvailable`), not the version of Node.js. So each Node.js of
 * the CI matrix runs one of the two suites.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedurePath } from "@procedures/client";
import { confineToFile, openDatabase } from "@mark1russell7/sqlite";
import { loadSqlite } from "./load.js";
import { sqliteModule } from "./module.js";
import { isConfineAvailable } from "./procedures/db/shared.js";
import type { DbBackupOutput, DbSchemaOutput, DbTablesOutput, LogsQueryOutput } from "./types.js";

vi.mock("@mark1russell7/sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mark1russell7/sqlite")>();
  return { ...actual, confineToFile: vi.fn(actual.confineToFile) };
});

const guard = isConfineAvailable(await loadSqlite());
const confined = vi.mocked(confineToFile);
const registry = createRegistry(sqliteModule);
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-confine-"));
  dirs.push(dir);
  return dir;
}

async function call<T>(key: string, input: unknown): Promise<T> {
  const path: ProcedurePath = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** A database file with the table `t` and one row, made through the engine of the home package. */
function fileWithTable(dir: string): string {
  const dbPath = join(dir, "data.db");
  const db = openDatabase(dbPath, { wal: false });
  db.exec("CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1);");
  db.close();
  return dbPath;
}

/** A call of each of the four procedures that run the SQL of a caller. */
function callerSqlCalls(dbPath: string): Array<[string, unknown]> {
  return [
    ["sqlite.query", { dbPath, sql: "SELECT 1 AS one" }],
    ["sqlite.execute", { dbPath, sql: "CREATE TABLE IF NOT EXISTS u (x)" }],
    ["sqlite.transaction", { dbPath, statements: [{ sql: "CREATE TABLE IF NOT EXISTS v (x)" }] }],
    ["sqlite.migrate", { dbPath, migrations: [{ version: 1, sql: "CREATE TABLE m (x)" }] }],
  ];
}

describe.runIf(guard)("the guard on a Node.js that has it", () => {
  it("each procedure that runs the SQL of a caller puts confineToFile on its connection", async () => {
    const dbPath = fileWithTable(tempDir());
    for (const [key, input] of callerSqlCalls(dbPath)) {
      confined.mockClear();
      await call(key, input);
      expect(confined, key).toHaveBeenCalledTimes(1);
    }
  });

  it("the procedures that run only their own SQL do not use the guard", async () => {
    const dir = tempDir();
    const dbPath = fileWithTable(dir);
    const calls: Array<[string, unknown]> = [
      ["sqlite.tables", { dbPath }],
      ["sqlite.schema", { dbPath, table: "t" }],
      ["sqlite.backup", { dbPath, to: join(dir, "copy.db") }],
      ["logs.store", { dbPath, level: "info", message: "hello" }],
      ["logs.query", { dbPath }],
    ];
    for (const [key, input] of calls) {
      confined.mockClear();
      await call(key, input);
      expect(confined, key).not.toHaveBeenCalled();
    }
  });
});

describe.runIf(!guard)("the procedures on a Node.js without the guard", () => {
  it("each procedure that runs the SQL of a caller refuses with CONFINE_UNAVAILABLE, and makes no file", async () => {
    const dir = tempDir();
    for (const [key, input] of callerSqlCalls(join(dir, "new", "data.db"))) {
      await expect(call(key, input), key).rejects.toMatchObject({ code: "CONFINE_UNAVAILABLE", message: expect.stringMatching(/Node\.js 24\.10 or later/) });
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  it("each of them refuses before it opens an existing file, and the file keeps its bytes", async () => {
    const dbPath = fileWithTable(tempDir());
    const before = readFileSync(dbPath);
    for (const [key, input] of callerSqlCalls(dbPath)) {
      await expect(call(key, input), key).rejects.toMatchObject({ code: "CONFINE_UNAVAILABLE" });
    }
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("the procedures that run only their own SQL work", async () => {
    const dir = tempDir();
    const dbPath = fileWithTable(dir);
    expect((await call<DbTablesOutput>("sqlite.tables", { dbPath })).tables.map((table) => table.name)).toEqual(["t"]);
    expect((await call<DbSchemaOutput>("sqlite.schema", { dbPath, table: "t" })).columns.map((column) => column.name)).toEqual(["n"]);
    const copy = await call<DbBackupOutput>("sqlite.backup", { dbPath, to: join(dir, "copy.db") });
    expect(existsSync(copy.path)).toBe(true);
    await call("logs.store", { dbPath, level: "info", message: "hello" });
    expect((await call<LogsQueryOutput>("logs.query", { dbPath })).logs.map((entry) => entry.message)).toEqual(["hello"]);
  });
});
