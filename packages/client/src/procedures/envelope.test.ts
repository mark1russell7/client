/**
 * The envelope form of a program (coeval D6, D9 and D10, roadmap item M7 of coeval).
 *
 * - The examples of PROGRAM-FORMAT.md in the envelope form give the results of the `$proc` form.
 * - The conversion changes each form into the other, and the round trip gives the same program.
 * - In an envelope program, the `$proc` form is data. In a `$proc` program, an envelope is data.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Client } from "../client/client.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { ProcedureRegistry } from "./registry.js";
import { allCoreProcedures } from "./core/index.js";
import { metaProcedures } from "./define-procedure.js";
import { MAX_DATA_DEPTH, isProcedureRef, proc, type ProcedureRefJson, type RefExecutor } from "./ref.js";
import { hydrateInput } from "./program.js";
import { fromEnvelopeProgram, isEnvelopeProgram, toEnvelopeProgram, type EnvelopeProgram } from "./envelope.js";

const RUNS = Number(process.env["FC_RUNS"] ?? 200);

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

/** A client with the core procedures. `test.input` gives `{ got, undefined }` for the input that it gets. */
function makeClient(): Client {
  const registry = new ProcedureRegistry();
  for (const procedure of [...allCoreProcedures, ...metaProcedures]) registry.register(procedure);
  registry.register(
    defineProcedure({
      path: ["test", "input"],
      input: outputSchema<unknown>(),
      output: outputSchema<unknown>(),
      handler: (input: unknown) => ({ got: input, undefined: input === undefined }),
    }),
  );
  return new Client(stubTransport).useRegistry(registry);
}

// The two forms of a call and of a reference
const call = (path: string[], value: unknown, name?: string): EnvelopeProgram => ({
  type: path,
  value,
  ...(name !== undefined ? { name } : {}),
});
const ref = (...path: unknown[]) => ({ type: "ref", value: path });
const names = (...keys: unknown[]) => ref("names", ...keys);
const literal = (value: unknown) => ({ type: "literal", value });
const $call = (path: string[], input: unknown, name?: string): ProcedureRefJson => ({
  $proc: path,
  input,
  ...(name !== undefined ? { $name: name } : {}),
});

/** The examples of PROGRAM-FORMAT.md without `$when`: the two forms and the result of the document. */
const EXAMPLES: Array<{ name: string; native: ProcedureRefJson; envelope: EnvelopeProgram; result: unknown }> = [
  {
    name: "1. a call",
    native: $call(["client", "add"], { a: 1, b: 2 }),
    envelope: call(["client", "add"], { a: 1, b: 2 }),
    result: 3,
  },
  {
    name: "3. nested calls",
    native: $call(["client", "multiply"], { a: $call(["client", "add"], { a: 1, b: 2 }), b: 10 }),
    envelope: call(["client", "multiply"], { a: call(["client", "add"], { a: 1, b: 2 }), b: 10 }),
    result: 30,
  },
  {
    name: "4. a chain with names and last",
    native: $call(["client", "chain"], {
      steps: [
        $call(["client", "add"], { a: 1, b: 2 }, "sum"),
        $call(["client", "multiply"], { a: { $ref: "sum" }, b: 10 }),
        $call(["client", "add"], { a: { $ref: "$last" }, b: { $ref: "sum" } }),
      ],
    }),
    envelope: call(["client", "chain"], {
      steps: [
        call(["client", "add"], { a: 1, b: 2 }, "sum"),
        call(["client", "multiply"], { a: names("sum"), b: 10 }),
        call(["client", "add"], { a: names("last"), b: names("sum") }),
      ],
    }),
    result: { results: [3, 30, 33], final: 33 },
  },
  {
    name: "6. a literal",
    native: $call(["client", "identity"], { value: { $literal: { $proc: ["client", "add"], input: { a: 1, b: 2 } } } }),
    envelope: call(["client", "identity"], { value: literal({ $proc: ["client", "add"], input: { a: 1, b: 2 } }) }),
    result: { $proc: ["client", "add"], input: { a: 1, b: 2 } },
  },
  {
    name: "7. an implicit chain",
    native: $call(["client", "identity"], {
      value: [$call(["client", "add"], { a: 1, b: 2 }), $call(["client", "multiply"], { a: { $ref: "$last" }, b: 10 })],
    }),
    envelope: call(["client", "identity"], {
      value: [call(["client", "add"], { a: 1, b: 2 }), call(["client", "multiply"], { a: names("last"), b: 10 })],
    }),
    result: { results: [3, 30], final: 30 },
  },
  {
    name: "7. a list of results in the input of a nested call",
    native: $call(["client", "identity"], {
      value: $call(["client", "identity"], {
        value: [$call(["client", "add"], { a: 1, b: 2 }), $call(["client", "add"], { a: 3, b: 4 })],
      }),
    }),
    envelope: call(["client", "identity"], {
      value: call(["client", "identity"], {
        value: [call(["client", "add"], { a: 1, b: 2 }), call(["client", "add"], { a: 3, b: 4 })],
      }),
    }),
    result: [3, 7],
  },
  {
    name: "8. client.conditional",
    native: $call(["client", "conditional"], {
      condition: $call(["client", "gt"], { a: 5, b: 3 }),
      then: { total: $call(["client", "add"], { a: 5, b: 3 }) },
      else: "small",
    }),
    envelope: call(["client", "conditional"], {
      condition: call(["client", "gt"], { a: 5, b: 3 }),
      then: { total: call(["client", "add"], { a: 5, b: 3 }) },
      else: "small",
    }),
    result: { total: 8 },
  },
  {
    name: "8. client.map with item and index",
    native: $call(["client", "map"], {
      items: [1, 2, 3],
      fn: $call(["client", "multiply"], { a: { $ref: "item" }, b: { $ref: "index" } }),
    }),
    envelope: call(["client", "map"], {
      items: [1, 2, 3],
      fn: call(["client", "multiply"], { a: names("item"), b: names("index") }),
    }),
    result: { results: [0, 2, 6] },
  },
  {
    name: "8. client.tryCatch with error",
    native: $call(["client", "tryCatch"], {
      try: $call(["client", "throw"], { message: "disk full" }),
      catch: { $ref: "error" },
    }),
    envelope: call(["client", "tryCatch"], {
      try: call(["client", "throw"], { message: "disk full" }),
      catch: names("error"),
    }),
    result: { success: false, value: "disk full", error: "disk full" },
  },
];

