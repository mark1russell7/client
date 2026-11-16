import * as generators from "@mark1russell7/rigor-generators";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { generatorsManifest, generatorsModule } from "./module.js";

const registry = createRegistry(generatorsModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["generators", name], input, { registry }), ["generators", name])) as T;

describe("@procedures/generators", () => {
  it("gives the same value as the function of the home", async () => {
    expect(await call("sha256Hex", { text: "abc" })).toBe(generators.sha256Hex("abc"));
    expect(await call("canonicalJson", { value: { b: 1, a: [2, "x"] } })).toBe(generators.canonicalJson({ b: 1, a: [2, "x"] }));
    expect(await call("deriveSeed", { seed: 7, label: "run" })).toBe(generators.deriveSeed(7, "run"));
    expect(await call("seedOf", { seed: "a name" })).toBe(generators.seedOf("a name"));
    expect(await call("normalQuantile", { p: 0.975 })).toBe(generators.normalQuantile(0.975));
  });

  it("takes a distribution, a union that holds itself, and gives one", async () => {
    const spec = { family: "mixture", parts: [{ weight: 1, part: { family: "lognormal", mu: 0, sigma: [0.5, 1] } }] } as const;
    expect(await call("dependsOnLibm", { spec })).toBe(generators.dependsOnLibm(spec));
    const table = generators.RECORDED_TABLES[Object.keys(generators.RECORDED_TABLES)[0]!]!;
    expect(await call("recordedSpec", { table })).toEqual(generators.recordedSpec(table));
    await expect(call("dependsOnLibm", { spec: { family: "mixture", parts: [{ weight: 1, part: { family: "none" } }] } })).rejects.toThrow();
  });

  it("gives a function parameter of the home as a sub-program: one call of a procedure of the home", async () => {
    const items = ["b", "a", "c", "d"];
    const keyOf = { $proc: ["generators", "canonicalJson"], input: { value: { $ref: "item" } }, $when: "$never" };
    expect(await call("stablePick", { seed: 11, items, keyOf })).toBe(generators.stablePick(11, items, (item) => generators.canonicalJson(item)));
    const weights = [0.2, 0.9, 0.5];
    const logWeightOf = { $proc: ["generators", "normalQuantile"], input: { p: { $ref: "item" } } };
    expect(await call("plackettLuceOrder", { seed: "order", items: weights, logWeightOf })).toEqual(
      generators.plackettLuceOrder("order", weights, (item) => generators.normalQuantile(item)),
    );
  });

  it("makes the Random of a design from its seed before each call, so two calls give the same design", async () => {
    const expected = generators.latinHypercube(5, 3, generators.random(7));
    expect(await call("latinHypercube", { n: 5, d: 3, r: { seed: 7 } })).toEqual(expected);
    expect(await call("latinHypercube", { n: 5, d: 3, r: { seed: 7 } })).toEqual(expected);
    expect(await call("randomDesign", { n: 4, d: 2, r: { seed: "a name" } })).toEqual(generators.randomDesign(4, 2, generators.random("a name")));
    const source = { $proc: ["generators", "deriveSeed"], input: { seed: { $ref: "seed" }, label: "source" }, $when: "$never" };
    await expect(call("randomDesign", { n: 2, d: 2, r: { seed: 3, source } })).rejects.toThrow();
    await expect(call("latinHypercube", { n: 5, d: 3, r: generators.random(7) })).rejects.toThrow();
  });

  it("refuses an input that does not match the schema", async () => {
    await expect(call("deriveSeed", { seed: 7, label: 3 })).rejects.toThrow();
  });

  it("has one procedure or one exemption for each function of the home", () => {
    const functions = Object.entries(generators)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    const named = [...generatorsManifest.procedures.map((p) => p.name), ...generatorsManifest.exempt.map((e) => e.name)].sort();
    expect(named).toEqual(functions);
  });

  it("declares each procedure as pure", () => {
    for (const procedure of generatorsManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });

  it("registers each procedure of the manifest in the namespace generators", () => {
    expect(generatorsModule.procedures).toHaveLength(generatorsManifest.procedures.length);
    expect(generatorsManifest.procedures.every((p) => p.path[0] === "generators")).toBe(true);
  });
});
