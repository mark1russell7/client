/**
 * The call policy of a host (deep dive MCP-3).
 *
 * Before, the guard examined only a data-driven caller: client.chain could not call shell.exec,
 * but an exposed procedure of code could call any procedure, so a code procedure that turns its
 * input into a call was a confused deputy. Now a code procedure declares the procedures that it
 * calls (`metadata.calls`), and a host with `strictCalls` refuses the other nested calls.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry, RegistryError } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { invokePath, outputValue, InvocationError, type InvokeOptions } from "./invoke.js";
import { callMatches, validateCalls, nestedCallRefusal, hiddenReach, hasCallPolicy } from "./policy.js";
import { RUNS_REFS_TAG } from "./ref.js";
import type { AnyProcedure, ProcedureContext, ProcedurePath } from "./types.js";

const any = outputSchema<unknown>();

/** A registry: `secret.run` (not exposed), `tool.declared` (calls secret.run, declared), `tool.undeclared` (calls it, no declaration), `tool.runner` (runs a path of its input). */
function setup(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  const add = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown, metadata: Record<string, unknown> = {}) =>
    registry.register(defineProcedure({ path, input: any, output: any, metadata, handler: handler as never }) as AnyProcedure);
  add(["secret", "run"], () => "secret ran");
  add(["secret", "other"], () => "other ran");
  add(["tool", "plain"], () => "plain");
  add(["tool", "declared"], (_input, ctx) => ctx.client.call(["secret", "run"], {}), { calls: ["secret.run"] });
  add(["tool", "wrongTarget"], (_input, ctx) => ctx.client.call(["secret", "other"], {}), { calls: ["secret.run"] });
  add(["tool", "undeclared"], (_input, ctx) => ctx.client.call(["secret", "run"], {}));
  add(["tool", "namespace"], (_input, ctx) => ctx.client.call(["secret", "other"], {}), { calls: ["secret.*"] });
  add(["tool", "runner"], (input: { path: string[] }, ctx) => ctx.client.call(input.path, {}), { tags: [RUNS_REFS_TAG] });
  add(["tool", "callsTool"], (_input, ctx) => ctx.client.call(["tool", "plain"], {}), { calls: [] });
  return registry;
}

const exposeTools = (path: ProcedurePath): boolean => path[0] === "tool";

async function run(registry: ProcedureRegistry, path: string[], options: InvokeOptions, input: unknown = {}): Promise<unknown> {
  return outputValue(await invokePath(path, input, { registry, ...options }), path);
}

describe("nested calls under a call policy (MCP-3)", () => {
  it("lets a code procedure call what it declares", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "declared"], { expose: exposeTools, strictCalls: true })).resolves.toBe("secret ran");
  });

  it("refuses a call that a code procedure does not declare, when the host has a policy", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "wrongTarget"], { expose: exposeTools })).rejects.toMatchObject({
      code: "NOT_DECLARED",
    });
  });

  it("matches a namespace entry", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "namespace"], { expose: exposeTools, strictCalls: true })).resolves.toBe("other ran");
  });

  it("lets a declared caller call an exposed procedure that it does not declare", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "callsTool"], { expose: exposeTools, strictCalls: true })).resolves.toBe("plain");
  });

  it("refuses an undeclared call to a hidden procedure under strictCalls, and allows it without", async () => {
    const registry = setup();
    const refused = run(registry, ["tool", "undeclared"], { expose: exposeTools, strictCalls: true });
    await expect(refused).rejects.toBeInstanceOf(InvocationError);
    await expect(refused).rejects.toMatchObject({ code: "NOT_EXPOSED" });
    await expect(run(registry, ["tool", "undeclared"], { expose: exposeTools })).resolves.toBe("secret ran");
  });

  it("keeps the rule of data-driven callers: exposed procedures only", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "runner"], { expose: exposeTools }, { path: ["secret", "run"] })).rejects.toMatchObject({
      code: "NOT_EXPOSED",
    });
    await expect(run(registry, ["tool", "runner"], { expose: exposeTools }, { path: ["tool", "plain"] })).resolves.toBe("plain");
  });

  it("checks nothing for a host without a policy (a library, the local CLI)", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "wrongTarget"], {})).resolves.toBe("other ran");
    await expect(run(registry, ["tool", "runner"], {}, { path: ["secret", "run"] })).resolves.toBe("secret ran");
  });

  it("checks every level: a declared callee's own calls follow its own declaration", async () => {
    const registry = setup();
    registry.register(
      defineProcedure({
        path: ["tool", "outer"],
        input: any,
        output: any,
        metadata: { calls: ["tool.undeclared"] },
        handler: ((_input: unknown, ctx: ProcedureContext) => ctx.client.call(["tool", "undeclared"], {})) as never,
      }) as AnyProcedure,
    );
    await expect(run(registry, ["tool", "outer"], { expose: exposeTools, strictCalls: true })).rejects.toMatchObject({
      code: "NOT_EXPOSED",
    });
  });
});

