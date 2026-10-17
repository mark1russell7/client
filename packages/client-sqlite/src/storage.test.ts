/**
 * SqliteStorage (roadmap R45).
 *
 * The first block runs the contract suite of `CollectionStorage` from
 * `@procedures/collections/testing`, for each engine (`node` and `sqljs`), for a database in
 * memory and for a file. The other blocks test what is particular to SQLite: the file, the
 * versions after a restart, the transactions, the shared database of a file and the table names.
 * `engines.test.ts` tests the engine choice.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import type { EngineDatabase, SqliteEngineName } from "./engines.js";
import { MEMORY_PATH, SqliteStorage, checkTableName, isNodeSqliteAvailable, type SqliteStorageOptions } from "./storage.js";

const dirs: string[] = [];
const open: Array<SqliteStorage<unknown>> = [];

afterEach(async () => {
  for (const storage of open.splice(0)) await storage.close().catch(() => undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-storage-"));
  dirs.push(dir);
  return dir;
}

function tempDb(): string {
  return join(tempDir(), "nested", "items.db");
}

function storageOf<T>(options: SqliteStorageOptions): SqliteStorage<T> {
  const storage = new SqliteStorage<T>(options);
  open.push(storage as SqliteStorage<unknown>);
  return storage;
}

/** The shared database of a storage, for the tests that change the database around it. */
async function databaseOf(storage: SqliteStorage<unknown>): Promise<EngineDatabase> {
  const shared = await (storage as unknown as { opening: Promise<{ open: { db: EngineDatabase } }> }).opening;
  return shared.open.db;
}

/** The engines of this Node.js: `node` needs Node.js 22.13 or later. */
const nodeAvailable = await isNodeSqliteAvailable();
const engines: SqliteEngineName[] = nodeAvailable ? ["node", "sqljs"] : ["sqljs"];

it("this Node.js has node:sqlite: CI runs the engine node on each Node.js version of the matrix", () => {
  // The engines field of the repository allows Node.js 22.0. Node.js 22.13 and later have node:sqlite
  // without a flag, and CI uses the newest 22.x.
  const [major, minor] = process.versions.node.split(".").map(Number) as [number, number];
  expect(nodeAvailable).toBe(major > 22 || (major === 22 && minor >= 13));
});

const places: Array<[string, () => string]> = [
  ["in memory", () => MEMORY_PATH],
  ["in a file", tempDb],
];

// The contract of CollectionStorage (the suite of @procedures/collections/testing), for each
// engine, for a database in memory and for a file. SqliteStorage keeps JSON text, so it gives
// copies.
for (const engine of engines) {
  for (const [place, pathOf] of places) {
    describeCollectionStorageContract(
      `SqliteStorage (${engine}) ${place}`,
      {
        create: () => storageOf<ContractItem>({ path: pathOf(), table: "items", engine }),
        createWithMaxTombstones: (max) => storageOf<ContractItem>({ path: pathOf(), table: "items", maxTombstones: max, engine }),
      },
      { describe, it },
    );
  }
}

