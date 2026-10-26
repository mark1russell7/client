/**
 * Modules and explicit registries (roadmap 3.1). Two registries in one process stay apart: a
 * procedure of one is not callable from the other, also through nested calls, control flow and
 * procedure.define. The global registry does not change.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../client/client.js";
import { LocalTransport } from "../adapters/local/client/index.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { PROCEDURE_REGISTRY, ProcedureRegistry as Registry, RegistryError } from "./registry.js";
import { clientModule, createRegistry, defineModule, definePackage, moduleClosure } from "./module.js";
import type { AnyProcedure, ProcedureContext, ProcedureModule } from "./types.js";
import type { ProcedureRegistry } from "./registry.js";

const proc = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown): AnyProcedure =>
  defineProcedure({ path, input: outputSchema<unknown>(), output: outputSchema<unknown>(), handler: handler as never }) as AnyProcedure;

const moduleA = defineModule("test-a", [
  proc(["a", "only"], () => "a"),
  // A code procedure that calls into the other module
  proc(["a", "callB"], (_input, ctx) => ctx.client.call(["b", "only"], {})),
]);
const moduleB = defineModule("test-b", [proc(["b", "only"], () => "b")]);

function clientOf(registry: ProcedureRegistry): Client {
  return new Client({ transport: new LocalTransport({ registry }), throwOnError: true }).useRegistry(registry);
}

describe("createRegistry", () => {
  it("has the procedures of the client module and of the given modules", () => {
    const registry = createRegistry(moduleA);
    expect(registry.has(["a", "only"])).toBe(true);
    expect(registry.has(["client", "chain"])).toBe(true);
    expect(registry.has(["procedure", "define"])).toBe(true);
    expect(registry.has(["b", "only"])).toBe(false);
    expect(registry.getAll().length).toBe(clientModule.procedures.length + moduleA.procedures.length);
  });

  it("keeps two registries apart: direct calls, nested calls and control flow", async () => {
    const a = clientOf(createRegistry(moduleA));
    const b = clientOf(createRegistry(moduleB));
    expect(await a.exec(["a", "only"], {})).toBe("a");
    expect(await b.exec(["b", "only"], {})).toBe("b");
    await expect(b.exec(["a", "only"], {})).rejects.toThrow();
    // A nested call of a code procedure looks in the registry of its invocation
    await expect(a.exec(["a", "callB"], {})).rejects.toThrow(/b\.only/);
    // Control flow too
    await expect(a.exec({ $proc: ["client", "chain"], input: { steps: [{ $proc: ["b", "only"], input: {} }] } })).rejects.toThrow(/b\.only/);
    expect(await a.exec({ $proc: ["client", "chain"], input: { steps: [{ $proc: ["a", "only"], input: {} }] } })).toMatchObject({ final: "a" });
  });

  it("keeps a procedure of procedure.define in its own registry", async () => {
    const registryA = createRegistry(moduleA);
    const registryB = createRegistry(moduleB);
    const a = clientOf(registryA);
    const b = clientOf(registryB);
    await a.exec(["procedure", "define"], {
      path: ["x", "twice"],
      aggregation: { $proc: ["client", "identity"], input: { value: { $ref: "input.value" } } },
    });
    expect(registryA.has(["x", "twice"])).toBe(true);
    expect(await a.exec(["x", "twice"], { value: 4 })).toBe(4);
    expect(registryB.has(["x", "twice"])).toBe(false);
    expect(PROCEDURE_REGISTRY.has(["x", "twice"])).toBe(false);
    await expect(b.exec(["x", "twice"], { value: 4 })).rejects.toThrow();
  });

  it("does not change the global registry", () => {
    const before = PROCEDURE_REGISTRY.getAll().length;
    createRegistry(moduleA, moduleB);
    expect(PROCEDURE_REGISTRY.has(["a", "only"])).toBe(false);
    expect(PROCEDURE_REGISTRY.getAll().length).toBe(before);
  });
});

describe("module requirements", () => {
  it("registers the required modules first, each one time", () => {
    const c = defineModule("test-c", [proc(["c", "x"], () => "c")], [moduleA]);
    const d = defineModule("test-d", [proc(["d", "x"], () => "d")], [moduleA, c]);
    expect(moduleClosure([d, c]).map((m) => m.name)).toEqual(["test-a", "test-c", "test-d"]);
    const registry = createRegistry(d, c);
    expect(registry.has(["a", "only"])).toBe(true);
    expect(registry.has(["c", "x"])).toBe(true);
  });

  it("takes a list of modules, as a bundle gives", () => {
    const registry = createRegistry([moduleA, moduleB]);
    expect(registry.has(["a", "only"]) && registry.has(["b", "only"])).toBe(true);
  });

  it("skips the same procedure from two modules, and refuses two procedures at one path", () => {
    const shared = proc(["s", "x"], () => 1);
    const one = defineModule("test-one", [shared]);
    const two = defineModule("test-two", [shared]);
    expect(createRegistry(one, two).has(["s", "x"])).toBe(true);
    const other = defineModule("test-other", [proc(["s", "x"], () => 2)]);
    expect(() => createRegistry(one, other)).toThrow(RegistryError);
  });

  it("refuses a cycle of requirements", () => {
    const leftRequires: ProcedureModule[] = [];
    const left: ProcedureModule = { name: "test-left", procedures: [], requires: leftRequires };
    const right: ProcedureModule = { name: "test-right", procedures: [], requires: [left] };
    leftRequires.push(right);
    expect(() => moduleClosure([left])).toThrow(/cycle/);
  });
});

describe("definePackage (O58)", () => {
  it("gives the module of the package and registers nothing at the call", () => {
    const before = PROCEDURE_REGISTRY.getAll().length;
    const pkg = definePackage("test-package", [proc(["pkg", "one"], () => 1)], [moduleB]);
    expect(pkg.module).toEqual({ name: "test-package", procedures: [expect.anything()], requires: [moduleB] });
    expect(PROCEDURE_REGISTRY.getAll().length).toBe(before);
    expect(PROCEDURE_REGISTRY.has(["pkg", "one"])).toBe(false);
  });

  it("register() puts the procedures and the required modules into the given registry", () => {
    const pkg = definePackage("test-package", [proc(["pkg", "one"], () => 1)], [moduleB]);
    const registry = new Registry();
    pkg.register(registry);
    expect(registry.has(["pkg", "one"])).toBe(true);
    expect(registry.has(["b", "only"])).toBe(true);
    // A second call skips the procedures that the registry has already
    expect(() => pkg.register(registry)).not.toThrow();
    expect(PROCEDURE_REGISTRY.has(["pkg", "one"])).toBe(false);
  });

  it("register() without a registry uses the global registry", () => {
    const pkg = definePackage("test-package-global", [proc(["pkg", "global", "o58"], () => 1)]);
    try {
      pkg.register();
      expect(PROCEDURE_REGISTRY.has(["pkg", "global", "o58"])).toBe(true);
    } finally {
      PROCEDURE_REGISTRY.unregister(["pkg", "global", "o58"]);
    }
  });

  it("gives the same module as defineModule", () => {
    const procedures = [proc(["pkg", "same"], () => 1)];
    expect(definePackage("test-same", procedures).module).toEqual(defineModule("test-same", procedures));
  });
});
