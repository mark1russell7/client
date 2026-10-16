import { describe, expect, it } from "vitest";
import { IndexedDbProgramStore, MemoryProgramStore } from "@procedures/store/indexeddb";
import { SAVED_PROGRAMS_DATABASE, nameProblem, openSavedPrograms, savedPrograms, toStoredProgram, type StoreModule } from "./saved-programs";

const call = { $proc: ["client", "add"], input: { a: 1, b: 2 } };

describe("the saved programs of the Composer (roadmap R45)", () => {
  it("uses a store in memory where IndexedDB is missing, as in Node", async () => {
    const { store, durable } = await openSavedPrograms();
    expect(durable).toBe(false);
    expect(store.kind).toBe("memory");
    const built = toStoredProgram("reports.weekly", call, 1);
    if (!built.ok) throw new Error(built.reason);
    await store.put(built.record);
    expect((await store.list()).map((p) => p.key)).toEqual(["reports.weekly"]);
    // The page opens its store one time
    expect(await savedPrograms()).toBe(await savedPrograms());
  });

  it("uses IndexedDB when the browser opens the database, and the memory store when it refuses", async () => {
    const opened: string[] = [];
    class Refused extends IndexedDbProgramStore {
      constructor(name?: string) {
        super(name);
        opened.push(name ?? "");
      }
      override list(): never {
        throw new Error("the browser refuses IndexedDB");
      }
    }
    class Accepted extends IndexedDbProgramStore {
      override list(): Promise<never[]> {
        return Promise.resolve([]);
      }
    }
    const moduleWith = (store: typeof IndexedDbProgramStore): StoreModule => ({
      IndexedDbProgramStore: store,
      MemoryProgramStore,
      hasIndexedDb: () => true,
    });

    const refused = await openSavedPrograms(async () => moduleWith(Refused));
    expect(refused.durable).toBe(false);
    expect(opened).toEqual([SAVED_PROGRAMS_DATABASE]);

    const accepted = await openSavedPrograms(async () => moduleWith(Accepted));
    expect(accepted.durable).toBe(true);
    expect(accepted.store.kind).toBe("indexeddb");
  });

  it("checks the name and the root of the program", () => {
    expect(nameProblem("reports.weekly")).toBeNull();
    expect(nameProblem("  my-program_2 ")).toBeNull();
    expect(nameProblem("")).toMatch(/Type a name/);
    expect(nameProblem("a..b")).toMatch(/with a dot between the parts/);
    expect(nameProblem("a b")).toMatch(/with a dot between the parts/);
    expect(nameProblem("x".repeat(101))).toMatch(/100 characters or fewer/);

    expect(toStoredProgram(" a.b ", call, 5)).toEqual({ ok: true, record: { key: "a.b", path: ["a", "b"], program: call, storedAt: 5 } });
    expect(toStoredProgram("", call)).toMatchObject({ ok: false });
    for (const program of [null, 42, "text", [call], { $ref: "x" }]) {
      expect(toStoredProgram("a", program)).toMatchObject({ ok: false, reason: expect.stringMatching(/starts with a call/) });
    }
  });
});
