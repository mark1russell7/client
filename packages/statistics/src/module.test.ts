import * as statistics from "@mark1russell7/rigor-statistics";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { statisticsManifest, statisticsModule } from "./module.js";

const registry = createRegistry(statisticsModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["statistics", name], input, { registry }), ["statistics", name])) as T;

describe("@procedures/statistics", () => {
  it("gives the median of a list", async () => {
    expect(await call("median", { values: [3, 1, 2, 10] })).toBe(2.5);
  });

  it("gives the same value as the function of the home", async () => {
    expect(await call("wilson", { k: 8, n: 10 })).toEqual(statistics.wilson(8, 10));
    expect(await call("holm", { pValues: [0.01, 0.04, 0.03] })).toEqual(statistics.holm([0.01, 0.04, 0.03]));
  });

  it("gives a function parameter of the home as a sub-program: one call of a statistics procedure", async () => {
    const data = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const options = { runs: 200, seed: 7 };
    const statistic = { $proc: ["statistics", "mean"], input: { values: { $ref: "sample" } }, $when: "$never" };
    expect(await call("bootstrap", { data, statistic, options })).toEqual(statistics.bootstrap(data, (sample) => statistics.mean(sample), options));
    const differences = { $proc: ["statistics", "median"], input: { values: { $ref: "differences" } } };
    expect(await call("pairedPermutation", { candidate: [5, 6, 7, 8], baseline: [4, 6, 5, 7], options: { ...options, statistic: differences } })).toEqual(
      statistics.pairedPermutation([5, 6, 7, 8], [4, 6, 5, 7], { ...options, statistic: (values) => statistics.median(values) }),
    );
  });

  it("refuses a sub-program that calls a procedure with an effect", async () => {
    const statistic = { $proc: ["shell", "run"], input: { argv: ["rm"] } };
    await expect(call("bootstrap", { data: [1, 2], statistic })).rejects.toThrow("calls shell.run, which is not an operator that this caller reaches");
  });

  it("takes a list for an iterable", async () => {
    expect(await call("runningOf", { values: [3, 1, 2] })).toEqual(statistics.runningOf([3, 1, 2]));
  });

  it("refuses an input that does not match the schema", async () => {
    await expect(call("median", { values: "3, 1, 2" })).rejects.toThrow();
  });

  it("has one procedure or one exemption for each function of the home", () => {
    const functions = Object.entries(statistics)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    const named = [...statisticsManifest.procedures.map((p) => p.name), ...statisticsManifest.exempt.map((e) => e.name)].sort();
    expect(named).toEqual(functions);
  });

  it("declares each procedure as pure", () => {
    for (const procedure of statisticsManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });

  it("gives a procedure for a function that the home re-exports from another package", async () => {
    expect(await call("normalCdf", { x: 0 })).toBe(0.5);
    expect(await call("normalQuantile", { p: 0.5 })).toBe(0);
  });

  it("registers each procedure of the manifest in the namespace statistics", () => {
    expect(statisticsModule.procedures).toHaveLength(statisticsManifest.procedures.length);
    expect(statisticsManifest.procedures.every((p) => p.path[0] === "statistics")).toBe(true);
  });
});
