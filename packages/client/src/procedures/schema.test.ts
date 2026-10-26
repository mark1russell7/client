/**
 * The schemas of procedures (roadmap 2.1): any Standard Schema validates the input and the
 * output, also an asynchronous one, and one function gives the JSON Schema of each.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineProcedure } from "./define.js";
import { invokeProcedure, outputValue } from "./invoke.js";
import { anySchema, outputSchema, typed, typedAnySchema, zodAdapter } from "./core/schemas.js";
import { describeIssues, jsonSchemaOf, validateSchema, type StandardSchemaV1 } from "./schema.js";

/** A Standard Schema with no zod: a positive number (the shape valibot and arktype give). */
function positiveNumber(asynchronous = false): StandardSchemaV1<unknown, number> {
  const check = (value: unknown): StandardSchemaV1.Result<number> =>
    typeof value === "number" && value > 0 ? { value } : { issues: [{ message: "Expected a positive number", path: ["n"] }] };
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => (asynchronous ? Promise.resolve(check(value)) : check(value)),
    },
  };
}

describe("validateSchema", () => {
  it("validates with a zod 4 schema, and gives the issues with their paths", () => {
    const schema = z.object({ filter: z.object({ status: z.string() }) });
    expect(validateSchema(schema, { filter: { status: "open" } })).toEqual({ ok: true, value: { filter: { status: "open" } } });
    const failed = validateSchema(schema, { filter: { status: 5 } });
    expect(failed).toMatchObject({ ok: false });
    expect((failed as { message: string }).message).toMatch(/^filter\.status: /);
  });

  it("gives a result at once for a synchronous schema, and a Promise for an asynchronous one", async () => {
    expect(validateSchema(positiveNumber(), 2)).toEqual({ ok: true, value: 2 });
    const later = validateSchema(positiveNumber(true), -1);
    expect(later).toBeInstanceOf(Promise);
    expect(await later).toMatchObject({ ok: false, message: "n: Expected a positive number" });
  });

  it("keeps the message of a parse-only schema that throws a plain error", () => {
    const schema = zodAdapter<string>({
      parse: () => {
        throw new Error("give exactly one of id or filter");
      },
    });
    expect(validateSchema(schema, {})).toMatchObject({ ok: false, message: "give exactly one of id or filter" });
  });

  it("writes array indexes in brackets", () => {
    expect(describeIssues([{ message: "bad", path: ["items", 2, { key: "name" }] }])).toBe("items[2].name: bad");
  });

  it("gives the messages inside an issue: a record key, the branches of a union", () => {
    const portions = z.object({
      portions: z.record(z.string().refine((key) => !key.endsWith("s"), "write cup, not cups"), z.number()),
    });
    const keyResult = validateSchema(portions, { portions: { cups: 1 } });
    expect(keyResult).toMatchObject({ ok: false });
    expect((keyResult as { message: string }).message).toMatch(/portions\.cups: .*\(.*write cup, not cups\)/);

    const choice = z.union([z.object({ kind: z.literal("a") }), z.object({ kind: z.literal("b"), n: z.number() })]);
    const unionResult = validateSchema(choice, { kind: "c" });
    expect((unionResult as { message: string }).message).toMatch(/\(.+\)/);
  });
});

describe("a procedure with a Standard Schema", () => {
  it("validates its input with a schema that has no parse method", async () => {
    const procedure = defineProcedure({
      path: ["t", "double"],
      input: positiveNumber(),
      output: positiveNumber(),
      handler: (n: number) => n * 2,
    });
    expect(await outputValue(await invokeProcedure(procedure, 4))).toBe(8);
    await expect(invokeProcedure(procedure, -4)).rejects.toThrow("Input validation failed for t.double: n: Expected a positive number");
  });

  it("waits for an asynchronous schema, for the input and the output", async () => {
    const procedure = defineProcedure({
      path: ["t", "half"],
      input: positiveNumber(true),
      output: positiveNumber(true),
      handler: (n: number) => n - 10,
    });
    expect(await outputValue(await invokeProcedure(procedure, 20))).toBe(10);
    await expect(invokeProcedure(procedure, 5)).rejects.toThrow("Output validation failed for t.half");
  });
});

describe("jsonSchemaOf", () => {
  it("gives the input JSON Schema of a zod schema, with descriptions and defaults, and no $schema", () => {
    const schema = z.object({
      collection: z.string().describe("The collection"),
      limit: z.number().int().default(10).describe("The most documents"),
      when: z.date().optional(),
    });
    expect(jsonSchemaOf(schema)).toEqual({
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection" },
        limit: { type: "integer", default: 10, description: "The most documents", minimum: expect.any(Number), maximum: expect.any(Number) },
        // A date has no JSON form: any value, so the description does not fail
        when: {},
      },
      required: ["collection"],
    });
  });

  it("gives {} for anySchema, and nothing for a pass-through output schema or a custom schema", () => {
    expect(jsonSchemaOf(anySchema)).toEqual({});
    expect(jsonSchemaOf(outputSchema<{ a: string }>())).toBeUndefined();
    expect(jsonSchemaOf(positiveNumber())).toBeUndefined();
  });

  it("uses the Standard JSON Schema converter of another library", () => {
    const schema = {
      ...positiveNumber(),
      "~standard": {
        ...positiveNumber()["~standard"],
        jsonSchema: {
          input: () => ({ $schema: "http://json-schema.org/draft-07/schema#", type: "number", exclusiveMinimum: 0 }),
          output: () => ({ type: "number" }),
        },
      },
    };
    expect(jsonSchemaOf(schema)).toEqual({ type: "number", exclusiveMinimum: 0 });
  });
});

describe("route resolution with an asynchronous schema", () => {
  it("leaves the input to the invocation, which validates it", async () => {
    const { ProcedureRegistry } = await import("./registry.js");
    const { createRouteResolver } = await import("../client/route-resolver.js");
    const registry = new ProcedureRegistry();
    registry.register(defineProcedure({ path: ["t", "async"], input: positiveNumber(true), output: anySchema, handler: (n: number) => n }));
    const resolution = createRouteResolver(registry).resolve({ t: { async: { in: 3 } } } as never);
    expect(resolution.errors).toEqual([]);
    expect(resolution.resolved[0]).toMatchObject({ input: 3, inputValidated: false });
  });
});

describe("typed<T>() (O58)", () => {
  it("passes each value through, and has no JSON Schema", () => {
    const schema = typed<{ id: string }>();
    expect(validateSchema(schema, { id: "a" })).toEqual({ ok: true, value: { id: "a" } });
    expect(validateSchema(schema, 42)).toEqual({ ok: true, value: 42 });
    expect(schema.safeParse("x")).toEqual({ success: true, data: "x" });
    expect(jsonSchemaOf(schema)).toBeUndefined();
  });

  it("validates like the deprecated names outputSchema and typedAnySchema", () => {
    for (const schema of [typed<number>(), outputSchema<number>(), typedAnySchema<number>()]) {
      expect(validateSchema(schema, 7)).toEqual({ ok: true, value: 7 });
      expect(schema.parse("seven")).toBe("seven");
    }
  });

  it("gives its type to a procedure without a cast", async () => {
    const procedure = defineProcedure({
      path: ["typed", "double"],
      input: typed<{ n: number }>(),
      output: typed<number>(),
      handler: async ({ n }) => n * 2,
    });
    expect(await outputValue(await invokeProcedure(procedure, { n: 4 }))).toBe(8);
  });
});
