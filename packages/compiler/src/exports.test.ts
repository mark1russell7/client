/**
 * The exports generator and its loader. The fixture `test/exports/fixture.d.ts` has one function
 * for each case of a type, and `fixture.js` is its implementation. The manifest of the fixture is
 * a golden file: a change of the generator shows in its diff.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Client, ProcedureRegistry, registerModules } from "@procedures/client/browser";
import { generateExportsManifest } from "./generate.js";
import { exportInputSchema, exportsModule } from "./exports/load.js";
import type { ExportsManifest } from "./exports/types.js";
import { stubTransport } from "../test/harness.js";
import * as fixture from "../test/exports/fixture.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "exports");
const PURE = { reads: [], writes: [] };

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

describe("generateExportsManifest", () => {
  const manifest = manifestOfFixture();

  it("gives the golden manifest of the fixture", async () => {
    await expect(`${JSON.stringify(manifest, null, 2)}\n`).toMatchFileSnapshot("../test/exports/fixture.manifest.json");
  });

  it("gives a procedure for each function with JSON inputs and a JSON output", () => {
    expect(manifest.procedures.map((procedure) => procedure.name)).toEqual([
      "add", "depth", "first", "flip", "greet", "norm", "nothing", "pair", "strict", "total",
    ]);
  });

  it("gives each other function an exemption with its reason", () => {
    expect(manifest.exempt.map(({ name, reason }) => [name, reason])).toEqual([
      ["apply", "function-parameter"],
      ["big", "input-not-json"],
      ["broken", "input-not-json"],
      ["counter", "output-not-json"],
      ["keys", "input-not-json"],
      ["parse", "overload"],
      ["sortBy", "function-parameter"],
    ]);
  });

  it("fails closed on a type that does not resolve", () => {
    expect(manifest.exempt.find((exemption) => exemption.name === "broken")?.detail).toBe("value: a type that does not resolve");
  });

  it("counts the classes, the values and the types", () => {
    expect(manifest.others).toEqual({ classes: ["Counter"], values: 1, types: 4 });
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
  });

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

  it("gives the same manifest on each run", () => {
    expect(manifestOfFixture()).toEqual(manifest);
  });
});

describe("exportsModule", () => {
  const manifest = manifestOfFixture();

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

  it("gives the procedures their descriptions and effects", () => {
    const module = exportsModule(manifest, fixture);
    const add = module.procedures.find((procedure) => procedure.path.join(".") === "fixture.add")!;
    expect(add.metadata).toMatchObject({ description: "The sum of two numbers.", effects: { idempotent: true } });
    expect(module.name).toBe("fixture");
  });
});