describe("the examples of PROGRAM-FORMAT.md in the envelope form", () => {
  for (const example of EXAMPLES) {
    it(example.name, async () => {
      expect(isEnvelopeProgram(example.envelope)).toBe(true);
      expect(fromEnvelopeProgram(example.envelope)).toStrictEqual(example.native);
      expect(toEnvelopeProgram(example.native)).toStrictEqual(example.envelope);
      expect(await makeClient().exec(example.envelope)).toEqual(example.result);
      expect(await makeClient().exec(example.native)).toEqual(example.result);
    });
  }

  it("10. procedure.define with a body in the envelope form", async () => {
    const client = makeClient();
    const program = call(["procedure", "define"], {
      path: ["math", "double"],
      aggregation: call(["client", "multiply"], { a: names("input", "x"), b: 2 }),
    });
    expect(fromEnvelopeProgram(program)).toStrictEqual(
      $call(["procedure", "define"], {
        path: ["math", "double"],
        aggregation: $call(["client", "multiply"], { a: { $ref: "input.x" }, b: 2 }),
      }),
    );
    await client.exec(program);
    expect(await client.exec(["math", "double"], { x: 21 })).toBe(42);
  });

  it("a ref into the world is a type: it gives the path of the procedure", async () => {
    const program = { type: ref("world", "client", "add"), value: { a: 1, b: 2 } };
    expect(isEnvelopeProgram(program)).toBe(true);
    expect(fromEnvelopeProgram(program as EnvelopeProgram)).toStrictEqual($call(["client", "add"], { a: 1, b: 2 }));
    expect(await makeClient().exec(program as EnvelopeProgram)).toBe(3);
    // A nested call can have this type too
    const nested = call(["client", "multiply"], { a: { type: ref("world", "client", "add"), value: { a: 1, b: 2 } }, b: 10 });
    expect(await makeClient().exec(nested)).toBe(30);
  });

  it("exec(program, input) puts the fields of input over the input of the program", async () => {
    const result = await makeClient().exec(call(["client", "add"], { a: 1, b: 1 }), { b: 41 });
    expect(result).toBe(42);
  });

  it("execStream accepts the envelope form", async () => {
    const items: unknown[] = [];
    for await (const item of makeClient().execStream(call(["client", "add"], { a: 1, b: 2 }))) items.push(item);
    expect(items).toEqual([3]);
  });

  it("a ref key can be an integer: [\"names\", \"items\", 0] reads items.0", async () => {
    expect(fromEnvelopeProgram(call(["client", "identity"], { value: names("items", 0, "id") })).input).toStrictEqual({
      value: { $ref: "items.0.id" },
    });
    const program = call(["client", "chain"], {
      steps: [
        call(["client", "identity"], { value: [{ id: "first" }] }, "items"),
        call(["client", "identity"], { value: names("items", 0, "id") }),
      ],
    });
    expect(await makeClient().exec(program)).toEqual({ results: [[{ id: "first" }], "first"], final: "first" });
  });
});

