/**
 * The engine choice of SqliteStorage: `auto` and `node` use `node:sqlite`, and version 0.61.0 removed `sqljs`. The
 * tests also cover the share of a file in one process, a lock of another connection, two processes on one file, and
 * a read-only file.
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ms } from "@procedures/client";
import { MEMORY_PATH, SqliteStorage, isNodeSqliteAvailable, type SqliteStorageOptions } from "./storage.js";

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

describe("SqliteStorage: the engine choice", () => {
  it("node:sqlite is available on each supported Node.js (22.13 or later)", async () => {
    expect(await isNodeSqliteAvailable()).toBe(true);
  });

  it("auto and node use node:sqlite", async () => {
    const auto = storageOf<number>({ path: MEMORY_PATH, table: "items" });
    expect(auto.engine).toBe("auto");
    expect(await auto.getEngine()).toBe("node");
    const node = storageOf<number>({ path: MEMORY_PATH, table: "items", engine: "node" });
    expect(await node.getEngine()).toBe("node");
  });

  it("refuses the removed engine sqljs, and tells the engine to use", () => {
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "items", engine: "sqljs" as never })).toThrow(
      /The SQLite engine sqljs was removed in version 0\.61\.0: use auto or node/,
    );
  });

  it("refuses an unknown engine", () => {
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "items", engine: "native" as never })).toThrow(/Unknown SQLite engine "native"/);
  });

  it("refuses a busy timeout that is not a duration", () => {
    expect(() => new SqliteStorage({ path: MEMORY_PATH, table: "items", busyTimeout: 50 as never })).toThrow(/busyTimeout must be a duration/);
  });
});

describe("SqliteStorage: the storages of one file in one process", () => {
  it("the storages of one file share one open database, with auto and node", async () => {
    const path = tempDb();
    const first = storageOf<{ n: number }>({ path, table: "items", engine: "node" });
    await first.set("a", { n: 1 });
    const auto = storageOf<{ n: number }>({ path, table: "items", engine: "auto" });
    expect(await auto.getEngine()).toBe("node");
    expect(await auto.get("a")).toEqual({ n: 1 });
    await auto.set("b", { n: 2 });
    await auto.close();
    // The close of one storage does not close the database of the other storages
    expect(await first.getIds()).toEqual(["a", "b"]);
    await first.close();

    const later = storageOf<{ n: number }>({ path, table: "items" });
    expect(await later.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]);
  });

  it("flush() does no work and keeps the items", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items" });
    await storage.set("a", { n: 1 });
    await storage.flush();
    expect(await storage.get("a")).toEqual({ n: 1 });
  });
});

describe("SqliteStorage: locks and processes", () => {
  it("a write waits for the lock of another connection, and fails after the busy timeout", async () => {
    const path = tempDb();
    const storage = storageOf<{ n: number }>({ path, table: "items", engine: "node", busyTimeout: ms(50) });
    await storage.set("a", { n: 1 });
    const { openDatabase } = await import("@mark1russell7/sqlite");
    const other = openDatabase(path, { wal: false });
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
