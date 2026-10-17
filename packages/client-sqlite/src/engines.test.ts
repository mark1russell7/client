/**
 * The engine choice of SqliteStorage: `auto`, `node` and `sqljs`, a file of one engine in the
 * other, the share of a file in one process, a lock of another connection, two processes on one
 * file, and a read-only file. `engines.fallback.test.ts` tests a Node.js without `node:sqlite`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ms } from "@procedures/client";
import { MEMORY_PATH, SqliteStorage, isNodeSqliteAvailable, type SqliteEngineName, type SqliteStorageOptions } from "./storage.js";

const dirs: string[] = [];
const open: Array<SqliteStorage<unknown>> = [];

afterEach(async () => {
  for (const storage of open.splice(0)) await storage.close().catch(() => undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-engines-"));
  dirs.push(dir);
  return join(dir, "items.db");
}

function storageOf<T>(options: SqliteStorageOptions): SqliteStorage<T> {
  const storage = new SqliteStorage<T>(options);
  open.push(storage as SqliteStorage<unknown>);
  return storage;
}

const nodeAvailable = await isNodeSqliteAvailable();

describe("SqliteStorage: the engine choice", () => {
  it("auto uses node when Node.js has node:sqlite, and sqljs uses sql.js", async () => {
    const auto = storageOf<number>({ path: MEMORY_PATH, table: "items" });
    expect(auto.engine).toBe("auto");
    expect(await auto.getEngine()).toBe(nodeAvailable ? "node" : "sqljs");
    const sqljs = storageOf<number>({ path: MEMORY_PATH, table: "items", engine: "sqljs" });
    expect(await sqljs.getEngine()).toBe("sqljs");
  });

  it("refuses an unknown engine", () => {
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "items", engine: "native" as never })).toThrow(/Unknown SQLite engine "native"/);
  });

  it("refuses a busy timeout that is not a duration", () => {
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "items", busyTimeout: 50 as never })).toThrow(/busyTimeout must be a duration/);
  });
});

describe.runIf(nodeAvailable)("SqliteStorage: one file format for the two engines", () => {
  const pairs: Array<[SqliteEngineName, SqliteEngineName]> = [
    ["node", "sqljs"],
    ["sqljs", "node"],
  ];
  for (const [writer, reader] of pairs) {
    it(`a file that ${writer} writes opens with ${reader}, with its items and its versions`, async () => {
      const path = tempDb();
      const first = storageOf<{ n: number }>({ path, table: "items", engine: writer });
      await first.setBatch([["a", { n: 1 }], ["b", { n: 2 }], ["c", { n: 3 }]]);
      await first.delete("b");
      const version = (await first.getChangesSince()).version;
      await first.close();

      const second = storageOf<{ n: number }>({ path, table: "items", engine: reader });
      expect(await second.getEngine()).toBe(reader);
      expect(await second.getEntries()).toEqual([["a", { n: 1 }], ["c", { n: 3 }]]);
      // The version of the other engine stays valid
      await second.set("d", { n: 4 });
      await second.delete("a");
      expect(await second.getChangesSince(version)).toMatchObject({ full: false, changed: [["d", { n: 4 }]], deleted: ["a"] });
      await second.close();

      // And back to the first engine
      const third = storageOf<{ n: number }>({ path, table: "items", engine: writer });
      expect(await third.getIds()).toEqual(["c", "d"]);
    });
  }
});

describe.runIf(nodeAvailable)("SqliteStorage: the engines of one file in one process", () => {
  it("a storage with auto shares the open database, and a storage with the other engine refuses it", async () => {
    const path = tempDb();
    const first = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    await first.set("a", { n: 1 });
    const auto = storageOf<{ n: number }>({ path, table: "items", engine: "auto" });
    expect(await auto.getEngine()).toBe("node");
    expect(await auto.get("a")).toEqual({ n: 1 });
    const other = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    await expect(other.get("a")).rejects.toThrow(/is open with the SQLite engine node in this process/);
    // The refusal does not close the database of the other storages
    expect(await first.get("a")).toEqual({ n: 1 });
  });

  it("the first storage of a file sets the engine, and after the last close a storage opens the file with its own engine", async () => {
    const path = tempDb();
    // The two storages open at the same time: the first one opens the file
    const sqljs = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    const node = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    await expect(node.get("a")).rejects.toThrow(/is open with the SQLite engine sqljs/);
    await sqljs.set("a", { n: 1 });
    await sqljs.close();
    const later = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    expect(await later.get("a")).toEqual({ n: 1 });
  });
});

describe.runIf(nodeAvailable)("SqliteStorage (node): locks and processes", () => {
  it("sql.js refuses a file whose write-ahead log has changes, and opens it after the log is gone", async () => {
    const path = tempDb();
    // A connection of node:sqlite outside the storages: it keeps changes in the log
    const { DatabaseSync } = (await import("node:sqlite")) as unknown as {
      DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
    };
    const raw = new DatabaseSync(path);
    raw.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
    raw.exec(`CREATE TABLE "items" (id TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO "items" VALUES ('a', '{"n":1}');`);
    expect(existsSync(`${path}-wal`)).toBe(true);
    const sqljs = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    await expect(sqljs.get("a")).rejects.toThrow(/has a write-ahead log/);
    raw.close();

    const again = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    expect(await again.get("a")).toEqual({ n: 1 });
  });

  it("a write waits for the lock of another connection, and fails after the busy timeout", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items", engine: "node", busyTimeout: ms(50) });
    await storage.set("a", { n: 1 });
    const { DatabaseSync } = (await import("node:sqlite")) as unknown as {
      DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
    };
    const other = new DatabaseSync(path);
    try {
      other.exec("BEGIN IMMEDIATE");
      await expect(storage.set("b", { n: 2 })).rejects.toThrow(/database is locked/);
      // A read does not wait for the write lock in WAL mode
      expect(await storage.get("a")).toEqual({ n: 1 });
      other.exec("COMMIT");
      await storage.set("b", { n: 2 });
      expect(await storage.getIds()).toEqual(["a", "b"]);
    } finally {
      other.close();
    }
  });

  it("two processes write one file at the same time, and each write stays in the change log", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    await storage.set("start", { n: 0 });
    const start = (await storage.getChangesSince()).version;

    // The other process uses the built storage: CI builds the packages before the tests
    const built = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "storage.js");
    expect(existsSync(built), `the built storage ${built} is missing: start pnpm build first`).toBe(true);
    const code = `
      const { SqliteStorage } = await import(${JSON.stringify(pathToFileURL(built).href)});
      const storage = new SqliteStorage({ path: ${JSON.stringify(path)}, table: "items", engine: "node" });
      for (let n = 0; n < 100; n++) await storage.set("child" + n, { n });
      await storage.close();
    `;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk: Buffer) => (errors += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
    for (let n = 0; n < 100; n++) await storage.set(`parent${n}`, { n });
    const exitCode = await exited;
    // Node.js 22 warns that node:sqlite is experimental
    expect(errors.replace(/.*(ExperimentalWarning|--trace-warnings).*\r?\n?/g, "")).toBe("");
    expect(exitCode).toBe(0);

    expect(await storage.size()).toBe(201);
    const delta = await storage.getChangesSince(start);
    expect(delta.full).toBe(false);
    expect(delta.changed).toHaveLength(200);
    expect(new Set(delta.changed.map(([id]) => id)).size).toBe(200);
  });

  // The user root writes a read-only file
  it.skipIf(process.getuid?.() === 0)("reads a read-only file, and a write fails without a change", async () => {
    const path = tempDb();
    const first = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    await first.set("a", { n: 1 });
    await first.close();
    chmodSync(path, 0o444);
    try {
      const reader = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
      expect(await reader.get("a")).toEqual({ n: 1 });
      await expect(reader.set("b", { n: 2 })).rejects.toThrow(/readonly|read-only/i);
      expect(await reader.getIds()).toEqual(["a"]);
      await reader.close();
    } finally {
      chmodSync(path, 0o666);
    }
  });
});
