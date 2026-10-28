/**
 * Each backend of the program store follows one contract: memory, a JSON file, a collection
 * storage (InMemoryStorage of client-collections) and IndexedDB (roadmap R45, with
 * `fake-indexeddb`). The file store also keeps the programs of two processes and never writes
 * over a file that it cannot read.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryStorage } from "@procedures/collections";
import { VersionConflictError } from "@procedures/client";
import { MemoryProgramStore } from "./memory.js";
import { FileProgramStore } from "./file.js";
import { CollectionProgramStore } from "./collection.js";
import { IndexedDbProgramStore } from "../indexeddb/program-store.js";
import { storedProgramVersion, type ProgramStore, type StoredProgram } from "./types.js";

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
  ["CollectionProgramStore", () => new CollectionProgramStore(new InMemoryStorage<StoredProgram>({ versionOf: storedProgramVersion }))],
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

      expect(await store.get("reports.weekly")).toEqual({ ...program("reports.weekly"), version: expect.anything() });
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
      await expect(store.put({ ...program("a.b"), name: 3 as never })).rejects.toThrow("name");
      await expect(store.put({ ...program("a.b"), version: {} as never })).rejects.toThrow("version");
    });

    it("keeps the name and the description, and sets a new version on each put (decision D11)", async () => {
      const store = make();
      await store.put({ ...program("v.one"), name: "One", description: "The first program", version: "ignored" });
      const first = await store.get("v.one");
      expect(first).toMatchObject({ name: "One", description: "The first program" });
      expect(first?.version).toBeDefined();
      expect(first?.version).not.toBe("ignored");
      await store.put(program("v.one", 2));
      const second = await store.get("v.one");
      expect(second?.version).toBeDefined();
      expect(second?.version).not.toEqual(first?.version);
      expect((await store.list("v"))[0]?.version).toEqual(second?.version);
      await store.close?.();
    });

    it("writes with the expected version, and refuses another version with VersionConflictError", async () => {
      const store = make();
      // null expects no program: the first write
      await store.put(program("v.two", 1), { expectedVersion: null });
      const current = (await store.get("v.two"))!;
      await store.put(program("v.two", 2), { expectedVersion: current.version! });
      const next = (await store.get("v.two"))!;
      expect(next.program).toEqual(program("v.two", 2).program);

      // The old version, a version of a missing program and null for a present program conflict
      const stale = store.put(program("v.two", 3), { expectedVersion: current.version! });
      await expect(stale).rejects.toBeInstanceOf(VersionConflictError);
      await expect(store.put(program("v.two", 3), { expectedVersion: current.version! })).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        conflicts: [{ id: "v.two", found: true, version: String(next.version) }],
      });
      await expect(store.put(program("v.missing"), { expectedVersion: "1" })).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        conflicts: [{ id: "v.missing", found: false, version: null }],
      });
      await expect(store.put(program("v.two", 3), { expectedVersion: null })).rejects.toBeInstanceOf(VersionConflictError);
      // A conflict changes nothing
      expect(await store.get("v.two")).toEqual(next);
      expect(await store.get("v.missing")).toBeUndefined();
      await store.close?.();
    });

    it("deletes with the expected version, and refuses another version", async () => {
      const store = make();
      await store.put(program("v.three"));
      const current = (await store.get("v.three"))!;
      await expect(store.delete("v.three", { expectedVersion: "no such version" })).rejects.toBeInstanceOf(VersionConflictError);
      expect(await store.get("v.three")).toEqual(current);
      expect(await store.delete("v.three", { expectedVersion: current.version! })).toBe(true);
      // null expects no program: a delete of a missing program changes nothing
      expect(await store.delete("v.three", { expectedVersion: null })).toBe(false);
      await store.close?.();
    });

    it("writes without the option as before: the last write wins", async () => {
      const store = make();
      await store.put(program("v.four", 1));
      await store.put(program("v.four", 2));
      await store.put(program("v.four", 3), {});
      expect((await store.get("v.four"))?.program).toEqual(program("v.four", 3).program);
      expect(await store.delete("v.four", {})).toBe(true);
      await store.close?.();
    });
  });
}

describe("CollectionProgramStore on a storage without versionOf", () => {
  it("writes without expectedVersion, and refuses a write with it: the storage never ignores it", async () => {
    const store = new CollectionProgramStore(new InMemoryStorage<StoredProgram>());
    await store.put(program("a.b"));
    expect((await store.get("a.b"))?.version).toMatch(/^1-/);
    await expect(store.put(program("a.b"), { expectedVersion: "1" })).rejects.toMatchObject({ code: "PRECONDITION_NOT_SUPPORTED" });
    await expect(store.delete("a.b", { expectedVersion: "1" })).rejects.toMatchObject({ code: "PRECONDITION_NOT_SUPPORTED" });
    expect(await store.delete("a.b")).toBe(true);
  });
});

describe("the version counters", () => {
  it("MemoryProgramStore and FileProgramStore do not give an old version again after a delete", async () => {
    for (const store of [new MemoryProgramStore(), new FileProgramStore(tempFile())]) {
      await store.put(program("a.b"));
      const first = (await store.get("a.b"))!.version;
      await store.delete("a.b");
      await store.put(program("a.b"));
      expect((await store.get("a.b"))!.version, store.kind).not.toEqual(first);
    }
  });

  it("FileProgramStore starts the count from the versions of a file of an older release", async () => {
    const path = tempFile();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, programs: { "a.b": { ...program("a.b"), version: 7 }, "a.c": program("a.c") } }));
    const store = new FileProgramStore(path);
    await store.put(program("a.c"));
    expect((await store.get("a.c"))?.version).toBe(8);
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ schemaVersion: 1, counter: 8 });
  });
});

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

  it("removes a stale lock, and removes only its own lock at the end (audit pass 2)", async () => {
    const path = tempFile();
    const store = new FileProgramStore(path);
    const lock = `${path}.lock`;
    // A stale lock of a writer that stopped
    mkdirSync(dirname(lock), { recursive: true });
    writeFileSync(lock, "a writer that stopped");
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    await store.put(program("s.one"));
    expect(existsSync(lock)).toBe(false);
    // Another writer takes the lock while this writer works: this writer leaves that lock
    const withLock = (store as unknown as { withLock(work: () => Promise<void>): Promise<void> }).withLock.bind(store);
    await withLock(async () => {
      writeFileSync(lock, "another writer");
    });
    expect(readFileSync(lock, "utf8")).toBe("another writer");
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
