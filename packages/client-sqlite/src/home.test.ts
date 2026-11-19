/**
 * The generated procedures of `@mark1russell7/sqlite` (d40-handles). `sqlite.openDatabase` opens a
 * database as a handle in the scope of the caller, and the other procedures take the handle. The
 * tests use temporary folders.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, HandleScope, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { openDatabase } from "@mark1russell7/sqlite";
import { sqliteHomeProcedures, sqliteManifest, sqliteModule } from "./module.js";

let base: string;
let file: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "sqlite-home-"));
  file = join(base, "a.db");
  const db = openDatabase(file, { wal: false });
  db.exec("CREATE TABLE t (x INTEGER)");
  db.close();
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

async function call<T>(registry: ProcedureRegistry, handles: HandleScope, key: string, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry, handles }));
}

describe("the generated procedures of @mark1russell7/sqlite", () => {
  it("give one procedure for each function of the manifest, and each is confined under a root", () => {
    expect(sqliteHomeProcedures.map((procedure) => procedure.path.join("."))).toEqual(sqliteManifest.procedures.map((procedure) => `sqlite.${procedure.name}`));
    expect(sqliteHomeProcedures.map((procedure) => rootDecisionOf(procedure).kind)).toEqual(sqliteHomeProcedures.map(() => "confined"));
    const open = sqliteManifest.procedures.find((procedure) => procedure.name === "openDatabase")!;
    expect(open.output).toMatchObject({ "x-procedures-handle": "node:sqlite#DatabaseSync" });
    expect(open.effects).toMatchObject({ reads: ["fs"], writes: ["fs", "handles"] });
  });

  it("open a database as a handle, and the other procedures take the handle", async () => {
    const registry = createRegistry(sqliteModule);
    const scope = new HandleScope();
    const db = await call<{ handle: string }>(registry, scope, "sqlite.openDatabase", { path: file, options: { wal: false } });
    expect(await call(registry, scope, "sqlite.tableColumns", { db, table: "t" })).toEqual(["x"]);
    expect(await call(registry, scope, "sqlite.addMissingColumns", { db, table: "t", columns: { y: "TEXT" } })).toEqual(["y"]);
    expect(await call(registry, scope, "sqlite.tableColumns", { db, table: "t" })).toEqual(["x", "y"]);
    expect(await call(registry, scope, "sqlite.checkIntegrity", { db })).toEqual({ ok: true, problems: [] });
    expect(await call(registry, scope, "sqlite.userVersion", { db })).toBe(0);
    const copy = join(base, "copy.db");
    expect(await call(registry, scope, "sqlite.snapshot", { db, path: copy })).toMatchObject({ bytes: expect.any(Number) });
    expect(existsSync(copy)).toBe(true);
    expect(await call(registry, scope, "handle.list", {})).toMatchObject({ count: 1, handles: [{ handle: db.handle, kind: "node:sqlite#DatabaseSync" }] });
    expect(await call(registry, scope, "sqlite.clearDatabase", { db })).toEqual(["t"]);
    // The end of the scope closes the database
    expect(await scope.end()).toEqual({ closed: 1, failed: [] });
  });

  it("refuse the handle of another caller", async () => {
    const registry = createRegistry(sqliteModule);
    const scope = new HandleScope();
    const db = await call<{ handle: string }>(registry, scope, "sqlite.openDatabase", { path: ":memory:" });
    await expect(call(registry, new HandleScope(), "sqlite.userVersion", { db })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await scope.end();
  });

  it("start relative paths at the root of a host, and refuse a path outside the root", async () => {
    const root = join(base, "root");
    const outside = join(base, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    const registry = createRegistry(sqliteModule);
    confineToRoot(registry, root);
    const scope = new HandleScope();
    const db = await call<{ handle: string }>(registry, scope, "sqlite.openDatabase", { path: "r.db", options: { wal: false } });
    expect(existsSync(join(root, "r.db"))).toBe(true);
    expect(await call(registry, scope, "sqlite.userVersion", { db })).toBe(0);
    await expect(call(registry, scope, "sqlite.openDatabase", { path: ":memory:" })).resolves.toMatchObject({ handle: expect.any(String) });
    const refused = { code: "FORBIDDEN", reason: "outside-root" };
    await expect(call(registry, scope, "sqlite.openDatabase", { path: join(outside, "b.db") })).rejects.toMatchObject(refused);
    await expect(call(registry, scope, "sqlite.snapshot", { db, path: join(outside, "c.db") })).rejects.toMatchObject(refused);
    await scope.end();
  });
});