describe("the calls declaration", () => {
  it("matches exact keys and namespace entries", () => {
    expect(callMatches("shell.run", "shell.run")).toBe(true);
    expect(callMatches("shell.run", "shell.runner")).toBe(false);
    expect(callMatches("fs.*", "fs.read.json")).toBe(true);
    expect(callMatches("fs.*", "fsx.read")).toBe(false);
    expect(callMatches("fs.*", "fs")).toBe(false);
  });

  it("refuses a wildcard for every procedure: a procedure whose callees come from its input is data-driven", () => {
    expect(() => validateCalls(["*"], ["x", "y"])).toThrow(/runs-refs/);
    expect(() => validateCalls(["shell.*", ""], ["x", "y"])).toThrow();
    expect(() => validateCalls("shell.run", ["x", "y"])).toThrow();
    expect(() => validateCalls(["a.*.b"], ["x", "y"])).toThrow();
    expect(validateCalls(["shell.run", "fs.*"], ["x", "y"])).toEqual(["shell.run", "fs.*"]);
    expect(validateCalls(undefined, ["x", "y"])).toBeUndefined();
  });

  it("is checked when the procedure is registered", () => {
    const registry = new ProcedureRegistry();
    expect(() =>
      registry.register(defineProcedure({ path: ["x", "y"], input: any, output: any, metadata: { calls: ["*"] }, handler: () => 1 }) as AnyProcedure),
    ).toThrow(RegistryError);
  });

  it("gives the reach of the exposed procedures through their declarations, also through more than one step", () => {
    const registry = setup();
    registry.register(
      defineProcedure({ path: ["secret", "chained"], input: any, output: any, metadata: { calls: ["deep.*"] }, handler: () => 1 }) as AnyProcedure,
    );
    registry.register(defineProcedure({ path: ["deep", "end"], input: any, output: any, handler: () => 1 }) as AnyProcedure);
    registry.register(
      defineProcedure({ path: ["tool", "chain"], input: any, output: any, metadata: { calls: ["secret.chained"] }, handler: () => 1 }) as AnyProcedure,
    );
    expect(hiddenReach(registry.getAll(), exposeTools)).toEqual([
      { from: "secret.chained", to: "deep.end" },
      { from: "tool.chain", to: "secret.chained" },
      { from: "tool.declared", to: "secret.run" },
      { from: "tool.namespace", to: "secret.chained" },
      { from: "tool.namespace", to: "secret.other" },
      { from: "tool.namespace", to: "secret.run" },
      { from: "tool.wrongTarget", to: "secret.run" },
    ]);
  });

  it("gives the reason of a refusal, or nothing", () => {
    const caller = { path: ["tool", "x"], metadata: { calls: ["a.b"] } } as unknown as AnyProcedure;
    expect(nestedCallRefusal(caller, ["a", "b"], { expose: () => false })).toBeUndefined();
    expect(nestedCallRefusal(caller, ["a", "c"], { expose: () => false })?.code).toBe("NOT_DECLARED");
    expect(nestedCallRefusal(caller, ["a", "c"], {})).toBeUndefined();
  });

  it("lets a declared caller call each procedure that one of its entries names", () => {
    const caller = { path: ["tool", "x"], metadata: { calls: ["a.b", "c.d"] } } as unknown as AnyProcedure;
    expect(nestedCallRefusal(caller, ["a", "b"], { expose: () => false })).toBeUndefined();
    expect(nestedCallRefusal(caller, ["c", "d"], { expose: () => false })).toBeUndefined();
  });

  it("names the callee, the caller and the rule in each refusal", () => {
    const hidden = { expose: () => false, strictCalls: true };
    const declared = { path: ["tool", "declared"], metadata: { calls: ["a.b"] } } as unknown as AnyProcedure;
    const plain = { path: ["tool", "plain"], metadata: {} } as unknown as AnyProcedure;
    const runner = { path: ["tool", "runner"], metadata: { tags: [RUNS_REFS_TAG] } } as unknown as AnyProcedure;

    const notDeclared = nestedCallRefusal(declared, ["secret", "run"], hidden)?.message ?? "";
    expect(notDeclared).toMatch(/^Procedure not declared: tool\.declared calls secret\.run/);
    expect(notDeclared).toMatch(/its metadata\.calls does not name it/);

    const notExposed = nestedCallRefusal(plain, ["secret", "run"], hidden)?.message ?? "";
    expect(notExposed).toMatch(/^Procedure not exposed: secret\.run\. tool\.plain declares no metadata\.calls/);
    expect(notExposed).toMatch(/call only the procedures that it exposes\.$/);

    const dataDriven = nestedCallRefusal(runner, ["secret", "run"], hidden)?.message ?? "";
    expect(dataDriven).toMatch(/^Procedure not exposed: secret\.run\. tool\.runner runs procedure refs from its input/);
    expect(dataDriven).toMatch(/can call only the procedures that this server exposes\.$/);
  });
});

