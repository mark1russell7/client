/**
 * Property tests of the command line of mark (roadmap R29). A command line made from random
 * values by the documented rules gives back the same values. Any command line gives a result
 * or errors, and never throws. A flag that nothing declares is an error, and it never reaches
 * the input.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { z } from "zod";
import { createProcedure, outputSchema, zodAdapter, type AnyProcedure } from "@procedures/client";
import { parseCommandLine } from "./args.js";
import { testProcedures } from "../test/procedures.js";

const RUNS = Number(process.env["FC_RUNS"] ?? 300);
const params = { numRuns: RUNS };

const command = createProcedure()
  .path(["t", "run"])
  .input(
    zodAdapter(
      z.object({
        name: z.string(),
        rest: z.array(z.string()).optional(),
        count: z.number().optional(),
        flag: z.boolean().optional(),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
      }),
    ),
  )
  .output(outputSchema<unknown>())
  .meta({ args: ["name", "rest"], shorts: { flag: "x" } } as Record<string, unknown>)
  .handler(async (input: unknown) => input)
  .build() as unknown as AnyProcedure;

const procedures = [command];

/** A text of an array item: text that starts with "[" is a JSON array (a documented rule). */
const itemText = fc.string({ maxLength: 8 }).filter((text) => !text.trimStart().startsWith("["));
/** A key of a record flag: not empty, without "=", and not JSON. */
const recordKey = fc
  .string({ minLength: 1, maxLength: 6 })
  .filter((key) => !key.includes("=") && !key.trimStart().startsWith("{") && key !== "__proto__");
/** A number without -0: the text "0" gives 0, and toEqual tells 0 from -0. */
const number = fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true })).filter((value) => !Object.is(value, -0));

const values = fc.record(
  {
    name: fc.string({ maxLength: 8 }),
    rest: fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 }),
    count: number,
    flag: fc.boolean(),
    title: fc.string({ maxLength: 8 }),
    tags: fc.array(itemText, { minLength: 1, maxLength: 3 }),
    env: fc.dictionary(recordKey, fc.string({ maxLength: 6 }), { minKeys: 1, maxKeys: 3 }),
  },
  { requiredKeys: ["name", "rest"] },
);

type Values = typeof values extends fc.Arbitrary<infer T> ? T : never;

/** The forms of a boolean flag: `--flag`, `--flag=true`, `--flag true`, the short letter, `--no-flag`. */
const booleanForm = fc.constantFrom("bare", "inline", "separate", "short");

/** This function writes the command line of the values, by the rules of `args.ts`. */
function render(value: Values, forms: { bool: string; title: boolean }): string[] {
  const flags: string[] = [];
  if (value.count !== undefined) flags.push("--count", String(value.count));
  if (value.flag !== undefined) {
    if (forms.bool === "bare") flags.push(value.flag ? "--flag" : "--no-flag");
    else if (forms.bool === "inline") flags.push(`--flag=${value.flag}`);
    else if (forms.bool === "separate") flags.push("--flag", String(value.flag));
    else flags.push(value.flag ? "-x" : "--no-flag");
  }
  if (value.title !== undefined) {
    // A title that starts with "-" goes inline: as a separate token, it is a flag
    if (forms.title && !value.title.startsWith("-")) flags.push("--title", value.title);
    else flags.push(`--title=${value.title}`);
  }
  for (const tag of value.tags ?? []) flags.push(`--tags=${tag}`);
  for (const [key, text] of Object.entries(value.env ?? {})) {
    const pair = `${key}=${text}`;
    if (pair.startsWith("-")) flags.push(`--env=${pair}`);
    else flags.push("--env", pair);
  }
  // After "--", each token is a positional argument, also one that starts with "-"
  return ["t", "run", ...flags, "--", value.name, ...value.rest];
}

/** The input that the command line of the values gives. */
function expected(value: Values): Record<string, unknown> {
  const input: Record<string, unknown> = { name: value.name };
  if (value.rest.length > 0) input["rest"] = value.rest;
  for (const key of ["count", "flag", "title", "tags", "env"] as const) {
    if (value[key] !== undefined) input[key] = value[key];
  }
  return input;
}

describe("the command line of mark (R29)", () => {
  it("gives back the values of a command line that the rules make", () => {
    fc.assert(
      fc.property(values, booleanForm, fc.boolean(), (value, bool, title) => {
        const line = parseCommandLine(render(value, { bool, title }), procedures);
        expect(line.errors).toEqual([]);
        expect(line.path).toEqual(["t", "run"]);
        const { rest, ...others } = line.input;
        const { rest: expectedRest, ...expectedOthers } = expected(value);
        expect(others).toEqual(expectedOthers);
        expect((rest as unknown[] | undefined) ?? []).toEqual((expectedRest as unknown[] | undefined) ?? []);
      }),
      params,
    );
  });

  it("gives a result or errors for any command line, and never throws", () => {
    const token = fc.oneof(
      fc.string({ maxLength: 10 }),
      fc.constantFrom("--", "-", "--no-", "-x", "--flag", "--count", "--env", "=", "--=", "-1", "--help", "--format", "t", "run"),
      fc.string({ maxLength: 6 }).map((text) => `--${text}`),
      fc.string({ maxLength: 6 }).map((text) => `-${text}`),
    );
    const all = [...procedures, ...testProcedures()];
    fc.assert(
      fc.property(fc.array(token, { maxLength: 10 }), (argv) => {
        const line = parseCommandLine(argv, all);
        expect(Array.isArray(line.errors)).toBe(true);
        expect(typeof line.input).toBe("object");
      }),
      params,
    );
  });

  it("refuses a flag that nothing declares, and keeps it out of the input", () => {
    const declared = new Set(["count", "flag", "title", "tags", "env", "name", "rest", "x"]);
    const unknown = fc
      .stringMatching(/^[a-z][a-z0-9]{1,8}$/)
      .filter((name) => !declared.has(name) && !name.startsWith("no") && !["help", "version", "verbose", "format", "local", "json", "interactive", "server", "port", "host", "transport", "input"].includes(name));
    fc.assert(
      fc.property(unknown, fc.string({ maxLength: 6 }), (name, text) => {
        const line = parseCommandLine(["t", "run", `--${name}=${text}`, "--", "n"], procedures);
        expect(line.errors.length).toBeGreaterThan(0);
        expect(Object.keys(line.input)).not.toContain(name);
      }),
      params,
    );
  });
});
