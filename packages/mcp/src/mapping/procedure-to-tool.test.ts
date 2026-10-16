/**
 * The MCP hints of a tool come from the declared effects of its procedure (CAPABILITIES-2026-10).
 * The description of a defined procedure tells the effects of its body (roadmap R23).
 */

import { describe, it, expect } from "vitest";
import { defineProcedure, markDataDriven, outputSchema, type AnyProcedure } from "@procedures/client";
import { effectsSentence, procedureToMcpTool, toolDescription, toToolDefinition } from "./procedure-to-tool.js";

function procedure(path: string[], metadata: Record<string, unknown>): AnyProcedure {
  return defineProcedure({
    path,
    input: outputSchema<Record<string, never>>(),
    output: outputSchema<string>(),
    metadata,
    handler: async () => "ok",
  }) as AnyProcedure;
}

describe("the MCP hints of a tool", () => {
  it("says read only for a procedure that changes nothing, and gives the hints in the definition", () => {
    const tool = procedureToMcpTool(procedure(["files", "read"], { effects: { reads: ["fs"], writes: [] } }));
    expect(tool.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
    expect(toToolDefinition(tool).annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
  });

  it("says destructive for a procedure that writes, unless it declares otherwise", () => {
    expect(procedureToMcpTool(procedure(["files", "write"], { effects: { reads: [], writes: ["fs"] } })).annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(
      procedureToMcpTool(procedure(["files", "append"], { effects: { reads: [], writes: ["fs"], destructive: false, idempotent: false } }))
        .annotations
    ).toMatchObject({ destructiveHint: false, idempotentHint: false });
  });

  it("gives no hints to a procedure without a declaration", () => {
    const tool = procedureToMcpTool(procedure(["files", "unknown"], {}));
    expect(tool.annotations).toBeUndefined();
    expect(toToolDefinition(tool).annotations).toBeUndefined();
  });
});

describe("the description of a defined procedure (roadmap R23)", () => {
  it("gets a sentence with the effects that the host found for its body", () => {
    const defined = markDataDriven(procedure(["d", "report"], { description: "Write the report", inferredEffects: { reads: ["fs", "git", "registry"], writes: ["store"] } }));
    const tool = procedureToMcpTool(defined);
    expect(tool.description).toBe("Write the report. It reads fs, git and registry and changes store.");
    expect(toToolDefinition(tool).description).toBe(tool.description);
    // The hints come from the same effects
    expect(tool.annotations).toMatchObject({ readOnlyHint: false });
  });

  it("says nothing and nothing for a body without effects, and keeps the end of a sentence", () => {
    const defined = markDataDriven(procedure(["d", "pure"], { description: "Add the numbers.", inferredEffects: { reads: [], writes: [] } }));
    expect(procedureToMcpTool(defined).description).toBe("Add the numbers. It reads nothing and changes nothing.");
    expect(toolDescription(markDataDriven(procedure(["d", "plain"], { inferredEffects: { reads: ["fs"], writes: [] } })))).toBe("Call d.plain. It reads fs and changes nothing.");
  });

  it("keeps the description of a procedure of code, and of a defined procedure without inferred effects", () => {
    expect(procedureToMcpTool(procedure(["files", "read"], { description: "Read a file", inferredEffects: { reads: ["fs"], writes: [] } })).description).toBe("Read a file");
    expect(procedureToMcpTool(markDataDriven(procedure(["d", "old"], { description: "An old definition" }))).description).toBe("An old definition");
  });

  it("writes a list of effects in words", () => {
    expect(effectsSentence({ reads: ["fs"], writes: ["fs", "network"] })).toBe("It reads fs and changes fs and network.");
  });
});
