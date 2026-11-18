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

  it("gives each bigint of an exact value its decimal string, in the input and in the output", async () => {
    expect(await call("convertExact", { value: { n: "3", d: "2" }, from: "h", to: "s" })).toEqual({ n: "5400", d: "1" });
    const unit = await call<{ components: Array<{ atom: { factor: unknown } }> }>("parseUnit", { spelling: "km/h" });
    expect(unit.components.map((component) => component.atom.factor)).toEqual([{ n: "1000", d: "1" }, { n: "3600", d: "1" }]);
    expect(await call("tryParseUnit", { spelling: "no unit" })).toBe(null);
    await expect(call("convertExact", { value: { n: 3, d: 2 }, from: "h", to: "s" })).rejects.toThrow();
  });

  it("names unitSystem as an exemption, because its output holds a function", () => {
    expect(quantityManifest.exempt.map((exemption) => exemption.name)).toEqual(["unitSystem"]);
  });

  it("has a procedure with no effect for each function of the home", () => {
    expect(quantityManifest.procedures).toHaveLength(31);
    for (const procedure of quantityManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });
});
