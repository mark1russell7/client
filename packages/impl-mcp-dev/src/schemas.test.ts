/**
 * Each tool that the dev-tools MCP server exposes describes its input (roadmap 2.1).
 *
 * Claude reads the input JSON Schema of a tool to call it. Before, most tools had a
 * pass-through schema: the tool list showed `{ type: "object", additionalProperties: true }`,
 * and a wrong field name reached the handler. Now each tool has a real schema: an object with
 * its fields, and a description for each field.
 *
 * The control-flow tools (client.chain, client.map, ...) take programs: their operands are any
 * JSON, but they still name their fields.
 */

import { describe, it, expect } from "vitest";
import { PROCEDURE_REGISTRY, jsonSchemaOf, pathToKey } from "@procedures/client";
import { exposeRule, mergeSurfaces, procedureToMcpTool } from "@procedures/mcp-server";
import * as bundle from "@procedures/bundle-mcp/register.js";

const surface = mergeSurfaces([bundle]);
const expose = exposeRule(surface!);
const tools = PROCEDURE_REGISTRY.getAll()
  .filter((procedure) => procedure.handler && expose(procedure.path))
  .sort((a, b) => pathToKey(a.path).localeCompare(pathToKey(b.path)));

interface Property {
  description?: string;
}

describe("the input schemas of the MCP tools", () => {
  it("has the 92 tools of the snapshot", () => {
    // procedure.manifest is the 63rd (roadmap R17), program.check and program.compile came with R22,
    // program.diagram and program.explain with R23
    expect(tools.length).toBe(92);
  });

  for (const procedure of tools) {
    const key = pathToKey(procedure.path);
    it(`${key}: an object schema, and a description for each field`, () => {
      const json = jsonSchemaOf(procedure.input);
      expect(json, `${key} has no JSON Schema (a pass-through schema)`).toBeDefined();
      expect(json!["type"]).toBe("object");
      const properties = (json!["properties"] ?? {}) as Record<string, Property>;
      const missing = Object.entries(properties)
        .filter(([, property]) => !property.description)
        .map(([name]) => name);
      expect(missing, `${key}: fields without a description`).toEqual([]);
      // The tool list gives this schema to Claude
      expect(procedureToMcpTool(procedure).inputSchema).toEqual(json);
    });
  }
});
