/**
 * The help of a command lists the fields of its result (roadmap 2.1: the output schemas describe
 * the results).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {  } from "@procedures/client";
import { generateHelp, resultFieldsOfSchema } from "./parse.js";

describe("the help of a command", () => {
  it("lists the fields of an object result, with their types and descriptions", () => {
    const output = z.looseObject({
        found: z.boolean().describe("True when the program is found"),
        path: z.string().nullable().optional().describe("The full path of the program"),
      });
    const result = resultFieldsOfSchema(output);
    expect(result.map((field) => field.name)).toEqual(["found", "path"]);

    const help = generateHelp(["shell", "which"], { description: "Find a program" }, [], result);
    expect(help).toContain("Result:");
    expect(help).toContain("  found (boolean)");
    expect(help).toContain("True when the program is found");
    expect(help).toMatch(/ {2}path \([^)]*, optional\)/);
  });

  it("shows one value for a number, a string, a boolean or an array result", () => {
    const result = resultFieldsOfSchema(z.number().describe("The sum of a and b"));
    expect(result.map((field) => [field.name, field.type])).toEqual([["value", "number"]]);
    const help = generateHelp(["client", "add"], { description: "Add two numbers" }, [], result);
    expect(help).toContain("Result:");
    expect(help).toContain("  value (number)");
    expect(help).toContain("The sum of a and b");
  });

  it("has no result section for a union or any value", () => {
    const union = z.union([z.looseObject({ a: z.string() }), z.looseObject({ b: z.number() })]);
    expect(resultFieldsOfSchema(union)).toEqual([]);
    expect(resultFieldsOfSchema(undefined)).toEqual([]);
    expect(generateHelp(["x"], {}, [], [])).not.toContain("Result:");
  });
});