for (const engine of engines) {
  describe(`SqliteStorage (${engine}): the versions`, () => {
    it("a number above the version of the storage is not a version of it", async () => {
      const storage = storageOf<{ n: number }>({ path: MEMORY_PATH, table: "items", engine });
      await storage.set("a", { n: 1 });
      const start = await storage.getChangesSince();
      expect((await storage.getChangesSince(`${start.version.split(":")[0]}:999`)).full).toBe(true);
      expect((await storage.getChangesSince(start.version)).full).toBe(false);
    });

    it("gives a delta in the order of the last write of each id", async () => {
      const storage = storageOf<{ n: number }>({ path: MEMORY_PATH, table: "items", engine });
      await storage.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
      const start = await storage.getChangesSince();
      await storage.set("b", { n: 20 });
      await storage.set("a", { n: 10 });
      expect((await storage.getChangesSince(start.version)).changed.map(([id]) => id)).toEqual(["b", "a"]);
    });
  });

  describe(`SqliteStorage (${engine}) in a file`, () => {
    it("keeps the items after close(), and a new storage of the file reads them", async () => {
      const path = tempDb();
      const first = storageOf<{ name: string; tags: string[] }>({ path, table: "users", engine });
      await first.set("u1", { name: "Ada", tags: ["a", "b"] });
      await first.setBatch([["u2", { name: "Bob", tags: [] }], ["u3", { name: "Cy", tags: ["c"] }]]);
      await first.delete("u2");
      await first.close();
      expect(existsSync(path)).toBe(true);

      const second = storageOf<{ name: string; tags: string[] }>({ path, table: "users", engine });
      expect(await second.getEntries()).toEqual([
        ["u1", { name: "Ada", tags: ["a", "b"] }],
        ["u3", { name: "Cy", tags: ["c"] }],
      ]);
      expect(await second.getIds()).toEqual(["u1", "u3"]);
    });

    it("keeps the versions valid after a restart: a version of the old storage gives a delta", async () => {
      const path = tempDb();
      const first = storageOf<{ n: number }>({ path, table: "items", engine });
      await first.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
      const before = await first.getChangesSince();
      await first.close();

      const second = storageOf<{ n: number }>({ path, table: "items", engine });
      await second.set("c", { n: 3 });
      await second.delete("a");
      expect(await second.getChangesSince(before.version)).toEqual({
        version: (await second.getChangesSince()).version,
        full: false,
        changed: [["c", { n: 3 }]],
        deleted: ["a"],
      });
    });

    it("keeps a version that it gave before the file existed", async () => {
      const path = tempDb();
      const storage = storageOf<{ n: number }>({ path, table: "items", engine });
      const empty = await storage.getChangesSince();
      await storage.set("a", { n: 1 });
      expect(await storage.getChangesSince(empty.version)).toMatchObject({ full: false, changed: [["a", { n: 1 }]] });
      await storage.close();
      const again = storageOf<{ n: number }>({ path, table: "items", engine });
      expect((await again.getChangesSince(empty.version)).full).toBe(false);
    });

    it("does not make the file when it only reads", async () => {
      const path = tempDb();
      const storage = storageOf<{ n: number }>({ path, table: "items", engine });
      expect(await storage.get("a")).toBeUndefined();
      expect(await storage.getChangesSince()).toMatchObject({ full: true, changed: [] });
      expect(await storage.getIds()).toEqual([]);
      await storage.delete("a");
      await storage.deleteBatch(["a", "b"]);
      await storage.clear();
      await storage.flush();
      await storage.close();
      expect(existsSync(path)).toBe(false);
    });

    it("keeps each write of several writes that wait", async () => {
      const path = tempDb();
      const storage = storageOf<{ n: number }>({ path, table: "items", engine });
      await Promise.all(Array.from({ length: 50 }, (_, n) => storage.set(`k${n}`, { n })));
      await storage.close();

      const again = storageOf<{ n: number }>({ path, table: "items", engine });
      expect(await again.size()).toBe(50);
    });

    it("shares one database between the storages of one file: two tables keep their items", async () => {
      const path = tempDb();
      const users = storageOf<{ name: string }>({ path, table: "users", engine });
      const orders = storageOf<{ total: number }>({ path, table: "orders", engine });
      await Promise.all([users.set("u", { name: "Ada" }), orders.set("o", { total: 5 })]);
      // A second storage of the same table sees the writes of the first one
      const usersAgain = storageOf<{ name: string }>({ path, table: "users", engine });
      expect(await usersAgain.get("u")).toEqual({ name: "Ada" });
      await Promise.all([users.close(), orders.close(), usersAgain.close()]);

      // Each table has its own change log and version
      const reopenedUsers = storageOf<{ name: string }>({ path, table: "users", engine });
      const reopenedOrders = storageOf<{ total: number }>({ path, table: "orders", engine });
      expect((await reopenedUsers.getChangesSince()).changed).toEqual([["u", { name: "Ada" }]]);
      expect((await reopenedOrders.getChangesSince()).changed).toEqual([["o", { total: 5 }]]);
      expect((await reopenedUsers.getChangesSince()).version).not.toBe((await reopenedOrders.getChangesSince()).version);
    });

    it("makes the tables of a second storage that opened before the first write in the file", async () => {
      const path = tempDb();
      const users = storageOf<{ name: string }>({ path, table: "users", engine });
      const orders = storageOf<{ total: number }>({ path, table: "orders", engine });
      expect(await orders.size()).toBe(0);
      await users.set("u", { name: "Ada" });
      await orders.set("o", { total: 5 });
      expect(await orders.getEntries()).toEqual([["o", { total: 5 }]]);
    });

    it("refuses an existing table that does not have the columns of a storage", async () => {
      const path = tempDb();
      const first = storageOf<{ n: number }>({ path, table: "items", engine });
      await first.set("a", { n: 1 });
      const db = await databaseOf(first as SqliteStorage<unknown>);
      db.run("CREATE TABLE other (name TEXT)");
      const wrong = storageOf<{ n: number }>({ path, table: "other", engine });
      await expect(wrong.get("a")).rejects.toThrow(/does not have the columns id and value/);
      // The storage of the other table works still
      expect(await first.get("a")).toEqual({ n: 1 });
    });

    it("gives the error of a file that is not a database to each operation", async () => {
      const dir = tempDir();
      const path = join(dir, "bad.db");
      writeFileSync(path, "this is not a SQLite database file, and it is long enough to have a header");
      const storage = storageOf<{ n: number }>({ path, table: "items", engine });
      await expect(storage.get("a")).rejects.toThrow(/not a database|malformed/i);
      await expect(storage.set("a", { n: 1 })).rejects.toThrow(/not a database|malformed/i);
      await storage.close();
    });
  });

  describe(`SqliteStorage (${engine}): the transactions`, () => {
    it("a batch that fails in the database changes nothing", async () => {
      const storage = storageOf<{ n: number }>({ path: MEMORY_PATH, table: "items", engine });
      await storage.set("keep", { n: 0 });
      const before = await storage.getChangesSince();
      const db = await databaseOf(storage as SqliteStorage<unknown>);
      db.run(`CREATE TRIGGER refuse_bad BEFORE INSERT ON "items" WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'the id bad is refused'); END`);

      await expect(storage.setBatch([["a", { n: 1 }], ["bad", { n: 2 }], ["c", { n: 3 }]])).rejects.toThrow("the id bad is refused");
      expect(await storage.getEntries()).toEqual([["keep", { n: 0 }]]);
      // The change log did not move
      expect(await storage.getChangesSince(before.version)).toEqual({ version: before.version, full: false, changed: [], deleted: [] });

      // The next write works
      await storage.setBatch([["a", { n: 1 }]]);
      expect(await storage.size()).toBe(2);
    });

    it("refuses a value that is not JSON before any change", async () => {
      const storage = storageOf<unknown>({ path: MEMORY_PATH, table: "items", engine });
      await expect(storage.set("a", undefined)).rejects.toThrow(TypeError);
      await expect(storage.set("a", () => 1)).rejects.toThrow(/not JSON/);
      await expect(storage.setBatch([["a", 1], ["b", 10n]])).rejects.toThrow(/The value of "b" is not JSON/);
      expect(await storage.size()).toBe(0);
      await expect(storage.set(1 as unknown as string, 1)).rejects.toThrow(/An id must be a string/);
    });
  });

  describe(`SqliteStorage (${engine}): the life cycle`, () => {
    it("rejects each operation after close(), also flush() and an empty batch, and close() can run two times", async () => {
      const storage = new SqliteStorage<number>({ path: MEMORY_PATH, table: "items", engine });
      await storage.set("a", 1);
      await storage.close();
      await storage.close();
      await expect(storage.get("a")).rejects.toThrow(/is closed/);
      await expect(storage.set("a", 2)).rejects.toThrow(/is closed/);
      await expect(storage.flush()).rejects.toThrow(/is closed/);
      await expect(storage.setBatch([])).rejects.toThrow(/is closed/);
      await expect(storage.deleteBatch([])).rejects.toThrow(/is closed/);
      await expect(storage.getIds()).rejects.toThrow(/is closed/);
      await expect(storage.getEngine()).rejects.toThrow(/is closed/);
    });

    it("gives a new database for each storage in memory", async () => {
      const one = storageOf<number>({ path: MEMORY_PATH, table: "items", engine });
      const two = storageOf<number>({ path: MEMORY_PATH, table: "items", engine });
      await one.set("a", 1);
      expect(await two.has("a")).toBe(false);
      expect((await one.getChangesSince()).version).not.toBe((await two.getChangesSince()).version);
    });

    it("gives its metadata with the engine", async () => {
      const storage = storageOf<number>({ path: MEMORY_PATH, table: "items", engine });
      await storage.setBatch([["a", 1], ["b", 2]]);
      expect(await storage.getMetadata()).toEqual({ type: "custom", size: 2, stats: { backend: "sqlite", engine, table: "items", memory: true } });
      expect(await storage.getEngine()).toBe(engine);
    });
  });
}

