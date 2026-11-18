import * as home from "@mark1russell7/optional";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { optionalManifest, optionalModule } from "./module.js";

const registry = createRegistry(optionalModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["optional", name], input, { registry }), ["optional", name])) as T;

describe("@procedures/optional", () => {
  it("gives the same value as the function of the home", async () => {
    expect(await call("some", { value: 3 })).toEqual(home.some(3));
    expect(await call("fromNullable", { value: 1500 })).toEqual(home.fromNullable(1500));
    expect(await call("fromNullable", { value: null })).toEqual(home.fromNullable(null));
    expect(await call("getOr", { o: home.none, fallback: "unknown" })).toBe("unknown");
    expect(await call("isSome", { o: home.some("a") })).toBe(true);
    expect(await call("ok", { value: 1 })).toEqual(home.ok(1));
  });

  it("gives a function parameter as a sub-program: one call of a procedure", async () => {
    const f = { $proc: ["optional", "some"], input: { value: { $ref: "v" } }, $when: "$never" };
    expect(await call("flatMap", { o: home.some(3), f })).toEqual(home.flatMap(home.some(3), (v) => home.some(v)));
    expect(await call("flatMap", { o: home.none, f })).toEqual(home.none);
  });

  it("names the overloads as exemptions", () => {
    expect(optionalManifest.exempt.map((exemption) => [exemption.name, exemption.reason])).toEqual([
      ["filter", "overload"],
      ["tryCatch", "overload"],
      ["tryCatchAsync", "overload"],
    ]);
  });

  it("has a procedure with no effect for each function of the home", () => {
    expect(optionalManifest.procedures).toHaveLength(20);
    for (const procedure of optionalManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });
});
