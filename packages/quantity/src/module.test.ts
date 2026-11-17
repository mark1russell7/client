import * as home from "@mark1russell7/quantity";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { quantityManifest, quantityModule } from "./module.js";

const registry = createRegistry(quantityModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["quantity", name], input, { registry }), ["quantity", name])) as T;

describe("@procedures/quantity", () => {
  it("gives the same value as the function of the home", async () => {
    const amount = home.quantity(833600, "ns");
    expect(await call("quantity", { value: 833600, unit: "ns" })).toEqual(amount);
    expect(await call("convert", { amount, to: "ms" })).toEqual(home.convert(amount, "ms"));
    expect(await call("format", { amount })).toBe(home.format(amount));
    expect(await call("sum", { amounts: [amount, home.quantity(1, "ms")], unit: "ms" })).toEqual(home.sum([amount, home.quantity(1, "ms")], "ms"));
    expect(await call("convertible", { from: "s", to: "ms" })).toBe(true);
  });

  it("tells why two units do not convert, and refuses the conversion", async () => {
    expect(await call("whyNotConvertible", { from: "s", to: "m" })).toBe(home.whyNotConvertible("s", "m"));
    await expect(call("convert", { amount: home.quantity(1, "s"), to: "m" })).rejects.toThrow();
  });

  it("names the functions with a bigint in their types as exemptions", () => {
    expect(quantityManifest.exempt.map((exemption) => exemption.name)).toEqual(["convertExact", "lookupAtom", "parseUnit", "tryParseUnit", "unitSystem"]);
  });

  it("has a procedure with no effect for each function of the home", () => {
    expect(quantityManifest.procedures).toHaveLength(27);
    for (const procedure of quantityManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });
});