describe("SqliteStorage (sqljs): the whole-file writes", () => {
  it("writes the file one time for several writes that wait, and keeps each write", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    await Promise.all(Array.from({ length: 50 }, (_, n) => storage.set(`k${n}`, { n })));
    await storage.close();

    const again = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    expect(await again.size()).toBe(50);
  });

  it("a failed file write fails the write, and flush() writes the change later", async () => {
    const dir = tempDir();
    const path = join(dir, "blocked", "items.db");
    const storage = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    expect(await storage.size()).toBe(0);
    // A file in the place of the folder: the file write cannot make the folder
    writeFileSync(join(dir, "blocked"), "not a folder");
    await expect(storage.set("a", { n: 1 })).rejects.toThrow();
    // The change stays in the database of the process
    expect(await storage.get("a")).toEqual({ n: 1 });

    rmSync(join(dir, "blocked"));
    await storage.flush();
    await storage.close();
    const again = storageOf<{ n: number }>({ path, table: "items", engine: "sqljs" });
    expect(await again.get("a")).toEqual({ n: 1 });
  });
});

describe.runIf(nodeAvailable)("SqliteStorage (node): the file", () => {
  it("a write that cannot make the file fails and changes nothing, and the next write makes it", async () => {
    const dir = tempDir();
    const path = join(dir, "blocked", "items.db");
    const storage = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    const empty = await storage.getChangesSince();
    // A file in the place of the folder: the storage cannot make the folder
    writeFileSync(join(dir, "blocked"), "not a folder");
    await expect(storage.set("a", { n: 1 })).rejects.toThrow();
    // The engine node changes nothing when the file write fails
    expect(await storage.get("a")).toBeUndefined();
    expect((await storage.getChangesSince(empty.version)).changed).toEqual([]);

    rmSync(join(dir, "blocked"));
    await storage.set("a", { n: 1 });
    await storage.close();
    const again = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    expect(await again.get("a")).toEqual({ n: 1 });
    expect((await again.getChangesSince(empty.version)).changed).toEqual([["a", { n: 1 }]]);
  });

  it("puts the file in WAL mode with a busy timeout", async () => {
    const storage = storageOf<{ n: number }>({ path: tempDb(), table: "items", engine: "node" });
    await storage.set("a", { n: 1 });
    const db = await databaseOf(storage as SqliteStorage<unknown>);
    expect(db.all("PRAGMA journal_mode")).toEqual([{ journal_mode: "wal" }]);
    expect(db.all("PRAGMA busy_timeout")).toEqual([{ timeout: 5000 }]);
  });

  it("sees a file that another process made after the open", async () => {
    const path = tempDb();
    const reader = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    expect(await reader.size()).toBe(0);
    // The sql.js engine of docker-sqlite stands for another process: it does not share the database of this process
    const { createConnection } = await import("@mark1russell7/docker-sqlite");
    const other = await createConnection({ dbPath: path });
    other.db.run(`CREATE TABLE "items" (id TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    other.db.run(`INSERT INTO "items" VALUES ('x', '{"n":9}')`);
    await other.save();
    other.db.close();
    expect(await reader.get("x")).toEqual({ n: 9 });
    await reader.set("a", { n: 1 });
    expect(await reader.getIds()).toEqual(["x", "a"]);
  });
});

describe("SqliteStorage: the options", () => {
  it("checks the table name: it goes into the SQL text", () => {
    for (const name of ["users", "Users2", "a_b_c", "x".repeat(64)]) expect(checkTableName(name)).toBe(name);
    for (const name of ["", "1abc", "_hidden", "a-b", 'x"; DROP TABLE y; --', "sqlite_master", "SQLITE_x", "x".repeat(65), 42]) {
      expect(() => checkTableName(name)).toThrow(TypeError);
    }
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "a b" })).toThrow(TypeError);
    expect(() => new SqliteStorage({ path: "", table: "items" })).toThrow(/needs a path/);
  });
});
