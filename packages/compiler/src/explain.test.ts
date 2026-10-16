/**
 * The explanation of a program (roadmap R23): `explainProgram()` and the procedure
 * `program.explain`. The check and `explainInvocation()` of the client give one result.
 */

import { describe, expect, it } from "vitest";
import { Client, describeRegistry, type AnyProcedure, type ProcedureContext } from "@procedures/client/browser";
import { makeHarness, stubTransport } from "../test/harness.js";
import { call, ref } from "../test/golden-programs.js";
import { explainProgram } from "./explain.js";
import { compilerModule } from "./module.js";
import type { ProgramExplainOutput } from "./types.js";

/** A chain: a write, a read of the result, and a conditional write. */
const program = call("client.chain", {
  steps: [
    call("t.write", { key: "a", value: 1 }, { $name: "written" }),
    call("t.read", { key: ref("written.written") }),
    call("client.conditional", { condition: ref("$last"), then: call("t.write", { key: "b", value: 2 }) }),
  ],
});

describe("explainProgram", () => {
  it("gives each call with its effects, and the effects of the program, without a capability", () => {
    const harness = makeHarness();
    const result = explainProgram(program, { facts: harness.facts() });
    expect(result.ok).toBe(true);
    expect(result.effects).toEqual({ reads: ["store"], writes: ["store"], destructive: true, idempotent: false });
    expect(result.mustEffects).toEqual({ reads: ["store"], writes: ["store"] });
    expect(result.calls.map((entry) => [entry.key, entry.pointer, entry.kind, entry.permitted])).toEqual([
      ["client.chain", "", "control", true],
      ["t.write", "/input/steps/0", "call", true],
      ["t.read", "/input/steps/1", "call", true],
      ["client.conditional", "/input/steps/2", "control", true],
      ["t.write", "/input/steps/2/input/then", "call", true],
    ]);
    expect(result.calls[1]).toMatchObject({ effects: { reads: [], writes: ["store"] }, known: true, exposed: true, message: "t.write is permitted" });
    expect(harness.trace).toEqual([]);
  });

  it("gives the refusal of the capability for each call, and the summary tells it", () => {
    const harness = makeHarness();
    const result = explainProgram(program, { facts: harness.facts(), capability: { effects: { writes: [] } } });
    expect(result.ok).toBe(false);
    const refused = result.calls.filter((entry) => !entry.permitted);
    expect(refused.map((entry) => [entry.key, entry.pointer, entry.reason])).toEqual([
      ["t.write", "/input/steps/0", "effects-exceeded"],
      ["t.write", "/input/steps/2/input/then", "effects-exceeded"],
    ]);
    expect(refused[0]!.message).toBe("t.write changes store, and this call changes nothing");
    expect(result.summary).toBe(
      [
        "The program has 5 calls of 4 procedures.",
        "The program can read store and can change store.",
        "A call can delete or overwrite data.",
        "Each run in which no call fails reads store and changes store.",
        "The capability refuses 2 calls: t.write at /input/steps/0 and t.write at /input/steps/2/input/then.",
        "The check found 2 errors, so the host does not start the program.",
      ].join(" "),
    );
  });

  it("tells an unknown procedure and a procedure that the host does not expose", () => {
    const harness = makeHarness();
    const hidden = call("client.chain", { steps: [call("t.num", { value: 1 }), call("t.nothing", {})] });
    const result = explainProgram(hidden, { registry: harness.registry, expose: (path) => path[1] !== "num" });
    expect(result.calls.map((entry) => [entry.key, entry.known, entry.exposed, entry.reason])).toEqual([
      ["client.chain", true, true, undefined],
      ["t.num", true, false, undefined],
      ["t.nothing", false, false, "not-found"],
    ]);
    expect(result.summary).toContain("The host has no procedure for 1 call: t.nothing at /input/steps/1.");
    expect(result.summary).toContain("The host does not expose 1 call: t.num at /input/steps/0.");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["not-exposed", "unknown-procedure"]);
  });

  it("works from a manifest, as in a browser, and tells unknown effects", () => {
    const harness = makeHarness();
    const manifest = describeRegistry(harness.registry);
    const defined = call("client.chain", { steps: [call("client.eval", { procedure: { $ref: "$last" }, input: {} })] });
    const result = explainProgram(defined, { manifest });
    expect(result.effects.reads).toBeUndefined();
    expect(result.summary).toContain("The compiler does not know the effects of the program");
    expect(result.registryHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("explains the calls that a client.eval of a literal path runs", () => {
    const harness = makeHarness();
    const result = explainProgram(call("client.eval", { procedure: ["t", "write"], input: { key: "k" } }), { facts: harness.facts() });
    expect(result.calls.map((entry) => [entry.key, entry.kind, entry.pointer])).toEqual([
      ["client.eval", "dynamic", ""],
      ["t.write", "call", "/input"],
    ]);
  });
});

describe("program.explain", () => {
  it("explains a program with the capability of the input, and starts nothing of it", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const result = await harness.client.exec<ProgramExplainOutput>({ $proc: ["program", "explain"], input: { program, capability: { effects: { writes: [] } } } });
    expect(result.ok).toBe(false);
    expect(result.calls.filter((entry) => !entry.permitted).map((entry) => entry.reason)).toEqual(["effects-exceeded", "effects-exceeded"]);
    expect(result.effects).toEqual({ reads: ["store"], writes: ["store"], destructive: true, idempotent: false });
    expect(result.summary).toContain("The capability refuses 2 calls");
    expect(harness.trace).toEqual([]);
  });

  it("uses the capability of the caller when the input has none", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const client = new Client({ transport: stubTransport, capability: { effects: { writes: ["registry"] } } }).useRegistry(harness.registry);
    const result = await client.exec<ProgramExplainOutput>({ $proc: ["program", "explain"], input: { program } });
    expect(result.calls.find((entry) => !entry.permitted)?.message).toBe("t.write changes store, and this call changes only registry");
  });

  it("obeys the expose rule of the host", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const { programExplain } = await import("./procedures/program/explain.js");
    const context = { registry: harness.registry, expose: (path: string[]) => path[0] !== "t", metadata: {}, path: ["program", "explain"] };
    const result = await programExplain({ program }, context as unknown as ProcedureContext);
    expect(result.calls.filter((entry) => !entry.exposed).map((entry) => entry.key)).toEqual(["t.write", "t.read", "t.write"]);
  });
});
