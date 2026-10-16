/**
 * SqliteStorage (roadmap R45).
 *
 * The first block mirrors the tests of `InMemoryStorage` in client-collections
 * (`collections.test.ts`), case by case, for a database in memory and for a file. The repository
 * has no shared contract suite for `CollectionStorage` yet: a suite that each storage runs is the
 * better place for these cases. The other blocks test what is particular to SQLite: the file, the
 * versions after a restart, the transactions, the shared database of a file and the table names.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "@mark1russell7/docker-sqlite";
import { MEMORY_PATH, SqliteStorage, checkTableName, type SqliteStorageOptions } from "./storage.js";

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
async function databaseOf(storage: SqliteStorage<unknown>): Promise<Database> {
  const { shared } = await (storage as unknown as { opening: Promise<{ shared: { db: Database } }> }).opening;
  return shared.db;
}

const places: Array<[string, () => string]> = [
  ["in memory", () => MEMORY_PATH],
  ["in a file", tempDb],
];

for (const [place, pathOf] of places) {
  describe(`SqliteStorage ${place}: the cases of InMemoryStorage`, () => {
    it("implements the CollectionStorage operations", async () => {
      const storage = storageOf<{ id: string; n: number }>({ path: pathOf(), table: "items" });

      await storage.set("1", { id: "1", n: 1 });
      await storage.setBatch([["2", { id: "2", n: 2 }], ["3", { id: "3", n: 3 }]]);

      expect(await storage.size()).toBe(3);
      expect(await storage.get("2")).toEqual({ id: "2", n: 2 });
      expect(await storage.has("4")).toBe(false);
      expect((await storage.find((item) => item.n > 1)).map((item) => item.id)).toEqual(["2", "3"]);
      expect([...(await storage.getBatch(["1", "3"])).keys()]).toEqual(["1", "3"]);

      expect(await storage.delete("1")).toBe(true);
      expect(await storage.deleteBatch(["2", "9"])).toBe(1);
      expect((await storage.getAll()).map((item) => item.id)).toEqual(["3"]);

      await storage.clear();
      expect(await storage.size()).toBe(0);
      await storage.close();
    });

    it("gives the changes since a version: the changed items and the deleted ids (roadmap R28)", async () => {
      const storage = storageOf<{ n: number }>({ path: pathOf(), table: "items" });
      await storage.setBatch([["a", { n: 1 }], ["b", { n: 2 }], ["c", { n: 3 }]]);
      const first = await storage.getChangesSince();
      expect(first.full).toBe(true);
      expect(first.changed).toEqual([["a", { n: 1 }], ["b", { n: 2 }], ["c", { n: 3 }]]);

      await storage.set("a", { n: 10 });
      await storage.delete("b");
      await storage.delete("missing");
      const second = await storage.getChangesSince(first.version);
      expect(second).toEqual({ version: second.version, full: false, changed: [["a", { n: 10 }]], deleted: ["b"] });

      // A deleted id that comes back is a change, not a delete
      await storage.set("b", { n: 20 });
      await storage.clear();
      const third = await storage.getChangesSince(second.version);
      expect(third.full).toBe(false);
      expect(third.changed).toEqual([]);
      expect(third.deleted.sort()).toEqual(["a", "b", "c"]);
      expect(await storage.getChangesSince(third.version)).toEqual({ version: third.version, full: false, changed: [], deleted: [] });
    });

    it("gives all items for a version of another storage, or older than the dropped deletes", async () => {
      const storage = storageOf<{ n: number }>({ path: pathOf(), table: "items", maxTombstones: 2 });
      await storage.setBatch([["a", { n: 1 }], ["b", { n: 2 }], ["c", { n: 3 }], ["d", { n: 4 }]]);
      const start = await storage.getChangesSince();

      const other = await storageOf<{ n: number }>({ path: MEMORY_PATH, table: "items" }).getChangesSince();
      expect((await storage.getChangesSince(other.version)).full).toBe(true);
      expect((await storage.getChangesSince("not a version")).full).toBe(true);
      // A number above the version of the storage is not a version of it
      expect((await storage.getChangesSince(`${start.version.split(":")[0]}:999`)).full).toBe(true);

      // Two deletes fit in the log
      await storage.deleteBatch(["a", "b"]);
      expect(await storage.getChangesSince(start.version)).toMatchObject({ full: false, deleted: ["a", "b"] });
      // The third delete drops the oldest one: the start version gives all items now
      await storage.delete("c");
      const after = await storage.getChangesSince(start.version);
      expect(after).toMatchObject({ full: true, changed: [["d", { n: 4 }]], deleted: [] });
      // A version after the dropped deletes still gives a delta
      expect((await storage.getChangesSince(after.version)).full).toBe(false);
    });
  });
}

describe("SqliteStorage in a file", () => {
  it("keeps the items after close(), and a new storage of the file reads them", async () => {
    const path = tempDb();
    const first = storageOf<{ name: string; tags: string[] }>({ path, table: "users" });
    await first.set("u1", { name: "Ada", tags: ["a", "b"] });
    await first.setBatch([["u2", { name: "Bob", tags: [] }], ["u3", { name: "Cy", tags: ["c"] }]]);
    await first.delete("u2");
    await first.close();
    expect(existsSync(path)).toBe(true);

    const second = storageOf<{ name: string; tags: string[] }>({ path, table: "users" });
    expect(await second.getEntries()).toEqual([
      ["u1", { name: "Ada", tags: ["a", "b"] }],
      ["u3", { name: "Cy", tags: ["c"] }],
    ]);
  });

  it("keeps the versions valid after a restart: a version of the old storage gives a delta", async () => {
    const path = tempDb();
    const first = storageOf<{ n: number }>({ path, table: "items" });
    await first.setBatch([["a", { n: 1 }], ["b", { n: 2 }]]);
    const before = await first.getChangesSince();
    await first.close();

    const second = storageOf<{ n: number }>({ path, table: "items" });
    await second.set("c", { n: 3 });
    await second.delete("a");
    expect(await second.getChangesSince(before.version)).toEqual({
      version: (await second.getChangesSince()).version,
      full: false,
      changed: [["c", { n: 3 }]],
      deleted: ["a"],
    });
  });

  it("does not make the file when it only reads", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items" });
    expect(await storage.get("a")).toBeUndefined();
    expect(await storage.getChangesSince()).toMatchObject({ full: true, changed: [] });
    await storage.delete("a");
    await storage.clear();
    await storage.close();
    expect(existsSync(path)).toBe(false);
  });

  it("writes the file one time for several writes that wait, and keeps each write", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items" });
    await Promise.all(Array.from({ length: 50 }, (_, n) => storage.set(`k${n}`, { n })));
    await storage.close();

    const again = storageOf<{ n: number }>({ path, table: "items" });
    expect(await again.size()).toBe(50);
  });

  it("shares one database between the storages of one file: two tables keep their items", async () => {
    const path = tempDb();
    const users = storageOf<{ name: string }>({ path, table: "users" });
    const orders = storageOf<{ total: number }>({ path, table: "orders" });
    await Promise.all([users.set("u", { name: "Ada" }), orders.set("o", { total: 5 })]);
    // A second storage of the same table sees the writes of the first one
    const usersAgain = storageOf<{ name: string }>({ path, table: "users" });
    expect(await usersAgain.get("u")).toEqual({ name: "Ada" });
    await Promise.all([users.close(), orders.close(), usersAgain.close()]);

    // Each table has its own change log and version
    const reopenedUsers = storageOf<{ name: string }>({ path, table: "users" });
    const reopenedOrders = storageOf<{ total: number }>({ path, table: "orders" });
    expect((await reopenedUsers.getChangesSince()).changed).toEqual([["u", { name: "Ada" }]]);
    expect((await reopenedOrders.getChangesSince()).changed).toEqual([["o", { total: 5 }]]);
    expect((await reopenedUsers.getChangesSince()).version).not.toBe((await reopenedOrders.getChangesSince()).version);
  });

  it("a failed file write fails the write, and flush() writes the change later", async () => {
    const dir = tempDir();
    const path = join(dir, "blocked", "items.db");
    const storage = storageOf<{ n: number }>({ path, table: "items" });
    expect(await storage.size()).toBe(0);
    // A file in the place of the folder: the file write cannot make the folder
    writeFileSync(join(dir, "blocked"), "not a folder");
    await expect(storage.set("a", { n: 1 })).rejects.toThrow();
    // The change stays in the database of the process
    expect(await storage.get("a")).toEqual({ n: 1 });

    rmSync(join(dir, "blocked"));
    await storage.flush();
    await storage.close();
    const again = storageOf<{ n: number }>({ path, table: "items" });
    expect(await again.get("a")).toEqual({ n: 1 });
  });

  it("refuses an existing table that does not have the columns of a storage", async () => {
    const path = tempDb();
    const first = storageOf<{ n: number }>({ path, table: "items" });
    await first.set("a", { n: 1 });
    const db = await databaseOf(first as SqliteStorage<unknown>);
    db.run("CREATE TABLE other (name TEXT)");
    const wrong = storageOf<{ n: number }>({ path, table: "other" });
    await expect(wrong.get("a")).rejects.toThrow(/does not have the columns id and value/);
    // The storage of the other table works still
    expect(await first.get("a")).toEqual({ n: 1 });
  });

  it("gives the error of a file that is not a database to each operation", async () => {
    const dir = tempDir();
    const path = join(dir, "bad.db");
    writeFileSync(path, "this is not a SQLite database file, and it is long enough to have a header");
    const storage = storageOf<{ n: number }>({ path, table: "items" });
    await expect(storage.get("a")).rejects.toThrow(/not a database|malformed/i);
    await expect(storage.set("a", { n: 1 })).rejects.toThrow(/not a database|malformed/i);
    await storage.close();
  });
});

describe("SqliteStorage: the transactions", () => {
  it("a batch that fails in the database changes nothing", async () => {
    const storage = storageOf<{ n: number }>({ path: MEMORY_PATH, table: "items" });
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
    const storage = storageOf<unknown>({ path: MEMORY_PATH, table: "items" });
    await expect(storage.set("a", undefined)).rejects.toThrow(TypeError);
    await expect(storage.set("a", () => 1)).rejects.toThrow(/not JSON/);
    await expect(storage.setBatch([["a", 1], ["b", 10n]])).rejects.toThrow(/The value of "b" is not JSON/);
    expect(await storage.size()).toBe(0);
    await expect(storage.set(1 as unknown as string, 1)).rejects.toThrow(/An id must be a string/);
  });

  it("keeps the JSON values, and gives a copy for each read", async () => {
    const storage = storageOf<unknown>({ path: MEMORY_PATH, table: "items" });
    const value = { text: "é ✓", list: [1, null, { deep: true }], n: 1.5 };
    await storage.setBatch([["object", value], ["null", null], ["text", "plain"], ["zero", 0]]);
    const read = (await storage.get("object")) as typeof value;
    expect(read).toEqual(value);
    read.list.push(99);
    expect(await storage.get("object")).toEqual(value);
    expect(await storage.get("null")).toBeNull();
    expect(await storage.getBatch(["zero", "missing", "text"])).toEqual(new Map<string, unknown>([["zero", 0], ["text", "plain"]]));
  });

  it("a set of an existing id keeps its place in the order", async () => {
    const storage = storageOf<number>({ path: MEMORY_PATH, table: "items" });
    await storage.setBatch([["a", 1], ["b", 2], ["c", 3]]);
    await storage.set("a", 10);
    expect((await storage.getEntries()).map(([id]) => id)).toEqual(["a", "b", "c"]);
    // A delete, then a set: the id goes to the end, as in a Map
    await storage.delete("a");
    await storage.set("a", 11);
    expect((await storage.getEntries()).map(([id]) => id)).toEqual(["b", "c", "a"]);
    expect(await storage.deleteBatch([])).toBe(0);
    await storage.setBatch([]);
  });
});

describe("SqliteStorage: the life cycle and the options", () => {
  it("checks the table name: it goes into the SQL text", () => {
    for (const name of ["users", "Users2", "a_b_c", "x".repeat(64)]) expect(checkTableName(name)).toBe(name);
    for (const name of ["", "1abc", "_hidden", "a-b", 'x"; DROP TABLE y; --', "sqlite_master", "SQLITE_x", "x".repeat(65), 42]) {
      expect(() => checkTableName(name)).toThrow(TypeError);
    }
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "a b" })).toThrow(TypeError);
    expect(() => new SqliteStorage({ path: "", table: "items" })).toThrow(/needs a path/);
  });

  it("throws after close(), and close() can run two times", async () => {
    const storage = new SqliteStorage<number>({ path: MEMORY_PATH, table: "items" });
    await storage.set("a", 1);
    await storage.close();
    await storage.close();
    await expect(storage.get("a")).rejects.toThrow(/is closed/);
    await expect(storage.set("a", 2)).rejects.toThrow(/is closed/);
    await storage.flush();
  });

  it("gives a new database for each storage in memory", async () => {
    const one = storageOf<number>({ path: MEMORY_PATH, table: "items" });
    const two = storageOf<number>({ path: MEMORY_PATH, table: "items" });
    await one.set("a", 1);
    expect(await two.has("a")).toBe(false);
    expect((await one.getChangesSince()).version).not.toBe((await two.getChangesSince()).version);
  });

  it("gives its metadata", async () => {
    const storage = storageOf<number>({ path: MEMORY_PATH, table: "items" });
    await storage.setBatch([["a", 1], ["b", 2]]);
    expect(await storage.getMetadata()).toEqual({ type: "custom", size: 2, stats: { backend: "sqlite", table: "items", memory: true } });
  });
});
