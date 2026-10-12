/**
 * The TypeScript manifest gives the types of the JSON Schemas (roadmap 2.1). Before, every
 * input and output was `unknown`.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { jsonSchemaOf } from "@mark1russell7/client";
import { generateTypeScript, jsonSchemaToTs } from "./typescript.js";

describe("jsonSchemaToTs", () => {
  it("writes objects, optional fields, arrays, records, enums and unions", () => {
    const schema = jsonSchemaOf(
      z.object({
        collection: z.string(),
        limit: z.number().optional(),
        ids: z.array(z.string()),
        env: z.record(z.string(), z.string()),
        mode: z.enum(["write", "append"]),
        target: z.union([z.string(), z.number()]),
        "x-key": z.boolean(),
      })
    );
    expect(jsonSchemaToTs(schema)).toBe(
      [
        "{",
        "  collection: string;",
        "  limit?: number;",
        "  ids: Array<string>;",
        "  env: Record<string, string>;",
        '  mode: "write" | "append";',
        "  target: string | number;",
        '  "x-key": boolean;',
        "}",
      ].join("\n")
    );
  });

  it("gives unknown for a schema it cannot read", () => {
    expect(jsonSchemaToTs(undefined)).toBe("unknown");
    expect(jsonSchemaToTs({})).toBe("unknown");
  });
});

describe("generateTypeScript", () => {
  it("uses the input and output schemas of a procedure", () => {
    const text = generateTypeScript([
      { path: ["users", "get"], inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    ]);
    expect(text).toContain("input: {\n      id: string;\n    };");
    expect(text).toContain("output: unknown;");
  });
});
