/**
 * The help of a command lists the fields of its result (roadmap 2.1: the output schemas describe
 * the results).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodAdapter } from "@mark1russell7/client";
import { generateHelp, resultFieldsOfSchema } from "./parse.js";

describe("the help of a command", () => {
  it("lists the fields of an object result, with their types and descriptions", () => {
    const output = zodAdapter(
      z.looseObject({
        found: z.boolean().describe("True when the program is found"),
        path: z.string().nullable().optional().describe("The full path of the program"),
      })
    );
    const result = resultFieldsOfSchema(output);
    expect(result.map((field) => field.name)).toEqual(["found", "path"]);

    const help = generateHelp(["shell", "which"], { description: "Find a program" }, [], result);
    expect(help).toContain("Result:");
    expect(help).toContain("  found (boolean)");
    expect(help).toContain("True when the program is found");
    expect(help).toMatch(/ {2}path \([^)]*, optional\)/);
  });

  it("has no result section for a result that is not an object", () => {
    const union = zodAdapter(z.union([z.looseObject({ a: z.string() }), z.looseObject({ b: z.number() })]));
    expect(resultFieldsOfSchema(union)).toEqual([]);
    expect(resultFieldsOfSchema(undefined)).toEqual([]);
    expect(generateHelp(["x"], {}, [], [])).not.toContain("Result:");
  });
});
