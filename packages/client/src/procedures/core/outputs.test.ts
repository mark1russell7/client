/**
 * Each core procedure has a real output schema (roadmap 2.1), and its real output passes it.
 *
 * The test runs every core procedure once through `client.exec()`, which validates the output.
 * A schema that does not match what the handler gives makes the call fail with
 * OUTPUT_VALIDATION_ERROR.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { ProcedureRegistry } from "../registry.js";
import { jsonSchemaOf } from "../schema.js";
import { allCoreProcedures } from "./index.js";
import { metaProcedures } from "../define-procedure.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function makeClient(): Client {
  const registry = new ProcedureRegistry();
  for (const procedure of [...allCoreProcedures, ...metaProcedures]) registry.register(procedure);
  return new Client(stubTransport).useRegistry(registry);
}

const call = (name: string, input: unknown) => ({ $proc: ["client", name], input });
const people = [
  { name: "ada", team: "a", age: 36 },
  { name: "bob", team: "b", age: 41 },
];

/** One sample input for each core procedure, by the last segment of its path. */
const SAMPLES: Record<string, unknown> = {
  // Control flow
  chain: { steps: [call("add", { a: 1, b: 2 }), call("multiply", { a: 2, b: 3 })] },
  parallel: { tasks: [call("add", { a: 1, b: 2 }), call("constant", { value: "x" })] },
  conditional: { condition: true, then: "yes", else: "no" },
  and: { values: [1, "x", call("constant", { value: 0 })] },
  or: { values: [0, "", "x"] },
  not: { value: false },
  all: { values: [true, 1] },
  any: { values: [false, 1] },
  none: { values: [false, 0] },
  map: { items: [1, 2, 3], fn: call("multiply", { a: { $ref: "item" }, b: 2 }) },
  reduce: { items: [1, 2, 3], initial: 0, fn: call("add", { a: { $ref: "acc" }, b: { $ref: "item" } }) },
  identity: { value: { a: [1] } },
  constant: { value: 42 },
  tryCatch: { try: call("throw", { message: "boom" }), catch: "caught" },
  // Math
  add: { a: 1, b: 2 },
  subtract: { a: 5, b: 2 },
  multiply: { a: 3, b: 4 },
  divide: { a: 1, b: 4 },
  mod: { a: 7, b: 3 },
  abs: { value: -3 },
  min: { values: [3, 1, 2] },
  max: { values: [3, 1, 2] },
  sum: { values: [1, 2, 3] },
  pow: { base: 2, exp: 10 },
  sqrt: { value: 9 },
  floor: { value: 1.7 },
  ceil: { value: 1.2 },
  round: { value: 1.256, decimals: 2 },
  // Comparison
  eq: { a: 1, b: 1 },
  neq: { a: 1, b: 2 },
  gt: { a: 2, b: 1 },
  gte: { a: 2, b: 2 },
  lt: { a: 1, b: 2 },
  lte: { a: 2, b: 2 },
  between: { value: 5, min: 1, max: 10 },
  // String
  concat: { values: ["a", "b"], separator: "-" },
  split: { value: "a,b,c", separator: "," },
  join: { values: ["a", "b"], separator: "+" },
  replace: { value: "a-b-c", search: "-", replace: "+", all: true },
  substring: { value: "hello", start: 1, end: 3 },
  trim: { value: "  x  " },
  toLower: { value: "ABC" },
  toUpper: { value: "abc" },
  startsWith: { value: "hello", search: "he" },
  endsWith: { value: "hello", search: "lo" },
  includes: { value: "hello", search: "ell" },
  strLength: { value: "hello" },
  template: { template: "Hi {{name}}", values: { name: "ada" } },
  // Type
  typeof: { value: [1] },
  isNull: { value: null },
  isUndefined: { value: 1 },
  isNil: { value: null },
  isArray: { value: [] },
  isObject: { value: {} },
  isString: { value: "x" },
  isNumber: { value: 1 },
  isBoolean: { value: true },
  coerce: { value: "42", to: "number" },
  // Object
  get: { object: { a: { b: 1 } }, path: "a.b" },
  set: { object: { a: 1 }, path: "b.c", value: 2 },
  merge: { objects: [{ a: 1 }, { b: 2 }] },
  keys: { object: { a: 1, b: 2 } },
  values: { object: { a: 1, b: 2 } },
  entries: { object: { a: 1 } },
  fromEntries: { entries: [["a", 1]] },
  pick: { object: { a: 1, b: 2 }, keys: ["a"] },
  omit: { object: { a: 1, b: 2 }, keys: ["a"] },
  has: { object: { a: { b: 1 } }, path: "a.b" },
  // Array
  first: { items: [1, 2] },
  last: { items: [1, 2] },
  nth: { items: [1, 2, 3], index: 1 },
  arrLength: { items: [1, 2] },
  flatten: { items: [[1], [2, [3]]] },
  reverse: { items: [1, 2] },
  sort: { items: people, key: "age", desc: true },
  slice: { items: [1, 2, 3], start: 1 },
  arrConcat: { arrays: [[1], [2]] },
  unique: { items: [1, 1, 2] },
  groupBy: { items: people, key: "team" },
  zip: { arrays: [[1, 2], ["a", "b"]] },
  unzip: { tuples: [[1, "a"], [2, "b"]] },
  indexOf: { items: [1, 2], value: 2 },
  contains: { items: [1, 2], value: 3 },
  push: { items: [1], value: 2 },
  unshift: { items: [1], value: 0 },
  range: { start: 0, end: 5 },
  filter: { items: people, key: "team", value: "a" },
  where: { items: people, where: { team: "b" } },
  pluck: { items: people, key: "name" },
  arrPick: { items: people, keys: ["name"] },
  arrOmit: { items: people, keys: ["age"] },
  partition: { items: people, key: "team", value: "a" },
  count: { items: people, key: "team", value: "a" },
  // Meta
  import: { json: '{"$proc":["client","add"],"input":{"a":1,"b":2}}' },
  export: { procedure: call("add", { a: 1, b: 2 }) },
  eval: { procedure: call("add", { a: 1, b: 2 }) },
  parseJson: { json: '{"a":1}' },
  stringifyJson: { value: { a: 1 } },
  lookup: { path: ["client", "add"] },
};

