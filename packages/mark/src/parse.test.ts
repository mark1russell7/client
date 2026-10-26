/**
 * parseFromSchema turns the old parameter shape (positional values and options) into the input of
 * a procedure. The help of mark has the name `mark` and the global flags of mark.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { generateHelp, parseFromSchema } from "./parse.js";

const schema = z.object({
  name: z.string(),
  count: z.number().optional(),
  dryRun: z.boolean().optional(),
});

describe("parseFromSchema", () => {
  it("gives the positional values to the fields of meta.args, converted by the schema", () => {
    const input = parseFromSchema({ array: ["007", "3"] }, { args: ["name", "count"] }, schema);
    expect(input).toEqual({ name: "007", count: 3 });
  });

  it("skips a positional field that has no value", () => {
    expect(parseFromSchema({ array: [] }, { args: ["name"] }, schema)).toEqual({});
  });

  it("maps short flags and kebab-case options to their fields", () => {
    const input = parseFromSchema(
      { options: { c: "5", "dry-run": true } },
      { shorts: { count: "c" } },
      schema,
    );
    expect(input).toEqual({ count: 5, dryRun: true });
  });

  it("keeps a positional value when an option has the same name", () => {
    const input = parseFromSchema({ array: ["a"], options: { name: "b" } }, { args: ["name"] }, schema);
    expect(input).toEqual({ name: "a" });
  });

  it("sets an option of a positional field that has no positional value", () => {
    const input = parseFromSchema({ options: { name: "b" } }, { args: ["name"] }, schema);
    expect(input).toEqual({ name: "b" });
  });

  it("throws the conversion error, with the flag of the field", () => {
    expect(() => parseFromSchema({ options: { count: "many" } }, {}, schema)).toThrow(/--count/);
  });

  it("reads JSON without a schema, and keeps other text", () => {
    const input = parseFromSchema({ options: { list: "[1,2]", word: "hello" } }, {});
    expect(input).toEqual({ list: [1, 2], word: "hello" });
  });

  it("gives an empty input for no parameters", () => {
    expect(parseFromSchema({}, {})).toEqual({});
  });
});

describe("the help of mark", () => {
  it("names mark and lists the global flags of a command, not the modes", () => {
    const help = generateHelp(["shell", "which"], { description: "Find a program", args: ["name"] }, schema);
    expect(help).toContain("mark shell which");
    expect(help).toContain("Find a program");
    expect(help).toContain("--json");
    expect(help).not.toContain("--version");
  });
});
