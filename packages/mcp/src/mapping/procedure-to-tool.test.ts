/**
 * The MCP hints of a tool come from the declared effects of its procedure (CAPABILITIES-2026-10).
 */

import { describe, it, expect } from "vitest";
import { defineProcedure, outputSchema, type AnyProcedure } from "@procedures/client";
import { procedureToMcpTool, toToolDefinition } from "./procedure-to-tool.js";

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