/** The procedures that give no value: their schema is `never`. */
const THROWS = new Set(["throw"]);

describe("the output schemas of the core procedures", () => {
  it("are real schemas: no core procedure keeps a pass-through output", () => {
    const passThrough = allCoreProcedures
      .filter((procedure) => (procedure.output as { "~standard"?: { vendor?: string } })["~standard"]?.vendor !== "zod")
      .map((procedure) => procedure.path.join("."));
    expect(passThrough).toEqual([]);
  });

  it("have a sample input for each core procedure", () => {
    const missing = allCoreProcedures
      .map((procedure) => procedure.path[procedure.path.length - 1]!)
      .filter((name) => !THROWS.has(name) && !(name in SAMPLES));
    expect(missing).toEqual([]);
  });

  for (const procedure of allCoreProcedures) {
    const name = procedure.path[procedure.path.length - 1]!;
    if (THROWS.has(name)) continue;
    it(`client.${name}: the real output passes the schema`, async () => {
      const client = makeClient();
      await expect(client.exec(call(name, SAMPLES[name]) as never)).resolves.not.toThrow();
    });
  }

  it("client.throw has the schema never, and still throws its error", async () => {
    const client = makeClient();
    await expect(client.exec(call("throw", { message: "boom" }) as never)).rejects.toThrow("boom");
  });

  it("accept NaN and Infinity from the math procedures (z.number() refuses both)", async () => {
    const client = makeClient();
    expect(await client.exec(call("pow", { base: 10, exp: 400 }) as never)).toBe(Infinity);
    expect(Number.isNaN(await client.exec(call("sqrt", { value: -1 }) as never))).toBe(true);
  });

  it("refuse a wrong output", () => {
    const add = allCoreProcedures.find((procedure) => procedure.path.join(".") === "client.add")!;
    const result = (add.output as { safeParse: (value: unknown) => { success: boolean } }).safeParse("3");
    expect(result.success).toBe(false);
  });

  it("describe the result in JSON Schema: a number for client.add, an object for client.chain", () => {
    const byKey = new Map(allCoreProcedures.map((procedure) => [procedure.path.join("."), procedure]));
    expect(jsonSchemaOf(byKey.get("client.add")!.output, { io: "output" })).toMatchObject({ type: "number" });
    const chain = jsonSchemaOf(byKey.get("client.chain")!.output, { io: "output" }) as {
      type?: string;
      properties?: Record<string, { description?: string }>;
    };
    expect(chain.type).toBe("object");
    expect(Object.values(chain.properties ?? {}).every((property) => !!property.description)).toBe(true);
  });
});

describe("the output schemas of procedure.define, get, list and delete", () => {
  it("pass for a define, a get (found and not found), a list and a delete", async () => {
    const client = makeClient();
    const proc = (name: string, input: unknown) => ({ $proc: ["procedure", name], input });
    await expect(
      client.exec(proc("define", { path: ["my", "double"], aggregation: call("multiply", { a: { $ref: "input.n" }, b: 2 }) }) as never)
    ).resolves.toMatchObject({ path: ["my", "double"], replaced: false });
    await expect(client.exec(proc("get", { path: "my.double" }) as never)).resolves.toMatchObject({ found: true, runtime: true });
    await expect(client.exec(proc("get", { path: "no.such" }) as never)).resolves.toEqual({ found: false });
    await expect(client.exec(proc("list", { runtime: true }) as never)).resolves.toMatchObject({ count: 1 });
    await expect(client.exec(proc("delete", { path: ["my", "double"] }) as never)).resolves.toEqual({ deleted: true });
  });
});
