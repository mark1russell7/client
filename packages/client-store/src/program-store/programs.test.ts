/**
 * The procedures of the saved programs of a tenant (AG1-B): `programs.save`, `get`, `list` and
 * `remove` over a store of each partition. The tests pin the isolation of two tenants, the refusal
 * of a resolver, the versions, the effects, and the read-only capability: get and list work, save
 * and remove are refused, and a saved program that writes is refused when it runs.
 */

import { describe, it, expect } from "vitest";
import {
  Client,
  createProcedure,
  createRegistry,
  effectsOf,
  hostPolicy,
  invokeProcedure,
  outputValue,
  typed,
  VersionConflictError,
  type AnyProcedure,
  type Capability,
  type PartitionResolver,
  type Principal,
  type ProcedureRegistry,
  type Transport,
} from "@procedures/client";
import { z } from "zod";
import { MemoryProgramStore } from "./memory.js";
import { createProgramModule, createProgramProcedures } from "./programs.js";
import type { ProgramStore, StoredProgram } from "./types.js";

const stubTransport = { name: "stub", send: async function* () {}, close: async () => {} } as unknown as Transport;

/** The tenant of a principal: the claim `tenant`. */
const byTenant: PartitionResolver = (ctx, requested) => {
  const tenant = ctx.principal?.claims?.["tenant"];
  if (typeof tenant !== "string") return null;
  return requested === undefined ? tenant : `${tenant}/${requested}`;
};

const ann: Principal = { id: "ann", via: "test", claims: { tenant: "t1" } };
const bob: Principal = { id: "bob", via: "test", claims: { tenant: "t2" } };

const READ_ONLY: Capability = { effects: { writes: [] } };

/** A procedure that writes a note: the write that a read-only capability refuses. */
function notesProcedure(notes: Map<string, unknown>): AnyProcedure {
  return createProcedure()
    .path(["notes", "write"])
    .input(z.object({ id: z.string(), text: z.string() }))
    .output(typed<{ written: true }>())
    .meta({ description: "Write a note", effects: { reads: [], writes: ["notes"] } })
    .handler(async (input: { id: string; text: string }) => {
      notes.set(input.id, input.text);
      return { written: true as const };
    })
    .build();
}

/** A host: the core, the program procedures over a store of each partition, and a notes procedure. */
function host(partition: PartitionResolver = byTenant) {
  const stores = new Map<string | undefined, ProgramStore>();
  const notes = new Map<string, unknown>();
  const module = createProgramModule({
    partition,
    storeFor: (name) => {
      let store = stores.get(name);
      if (!store) stores.set(name, (store = new MemoryProgramStore()));
      return store;
    },
  });
  const registry: ProcedureRegistry = createRegistry(module);
  registry.register(notesProcedure(notes));
  /** A call of a program procedure, as a server gives it: the principal and the capability of the request. */
  const call = async <T = unknown>(operation: string, input: unknown, principal?: Principal, capability?: Capability): Promise<T> => {
    const path = ["programs", operation];
    return outputValue<T>(
      await invokeProcedure<T>(registry.get(path)!, input, {
        registry,
        ...(principal ? { principal } : {}),
        ...(capability ? { capability } : {}),
      }),
      path,
    );
  };
  return { registry, stores, notes, call };
}

const chain = (steps: unknown[]) => ({ $proc: ["client", "chain"], input: { steps } });
const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });

