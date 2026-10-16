/**
 * db.tables, db.schema, db.transaction, db.migrate and db.backup (roadmap R44), against real
 * SQLite files (sql.js) in temporary folders.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type Effects, type ProcedurePath } from "@procedures/client";
import { sqliteModule } from "./module.js";
import { controlsTransaction } from "./procedures/db/shared.js";
import type { DbBackupOutput, DbMigrateOutput, DbQueryOutput, DbSchemaOutput, DbTablesOutput, DbTransactionOutput } from "./types.js";

const registry = createRegistry(sqliteModule);
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-r44-"));
  dirs.push(dir);
  return dir;
}

async function call<T>(key: string, input: unknown): Promise<T> {
  const path: ProcedurePath = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** A database with two tables, an index, a foreign key and a view. */
async function sampleDb(): Promise<string> {
  const dbPath = join(tempDir(), "sample.db");
  await call("db.execute", {
    dbPath,
    sql: `
      CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        score REAL DEFAULT 0
      );
      CREATE INDEX users_by_email ON users(email);
      CREATE VIEW scores AS SELECT email, score FROM users;
      INSERT INTO teams (name) VALUES ('red');
    `,
  });
  return dbPath;
}

describe("the effects of the R44 procedures", () => {
  it("are declared", () => {
    const effects: Record<string, Effects | undefined> = Object.fromEntries(
      sqliteModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]),
    );
    expect(effects["db.tables"]).toEqual({ reads: ["fs"], writes: [] });
    expect(effects["db.schema"]).toEqual({ reads: ["fs"], writes: [] });
    expect(effects["db.transaction"]).toEqual({ reads: ["fs"], writes: ["fs"] });
    expect(effects["db.migrate"]).toEqual({ reads: ["fs"], writes: ["fs"], idempotent: true });
    expect(effects["db.backup"]).toEqual({ reads: ["fs"], writes: ["fs"], destructive: false, idempotent: false });
  });
});

