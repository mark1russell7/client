import * as home from "@mark1russell7/rational";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { rationalManifest, rationalModule } from "./module.js";

const registry = createRegistry(rationalModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["rational", name], input, { registry }), ["rational", name])) as T;
// The JSON form of a rational: each bigint is a decimal string
const json = (value: home.Rational): { n: string; d: string } => ({ n: String(value.n), d: String(value.d) });

describe("@procedures/rational", () => {
  it("gives the same value as the function of the home", async () => {
    const [a, b] = [home.rational(1n, 3n), home.rational(1n, 6n)];
    expect(await call("add", { a: json(a), b: json(b) })).toEqual(json(home.add(a, b)));
    expect(await call("mul", { a: json(a), b: json(b) })).toEqual(json(home.mul(a, b)));
    expect(await call("compare", { a: json(a), b: json(b) })).toBe(home.compare(a, b));
    expect(await call("toString", { a: json(a) })).toBe(home.toString(a));
    expect(await call("fromDecimal", { text: "0.125" })).toEqual({ n: "1", d: "8" });
    expect(await call("rational", { n: "6", d: "4" })).toEqual({ n: "3", d: "2" });
    expect(await call("gcd", { a: "12", b: "18" })).toBe("6");
  });

  it("keeps a bigint exact past 2^53", async () => {
    const big = { n: "9007199254740993", d: "1" };
    expect(await call("mul", { a: big, b: { n: "3", d: "1" } })).toEqual({ n: "27021597764222979", d: "1" });
    expect(await call("root", { a: { n: "4", d: "9" }, k: 2 })).toEqual({ n: "2", d: "3" });
    expect(await call("root", { a: { n: "2", d: "1" }, k: 2 })).toBe(null);
  });

  it("refuses a number where the schema has a bigint", async () => {
    await expect(call("add", { a: { n: 1, d: 3 }, b: { n: "1", d: "6" } })).rejects.toThrow();
    await expect(call("add", { a: { n: "1.5", d: "3" }, b: { n: "1", d: "6" } })).rejects.toThrow();
  });

  it("has a procedure with no effect for each function of the home", () => {
    expect(rationalManifest.procedures).toHaveLength(24);
    expect(rationalManifest.exempt).toEqual([]);
    for (const procedure of rationalManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });
});