describe("a call without input", () => {
  it("a value of null gives a call without input: the procedure gets undefined", async () => {
    const program = call(["test", "input"], null);
    expect(fromEnvelopeProgram(program)).toStrictEqual({ $proc: ["test", "input"] });
    expect(await makeClient().exec(program)).toEqual({ got: undefined, undefined: true });
  });

  it("with passThrough, client.chain gives such a step the result of the step before", async () => {
    const program = call(["client", "chain"], {
      passThrough: true,
      steps: [call(["client", "add"], { a: 1, b: 2 }), call(["test", "input"], null)],
    });
    expect(await makeClient().exec(program)).toMatchObject({ final: { got: 3, undefined: false } });
  });

  it("a literal null gives the input null", async () => {
    const program = call(["test", "input"], literal(null));
    expect(fromEnvelopeProgram(program)).toStrictEqual({ $proc: ["test", "input"], input: { $literal: null } });
    expect(await makeClient().exec(program)).toEqual({ got: null, undefined: false });
  });

  it("toEnvelopeProgram gives the value null to a call without input", () => {
    expect(toEnvelopeProgram({ $proc: ["test", "input"] })).toStrictEqual({ type: ["test", "input"], value: null });
    expect(toEnvelopeProgram(proc(["test", "input"]).input(undefined).build())).toStrictEqual({
      type: ["test", "input"],
      value: null,
    });
  });
});

describe("the escapes: in an envelope program, the $proc form is data", () => {
  it("a $proc object is data", async () => {
    const data = { $proc: ["client", "add"], input: { a: 1, b: 2 } };
    const program = call(["client", "identity"], { value: data });
    expect(fromEnvelopeProgram(program).input).toStrictEqual({ value: { $literal: data } });
    expect(await makeClient().exec(program)).toEqual(data);
  });

  it("a $ref object is data, also in the scope of a chain", async () => {
    const program = call(["client", "chain"], {
      steps: [call(["client", "add"], { a: 1, b: 2 }, "sum"), call(["client", "identity"], { value: { $ref: "sum" } })],
    });
    expect(await makeClient().exec(program)).toEqual({ results: [3, { $ref: "sum" }], final: { $ref: "sum" } });
  });

  it("a $literal object is data", async () => {
    const program = call(["client", "identity"], { value: { $literal: 5 } });
    expect(await makeClient().exec(program)).toEqual({ $literal: 5 });
  });

  it("a runtime ProcedureRef is data", async () => {
    const runtime = proc(["client", "add"]).input({ a: 1, b: 2 }).build();
    const converted = fromEnvelopeProgram(call(["client", "identity"], { value: runtime }));
    expect((converted.input as { value: { $literal: unknown } }).value.$literal).toBe(runtime);
    const result = await makeClient().exec(call(["client", "identity"], { value: runtime }));
    expect(isProcedureRef(result)).toBe(true);
  });

  it("a literal envelope gives its value as data", async () => {
    const data = call(["client", "add"], { a: 1, b: 2 });
    const program = call(["client", "identity"], { value: literal(data) });
    expect(await makeClient().exec(program)).toEqual(data);
  });

  it("the type \"lit\" (the kind of the kernel) is an alias of \"literal\"", async () => {
    const data = call(["client", "add"], { a: 1, b: 2 });
    const program = call(["client", "identity"], { value: { type: "lit", value: data } });
    expect(await makeClient().exec(program)).toEqual(data);
    expect(fromEnvelopeProgram(program)).toStrictEqual($call(["client", "identity"], { value: { $literal: data } }));
    expect(isEnvelopeProgram({ type: "lit", value: 1 })).toBe(false);
    // The functions of the module write the type "literal"
    expect(toEnvelopeProgram(fromEnvelopeProgram(program))).toStrictEqual(call(["client", "identity"], { value: literal(data) }));
  });

  it("an envelope of another type is data, and the calls in it run", async () => {
    const program = call(["client", "identity"], { value: { type: "point", value: call(["client", "add"], { a: 1, b: 2 }) } });
    expect(await makeClient().exec(program)).toEqual({ type: "point", value: 3 });
  });

  it("a value that is not plain data stays the same object", () => {
    const when = new Date(0);
    const map = new Map([["a", 1]]);
    const converted = fromEnvelopeProgram(call(["client", "identity"], { value: { when, map } }));
    const input = converted.input as { value: { when: Date; map: Map<string, number> } };
    expect(input.value.when).toBe(when);
    expect(input.value.map).toBe(map);
  });

  it("the conversion copies the program: it does not change it", () => {
    const program = call(["client", "add"], { a: names("last"), b: 1 });
    const copy = structuredClone(program);
    fromEnvelopeProgram(program);
    expect(program).toStrictEqual(copy);
  });
});

