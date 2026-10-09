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
import { callMatches, validateCalls, nestedCallRefusal } from "./policy.js";
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

  it("gives the reason of a refusal, or nothing", () => {
    const caller = { path: ["tool", "x"], metadata: { calls: ["a.b"] } } as unknown as AnyProcedure;
    expect(nestedCallRefusal(caller, ["a", "b"], { expose: () => false })).toBeUndefined();
    expect(nestedCallRefusal(caller, ["a", "c"], { expose: () => false })?.code).toBe("NOT_DECLARED");
    expect(nestedCallRefusal(caller, ["a", "c"], {})).toBeUndefined();
  });
});