describe("a host with a policy", () => {
  it("has a policy when it has an expose rule or strictCalls, and not without", () => {
    expect(hasCallPolicy({})).toBe(false);
    expect(hasCallPolicy({ expose: undefined, strictCalls: undefined })).toBe(false);
    expect(hasCallPolicy({ strictCalls: false })).toBe(false);
    expect(hasCallPolicy({ strictCalls: true })).toBe(true);
    expect(hasCallPolicy({ expose: () => true })).toBe(true);
  });

  it("exposes every procedure when it has strictCalls and no expose rule", async () => {
    const registry = setup();
    await expect(run(registry, ["tool", "undeclared"], { strictCalls: true })).resolves.toBe("secret ran");
    await expect(run(registry, ["tool", "runner"], { strictCalls: true }, { path: ["secret", "run"] })).resolves.toBe("secret ran");
  });
});

describe("an invalid calls declaration", () => {
  const where = ["x", "y"];

  it("names the procedure and the problem", () => {
    expect(() => validateCalls("shell.run", where)).toThrow(/^metadata\.calls of x\.y must be a list of procedure keys$/);
    expect(() => validateCalls({ 0: "shell.run" }, where)).toThrow(/^metadata\.calls of x\.y must be a list of procedure keys$/);
    expect(() => validateCalls([42], where)).toThrow(/^metadata\.calls of x\.y has an entry that is not a procedure key: 42$/);
    expect(() => validateCalls([""], where)).toThrow(/^metadata\.calls of x\.y has an entry that is not a procedure key: ""$/);
    expect(() => validateCalls(["*"], where)).toThrow(/^metadata\.calls of x\.y is "\*"\. A procedure whose callees come from its input is data-driven/);
  });

  it("refuses an entry with an empty segment", () => {
    for (const entry of ["a..b", "a.", ".b", "a..*", ".*"]) {
      expect(() => validateCalls([entry], where)).toThrow(`metadata.calls of x.y has an invalid entry: "${entry}". Use "ns.name" or "ns.*".`);
    }
  });

  it("accepts short names and namespaces of one letter", () => {
    expect(validateCalls(["fs.ls", "a.*", "a.b.*", "a.b"], where)).toEqual(["fs.ls", "a.*", "a.b.*", "a.b"]);
  });
});

describe("the hidden reach", () => {
  const add = (registry: ProcedureRegistry, path: string[], metadata: Record<string, unknown> = {}): void =>
    registry.register(defineProcedure({ path, input: any, output: any, metadata, handler: () => 1 }) as AnyProcedure);

  it("ends on a cycle of hidden procedures", () => {
    const registry = new ProcedureRegistry();
    add(registry, ["tool", "entry"], { calls: ["loop.a"] });
    add(registry, ["loop", "a"], { calls: ["loop.b"] });
    add(registry, ["loop", "b"], { calls: ["loop.a"] });
    expect(hiddenReach(registry.getAll(), exposeTools)).toEqual([
      { from: "loop.a", to: "loop.b" },
      { from: "loop.b", to: "loop.a" },
      { from: "tool.entry", to: "loop.a" },
    ]);
  });

  it("adds no edge from a data-driven procedure, also when it declares calls", () => {
    const registry = new ProcedureRegistry();
    add(registry, ["secret", "run"]);
    add(registry, ["tool", "runner"], { tags: [RUNS_REFS_TAG], calls: ["secret.run"] });
    expect(hiddenReach(registry.getAll(), exposeTools)).toEqual([]);
    // The rule of the nested calls agrees: the declaration does not open a hidden procedure
    const runner = registry.getAll().find((procedure) => procedure.path[1] === "runner")!;
    expect(nestedCallRefusal(runner, ["secret", "run"], { expose: exposeTools })?.code).toBe("NOT_EXPOSED");
  });

  it("starts only at the exposed procedures", () => {
    const registry = new ProcedureRegistry();
    add(registry, ["secret", "run"]);
    add(registry, ["hidden", "lonely"], { calls: ["secret.run"] });
    expect(hiddenReach(registry.getAll(), exposeTools)).toEqual([]);
  });

  it("leaves out a stub without a handler: it does not run, so it calls nothing", () => {
    const stub = { path: ["tool", "stub"], metadata: { calls: ["secret.run"] } } as unknown as AnyProcedure;
    const target = { path: ["secret", "run"], metadata: {}, handler: () => 1 } as unknown as AnyProcedure;
    const ghost = { path: ["secret", "ghost"], metadata: {} } as unknown as AnyProcedure;
    const caller = { path: ["tool", "caller"], metadata: { calls: ["secret.ghost"] }, handler: () => 1 } as unknown as AnyProcedure;
    expect(hiddenReach([stub, target, ghost, caller], exposeTools)).toEqual([]);
  });
});
