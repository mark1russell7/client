/**
 * The sqlite procedures under the root of a host (roadmap R33): the database file, the folder of
 * the migrations and the file of a backup must be in the root. A relative path starts at the
 * root. Under a root, a call must give `dbPath`, because the default database is in the home
 * folder. `:memory:` is not a path. The tests use temporary folders.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { sqliteModule } from "./module.js";
import type { DbQueryOutput } from "./types.js";

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

async function refused(key: string, input: unknown): Promise<void> {
  await expect(call(key, input), `${key} ${JSON.stringify(input)}`).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "sqlite-host-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "migrations"), { recursive: true });
  mkdirSync(join(outside, "migrations"), { recursive: true });
  writeFileSync(join(root, "migrations", "001_t.sql"), "CREATE TABLE t (x INTEGER);");
  writeFileSync(join(outside, "migrations", "001_t.sql"), "CREATE TABLE t (x INTEGER);");
  registry = createRegistry(sqliteModule);
  confineToRoot(registry, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the sqlite procedures under the root of a host", () => {
  it("are confined procedures", () => {
    expect([...new Set(sqliteModule.procedures.map((procedure) => rootDecisionOf(procedure).kind))]).toEqual(["confined"]);
  });

  it("work on a database in the root, with relative paths that start at the root", async () => {
    await call("sqlite.migrate", { dbPath: "data.db", folder: "migrations" });
    await call("sqlite.execute", { dbPath: "data.db", sql: "INSERT INTO t (x) VALUES (1)" });
    expect(existsSync(join(root, "data.db"))).toBe(true);
    const rows = await call<DbQueryOutput>("sqlite.query", { dbPath: join(root, "data.db"), sql: "SELECT x FROM t" });
    expect(rows.rows).toEqual([{ x: 1 }]);
    await call("sqlite.backup", { dbPath: "data.db", to: "copy.db" });
    expect(existsSync(join(root, "copy.db"))).toBe(true);
    // A database in memory is not a path
    expect((await call<DbQueryOutput>("sqlite.query", { dbPath: ":memory:", sql: "SELECT 1 AS one" })).rows).toEqual([{ one: 1 }]);
  });

  it("refuse each path outside the root, and a call without dbPath", async () => {
    await refused("sqlite.query", { dbPath: join(outside, "data.db"), sql: "SELECT 1" });
    await refused("sqlite.execute", { dbPath: "../outside/data.db", sql: "CREATE TABLE t (x)" });
    await refused("sqlite.migrate", { dbPath: "data.db", folder: join(outside, "migrations") });
    await refused("sqlite.backup", { dbPath: "data.db", to: join(outside, "copy.db") });
    await refused("sqlite.query", { sql: "SELECT 1" });
    await refused("logs.store", { level: "info", message: "x" });
    await refused("logs.query", {});
    expect(readdirSync(outside)).toEqual(["migrations"]);
  });

  it("work on a database outside the folder without a root", async () => {
    const plain = createRegistry(sqliteModule);
    await call("sqlite.migrate", { dbPath: join(outside, "data.db"), folder: join(outside, "migrations") }, plain);
    expect(existsSync(join(outside, "data.db"))).toBe(true);
  });
});
