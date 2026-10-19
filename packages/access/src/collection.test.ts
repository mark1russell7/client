/**
 * The rules of the rows of a collection from the access lists (roadmap CLI-41). `accessAdmitItem`
 * gives the rule of the rows, and `accessWriteGuard` gives the guard of the writes. The
 * collection procedures apply them to each read and each write.
 */
import { describe, it, expect } from "vitest";
import { createCollectionProcedures, invokeProcedure, outputValue, type CollectionStorage, type Principal, type RepositoryProvider } from "@procedures/client";
import { Access, accessAdmitItem, accessWriteGuard, type AccessList, type AccessLists } from "./index.js";

/** A storage of a Map. */
class MapStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
  }
  async getChangesSince() {
    return { version: "1", full: true, changed: [...this.data.entries()], deleted: [] };
  }
  async find(predicate: (item: unknown) => boolean) {
    return [...this.data.values()].filter(predicate);
  }
  async has(id: string) {
    return this.data.has(id);
  }
  async size() {
    return this.data.size;
  }
  async set(id: string, value: unknown) {
    this.data.set(id, value);
  }
  async delete(id: string) {
    return this.data.delete(id);
  }
  async clear() {
    this.data.clear();
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) this.data.set(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (this.data.delete(id)) count++;
    return count;
  }
  async close() {}
}

/**
 * The lists of the scopes. On `board:b1`, Ana reads and writes. Each signed-in user reads the
 * documents with `public`, and writes and deletes the documents that it made (`by`).
 */
const LISTS: AccessLists = new Map<string, AccessList>([
  [
    "board:b1",
    {
      owner: "user:u_mark",
      access: [
        { principal: "user:u_ana", rights: ["write"] },
        { principal: "signed-in", rights: ["read"], when: { public: true } },
        { principal: "signed-in", rights: ["write"], when: { mine: true } },
      ],
    },
  ],
]);

/** The evaluator of the conditions of the lists: `public` and `mine` over `doc`, and over `prev` for a delete. */
const evaluate = (condition: unknown, vars: Readonly<Record<string, unknown>>): boolean => {
  const c = condition as { public?: boolean; mine?: boolean };
  const user = (vars["principal"] as { user: unknown }).user;
  const doc = vars["doc"] as Record<string, unknown> | null;
  const prev = vars["prev"] as Record<string, unknown> | null;
  if (c.public) return doc?.["public"] === true;
  if (c.mine) {
    if (vars["op"] === "delete") return prev?.["by"] === user;
    return doc?.["by"] === user && (prev === null || prev["by"] === user);
  }
  return false;
};

const access = new Access({ evaluate });
const scopeOfDoc = (doc: unknown): string | undefined => (doc as { _scope?: string } | null)?._scope;
const admission = {
  admit: accessAdmitItem({ access, lists: () => LISTS, scopeOf: (row) => scopeOfDoc((row as { value: unknown }).value), docOf: (row) => (row as { value: unknown }).value }),
  guard: accessWriteGuard({ access, lists: () => LISTS, scopeOf: scopeOfDoc }),
};

const mark: Principal = { id: "u_mark", via: "better-auth" };
const ana: Principal = { id: "u_ana", via: "better-auth" };
const zoe: Principal = { id: "u_zoe", via: "better-auth" };

/** The procedures of "notes" with the rules of the access lists, on a storage with four notes. */
function host() {
  const storage = new MapStorage();
  storage.data.set("n1", { _scope: "board:b1", by: "u_ana", text: "private" });
  storage.data.set("n2", { _scope: "board:b1", by: "u_mark", text: "public", public: true });
  storage.data.set("n3", { _scope: "board:b1", by: "u_zoe", text: "zoe's" });
  storage.data.set("n4", { by: "u_mark", text: "no scope" });
  const procedures = createCollectionProcedures("notes", { admission });
  const repository: RepositoryProvider = { getStorage: <T>() => storage as unknown as CollectionStorage<T>, hasCollection: (name) => name === "notes" };
  const run = async (operation: string, input: unknown, principal: Principal): Promise<unknown> => {
    const procedure = procedures.find((candidate) => candidate.path[2] === operation)!;
    return outputValue(await invokeProcedure(procedure, input, { repository, principal }), procedure.path);
  };
  return { run, storage };
}

