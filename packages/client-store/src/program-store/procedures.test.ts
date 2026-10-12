/**
 * The procedures of the program store (roadmap 3.2). The main case: a program of
 * procedure.define goes to a file, the process "restarts" (a new registry and a new store on the
 * same file), procedure.load defines it again, and the call gives the same result.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Client,
  ProcedureRegistry,
  allCoreProcedures,
  isDataDriven,
  metaProcedures,
  runtimeProgramOf,
} from "@procedures/client";
import { programStoreProcedures } from "./procedures.js";
import { attachProgramStore, getProgramStore } from "./attach.js";
import { FileProgramStore } from "./file.js";
import { MemoryProgramStore } from "./memory.js";
import type { ProgramStore } from "./types.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A process: a registry with the core, the meta-procedures and the store procedures, and a client on it. */
function startProcess(store?: ProgramStore): { client: Client; registry: ProcedureRegistry } {
  const registry = new ProcedureRegistry();
  for (const procedure of [...allCoreProcedures, ...metaProcedures, ...programStoreProcedures]) registry.register(procedure);
  if (store) attachProgramStore(registry, store);
  const transport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];
  return { client: new Client(transport).useRegistry(registry), registry };
}

const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });

async function define(client: Client, path: string[], aggregation: unknown, metadata?: Record<string, unknown>) {
  await client.exec({ $proc: ["procedure", "define"], input: { path, aggregation, ...(metadata ? { metadata } : {}) } });
}

describe("the program store procedures", () => {
  it("define, store, restart, load and call give the same result (a JSON file)", async () => {
    const folder = mkdtempSync(join(tmpdir(), "program-store-"));
    folders.push(folder);
    const file = join(folder, "programs.json");

    // The first process defines a program and stores it
    const first = startProcess(new FileProgramStore(file));
    await define(first.client, ["math", "addTen"], add({ $ref: "input.x" }, 10), { description: "Add ten" });
    expect(await first.client.exec(["math", "addTen"], { x: 5 })).toBe(15);
    expect(await first.client.exec(["procedure", "store"], { path: "math.addTen" })).toMatchObject({
      stored: true,
      path: ["math", "addTen"],
    });

    // A new process on the same file: the procedure is not there until the load
    const second = startProcess(new FileProgramStore(file));
    expect(second.registry.get(["math", "addTen"])).toBeUndefined();
    const loaded = await second.client.exec(["procedure", "load"], { all: true });
    expect(loaded).toMatchObject({ loaded: 1, paths: [["math", "addTen"]], conflicts: [] });

    const procedure = second.registry.get(["math", "addTen"])!;
    expect(await second.client.exec(["math", "addTen"], { x: 5 })).toBe(15);
    expect(procedure.metadata.description).toBe("Add ten");
    // A loaded program is runtime-defined and data-driven: a server with an expose rule limits its calls
    expect(runtimeProgramOf(procedure)).toEqual(add({ $ref: "input.x" }, 10));
    expect(isDataDriven(procedure)).toBe(true);
  });

  it("a loaded program runs as exec() runs it: a root $when does not apply, a list in the root input is a chain (DOC-3)", async () => {
    const store = new MemoryProgramStore();
    const program = {
      $proc: ["client", "identity"],
      input: { value: [add({ $ref: "input.x" }, 1), add(2, 2)] },
      $when: "$never",
    };
    const first = startProcess(store);
    await define(first.client, ["math", "both"], program);
    await first.client.exec(["procedure", "store"], { path: "math.both" });

    const second = startProcess(store);
    await second.client.exec(["procedure", "load"], { all: true });
    const viaStore = await second.client.exec(["math", "both"], { x: 1 });
    const viaExec = await second.client.exec({ ...program, input: { value: [add(1, 1), add(2, 2)] } });
    expect(viaStore).toEqual(viaExec);
    expect(viaStore).toMatchObject({ final: 4 });
  });

  it("fails with NOT_CONFIGURED without a store, and remote status says so", async () => {
    const { client, registry } = startProcess();
    expect(getProgramStore(registry)).toBeUndefined();
    await expect(client.exec(["procedure", "store"], { path: "client.add" })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(client.exec(["procedure", "load"], { all: true })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(client.exec(["procedure", "sync"], {})).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(await client.exec(["procedure", "remote"], { action: "status" })).toMatchObject({ configured: false });
  });

  it("stores only programs: a code procedure is NOT_A_PROGRAM", async () => {
    const { client } = startProcess(new MemoryProgramStore());
    await expect(client.exec(["procedure", "store"], { path: ["client", "add"] })).rejects.toMatchObject({ code: "NOT_A_PROGRAM" });
    await expect(client.exec(["procedure", "store"], { path: "no.such" })).rejects.toThrow("Procedure not found");
  });

  it("reports a stored program that would replace a code procedure as a conflict, and keeps the code", async () => {
    const store = new MemoryProgramStore();
    await store.put({
      key: "client.add",
      path: ["client", "add"],
      program: add(1, 1),
      storedAt: Date.now(),
    });
    const { client } = startProcess(store);
    const result = await client.exec<{ loaded: number; conflicts: Array<{ reason: string }> }>(["procedure", "load"], { path: "client.add" });
    expect(result.loaded).toBe(0);
    expect(result.conflicts[0]?.reason).toContain("code procedure");
    expect(await client.exec(["client", "add"], { a: 2, b: 3 })).toBe(5);
  });

  it("needs exactly one of path, prefix or all for a load", async () => {
    const { client } = startProcess(new MemoryProgramStore());
    await expect(client.exec(["procedure", "load"], {})).rejects.toThrow("exactly one");
    await expect(client.exec(["procedure", "load"], { all: true, prefix: "a" })).rejects.toThrow("exactly one");
  });

  it("syncs: push writes every program, pull defines the stored ones, both keeps the registry's version", async () => {
    const store = new MemoryProgramStore();
    const first = startProcess(store);
    await define(first.client, ["s", "one"], add(1, { $ref: "input.b" }));
    await define(first.client, ["s", "two"], add(2, { $ref: "input.b" }));
    expect(await first.client.exec(["procedure", "sync"], { direction: "push" })).toMatchObject({ pushed: 2, pulled: 0 });
    expect((await store.list()).map((p) => p.key)).toEqual(["s.one", "s.two"]);

    const second = startProcess(store);
    await define(second.client, ["s", "one"], add(100, { $ref: "input.b" }));
    const both = await second.client.exec<{ pushed: number; pulled: number }>(["procedure", "sync"], {});
    expect(both).toMatchObject({ pushed: 1, pulled: 1 });
    // The registry's version of s.one won, and s.two came from the store
    expect(await second.client.exec(["s", "one"], { b: 1 })).toBe(101);
    expect(await second.client.exec(["s", "two"], { b: 1 })).toBe(3);
    expect((await store.get("s.one"))?.program).toEqual(add(100, { $ref: "input.b" }));
  });

  it("remote: status names the kind; connect and disconnect are not implemented", async () => {
    const { client } = startProcess(new MemoryProgramStore());
    expect(await client.exec(["procedure", "remote"], { action: "status" })).toMatchObject({ configured: true, kind: "memory" });
    await expect(client.exec(["procedure", "remote"], { action: "connect" })).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    await expect(client.exec(["procedure", "remote"], { action: "disconnect" })).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });
});
