/**
 * The exports generator and its loader. The fixture `test/exports/fixture.d.ts` has one function
 * for each case of a type, and `functions.ts` is its implementation. The manifest of the fixture is
 * a golden file: a change of the generator shows in its diff.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Client, ProcedureRegistry, registerModules, type ProcedureContext } from "@procedures/client/browser";
import { generateExportsManifest } from "./generate.js";
import { exportInputSchema, exportOutputSchema, exportsModule, jsonValue } from "./exports/load.js";
import { PROGRAM_KEYWORD, type ExportsManifest, type ExportsProgram } from "./exports/types.js";
import { stubTransport } from "../test/harness.js";
import * as fixture from "../test/exports/functions.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "exports");
const PURE = { reads: [], writes: [] };
// One run of the generator builds a TypeScript program with the types of Node.js: 1 to 3 s, more under coverage
const GENERATE_TIMEOUT = 30_000;

function manifestOfFixture(): ExportsManifest {
  return generateExportsManifest({
    declarations: join(fixtureDir, "fixture.d.ts"),
    package: "fixture",
    version: "1.0.0",
    namespace: ["fixture"],
    overlay: { effects: PURE, functions: { add: { effects: { reads: [], writes: [], idempotent: true } } } },
  });
}

function clientOf(manifest: ExportsManifest): Client {
  const registry = new ProcedureRegistry();
  registerModules(registry, [exportsModule(manifest, fixture)]);
  return new Client({ transport: stubTransport }).useRegistry(registry);
}

const manifest = manifestOfFixture();

describe("generateExportsManifest", () => {

  it("gives the golden manifest of the fixture", async () => {
    await expect(`${JSON.stringify(manifest, null, 2)}\n`).toMatchFileSnapshot("../test/exports/fixture.manifest.json");
  });

  it("gives a procedure for each function with JSON inputs and a JSON output", () => {
    expect(manifest.procedures.map((procedure) => procedure.name)).toEqual([
      "above", "add", "apply", "chain", "choose", "depth", "findIndex", "first", "flip", "greet", "identity", "lookup", "minus", "norm", "nothing", "pair", "pick",
      "read", "scale", "sideOf", "sizes", "sortBy", "strict", "toggle", "total", "useHandler", "weight",
    ]);
  });

  it("gives each other function an exemption with its reason", () => {
    expect(manifest.exempt.map(({ name, reason }) => [name, reason])).toEqual([
      ["big", "input-not-json"],
      ["broken", "input-not-json"],
      ["counter", "output-not-json"],
      ["each", "function-parameter"],
      ["fail", "output-not-json"],
      ["grow", "input-not-json"],
      ["handlerOf", "output-not-json"],
      ["keys", "input-not-json"],
      ["later", "function-parameter"],
      ["measure", "input-not-json"],
      ["parse", "overload"],
      ["sizeOf", "function-parameter"],
      ["stamp", "input-not-json"],
      ["twice", "function-parameter"],
      ["unset", "input-not-json"],
      ["vanished", "unresolved"],
    ]);
  });

  it("fails closed on a type that does not resolve", () => {
    expect(manifest.exempt.find((exemption) => exemption.name === "broken")?.detail).toBe("value: a type that does not resolve");
  });

  it("counts the classes, the values and the types", () => {
    expect(manifest.others).toEqual({ classes: ["Counter"], values: 1, types: 11 });
  });

  it("takes the description from the first paragraph of the doc comment, and of each parameter", () => {
    const add = manifest.procedures.find((procedure) => procedure.name === "add")!;
    expect(add.description).toBe("The sum of two numbers.");
    expect(add.input).toMatchObject({ properties: { a: { type: "number", description: "The first number." } } });
  });

  it("applies the effects of the overlay: the package, then the function", () => {
    expect(manifest.procedures.find((procedure) => procedure.name === "add")!.effects).toEqual({ reads: [], writes: [], idempotent: true });
    expect(manifest.procedures.find((procedure) => procedure.name === "depth")!.effects).toEqual(PURE);
  });

  it("exempts a function that the overlay names, with its reason", () => {
    const exempted = generateExportsManifest({
      declarations: join(fixtureDir, "fixture.d.ts"),
      package: "fixture",
      namespace: ["fixture"],
      overlay: { functions: { add: { exempt: "a test of the overlay" } } },
    });
    expect(exempted.exempt).toContainEqual({ name: "add", reason: "overlay", detail: "a test of the overlay" });
    expect(exempted.procedures.find((procedure) => procedure.name === "add")).toBeUndefined();
  }, GENERATE_TIMEOUT);

  it("gives a recursive type one definition that refers to itself", () => {
    const depth = manifest.procedures.find((procedure) => procedure.name === "depth")!;
    expect(exportInputSchema(manifest, depth)).toEqual({
      type: "object",
      properties: { tree: { $ref: "#/$defs/Tree" } },
      required: ["tree"],
      additionalProperties: false,
      $defs: {
        Tree: {
          type: "object",
          properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/Tree" } } },
          required: ["name", "children"],
        },
      },
    });
  });

  it("gives a named union one definition, also when a member of the union holds the union again", async () => {
    const weight = manifest.procedures.find((procedure) => procedure.name === "weight")!;
    expect(weight.input).toMatchObject({ properties: { spec: { $ref: "#/$defs/Spec" } } });
    const [fixed, mix] = (manifest.$defs["Spec"] as { anyOf: Record<string, unknown>[] }).anyOf;
    expect(fixed).toMatchObject({ properties: { kind: { const: "fixed" } } });
    expect(mix).toMatchObject({ properties: { parts: { type: "array", items: { $ref: "#/$defs/Spec" } } } });
    const client = clientOf(manifest);
    const spec = { kind: "mix", parts: [{ kind: "fixed", value: 1 }, { kind: "mix", parts: [{ kind: "fixed", value: 2 }] }] };
    expect(await client.exec(["fixture", "weight"], { spec })).toBe(2);
    await expect(client.exec(["fixture", "weight"], { spec: { kind: "mix", parts: [{ kind: "none" }] } })).rejects.toThrow();
  });

  it("gives null for the undefined member of a named union in an output, and keeps it out of the definition", async () => {
    expect(manifest.$defs["MaybeSide"]).toEqual({ enum: ["less", "greater", "two-sided"] });
    expect(manifest.procedures.find((procedure) => procedure.name === "sideOf")!.output).toEqual({ anyOf: [{ $ref: "#/$defs/MaybeSide" }, { type: "null" }] });
    const client = clientOf(manifest);
    expect(await client.exec(["fixture", "sideOf"], { sign: -2 })).toBe("less");
    expect(await client.exec(["fixture", "sideOf"], { sign: 0 })).toBeNull();
  });

  it("fails closed on a type that grows at each level", () => {
    expect(manifest.exempt.find((exemption) => exemption.name === "grow")?.detail).toMatch(/^value\.next\.next\..*: a type deeper than 64 levels$/);
    expect(Object.keys(manifest.$defs).filter((name) => name.startsWith("Grow"))).toEqual([]);
  });

  it("gives each type of a union, and an enum for a union of literals", () => {
    const pick = manifest.procedures.find((procedure) => procedure.name === "pick")!;
    expect(pick.input).toMatchObject({ properties: { value: { anyOf: [{ type: "string" }, { type: "number" }] }, when: { enum: [true, "auto"] } } });
    expect(manifest.procedures.find((procedure) => procedure.name === "identity")!.input).toMatchObject({ properties: { value: {} } });
  });

  it("refuses a named type with a method, and keeps no definition of it", () => {
    expect(manifest.exempt.find((exemption) => exemption.name === "measure")?.detail).toBe("shape: an object with the method area");
    expect(manifest.$defs).not.toHaveProperty("Shape");
  });

  it("makes a property with an undefined member optional, and gives null for an undefined item of an output", () => {
    expect(manifest.$defs["Note"]).toMatchObject({ required: ["text"] });
    expect(manifest.procedures.find((procedure) => procedure.name === "lookup")!.output).toMatchObject({
      prefixItems: [{ type: "string" }, { type: "null" }],
    });
  });

  it("throws on a declaration file that is not readable, or that is not a module", () => {
    const of = (file: string) => () => generateExportsManifest({ declarations: join(fixtureDir, file), package: "fixture", namespace: ["fixture"] });
    expect(of("absent.d.ts")).toThrow(/is not readable/);
    expect(of("script.d.ts")).toThrow(/is not a module/);
  }, GENERATE_TIMEOUT * 2);

  it("gives the same manifest on each run", () => {
    expect(manifestOfFixture()).toEqual(manifest);
  }, GENERATE_TIMEOUT);
});

describe("exportsModule", () => {
  it("calls each function with the properties of the input, in the order of its parameters", async () => {
    const client = clientOf(manifest);
    expect(await client.exec(["fixture", "add"], { a: 2, b: 3 })).toBe(5);
    expect(await client.exec(["fixture", "norm"], { point: { x: 3, y: 4 } })).toBe(5);
    expect(await client.exec(["fixture", "norm"], { point: { x: 3, y: 4 }, options: { level: 2, side: "less" } })).toBe(10);
    expect(await client.exec(["fixture", "total"], { values: [1, 2, 3] })).toBe(6);
    expect(await client.exec(["fixture", "total"], {})).toBe(0);
    expect(await client.exec(["fixture", "depth"], { tree: { name: "a", children: [{ name: "b", children: [] }] } })).toBe(2);
    expect(await client.exec(["fixture", "pair"], { word: "four" })).toEqual(["four", 4]);
    expect(await client.exec(["fixture", "greet"], { name: "Ada", loud: true })).toBe("HELLO ADA");
    expect(await client.exec(["fixture", "flip"], { side: null })).toBeNull();
    expect(await client.exec(["fixture", "strict"], { flag: true, mode: 2 })).toBe("yes");
    expect(await client.exec(["fixture", "identity"], { value: { any: ["value"] } })).toEqual({ any: ["value"] });
    expect(await client.exec(["fixture", "toggle"], { on: true })).toBe(false);
    expect(await client.exec(["fixture", "pick"], { value: 7, when: "auto" })).toBe("7");
    expect(await client.exec(["fixture", "read"], { note: { text: "a" } })).toBe("a");
    expect(await client.exec(["fixture", "read"], { note: { text: "a", extra: "b" } })).toBe("a b");
    expect(await client.exec(["fixture", "lookup"], { key: "k" })).toEqual(["k", null]);
  });

  it("gives null for an absent output", async () => {
    const client = clientOf(manifest);
    expect(await client.exec(["fixture", "nothing"], {})).toBeNull();
    expect(await client.exec(["fixture", "first"], { items: [] })).toBeNull();
    expect(await client.exec(["fixture", "first"], { items: [{ any: "value" }] })).toEqual({ any: "value" });
  });

  it("refuses an input that does not agree with the types", async () => {
    const client = clientOf(manifest);
    await expect(client.exec(["fixture", "add"], { a: 2 })).rejects.toThrow();
    await expect(client.exec(["fixture", "add"], { a: 2, b: "3" })).rejects.toThrow();
    await expect(client.exec(["fixture", "add"], { a: 2, b: 3, c: 4 })).rejects.toThrow();
    await expect(client.exec(["fixture", "flip"], { side: "up" })).rejects.toThrow();
    await expect(client.exec(["fixture", "strict"], { flag: false, mode: 2 })).rejects.toThrow();
  });

  it("throws when the package does not export a function of the manifest", () => {
    const { add: _add, ...rest } = fixture;
    expect(() => exportsModule(manifest, rest)).toThrow(/does not export the functions add/);
  });

  it("gives the JSON form of an output, and copies only what changes", () => {
    const same = { list: [1, 2], nested: { word: "a" } };
    expect(jsonValue(same)).toBe(same);
    expect(jsonValue([1, undefined, [undefined]])).toEqual([1, null, [null]]);
    expect(jsonValue({ a: 1, b: undefined, c: { d: undefined, e: [undefined] } })).toEqual({ a: 1, c: { e: [null] } });
    expect(jsonValue(undefined)).toBeNull();
    const date = new Date(0);
    expect(jsonValue(date)).toBe(date);
  });

  it("throws on a manifest of another format", () => {
    expect(() => exportsModule({ ...manifest, format: "procedures-exports/0" as ExportsManifest["format"] }, fixture)).toThrow("this loader reads procedures-exports/1");
  });

  it("gives the output schema with its definitions, and throws on a definition that the manifest does not have", () => {
    const depth = manifest.procedures.find((procedure) => procedure.name === "depth")!;
    expect(exportOutputSchema(manifest, depth)).toEqual({ type: "number" });
    expect(() => exportInputSchema({ ...manifest, $defs: {} }, depth)).toThrow(/the definition Tree, which the manifest does not have/);
  });

  it("gives the procedures their descriptions and effects", () => {
    const module = exportsModule(manifest, fixture);
    const add = module.procedures.find((procedure) => procedure.path.join(".") === "fixture.add")!;
    expect(add.metadata).toMatchObject({ description: "The sum of two numbers.", effects: { idempotent: true } });
    expect(module.name).toBe("fixture");
  });
});

describe("sub-programs", () => {
  /** A call. In a program, a call with `$when: "$never"` is data: a sub-program. */
  const op = (path: string[], input: unknown) => ({ $proc: path, input });
  const program = (root: object, when: unknown = "$never") => ({ ...root, $when: when });
  const ref = (name: string) => ({ $ref: name });
  const sum = (a: unknown, b: unknown) => op(["fixture", "add"], { a, b });
  const programOf = (name: string, ...at: string[]): ExportsProgram => {
    let schema = manifest.procedures.find((procedure) => procedure.name === name)!.input as Record<string, unknown>;
    for (const key of at) {
      schema = (schema["properties"] as Record<string, Record<string, unknown>>)[key]!;
      const target = typeof schema["$ref"] === "string" ? manifest.$defs[(schema["$ref"] as string).slice("#/$defs/".length)] : undefined;
      if (target) schema = target as Record<string, unknown>;
    }
    return schema[PROGRAM_KEYWORD] as ExportsProgram;
  };

  it("gives a function parameter the schema of one call, with the names and the schemas of its parameters", () => {
    expect(programOf("apply", "fn")).toEqual({ params: ["value"], inputs: [{ type: "number" }], output: { type: "number" } });
    expect(programOf("findIndex", "predicate")).toEqual({ params: ["value", "index"], inputs: [{ type: "number" }, { type: "number" }], output: { type: "boolean" } });
    expect(programOf("sortBy", "options", "compare").params).toEqual(["a", "b"]);
    expect(programOf("useHandler", "handler", "run").params).toEqual(["value"]);
    expect(programOf("choose", "score")).toMatchObject({ output: { type: "number" }, undefinedForNull: true });
    const fn = (manifest.procedures.find((procedure) => procedure.name === "apply")!.input["properties"] as Record<string, Record<string, unknown>>)["fn"]!;
    expect(fn).toMatchObject({ type: "object", required: ["$proc"] });
    expect(fn["description"]).toContain('It reads each parameter as {"$ref": "<name>"}: value.');
  });

  it("keeps the exemption of a callback that a sub-program cannot give, and of a function in an output", () => {
    const detail = (name: string) => manifest.exempt.find((exemption) => exemption.name === name)?.detail;
    expect(detail("later")).toBe("fn: (value: number) => Promise<number>");
    expect(detail("each")).toBe("fn: (value: number) => void");
    expect(detail("twice")).toBe("fn: <T>(value: T) => T");
    expect(detail("sizeOf")).toBe("fn: (map: Map<string, number>) => number");
    expect(detail("handlerOf")).toBe("run: a function");
  });

  it("calls the function of the package with a function that starts the operators", async () => {
    const client = clientOf(manifest);
    expect(await client.exec(["fixture", "apply"], { values: [1, 2, 3], fn: program(sum(ref("value"), 10)) })).toEqual([11, 12, 13]);
    expect(await client.exec(["fixture", "sortBy"], { values: [2, 3, 1], options: { compare: program(op(["fixture", "minus"], { a: ref("b"), b: ref("a") })) } })).toEqual([3, 2, 1]);
    expect(await client.exec(["fixture", "findIndex"], { values: [1, 5, 9], predicate: program(op(["fixture", "above"], { value: ref("value"), limit: 4 })) })).toBe(1);
    expect(await client.exec(["fixture", "useHandler"], { handler: { name: "h", run: program(sum(ref("value"), 1)) }, value: 41 })).toBe(42);
    // Nested calls, and a literal that looks like a call
    expect(await client.exec(["fixture", "apply"], { values: [1], fn: program(sum(sum(ref("value"), ref("value")), { $literal: 5 })) })).toEqual([7]);
    // The result null of a sub-program is undefined for a function whose result can be undefined
    expect(await client.exec(["fixture", "choose"], { a: 2, b: 3, score: program(sum(ref("a"), ref("b"))) })).toBe(5);
    expect(await client.exec(["fixture", "choose"], { a: 2, b: 3, score: program(op(["fixture", "first"], { items: [] })) })).toBe(-1);
    expect(await client.exec(["fixture", "choose"], { a: 2, b: 3 })).toBe(-1);
  });

  it("binds a sub-program in a union, in an array, and in an array of the body", async () => {
    const client = clientOf(manifest);
    // A union: a call goes to the branch of the sub-program, a number stays a number
    expect(await client.exec(["fixture", "scale"], { values: [1, 2], factor: 3 })).toEqual([3, 6]);
    expect(await client.exec(["fixture", "scale"], { values: [1, 2], factor: program(sum(ref("value"), 1)) })).toEqual([2, 3]);
    // An array of sub-programs: each item is a function
    expect(await client.exec(["fixture", "chain"], { value: 1, steps: [program(sum(ref("value"), 1)), program(sum(ref("value"), 10))] })).toBe(12);
    expect(await client.exec(["fixture", "chain"], { value: 1, steps: [] })).toBe(1);
    // An array in the body of a sub-program, with a reference in it
    expect(await client.exec(["fixture", "apply"], { values: [1, 2], fn: program(op(["fixture", "total"], { values: [ref("value"), 10] })) })).toEqual([11, 12]);
  });

  it("reads the own fields of a parameter with dots in a $ref", async () => {
    const client = clientOf(manifest);
    const items = [{ name: "a", size: 2 }, { name: "bb", size: 5 }];
    expect(await client.exec(["fixture", "sizes"], { items, key: program(sum(ref("item.size"), 1)) })).toEqual([3, 6]);
    // The length of a string is not an own field, so the reference gives undefined, and add refuses it
    await expect(client.exec(["fixture", "sizes"], { items, key: program(sum(ref("item.name.length"), 1)) })).rejects.toThrow("gives fixture.add an input that its schema refuses");
    await expect(client.exec(["fixture", "sizes"], { items, key: program(sum(ref("item.none"), 1)) })).rejects.toThrow("gives fixture.add an input that its schema refuses");
  });

  it("names the property that is not JSON in the detail of an exemption", () => {
    expect(manifest.exempt.find((exemption) => exemption.name === "stamp")?.detail).toBe("record.at: bigint");
  });

  it("takes a call with no $when outside a program, as an MCP tool gets it", async () => {
    const registry = new ProcedureRegistry();
    registerModules(registry, [exportsModule(manifest, fixture)]);
    const apply = registry.get(["fixture", "apply"])!;
    const ctx = { registry } as unknown as ProcedureContext;
    expect(await apply.handler!({ values: [1, 2], fn: sum(ref("value"), 1) }, ctx)).toEqual([2, 3]);
    expect(await apply.handler!({ values: [1, 2], fn: program(sum(ref("value"), 1)) }, ctx)).toEqual([2, 3]);
  });

  it("finds the operators of each module of the registry of the caller", async () => {
    const other: ExportsManifest = {
      format: "procedures-exports/1",
      package: "other",
      entry: ".",
      namespace: ["other"],
      $defs: {},
      procedures: [
        {
          name: "double",
          path: ["other", "double"],
          params: ["x"],
          input: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
          output: { type: "number" },
          effects: PURE,
        },
      ],
      exempt: [],
      others: { classes: [], values: 0, types: 0 },
    };
    const registry = new ProcedureRegistry();
    registerModules(registry, [exportsModule(manifest, fixture), exportsModule(other, { double: (x: number) => 2 * x })]);
    const client = new Client({ transport: stubTransport }).useRegistry(registry);
    expect(await client.exec(["fixture", "apply"], { values: [1, 2, 3], fn: program(op(["other", "double"], { x: ref("value") })) })).toEqual([2, 4, 6]);
  });

  it("refuses a sub-program before the package starts", async () => {
    const client = clientOf({
      ...manifest,
      procedures: manifest.procedures.map((procedure) => (procedure.name === "minus" ? { ...procedure, effects: { reads: [], writes: ["store"] } } : procedure)),
    });
    const refusal = (root: object, when?: unknown) => client.exec(["fixture", "apply"], { values: [1], fn: program(root, when ?? "$never") });
    await expect(refusal(sum(ref("item"), 1))).rejects.toThrow('The sub-program at fn reads the unknown name "item" in "item". It reads the parameters value.');
    await expect(refusal(op(["fixture", "greet"], { name: "a" }))).rejects.toThrow("The sub-program at fn calls fixture.greet, which is not an operator that this caller reaches");
    await expect(refusal(op(["fixture", "nope"], {}))).rejects.toThrow("calls fixture.nope, which is not an operator");
    await expect(refusal(op(["fixture", "apply"], { values: [], fn: sum(1, 2) }))).rejects.toThrow("calls fixture.apply, which is not an operator");
    await expect(refusal(op(["fixture", "minus"], { a: 1, b: 2 }))).rejects.toThrow("calls fixture.minus, which is not an operator");
    await expect(refusal(sum(ref("value"), 1), "later")).rejects.toThrow('fn.$when: Invalid input: expected "$never"');
    const registry = new ProcedureRegistry();
    registerModules(registry, [exportsModule(manifest, fixture)]);
    const apply = registry.get(["fixture", "apply"])!;
    await expect(apply.handler!({ values: [1], fn: program(sum(ref("value"), 1), "later") }, {} as ProcedureContext)).rejects.toThrow('has the $when "later"');
    await expect(refusal(sum(program(sum(1, 2), "later"), 1))).rejects.toThrow("has a call with a $when in it");
    await expect(refusal(op(["fixture", "identity"], { value: [sum(1, 2), sum(3, 4)] }))).rejects.toThrow("has an array of calls");
  });

  it("refuses an input of an operator and a result that do not agree with their schemas", async () => {
    const client = clientOf(manifest);
    await expect(client.exec(["fixture", "apply"], { values: [1], fn: program(op(["fixture", "add"], { a: ref("value") })) })).rejects.toThrow(
      "The sub-program at fn gives fixture.add an input that its schema refuses",
    );
    await expect(client.exec(["fixture", "apply"], { values: [1], fn: program(op(["fixture", "pair"], { word: "a" })) })).rejects.toThrow(
      "The sub-program at fn gives a result that its function refuses",
    );
  });

  it("follows the expose rule of the caller", async () => {
    const registry = new ProcedureRegistry();
    registerModules(registry, [exportsModule(manifest, fixture)]);
    const apply = registry.get(["fixture", "apply"])!;
    const ctx = { registry, expose: (path: readonly string[]) => path[1] !== "add" } as unknown as ProcedureContext;
    await expect(apply.handler!({ values: [1], fn: sum(ref("value"), 1) }, ctx)).rejects.toThrow("calls fixture.add, which is not an operator that this caller reaches");
    expect(await apply.handler!({ values: [1], fn: op(["fixture", "minus"], { a: ref("value"), b: 1 }) }, ctx)).toEqual([0]);
  });
});