describe("programs.* over the store of each partition", () => {
  it("saves a program with its name and version, and gets and lists it", async () => {
    const { call } = host();
    const program = chain([add(1, 2), add({ $ref: "$last" }, 10)]);
    const saved = await call<StoredProgram>("save", { path: "reports.weekly", program, name: "Weekly", description: "The weekly report" }, ann);
    expect(saved).toMatchObject({ key: "reports.weekly", path: ["reports", "weekly"], program, name: "Weekly", description: "The weekly report" });
    expect(saved.version).toBeDefined();
    // The program is data: the save did not run its refs
    expect(saved.program).toEqual(program);

    expect(await call("get", { path: ["reports", "weekly"] }, ann)).toEqual(saved);
    expect(await call("get", { key: "reports.weekly" }, ann)).toEqual(saved);
    await call("save", { path: "reports.daily", program }, ann);
    await call("save", { path: "other", program }, ann);
    expect((await call<StoredProgram[]>("list", {}, ann)).map((p) => p.key)).toEqual(["other", "reports.daily", "reports.weekly"]);
    expect((await call<StoredProgram[]>("list", { prefix: "reports" }, ann)).map((p) => p.key)).toEqual(["reports.daily", "reports.weekly"]);
  });

  it("isolates two tenants: a program of A is not listed or got for B", async () => {
    const { call, stores } = host();
    await call("save", { path: "a.secret", program: add(1, 1) }, ann);
    expect(await call("list", {}, bob)).toEqual([]);
    await expect(call("get", { path: "a.secret" }, bob)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The input only selects: bob who asks for the partition of ann gets a scope under his own tenant
    expect(await call("list", { partition: "t1" }, bob)).toEqual([]);
    await expect(call("get", { path: "a.secret", partition: "t1" }, bob)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await call("remove", { path: "a.secret" }, bob)).toEqual({ removed: false, key: "a.secret" });
    expect((await call<StoredProgram[]>("list", {}, ann)).map((p) => p.key)).toEqual(["a.secret"]);
    expect([...stores.keys()].sort()).toEqual(["t1", "t2", "t2/t1"]);
  });

  it("refuses a call when the resolver gives null, as the collection procedures do", async () => {
    const { call, stores } = host();
    for (const [operation, input] of [
      ["save", { path: "a.b", program: add(1, 1) }],
      ["get", { path: "a.b" }],
      ["list", {}],
      ["remove", { path: "a.b" }],
    ] as const) {
      await expect(call(operation, input)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "partition-not-allowed" });
    }
    await expect(call("list", { partition: "x" })).rejects.toThrow('The call cannot use the partition "x" of programs');
    expect(stores.size).toBe(0);
    // A requested partition outside the pattern fails the input check
    await expect(call("list", { partition: "a b" }, ann)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("writes with the expected version, and refuses a stale version with VersionConflictError", async () => {
    const { call } = host();
    const first = await call<StoredProgram>("save", { path: "a.b", program: add(1, 1), expectedVersion: null }, ann);
    const second = await call<StoredProgram>("save", { path: "a.b", program: add(2, 2), expectedVersion: first.version }, ann);
    expect(second.version).not.toEqual(first.version);
    await expect(call("save", { path: "a.b", program: add(3, 3), expectedVersion: first.version }, ann)).rejects.toBeInstanceOf(VersionConflictError);
    await expect(call("save", { path: "a.b", program: add(3, 3), expectedVersion: null }, ann)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(call("remove", { path: "a.b", expectedVersion: first.version }, ann)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await call("get", { path: "a.b" }, ann)).toEqual(second);
    expect(await call("remove", { path: "a.b", expectedVersion: second.version }, ann)).toEqual({ removed: true, key: "a.b" });
    await expect(call("get", { path: "a.b" }, ann)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a program that is not a procedure ref, and a get without exactly one of path and key", async () => {
    const { call } = host();
    await expect(call("save", { path: "a.b", program: { input: 1 } }, ann)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("save", { path: "a.b", program: { $proc: [] } }, ann)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("get", {}, ann)).rejects.toThrow("exactly one");
    await expect(call("get", { path: "a.b", key: "a.b" }, ann)).rejects.toThrow("exactly one");
  });

  it("declares the effects: get and list read, save writes, remove is destructive", () => {
    const procedures = createProgramProcedures({ partition: byTenant, storeFor: () => new MemoryProgramStore() });
    const effects = Object.fromEntries(procedures.map((procedure) => [procedure.path.join("."), effectsOf(procedure)]));
    expect(effects).toEqual({
      "programs.save": { reads: ["programs"], writes: ["programs"] },
      "programs.get": { reads: ["programs"], writes: [], idempotent: true },
      "programs.list": { reads: ["programs"], writes: [], idempotent: true },
      "programs.remove": { reads: ["programs"], writes: ["programs"], destructive: true, idempotent: true },
    });
    // The save takes the program as data
    expect((procedures[0]!.metadata as { tags?: string[] }).tags).toContain("raw-input");
  });

  it("takes a namespace, and the module registers nothing until a registry takes it", () => {
    const module = createProgramModule({ partition: byTenant, storeFor: () => new MemoryProgramStore(), namespace: ["app", "programs"] });
    expect(module.name).toBe("@procedures/store/programs:app.programs");
    expect(module.procedures.map((procedure) => procedure.path.join("."))).toEqual(["app.programs.save", "app.programs.get", "app.programs.list", "app.programs.remove"]);
    expect(() => createProgramProcedures({ partition: byTenant, storeFor: () => new MemoryProgramStore(), namespace: [] })).toThrow("namespace");
  });
});

describe("programs.* under a read-only capability", () => {
  const readOnlyCapabilities: Array<[string, Capability]> = [
    ["{ effects: { writes: [] } }", READ_ONLY],
    ["hostPolicy({ readOnly: true })", hostPolicy({ readOnly: true }).capabilityOf!()!],
  ];

  for (const [name, capability] of readOnlyCapabilities) {
    it(`get and list work, save and remove are refused with effects-exceeded: ${name}`, async () => {
      const { call } = host();
      const saved = await call<StoredProgram>("save", { path: "a.b", program: add(1, 1) }, ann);
      expect(await call("get", { path: "a.b" }, ann, capability)).toEqual(saved);
      expect(await call("list", {}, ann, capability)).toEqual([saved]);
      await expect(call("save", { path: "a.c", program: add(1, 1) }, ann, capability)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
      await expect(call("remove", { path: "a.b" }, ann, capability)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
      // The refused calls changed nothing
      expect(await call("list", {}, ann)).toEqual([saved]);
    });
  }

  it("runs a saved program with client.chain: a step that writes is refused, and the write does not happen", async () => {
    // One tenant for the calls of this process, which have no principal
    const { registry, notes } = host(() => "t1");
    const writer = new Client({ transport: stubTransport }).useRegistry(registry);
    const reader = new Client({ transport: stubTransport, capability: READ_ONLY }).useRegistry(registry);

    const program = chain([{ $proc: ["client", "identity"], input: { value: 3 } }, { $proc: ["notes", "write"], input: { id: "n1", text: "from the program" } }]);
    await writer.exec(["programs", "save"], { path: "jobs.note", program, name: "Write a note" });

    // The read-only caller reads the saved program, and runs it as data with client.chain
    const saved = await reader.exec<StoredProgram>(["programs", "get"], { key: "jobs.note" });
    expect(saved.program).toEqual(program);
    await expect(reader.exec(saved.program)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
    expect(notes.size).toBe(0);

    // The same program writes for a caller that can write
    await writer.exec(saved.program);
    expect(notes.get("n1")).toBe("from the program");
  });
});
