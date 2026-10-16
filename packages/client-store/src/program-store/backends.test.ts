/**
 * Each backend of the program store follows one contract: memory, a JSON file, a collection
 * storage (InMemoryStorage of client-collections) and IndexedDB (roadmap R45, with
 * `fake-indexeddb`). The file store also keeps the programs of two processes and never writes
 * over a file that it cannot read.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryStorage } from "@procedures/collections";
import { MemoryProgramStore } from "./memory.js";
import { FileProgramStore } from "./file.js";
import { CollectionProgramStore } from "./collection.js";
import { IndexedDbProgramStore } from "../indexeddb/program-store.js";
import type { ProgramStore, StoredProgram } from "./types.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function tempFile(): string {
  const folder = mkdtempSync(join(tmpdir(), "program-store-"));
  folders.push(folder);
  return join(folder, "nested", "programs.json");
}

function program(key: string, a = 1): StoredProgram {
  return {
    key,
    path: key.split("."),
    program: { $proc: ["client", "add"], input: { a, b: { $ref: "input.b" } } },
    metadata: { description: `The program ${key}` },
    storedAt: 1_700_000_000_000,
  };
}

const backends: Array<[string, () => ProgramStore]> = [
  ["MemoryProgramStore", () => new MemoryProgramStore()],
  ["FileProgramStore", () => new FileProgramStore(tempFile())],
  ["CollectionProgramStore", () => new CollectionProgramStore(new InMemoryStorage<StoredProgram>())],
  ["IndexedDbProgramStore", () => new IndexedDbProgramStore("programs", { indexedDB: new IDBFactory() })],
];

for (const [name, make] of backends) {
  describe(`${name} follows the ProgramStore contract`, () => {
    it("writes, reads, lists by prefix in key order, and deletes", async () => {
      const store = make();
      await store.put(program("reports.weekly"));
      await store.put(program("reports.daily"));
      await store.put(program("reportsx.other"));
      await store.put(program("reports"));

      expect(await store.get("reports.weekly")).toEqual(program("reports.weekly"));
      expect(await store.get("missing")).toBeUndefined();
      expect((await store.list("reports")).map((p) => p.key)).toEqual(["reports", "reports.daily", "reports.weekly"]);
      expect((await store.list()).map((p) => p.key)).toEqual(["reports", "reports.daily", "reports.weekly", "reportsx.other"]);

      expect(await store.delete("reports.daily")).toBe(true);
      expect(await store.delete("reports.daily")).toBe(false);
      expect(await store.get("reports.daily")).toBeUndefined();
      await store.close?.();
    });

    it("replaces the program of a key", async () => {
      const store = make();
      await store.put(program("a.b", 1));
      await store.put(program("a.b", 2));
      expect((await store.get("a.b"))?.program).toEqual(program("a.b", 2).program);
      expect(await store.list()).toHaveLength(1);
    });

    it("gives copies: a caller that changes a result does not change the store", async () => {
      const store = make();
      const record = program("a.b");
      await store.put(record);
      record.metadata!["description"] = "changed after put";
      const read = await store.get("a.b");
      read!.metadata!["description"] = "changed after get";
      expect((await store.get("a.b"))?.metadata).toEqual({ description: "The program a.b" });
    });

    it("refuses a record with a wrong shape", async () => {
      const store = make();
      await expect(store.put({ ...program("a.b"), key: "x.y" })).rejects.toThrow("key");
      await expect(store.put({ ...program("a.b"), program: { input: 1 } as never })).rejects.toThrow("procedure ref");
      await expect(store.put({ ...program("a.b"), path: [] })).rejects.toThrow("path");
    });
  });
}

describe("FileProgramStore", () => {
  it("shares the file between two stores, as between two processes", async () => {
    const path = tempFile();
    const one = new FileProgramStore(path);
    const two = new FileProgramStore(path);
    await one.put(program("a.one"));
    await two.put(program("a.two"));
    expect((await one.list()).map((p) => p.key)).toEqual(["a.one", "a.two"]);
  });

  it("keeps every program of concurrent writes from two stores", async () => {
    const path = tempFile();
    const one = new FileProgramStore(path);
    const two = new FileProgramStore(path);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? one : two).put(program(`c.p${String(i).padStart(2, "0")}`)))
    );
    expect(await one.list("c")).toHaveLength(10);
    expect(existsSync(`${path}.lock`)).toBe(false);
  }, 30_000);

  it("is empty before the first write, and does not write over a file that is not JSON", async () => {
    const path = tempFile();
    const store = new FileProgramStore(path);
    expect(await store.list()).toEqual([]);
    await store.put(program("a.b"));
    writeFileSync(path, "{ not json");
    await expect(store.list()).rejects.toThrow("not valid JSON");
    await expect(store.put(program("a.c"))).rejects.toThrow("not valid JSON");
    expect(readFileSync(path, "utf8")).toBe("{ not json");
  });
});
