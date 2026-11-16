/**
 * SqliteStorage on a Node.js without `node:sqlite`: Node.js 22.0 to 22.12, or an environment
 * where the import fails. The mock makes the import of `node:sqlite` fail. Then the engine `auto`
 * uses sql.js, and the engine `node` gives a clear error.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeCollectionStorageContract, type ContractItem, type ContractTestApi } from "@procedures/collections/testing";
import { MEMORY_PATH, SqliteStorage, isNodeSqliteAvailable } from "./storage.js";

vi.mock("node:sqlite", () => {
  throw new Error("No such built-in module: node:sqlite");
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "client-sqlite-fallback-"));
  dirs.push(dir);
  return join(dir, "items.db");
}

describe("SqliteStorage when the import of node:sqlite fails", () => {
  it("isNodeSqliteAvailable() gives false", async () => {
    expect(await isNodeSqliteAvailable()).toBe(false);
  });

  it("the engine auto uses sql.js, for a file and in memory", async () => {
    const path = tempDb();
    const file = new SqliteStorage<{ n: number }>({ path, table: "items" });
    expect(await file.getEngine()).toBe("sqljs");
    await file.set("a", { n: 1 });
    await file.close();
    expect(existsSync(path)).toBe(true);
    const again = new SqliteStorage<{ n: number }>({ path, table: "items" });
    expect(await again.get("a")).toEqual({ n: 1 });
    await again.close();
    const memory = new SqliteStorage<number>({ path: MEMORY_PATH, table: "items" });
    expect(await memory.getEngine()).toBe("sqljs");
    await memory.close();
  });

  it("the engine node gives an error that names the Node.js version, to each operation", async () => {
    const storage = new SqliteStorage<number>({ path: tempDb(), table: "items", engine: "node" });
    await expect(storage.get("a")).rejects.toThrow(/needs node:sqlite.*Node\.js 22\.13 or later/);
    await expect(storage.set("a", 1)).rejects.toThrow(/needs node:sqlite/);
    await expect(storage.getEngine()).rejects.toThrow(/needs node:sqlite/);
    // close() of a storage whose open failed resolves
    await storage.close();
  });

  it("the engine auto gives one DeprecationWarning in a process, with the Node.js version", async () => {
    // A new copy of the module starts with no warning. The mock of node:sqlite stays.
    vi.resetModules();
    const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      const engines = await import("./engines.js");
      for (let open = 0; open < 2; open += 1) {
        (await engines.openEngine(engines.MEMORY_PATH, "auto", 1_000)).close();
      }
      const warnings = emit.mock.calls
        .filter(([, options]) => typeof options === "object" && options.code === "PROCEDURES_SQLITE_SQLJS")
        .map(([warning]) => String(warning));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`This Node.js (${process.version}) has no node:sqlite`);
      expect(warnings[0]).toMatch(/0\.61\.0/);
    } finally {
      emit.mockRestore();
    }
  });
});

// sql.js writes the whole file after each write. On a Windows runner the case of 80 random writes
// takes 2.8 s to 4.1 s of the default limit of 5 s (Nightly, 11-09 to 11-15), and it failed twice at 5 s.
const CONTRACT_CASE_MS = 30_000;
const itWithLimit: ContractTestApi["it"] = (name, body) => it(name, body, CONTRACT_CASE_MS);

// The fallback keeps the contract
describeCollectionStorageContract(
  "SqliteStorage (auto without node:sqlite) in a file",
  {
    create: () => new SqliteStorage<ContractItem>({ path: tempDb(), table: "items" }),
    createWithVersions: (versionOf) => new SqliteStorage<ContractItem>({ path: tempDb(), table: "items", versionOf }),
  },
  { describe, it: itWithLimit },
);