describe("the old programs do not change: in a $proc program, an envelope is data", () => {
  it("a call envelope in the input of a $proc program is data", async () => {
    const data = call(["client", "add"], { a: 1, b: 2 });
    expect(await makeClient().exec($call(["client", "identity"], { value: data }))).toEqual(data);
  });

  it("a ref envelope in a chain of a $proc program is data", async () => {
    const program = $call(["client", "chain"], {
      steps: [$call(["client", "add"], { a: 1, b: 2 }, "sum"), $call(["client", "identity"], { value: names("sum") })],
    });
    expect(await makeClient().exec(program)).toEqual({ results: [3, names("sum")], final: names("sum") });
  });

  it("hydration of a $proc input keeps an envelope as data", async () => {
    const input = { value: call(["client", "add"], { a: 1, b: 2 }), ref: names("x"), literal: literal(1) };
    const executor = (async () => {
      throw new Error("nothing runs");
    }) as unknown as RefExecutor;
    expect(await hydrateInput(input, executor)).toBe(input);
  });

  it("exec() keeps its error for a root that is not a program", async () => {
    const message = "exec() requires a ProcedureRef, $proc JSON, or procedure path array";
    await expect(makeClient().exec(42 as never)).rejects.toThrow(message);
    // An object with the shape of an envelope, but whose type is not a procedure path
    await expect(makeClient().exec({ type: [], value: 1 } as never)).rejects.toThrow(message);
    await expect(makeClient().exec({ type: "point", value: 1 } as never)).rejects.toThrow(message);
  });
});

