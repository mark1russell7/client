/**
 * The procedures `program.check`, `program.compile` and `program.diagram`: the program is data for
 * them, so nothing of it starts. The capability is the capability of the input, or of the caller.
 * The tests of `program.explain` and of the SDK procedures are in explain.test.ts and sdk.test.ts.
 */

import { describe, expect, it } from "vitest";
import { Client, createRegistry, effectsOf, type AnyProcedure, type ProcedureContext } from "@procedures/client/browser";
import { compilerModule, programModule, registerCompilerProcedures } from "./module.js";
import { makeHarness, stubTransport } from "../test/harness.js";
import type { ProgramCheckOutput, ProgramCompileOutput, ProgramDiagramOutput } from "./types.js";

const write = (key: string) => ({ $proc: ["t", "write"], input: { key, value: 1 } });
const program = { $proc: ["client", "chain"], input: { steps: [write("a"), { $proc: ["t", "num"], input: { value: { $ref: "$last.written" } } }] } };

describe("program.check", () => {
  it("checks a program and starts nothing of it", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const result = await harness.client.exec<ProgramCheckOutput>({ $proc: ["program", "check"], input: { program, capability: { effects: { writes: [] } } } });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.pointer])).toEqual([["capability-refused", "/input/steps/0"]]);
    expect(result.effects).toEqual({ reads: [], writes: ["store"], destructive: true, idempotent: false });
    expect(result.mustEffects).toEqual({ reads: [], writes: ["store"] });
    expect(result.registryHash).toMatch(/^[0-9a-f]{16}$/);
    expect(harness.trace).toEqual([]);
  });

  it("uses the capability of the caller when the input has none", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const client = new Client({ transport: stubTransport, capability: { effects: { writes: ["registry"] } } }).useRegistry(harness.registry);
    // program.check itself reads the registry and changes nothing, so this capability permits it
    const result = await client.exec<ProgramCheckOutput>({ $proc: ["program", "check"], input: { program } });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.message).toContain("t.write changes store, and this call changes only registry");
  });

  it("obeys the expose rule of the host", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const { programCheck } = await import("./procedures/program/check.js");
    const context = { registry: harness.registry, expose: (path: string[]) => path[0] !== "t", metadata: {}, path: ["program", "check"] };
    const result = await programCheck({ program }, context as unknown as ProcedureContext);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["not-exposed", "not-exposed"]);
  });
});

describe("program.compile", () => {
  it("gives the source text of a program, and starts nothing of it", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const result = await harness.client.exec<ProgramCompileOutput>({ $proc: ["program", "compile"], input: { program, language: "ts" } });
    expect(result.ok).toBe(true);
    expect(result.code).toContain("export default async function program(ctx: ProgramContext, input?: unknown): Promise<unknown> {");
    expect(result.sourceMap.length).toBeGreaterThan(0);
    expect(harness.trace).toEqual([]);
  });

  it("folds the pure core calls with literal inputs on request", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const sum = { $proc: ["client", "add"], input: { a: { $proc: ["client", "multiply"], input: { a: 2, b: 3 } }, b: 1 } };
    const result = await harness.client.exec<ProgramCompileOutput>({ $proc: ["program", "compile"], input: { program: { $proc: ["t", "num"], input: { value: sum } }, fold: true } });
    expect(result.folded).toEqual(["/input/value/input/a", "/input/value"]);
    // The object stays a new object for each run, as the interpreter makes it
    expect(result.code).toContain('rt.call(ctx, ["t", "num"], rt.object([["value", 7]]))');
  });
});

describe("program.diagram", () => {
  it("gives the flowchart and the diagnostics of a program, and starts nothing of it", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const result = await harness.client.exec<ProgramDiagramOutput>({ $proc: ["program", "diagram"], input: { program, direction: "LR" } });
    expect(result.mermaid.split("\n")[0]).toBe("flowchart LR");
    expect(result.mermaid).toContain('subgraph s0["client.chain"]');
    expect(result.mermaid).toContain('["t.write"]');
    expect(result.diagnostics).toEqual([]);
    expect(harness.trace).toEqual([]);
  });

  it("marks a call that the capability of the caller refuses", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const client = new Client({ transport: stubTransport, capability: { effects: { writes: ["registry"] } } }).useRegistry(harness.registry);
    const result = await client.exec<ProgramDiagramOutput>({ $proc: ["program", "diagram"], input: { program } });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["capability-refused"]);
    expect(result.mermaid).toMatch(/class n\d+ error/);
  });
});

describe("the module", () => {
  it("has the program procedures, which read the registry, take raw input and change nothing", () => {
    expect(programModule).toBe(compilerModule);
    const registry = createRegistry(compilerModule);
    for (const path of [["program", "check"], ["program", "compile"], ["program", "diagram"], ["program", "explain"]]) {
      const procedure = registry.get(path);
      expect(procedure).toBeDefined();
      expect(effectsOf(procedure!)).toEqual({ reads: ["registry"], writes: [] });
      expect((procedure!.metadata as { tags?: string[] }).tags).toContain("raw-input");
    }
  });

  it("has the SDK procedures, which read the registry and change nothing", () => {
    const registry = createRegistry(compilerModule);
    for (const path of [["sdk", "openrpc"], ["sdk", "typescript"]]) {
      const procedure = registry.get(path);
      expect(procedure).toBeDefined();
      expect(effectsOf(procedure!)).toEqual({ reads: ["registry"], writes: [] });
      expect((procedure!.metadata as { tags?: string[] }).tags).not.toContain("raw-input");
    }
    expect(compilerModule.procedures).toHaveLength(6);
  });

  it("registers its procedures in a registry", () => {
    const registry = createRegistry();
    registerCompilerProcedures(registry);
    expect(registry.has(["program", "check"])).toBe(true);
  });
});
