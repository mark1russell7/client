/**
 * `ArtifactDbStorage`: a collection storage over the db of an artifact page.
 *
 * The file applies the contract of `CollectionStorage` to a db in memory. The db in memory keeps
 * the path grammar of the db of a page. Each body is a JSON object, and a list has the order of
 * the ids. Then the file tests the escape of the ids, the documents of another writer and
 * the codes of the errors. It also tests a `HybridStorage` with this storage as its remote. An
 * offline queue drains, and two local copies converge.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { InMemoryStorage } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { ms } from "@procedures/client";
import { ArtifactDbError, ArtifactDbStorage, artifactDbId, artifactDbSegment, type ArtifactDb, type ArtifactDbData, type ArtifactDbDocSnapshot } from "./artifact-db.js";
import { HybridStorage } from "./hybrid.js";
import { MemoryQueueStore } from "./queue.js";

const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;

/** An error of the db with its code, as the db of a page gives it. */
const dbError = (code: string, message: string): Error => Object.assign(new Error(`${code}: ${message}`), { code });

/**
 * A db of an artifact page in memory. `down` makes each call fail with the code `unavailable`,
 * as a page with no network. `calls` counts the calls.
 */
class MemoryArtifactDb implements ArtifactDb {
  readonly files = new Map<string, string>();
  down = false;
  calls = 0;

  private check(path: string, kind: "doc" | "collection"): string[] {
    const parts = path.split("/");
    for (const part of parts) if (part === "" || part === "." || part === ".." || !SEGMENT.test(part) || part.length > 200) throw new TypeError(`The segment "${part}" breaks the path grammar.`);
    if ((parts.length % 2 === 0) !== (kind === "doc")) throw new TypeError(`"${path}" is not a ${kind} path.`);
    return parts;
  }

  private async call(): Promise<void> {
    this.calls += 1;
    await Promise.resolve();
    if (this.down) throw dbError("unavailable", "The host does not answer.");
  }

  private snapshot(path: string): ArtifactDbDocSnapshot {
    const text = this.files.get(path);
    const body = text === undefined ? undefined : (JSON.parse(text) as ArtifactDbData);
    return { id: path.slice(path.lastIndexOf("/") + 1), exists: text !== undefined, data: () => body };
  }

  doc(path: string) {
    this.check(path, "doc");
    return {
      get: async () => {
        await this.call();
        return this.snapshot(path);
      },
      set: async (data: ArtifactDbData) => {
        await this.call();
        if (data === null || typeof data !== "object" || Array.isArray(data)) throw dbError("invalid_argument", "The body of a document must be a JSON object.");
        this.files.set(path, JSON.stringify(data));
      },
      delete: async () => {
        await this.call();
        this.files.delete(path);
      },
    };
  }

