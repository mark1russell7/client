/**
 * Node.js 26.11 renamed the class `DatabaseSync` of `node:sqlite` to `Database`, and kept the old
 * name as a deprecated alias (DEP0210). The storage takes `Database` first. The mock gives only
 * the new name, so this test runs on each Node.js version with `node:sqlite`.
 */

import { describe, expect, it, vi } from "vitest";
import { MEMORY_PATH, SqliteStorage, isNodeSqliteAvailable } from "./storage.js";

vi.mock("node:sqlite", async (importOriginal) => {
  try {
    const actual = await importOriginal<{ DatabaseSync: unknown }>();
    return { Database: actual.DatabaseSync };
  } catch {
    return {};
  }
});

/** True when the real module loads (Node.js 22.13 or later): then the mock has the class `Database`. */
const real = typeof ((await import("node:sqlite")) as { Database?: unknown }).Database === "function";

describe.runIf(real)("SqliteStorage with the class name Database of node:sqlite", () => {
  it("uses the class Database", async () => {
    expect(await isNodeSqliteAvailable()).toBe(true);
    const storage = new SqliteStorage<number>({ path: MEMORY_PATH, table: "items", engine: "node" });
    await storage.set("a", 1);
    expect(await storage.get("a")).toBe(1);
    expect(await storage.getEngine()).toBe("node");
    await storage.close();
  });
});

describe.runIf(!real)("SqliteStorage with a module of node:sqlite that has no database class", () => {
  it("does not use the module", async () => {
    expect(await isNodeSqliteAvailable()).toBe(false);
  });
});
