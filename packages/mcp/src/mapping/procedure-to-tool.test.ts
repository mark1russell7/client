/**
 * The MCP hints of a tool come from the declared effects of its procedure (CAPABILITIES-2026-10).
 * The description of a defined procedure tells the effects of its body (roadmap R23).
 */

import { describe, it, expect } from "vitest";
import { defineProcedure, markDataDriven, outputSchema, type AnyProcedure } from "@procedures/client";
import {
  createToolMap,
  effectsSentence,
  findToolByPath,
  procedureToMcpTool,
  proceduresToMcpTools,
  toolDescription,
  toToolDefinition,
  UNTRUSTED_FIELD_DESCRIPTION,
  withUntrustedFields,
} from "./procedure-to-tool.js";
import { decodePath, encodePath, isValidPath, isValidPathSegment, sanitizePathSegment } from "./path-encoder.js";

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

describe("the title and the untrusted fields of a tool (CLI-10)", () => {
  const page = (metadata: Record<string, unknown>): AnyProcedure =>
    defineProcedure({
      path: ["web", "read"],
      input: outputSchema<Record<string, never>>(),
      // A schema with its own JSON Schema (`~jsonSchema`): this package has no zod
      output: Object.assign(outputSchema<unknown>(), {
        "~jsonSchema": {
          type: "object",
          properties: { doc: { type: "string" }, text: { type: "array", items: { type: "object", properties: { text: { type: "string" } } } } },
        },
      }),
      metadata,
      handler: async () => ({ doc: "d", text: [] }),
    }) as AnyProcedure;

  it("gives the title of the procedure to the tool and to its definition", () => {
    const tool = procedureToMcpTool(page({ title: "Read a page" }));
    expect(tool.title).toBe("Read a page");
    expect(toToolDefinition(tool).title).toBe("Read a page");
    expect(procedureToMcpTool(page({ title: "" })).title).toBeUndefined();
  });

  it("makes each untrusted field a string in the output schema, and keeps the cached schema", () => {
    const procedure = page({ untrusted: ["text"] });
    const tool = procedureToMcpTool(procedure);
    expect(tool.untrusted).toEqual(["text"]);
    expect(tool.outputSchema?.properties?.["text"]).toEqual({ type: "string", description: UNTRUSTED_FIELD_DESCRIPTION });
    expect(tool.outputSchema?.properties?.["doc"]).toMatchObject({ type: "string" });
    // The cache keeps the schema of the procedure: a tool without untrusted fields gets an array
    expect(procedureToMcpTool(page({})).outputSchema?.properties?.["text"]).toMatchObject({ type: "array" });
    const schema = { type: "object", properties: { a: { type: "number" } } };
    expect(withUntrustedFields(schema, ["b"])).toEqual({ type: "object", properties: { a: { type: "number" }, b: { type: "string", description: UNTRUSTED_FIELD_DESCRIPTION } } });
    expect(schema.properties).toEqual({ a: { type: "number" } });
  });
});

describe("the override of the hints of a tool (CLI-10)", () => {
  it("gives the cautious values of the override in the annotations", () => {
    const tool = procedureToMcpTool(procedure(["store", "read"], { effects: { reads: ["store"], writes: [] }, toolHints: { openWorldHint: true } }));
    expect(tool.annotations).toEqual({ readOnlyHint: true, openWorldHint: true });
    const plain = procedureToMcpTool(procedure(["any", "thing"], { toolHints: { destructiveHint: true } }));
    expect(toToolDefinition(plain).annotations).toEqual({ destructiveHint: true });
  });
});

describe("the names and the lookup of tools", () => {
  it("validates and sanitizes the segments of a path", () => {
    expect(isValidPath(["git", "status"])).toBe(true);
    expect(isValidPath([])).toBe(false);
    expect(isValidPathSegment("9lives")).toBe(false);
    expect(sanitizePathSegment("a.b")).toBe("a_b");
    expect(sanitizePathSegment("9")).toBe("_9");
    expect(sanitizePathSegment("")).toBe("_");
    expect(decodePath(encodePath(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("finds a tool by its path in a list and in a map", () => {
    const tools = proceduresToMcpTools([procedure(["files", "read"], {}), procedure(["files", "write"], {})], { pathPrefix: ["files"] });
    const map = createToolMap(tools);
    expect(findToolByPath(map, ["files", "write"])?.name).toBe("files.write");
    expect(findToolByPath(tools, ["files", "read"])?.name).toBe("files.read");
    expect(findToolByPath(tools, ["files", "gone"])).toBeUndefined();
  });

  it("filters the tools by tags and by the internal mark", () => {
    const tagged = procedure(["t", "a"], { tags: ["public"] });
    const hidden = procedure(["t", "b"], { internal: true, tags: ["secret"] });
    expect(proceduresToMcpTools([tagged, hidden], { includeTags: ["public"] }).map((tool) => tool.name)).toEqual(["t.a"]);
    expect(proceduresToMcpTools([tagged, hidden], { excludeTags: ["secret"], excludeInternal: false }).map((tool) => tool.name)).toEqual(["t.a"]);
    expect(proceduresToMcpTools([tagged, hidden], { excludeInternal: false }).map((tool) => tool.name)).toEqual(["t.a", "t.b"]);
  });
});
