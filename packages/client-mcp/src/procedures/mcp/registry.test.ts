/**
 * `mcp.list-tools` and `mcp.serve` use the registry of the caller, not the global registry (after
 * P9, a host can have its own registry; architecture review 2026-10-16).
 */

import { describe, it, expect } from "vitest";
import {
  PROCEDURE_REGISTRY,
  ProcedureRegistry,
  defineProcedure,
  invokePath,
  outputSchema,
  outputValue,
  type AnyProcedure,
} from "@procedures/client";
import { mcpListToolsProcedure } from "./list-tools.js";
import { prepareServe } from "./serve.js";

const own = defineProcedure({
  path: ["own", "thing"],
  input: outputSchema<unknown>(),
  output: outputSchema<unknown>(),
  metadata: { description: "Only in the host's registry", effects: { reads: [], writes: [] } },
  handler: () => "thing",
}) as AnyProcedure;

describe("the MCP procedures of a host with its own registry", () => {
  it("mcp.list-tools lists the tools of the caller's registry", async () => {
    const registry = new ProcedureRegistry();
    registry.register(mcpListToolsProcedure);
    registry.register(own);
    expect(PROCEDURE_REGISTRY.has(["own", "thing"])).toBe(false);
    const path = ["mcp", "list-tools"];
    const result = (await outputValue(await invokePath(path, {}, { registry }), path)) as { tools: Array<{ path: string[] }> };
    expect(result.tools.map((tool) => tool.path.join("."))).toContain("own.thing");
  });

  it("prepareServe serves the registry that it gets", async () => {
    const registry = new ProcedureRegistry();
    registry.register(own);
    const { server, expose } = await prepareServe({ namespaces: ["own"] }, process.cwd(), registry);
    expect(server.getRegistry()).toBe(registry);
    expect(expose(["own", "thing"])).toBe(true);
  });
});