describe("isEnvelopeProgram", () => {
  it("is true for a call envelope", () => {
    expect(isEnvelopeProgram({ type: ["client", "add"], value: { a: 1 } })).toBe(true);
    expect(isEnvelopeProgram({ type: ["client", "add"], value: null, name: "sum" })).toBe(true);
    expect(isEnvelopeProgram({ type: ["client", "add"], value: 1, own: {} })).toBe(true);
    expect(isEnvelopeProgram({ type: ref("world", "client", "add"), value: 1 })).toBe(true);
  });

  it("is false for the other values", () => {
    for (const value of [
      null,
      "client.add",
      ["client", "add"],
      { $proc: ["client", "add"], input: {} },
      proc(["client", "add"]).build(),
      { type: ["client", "add"] },
      { value: 1 },
      { type: ["client", "add"], value: 1, input: 2 },
      { type: [], value: 1 },
      { type: ["client", 1], value: 1 },
      { type: "client.add", value: 1 },
      { type: "ref", value: ["names", "x"] },
      { type: "literal", value: 1 },
      { type: ref("world"), value: 1 },
      { type: ref("names", "op"), value: 1 },
      { type: { ...ref("world", "client", "add"), name: "x" }, value: 1 },
      Object.create({ type: ["client", "add"], value: 1 }) as object,
    ]) {
      expect(isEnvelopeProgram(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("the errors", () => {
  const inIdentity = (value: unknown) => call(["client", "identity"], { value });

  it("a ref with a root other than names", () => {
    expect(() => fromEnvelopeProgram(inIdentity(ref("world", "client", "add")))).toThrow(
      /reads only the root "names".*the root "world".*only the type of a call/,
    );
    for (const root of ["self", "event", "caps", "other"]) {
      expect(() => fromEnvelopeProgram(inIdentity(ref(root, "x")))).toThrow(`the root "${root}"`);
    }
  });

  it("a bad ref path", () => {
    expect(() => fromEnvelopeProgram(inIdentity(ref()))).toThrow(/must be a path/);
    expect(() => fromEnvelopeProgram(inIdentity({ type: "ref", value: "names.x" }))).toThrow(/must be a path/);
    expect(() => fromEnvelopeProgram(inIdentity(names()))).toThrow(/needs a name/);
    expect(() => fromEnvelopeProgram(inIdentity(names("a.b")))).toThrow(/without a dot/);
    for (const key of [-1, 1.5, Number.NaN, {}, null, true]) {
      expect(() => fromEnvelopeProgram(inIdentity(names("items", key)))).toThrow(/integer of 0 or more/);
    }
  });

  it("a header on a ref or a literal", () => {
    expect(() => fromEnvelopeProgram(inIdentity({ ...names("x"), name: "y" }))).toThrow(/Only a call has a header/);
    expect(() => fromEnvelopeProgram(inIdentity({ ...literal(1), own: {} }))).toThrow(/Only a call has a header/);
  });

  it("own entries and a name that is not a string", () => {
    expect(() => fromEnvelopeProgram({ type: ["client", "add"], value: 1, own: { x: 1 } })).toThrow(/no own entries/);
    expect(() => fromEnvelopeProgram(inIdentity({ type: ["client", "add"], value: 1, own: 1 }))).toThrow(/no own entries/);
    expect(() => fromEnvelopeProgram({ type: ["client", "add"], value: 1, name: 5 } as never)).toThrow(/must be a string/);
  });

  it("a type that is a ref, but not into the world", () => {
    expect(() => fromEnvelopeProgram(inIdentity({ type: names("op"), value: 1 }))).toThrow(/ref into the world/);
  });

  it("a root that is not a call", () => {
    expect(() => fromEnvelopeProgram($call(["client", "add"], {}) as never)).toThrow(/requires a call/);
    expect(() => fromEnvelopeProgram(names("x") as never)).toThrow(/requires a call/);
  });

  it("a cyclic or a too deep program", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => fromEnvelopeProgram(inIdentity(cyclic))).toThrow(/cyclic/);
    let deep: unknown = 1;
    for (let level = 0; level <= MAX_DATA_DEPTH + 1; level++) deep = [deep];
    expect(() => fromEnvelopeProgram(inIdentity(deep))).toThrow(/levels of nesting/);
    // A value that occurs twice is not a cycle
    const shared = { a: 1 };
    expect(fromEnvelopeProgram(inIdentity([shared, shared])).input).toStrictEqual({ value: [{ a: 1 }, { a: 1 }] });
  });

  it("client.exec() gives the error of the conversion", async () => {
    await expect(makeClient().exec(inIdentity(ref("self", "x")))).rejects.toThrow(/the root "self"/);
  });

  it("toEnvelopeProgram refuses $when", () => {
    expect(() => toEnvelopeProgram({ $proc: ["client", "add"], input: {}, $when: "$never" })).toThrow(/no \$when/);
    expect(() =>
      toEnvelopeProgram($call(["client", "identity"], { value: { $proc: ["client", "add"], input: {}, $when: "$parent" } })),
    ).toThrow(/no \$when/);
    expect(() => toEnvelopeProgram(proc(["client", "add"]).input({}).defer().build())).toThrow(/no \$when/);
  });

  it("toEnvelopeProgram refuses what the envelope form cannot keep", () => {
    // A step with the name "last": ["names", "last"] reads the step before
    expect(() => toEnvelopeProgram($call(["client", "identity"], { value: { $ref: "last.x" } }))).toThrow(/name "last"/);
    // Data with the shape of a construct that holds a call: a literal stops the call
    expect(() =>
      toEnvelopeProgram($call(["client", "identity"], { value: { type: ["a"], value: $call(["client", "add"], {}) } })),
    ).toThrow(/no envelope form/);
    // Data whose type is a $ref: the envelope form reads a ref as the type of a call
    expect(() => toEnvelopeProgram($call(["client", "identity"], { value: { type: { $ref: "a" }, value: 1 } }))).toThrow(
      /no envelope form/,
    );
    // Other keys on a call or a $ref, a $name that is not a string, a bad path
    expect(() => toEnvelopeProgram({ $proc: ["client", "add"], input: {}, note: "x" } as never)).toThrow(/the key "note"/);
    expect(() => toEnvelopeProgram($call(["client", "identity"], { value: { $ref: "x", note: 1 } }))).toThrow(/other keys/);
    expect(() => toEnvelopeProgram({ $proc: ["client", "add"], $name: 5 } as never)).toThrow(/must be a string/);
    expect(() => toEnvelopeProgram({ $proc: [] })).toThrow(/one or more strings/);
    expect(() => toEnvelopeProgram({ type: ["client", "add"], value: 1 } as never)).toThrow(/requires a call/);
  });
});

describe("the round trip", () => {
  it("toEnvelopeProgram gives the envelope form, and fromEnvelopeProgram gives the program back", () => {
    for (const { native } of EXAMPLES) {
      expect(fromEnvelopeProgram(toEnvelopeProgram(native))).toStrictEqual(native);
    }
    const runtime = proc(["client", "chain"])
      .input({ steps: [proc(["client", "add"]).input({ a: 1, b: 2 }).name("sum").ref] })
      .build();
    expect(fromEnvelopeProgram(toEnvelopeProgram(runtime))).toStrictEqual(
      $call(["client", "chain"], { steps: [$call(["client", "add"], { a: 1, b: 2 }, "sum")] }),
    );
  });

  it("the exceptions come back in a $literal, and they give the same values", async () => {
    const nullInput = $call(["test", "input"], null);
    expect(toEnvelopeProgram(nullInput)).toStrictEqual({ type: ["test", "input"], value: literal(null) });
    const back = fromEnvelopeProgram(toEnvelopeProgram(nullInput));
    expect(back).toStrictEqual($call(["test", "input"], { $literal: null }));
    expect(await makeClient().exec(back)).toEqual(await makeClient().exec(nullInput));

    const shaped = $call(["client", "identity"], { value: { type: ["a"], value: 1 } });
    expect(toEnvelopeProgram(shaped)).toStrictEqual(call(["client", "identity"], { value: literal({ type: ["a"], value: 1 }) }));
    const shapedBack = fromEnvelopeProgram(toEnvelopeProgram(shaped));
    expect(shapedBack).toStrictEqual($call(["client", "identity"], { value: { $literal: { type: ["a"], value: 1 } } }));
    expect(await makeClient().exec(shapedBack)).toEqual(await makeClient().exec(shaped));
  });

  it("property: when toEnvelopeProgram accepts a program, the round trip hydrates to the same value", async () => {
    // Data that uses the keys and the texts of the two forms often
    const key = fc.constantFrom("type", "value", "name", "own", "$proc", "$ref", "$literal", "input", "$name", "a");
    const leaf = fc.oneof(
      fc.constantFrom("ref", "literal", "names", "world", "last", "$last", "x.y", "client", "add"),
      fc.integer({ min: -1, max: 3 }),
      fc.constant(null),
      fc.boolean(),
    );
    const procedure = fc.constantFrom(["client", "add"], ["x"]);
    const { tree } = fc.letrec<{ tree: unknown }>((tie) => ({
      tree: fc.oneof(
        { depthSize: "small", withCrossShrink: true },
        leaf,
        fc.array(tie("tree"), { maxLength: 3 }),
        fc.dictionary(key, tie("tree"), { maxKeys: 3 }),
        fc.record({ $proc: procedure, input: tie("tree") }),
        fc.record({ $proc: procedure, input: tie("tree"), $name: fc.constantFrom("sum", "last") }),
        fc.record({ $proc: procedure }),
        fc.record({ $ref: fc.constantFrom("a", "$last", "x.y", "last.a", "items.0") }),
        fc.record({ $literal: tie("tree") }),
      ),
    }));
    const echo = (async (path: readonly string[], input: unknown) => ({ path: path.join("."), input })) as unknown as RefExecutor;
    // No procedure takes raw input here: each call runs, so the two programs give their values
    const hydrate = async (input: unknown) => {
      try {
        return { value: await hydrateInput(input, echo, { rawInput: () => false }) };
      } catch (error) {
        return { error: (error as Error).message };
      }
    };
    await fc.assert(
      fc.asyncProperty(tree, async (input) => {
        const program = $call(["test", "input"], input);
        let envelope: EnvelopeProgram;
        try {
          envelope = toEnvelopeProgram(program);
        } catch {
          return; // This program has no envelope form
        }
        const back = fromEnvelopeProgram(envelope);
        expect(await hydrate(back.input)).toEqual(await hydrate(program.input));
      }),
      { numRuns: RUNS },
    );
  });
});