  collection(path: string) {
    const depth = this.check(path, "collection").length + 1;
    return {
      get: async () => {
        await this.call();
        const paths = [...this.files.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === depth);
        return { docs: paths.map((key) => this.snapshot(key)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
      },
    };
  }
}

describeCollectionStorageContract(
  "ArtifactDbStorage (a db of a page in memory)",
  { create: () => new ArtifactDbStorage<ContractItem>(new MemoryArtifactDb(), { collection: "items" }) },
  { describe, it },
);

describe("ArtifactDbStorage: the ids, the documents and the errors", () => {
  it("the segment of each id is in the path grammar, and the id comes back from it", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 30 }), (id) => {
        const segment = artifactDbSegment(id);
        expect(segment).toMatch(SEGMENT);
        expect(segment === "." || segment === "..").toBe(false);
        expect(artifactDbId(segment)).toBe(id);
      }),
    );
    expect(artifactDbSegment("met.winter.storm")).toBe("met.winter.storm");
    expect(artifactDbSegment("a b/c~")).toBe("a~20b~2Fc~7E");
    expect(artifactDbSegment("..")).toBe("~2E~2E");
    expect(artifactDbId("~4")).toBeUndefined();
    expect(artifactDbId("~FF")).toBeUndefined();
    expect(() => artifactDbSegment("x".repeat(201))).toThrow(TypeError);
  });

  it("an id with characters outside the grammar is one document, and a list gives the id back", async () => {
    const db = new MemoryArtifactDb();
    const storage = new ArtifactDbStorage<{ n: number }>(db, { collection: "notes" });
    await storage.set("a/b c", { n: 1 });
    expect([...db.files.keys()]).toEqual(["notes/a~2Fb~20c"]);
    expect(await storage.getEntries()).toEqual([["a/b c", { n: 1 }]]);
  });

  it("a document of another writer is not an item, and the storage does not delete it", async () => {
    const db = new MemoryArtifactDb();
    db.files.set("notes/other", JSON.stringify({ text: "by hand" }));
    const storage = new ArtifactDbStorage<{ n: number }>(db, { collection: "notes" });
    await storage.set("mine", { n: 1 });
    expect(await storage.getIds()).toEqual(["mine"]);
    expect(await storage.get("other")).toBeUndefined();
    expect(await storage.has("other")).toBe(false);
    expect(await storage.delete("other")).toBe(false);
    await storage.clear();
    expect([...db.files.keys()]).toEqual(["notes/other"]);
  });

  it("a collection path that is not correct and a db without doc() are refused", () => {
    const db = new MemoryArtifactDb();
    expect(() => new ArtifactDbStorage(db, { collection: "a/b" })).toThrow(TypeError);
    expect(() => new ArtifactDbStorage(db, { collection: "a b" })).toThrow(TypeError);
    expect(() => new ArtifactDbStorage({} as ArtifactDb, { collection: "a" })).toThrow(TypeError);
    expect(new ArtifactDbStorage(db, { collection: "a/b/c" }).collection).toBe("a/b/c");
  });

  it("an unavailable db gives a retryable error, and a refusal gives VALIDATION_ERROR", async () => {
    const db = new MemoryArtifactDb();
    const storage = new ArtifactDbStorage<unknown>(db, { collection: "notes" });
    db.down = true;
    const down = await storage.set("a", { n: 1 }).catch((error: unknown) => error);
    expect(down).toBeInstanceOf(ArtifactDbError);
    expect(down).toMatchObject({ code: "UNAVAILABLE", retryable: true, dbCode: "unavailable" });
    db.down = false;
    const refusing: ArtifactDb = {
      doc: (path) => ({ ...db.doc(path), set: async () => Promise.reject(dbError("invalid_argument", "refused")) }),
      collection: (path) => db.collection(path),
    };
    const refused = await new ArtifactDbStorage<unknown>(refusing, { collection: "notes" }).set("a", { n: 1 }).catch((error: unknown) => error);
    expect(refused).toMatchObject({ code: "VALIDATION_ERROR", retryable: false });
  });

  it("a value that JSON cannot keep is refused with a TypeError", async () => {
    const storage = new ArtifactDbStorage<unknown>(new MemoryArtifactDb(), { collection: "notes" });
    await expect(storage.set("a", undefined)).rejects.toThrow(TypeError);
  });
});

type Tick = { id: string; at: number };

/** A `HybridStorage` in write-back mode over a db of a page, with no timers: the test starts each sync. */
function hybridOver(db: ArtifactDb, queue = new MemoryQueueStore()): HybridStorage<Tick> {
  return new HybridStorage<Tick>(new ArtifactDbStorage<Tick>(db, { collection: "ticks" }), {
    mode: "write-back",
    syncInterval: ms(0),
    local: new InMemoryStorage<Tick>(),
    queueStore: queue,
  });
}

describe("ArtifactDbStorage as the remote of a HybridStorage", () => {
  it("offline, the writes stay local and wait in the queue. Online, the queue drains and the db has the same items", async () => {
    const db = new MemoryArtifactDb();
    db.down = true;
    const queue = new MemoryQueueStore();
    const storage = hybridOver(db, queue);
    await storage.set("a", { id: "a", at: 1 });
    await storage.set("b", { id: "b", at: 2 });
    await storage.delete("a");
    await expect(storage.sync()).rejects.toMatchObject({ retryable: true });
    expect(await storage.getEntries()).toEqual([["b", { id: "b", at: 2 }]]);
    expect(storage.getPendingOpsCount()).toBeGreaterThan(0);
    expect(db.files.size).toBe(0);

    db.down = false;
    await storage.sync();
    expect(storage.getPendingOpsCount()).toBe(0);
    const remote = new ArtifactDbStorage<Tick>(db, { collection: "ticks" });
    expect(await remote.getEntries()).toEqual(await storage.getEntries());
    await storage.close();
  });

  it("two local copies over one db converge", async () => {
    const db = new MemoryArtifactDb();
    const phone = hybridOver(db);
    const desk = hybridOver(db);
    await phone.set("a", { id: "a", at: 1 });
    await desk.set("b", { id: "b", at: 2 });
    await phone.sync();
    await desk.sync();
    await phone.sync();
    expect((await phone.getIds()).sort()).toEqual(["a", "b"]);
    expect((await desk.getIds()).sort()).toEqual(["a", "b"]);

    await desk.delete("a");
    await desk.sync();
    await phone.sync();
    expect(await phone.getEntries()).toEqual([["b", { id: "b", at: 2 }]]);
    expect(await desk.getEntries()).toEqual(await phone.getEntries());
    await phone.close();
    await desk.close();
  });
});