describe("db.tables (R44)", () => {
  it("lists the tables and the views, and only reads the file", async () => {
    const dbPath = await sampleDb();
    const before = readFileSync(dbPath);
    const result = await call<DbTablesOutput>("db.tables", { dbPath });
    expect(result.tables.map((table) => [table.name, table.type])).toEqual([
      ["scores", "view"],
      ["teams", "table"],
      ["users", "table"],
    ]);
    expect(result.tables[1]?.sql).toMatch(/^CREATE TABLE teams/);
    const tables = await call<DbTablesOutput>("db.tables", { dbPath, views: false });
    expect(tables.tables.map((table) => table.name)).toEqual(["teams", "users"]);
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("fails for a missing file, and does not make it", async () => {
    const dbPath = join(tempDir(), "missing.db");
    await expect(call("db.tables", { dbPath })).rejects.toMatchObject({ code: "ENOENT" });
    expect(existsSync(dbPath)).toBe(false);
  });
});

describe("db.schema (R44)", () => {
  it("gives the columns, the indexes and the foreign keys of a table", async () => {
    const dbPath = await sampleDb();
    const users = await call<DbSchemaOutput>("db.schema", { dbPath, table: "users" });
    expect(users.type).toBe("table");
    expect(users.columns).toEqual([
      { name: "id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: 1 },
      { name: "email", type: "TEXT", notNull: true, defaultValue: null, primaryKey: 0 },
      { name: "team_id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: 0 },
      { name: "score", type: "REAL", notNull: false, defaultValue: "0", primaryKey: 0 },
    ]);
    expect(users.indexes).toEqual([{ name: "users_by_email", unique: false, origin: "c", partial: false, columns: ["email"] }]);
    expect(users.foreignKeys).toEqual([{ from: "team_id", table: "teams", to: "id", onUpdate: "NO ACTION", onDelete: "CASCADE" }]);
    const teams = await call<DbSchemaOutput>("db.schema", { dbPath, table: "teams" });
    expect(teams.indexes).toEqual([expect.objectContaining({ unique: true, origin: "u", columns: ["name"] })]);
    const view = await call<DbSchemaOutput>("db.schema", { dbPath, table: "scores" });
    expect(view).toMatchObject({ type: "view", indexes: [], foreignKeys: [] });
    expect(view.columns.map((column) => column.name)).toEqual(["email", "score"]);
  });

  it("fails for a missing table, also a name with SQL in it", async () => {
    const dbPath = await sampleDb();
    await expect(call("db.schema", { dbPath, table: "nope" })).rejects.toThrow(/no table or view named "nope"/);
    await expect(call("db.schema", { dbPath, table: "users'); DROP TABLE users; --" })).rejects.toThrow(/no table or view/);
    expect((await call<DbTablesOutput>("db.tables", { dbPath })).tables).toHaveLength(3);
    await expect(call("db.schema", { dbPath: join(tempDir(), "missing.db"), table: "t" })).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("db.transaction (R44)", () => {
  it("runs the statements in one transaction, and gives the rows of a statement that gives rows", async () => {
    const dbPath = await sampleDb();
    const result = await call<DbTransactionOutput>("db.transaction", {
      dbPath,
      statements: [
        { sql: "INSERT INTO users (email, team_id) VALUES (?, ?)", params: ["a@x", 1] },
        { sql: "INSERT INTO users (email) VALUES ('b@x'); INSERT INTO users (email) VALUES ('c@x')" },
        { sql: "UPDATE users SET score = score + 1 WHERE email LIKE ? RETURNING email", params: ["%@x"] },
        { sql: "SELECT COUNT(*) AS n FROM users" },
      ],
    });
    expect(result.results).toEqual([
      { changes: 1 },
      { changes: 2 },
      { changes: 3, rows: [{ email: "a@x" }, { email: "b@x" }, { email: "c@x" }] },
      { changes: 0, rows: [{ n: 3 }] },
    ]);
    expect(result.changes).toBe(6);
  });

  it("rolls back every statement when one fails, and leaves the file as it was", async () => {
    const dbPath = await sampleDb();
    const before = readFileSync(dbPath);
    await expect(
      call("db.transaction", {
        dbPath,
        statements: [{ sql: "INSERT INTO users (email) VALUES ('a@x')" }, { sql: "INSERT INTO users (nope) VALUES (1)" }],
      }),
    ).rejects.toThrow(/statements\[1\]: .*nope.*The transaction was rolled back/);
    expect(readFileSync(dbPath).equals(before)).toBe(true);
    const rows = await call<DbQueryOutput>("db.query", { dbPath, sql: "SELECT COUNT(*) AS n FROM users" });
    expect(rows.rows).toEqual([{ n: 0 }]);
  });

  it("refuses the statements that control a transaction, and params for several statements", async () => {
    const dbPath = await sampleDb();
    const before = readFileSync(dbPath);
    for (const sql of ["COMMIT", "  -- a comment\n  BEGIN", "/* x */ ROLLBACK", "SAVEPOINT s", "INSERT INTO teams (name) VALUES ('x'); COMMIT"]) {
      await expect(call("db.transaction", { dbPath, statements: [{ sql }] })).rejects.toThrow(/BEGIN, COMMIT, ROLLBACK, SAVEPOINT and RELEASE are refused/);
    }
    await expect(
      call("db.transaction", { dbPath, statements: [{ sql: "INSERT INTO teams (name) VALUES (?); INSERT INTO teams (name) VALUES (?)", params: ["a"] }] }),
    ).rejects.toThrow(/params bind to one statement/);
    await expect(call("db.transaction", { dbPath, statements: [{ sql: "-- nothing" }] })).rejects.toThrow(/no statement/);
    await expect(call("db.transaction", { dbPath, statements: [] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("knows the statements that control a transaction", () => {
    expect(["BEGIN", "begin immediate", "COMMIT", "END", "ROLLBACK TO s", "RELEASE s", "--x\nSAVEPOINT a", "/* unclosed"].map(controlsTransaction)).toEqual([
      true, true, true, true, true, true, true, false,
    ]);
    expect(controlsTransaction("SELECT 'BEGIN'")).toBe(false);
  });
});

describe("db.migrate (R44)", () => {
  function migrationsFolder(files: Record<string, string>): string {
    const folder = join(tempDir(), "migrations");
    mkdirSync(folder);
    for (const [name, sql] of Object.entries(files)) writeFileSync(join(folder, name), sql);
    return folder;
  }

  it("applies the migrations of a folder in the order of their numbers, one time", async () => {
    const dbPath = join(tempDir(), "app.db");
    const folder = migrationsFolder({
      "002_add_email.sql": "ALTER TABLE users ADD COLUMN email TEXT;",
      "001_create_users.sql": "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\r\nCREATE INDEX users_by_name ON users(name);",
      "10-seed.sql": "INSERT INTO users (name, email) VALUES ('Ann', 'ann@x');",
      "README.md": "not a migration",
    });
    const first = await call<DbMigrateOutput>("db.migrate", { dbPath, folder });
    expect(first).toEqual({
      applied: [
        { version: 1, name: "create_users" },
        { version: 2, name: "add_email" },
        { version: 10, name: "seed" },
      ],
      skipped: 0,
      version: 10,
    });
    const rows = await call<DbQueryOutput>("db.query", { dbPath, sql: "SELECT version, name FROM schema_migrations ORDER BY version" });
    expect(rows.rows).toEqual([
      { version: 1, name: "create_users" },
      { version: 2, name: "add_email" },
      { version: 10, name: "seed" },
    ]);
    // A second call applies nothing and does not write the file
    const bytes = readFileSync(dbPath);
    expect(await call<DbMigrateOutput>("db.migrate", { dbPath, folder })).toEqual({ applied: [], skipped: 3, version: 10 });
    expect(readFileSync(dbPath).equals(bytes)).toBe(true);
    // A new migration: only it runs, and line ends do not change a checksum
    writeFileSync(join(folder, "001_create_users.sql"), "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\nCREATE INDEX users_by_name ON users(name);");
    writeFileSync(join(folder, "011_more.sql"), "INSERT INTO users (name) VALUES ('Bob');");
    expect(await call<DbMigrateOutput>("db.migrate", { dbPath, folder })).toEqual({ applied: [{ version: 11, name: "more" }], skipped: 3, version: 11 });
  });

  it("applies a list of migrations, with its own table", async () => {
    const dbPath = join(tempDir(), "list.db");
    const migrations = [
      { version: 1, sql: "CREATE TABLE t (n INTEGER)" },
      { version: 2, name: "fill", sql: "INSERT INTO t VALUES (1); INSERT INTO t VALUES (2);" },
    ];
    const result = await call<DbMigrateOutput>("db.migrate", { dbPath, migrations, table: "_my_migrations" });
    expect(result.applied).toEqual([
      { version: 1, name: "migration 1" },
      { version: 2, name: "fill" },
    ]);
    expect((await call<DbQueryOutput>("db.query", { dbPath, sql: "SELECT SUM(n) AS s FROM t" })).rows).toEqual([{ s: 3 }]);
    expect((await call<DbTablesOutput>("db.tables", { dbPath })).tables.map((table) => table.name)).toEqual(["_my_migrations", "t"]);
  });

  it("applies none of the pending migrations when one fails", async () => {
    const dbPath = join(tempDir(), "fail.db");
    await call("db.migrate", { dbPath, migrations: [{ version: 1, sql: "CREATE TABLE a (x)" }] });
    const before = readFileSync(dbPath);
    await expect(
      call("db.migrate", {
        dbPath,
        migrations: [
          { version: 1, sql: "CREATE TABLE a (x)" },
          { version: 2, name: "b", sql: "CREATE TABLE b (x)" },
          { version: 3, name: "broken", sql: "INSERT INTO missing VALUES (1)" },
        ],
      }),
    ).rejects.toThrow(/the migration 3 \(broken\) failed: .*missing.*No migration was applied/);
    expect(readFileSync(dbPath).equals(before)).toBe(true);
    await expect(call("db.migrate", { dbPath, migrations: [{ version: 2, sql: "BEGIN; CREATE TABLE c (x); COMMIT;" }] })).rejects.toThrow(
      /db\.migrate: the migration 2 \(migration 2\): the procedure runs the transaction/,
    );
  });

  it("refuses a changed migration, two migrations with one number, and a wrong input", async () => {
    const dbPath = join(tempDir(), "changed.db");
    await call("db.migrate", { dbPath, migrations: [{ version: 1, sql: "CREATE TABLE a (x)" }] });
    await expect(call("db.migrate", { dbPath, migrations: [{ version: 1, sql: "CREATE TABLE a (y)" }] })).rejects.toThrow(/changed after it was applied/);
    await expect(
      call("db.migrate", { dbPath, migrations: [{ version: 2, sql: "SELECT 1" }, { version: 2, sql: "SELECT 2" }] }),
    ).rejects.toThrow(/two migrations have the version 2/);
    await expect(call("db.migrate", { dbPath })).rejects.toThrow(/exactly one of folder or migrations/);
    await expect(call("db.migrate", { dbPath, folder: "x", migrations: [] })).rejects.toThrow(/exactly one of folder or migrations/);
    await expect(call("db.migrate", { dbPath, migrations: [], table: "bad name" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("db.migrate", { dbPath, folder: migrationsFolder({ "create.sql": "SELECT 1" }) })).rejects.toThrow(/has no number/);
  });
});

describe("db.backup (R44)", () => {
  it("copies a database to a new file, and leaves the source as it was", async () => {
    const dbPath = await sampleDb();
    const before = readFileSync(dbPath);
    const to = join(tempDir(), "copy.db");
    const result = await call<DbBackupOutput>("db.backup", { dbPath, to });
    expect(result).toEqual({ path: to, bytes: readFileSync(to).length });
    expect(readFileSync(to).equals(before)).toBe(true);
    expect(readFileSync(dbPath).equals(before)).toBe(true);
    expect((await call<DbTablesOutput>("db.tables", { dbPath: to })).tables).toHaveLength(3);
    expect(readdirSync(join(to, "..")).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("compacts the copy with vacuum: true", async () => {
    const dbPath = await sampleDb();
    await call("db.execute", { dbPath, sql: "CREATE TABLE big (data TEXT); INSERT INTO big VALUES (hex(randomblob(20000))); DROP TABLE big;" });
    const plain = await call<DbBackupOutput>("db.backup", { dbPath, to: join(tempDir(), "plain.db") });
    const compact = await call<DbBackupOutput>("db.backup", { dbPath, to: join(tempDir(), "compact.db"), vacuum: true });
    expect(compact.bytes).toBeLessThan(plain.bytes);
    expect((await call<DbTablesOutput>("db.tables", { dbPath: compact.path })).tables).toHaveLength(3);
  });

  it("does not replace a file, and does not copy a missing database", async () => {
    const dbPath = await sampleDb();
    const to = join(tempDir(), "taken.db");
    writeFileSync(to, "keep");
    await expect(call("db.backup", { dbPath, to })).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(to, "utf8")).toBe("keep");
    await expect(call("db.backup", { dbPath, to: dbPath })).rejects.toThrow(/cannot be the database file itself/);
    await expect(call("db.backup", { dbPath: join(tempDir(), "missing.db"), to: join(tempDir(), "x.db") })).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a source that is not a database, and leaves no file", async () => {
    const dir = tempDir();
    const dbPath = join(dir, "text.db");
    writeFileSync(dbPath, "this is not a database file, but it is long enough to look like one at first ".repeat(20));
    const to = join(dir, "copy.db");
    await expect(call("db.backup", { dbPath, to })).rejects.toThrow();
    expect(existsSync(to)).toBe(false);
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