/** The error of a call. */
async function errorOf(call: Promise<unknown>): Promise<Error & { code?: string; reason?: string }> {
  try {
    await call;
  } catch (error) {
    return error as Error & { code?: string; reason?: string };
  }
  throw new Error("the call did not fail");
}

describe("the rule of the rows from the access lists (CLI-41)", () => {
  it("gives each subject only the rows that it can read, with the when conditions over the document", async () => {
    const { run } = host();
    // Mark owns the board, and Ana has write (and so read). A note without a scope is for nobody.
    expect(await run("ids", {}, mark)).toEqual(["n1", "n2", "n3"]);
    expect(await run("ids", {}, ana)).toEqual(["n1", "n2", "n3"]);
    // Zoe reads the public note, and her own note: the condition `mine` gives write, and write implies read
    expect(await run("ids", {}, zoe)).toEqual(["n2", "n3"]);
    expect(await run("get", { id: "n1" }, zoe)).toBeUndefined();
    expect(await run("get", { id: "n3" }, zoe)).toMatchObject({ text: "zoe's" });
    expect(await run("find", { selector: { by: "u_ana" } }, zoe)).toEqual([]);
    expect(await run("changes", {}, zoe)).toMatchObject({ full: true, changed: [{ id: "n2" }, { id: "n3" }] });
    expect(await run("size", {}, zoe)).toBe(2);
  });
});

describe("the guard of the writes from the access lists (CLI-41)", () => {
  it("permits the writes of the right write, and the writes that a when condition permits", async () => {
    const { run, storage } = host();
    await run("set", { id: "n1", value: { _scope: "board:b1", by: "u_ana", text: "edited" } }, ana);
    // Zoe has no write on the board, but the condition `mine` permits her own notes
    await run("patch", { id: "n3", fields: { text: "zoe's, edited" } }, zoe);
    await run("set", { id: "z2", value: { _scope: "board:b1", by: "u_zoe" } }, zoe);
    expect(await run("delete", { id: "z2" }, zoe)).toBe(true);
    expect(storage.data.get("n1")).toMatchObject({ text: "edited" });
    expect(storage.data.get("n3")).toMatchObject({ text: "zoe's, edited" });
    expect(storage.data.has("z2")).toBe(false);
  });

  it("refuses with FORBIDDEN, and the storage does not change", async () => {
    const refused: Array<[string, unknown]> = [
      // A note of another user, a note for another user, and a note that Zoe takes from Ana
      ["set", { id: "n1", value: { _scope: "board:b1", by: "u_zoe" } }],
      ["set", { id: "z3", value: { _scope: "board:b1", by: "u_ana" } }],
      ["patch", { id: "n1", fields: { text: "zoe was here" } }],
      ["patch", { id: "n3", fields: { by: "u_ana" } }],
      ["delete", { id: "n1" }],
      // A document without a scope, and a delete of a missing id
      ["set", { id: "z4", value: { by: "u_zoe" } }],
      ["delete", { id: "missing" }],
      ["deleteBatch", { ids: ["n3", "n1"] }],
      ["clear", {}],
    ];
    for (const [operation, input] of refused) {
      const { run, storage } = host();
      const before = structuredClone([...storage.data.entries()]);
      const error = await errorOf(run(operation, input, zoe));
      expect(error.code, `${operation} ${JSON.stringify(input)}`).toBe("FORBIDDEN");
      expect(error.reason).toBe("write-not-allowed");
      expect([...storage.data.entries()]).toEqual(before);
    }
  });

  it("needs the right on the two scopes for a move", async () => {
    const { run, storage } = host();
    storage.data.set("m1", { _scope: "board:other", by: "u_ana" });
    const error = await errorOf(run("set", { id: "m1", value: { _scope: "board:b1", by: "u_ana" } }, ana));
    expect(error.reason).toBe("write-not-allowed");
    // Mark owns board:b1, but board:other has no list and no fallback
    expect((await errorOf(run("patch", { id: "n2", fields: { _scope: "board:other" } }, mark))).reason).toBe("write-not-allowed");
  });
});
