/**
 * The analysis follows the core. Each implicit-chain case runs with the real runtime too, so a
 * change of the core rule makes this test fail (deep dive SITE-8: the hint was missing for a
 * list of one call, and it showed for the input of a nested call).
 */

import { describe, it, expect } from "vitest";
import { analyzeProgram } from "./analysis";
import { runProgram } from "./runtime";
import { locationKey, type Json } from "./program";

const call = (name: string, input: Json, extra: { $name?: string } = {}): Json => ({ $proc: ["client", name], input, ...extra });
const add = (a: Json, b: Json): Json => call("add", { a, b });
const ref = (name: string): Json => ({ $ref: name });
const isChainResult = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "results" in value && "final" in value;

interface ChainCase {
  name: string;
  program: Json;
  /** The location of the list. */
  list: Array<string | number>;
  /** The runtime value of the list: the root result of the program reads it. */
  read: (value: unknown) => unknown;
  chain: boolean;
}

const cases: ChainCase[] = [
  {
    name: "a list of calls in the input of the root call",
    program: call("identity", { value: [add(1, 1), add(2, 2)] }),
    list: ["input", "value"],
    read: (value) => value,
    chain: true,
  },
  {
    name: "a list of one call",
    program: call("identity", { value: [add(1, 1)] }),
    list: ["input", "value"],
    read: (value) => value,
    chain: true,
  },
  {
    name: "a list in an object of the root input",
    program: call("identity", { value: { x: [add(1, 1), add(2, 2)] } }),
    list: ["input", "value", "x"],
    read: (value) => (value as { x: unknown }).x,
    chain: true,
  },
  {
    name: "a list in the input of a nested call",
    program: call("identity", { value: call("identity", { value: [add(1, 1), add(2, 2)] }) }),
    list: ["input", "value", "input", "value"],
    read: (value) => value,
    chain: false,
  },
  {
    name: "a list in the input of a chain step",
    program: call("chain", { steps: [call("identity", { value: [add(1, 1), add(2, 2)] })] }),
    list: ["input", "steps", 0, "input", "value"],
    read: (value) => (value as { final: unknown }).final,
    chain: true,
  },
  {
    name: "a list that is an item of map",
    program: call("map", { items: [[add(1, 1), add(2, 2)], 5] }),
    list: ["input", "items", 0],
    read: (value) => (value as { results: unknown[] }).results[0],
    chain: true,
  },
  {
    name: "a list in a branch of conditional (raw data)",
    program: call("conditional", { condition: true, then: [add(1, 1)] }),
    list: ["input", "then"],
    read: (value) => value,
    chain: false,
  },
];

describe("implicit chains", () => {
  for (const item of cases) {
    it(`${item.name}: ${item.chain ? "a chain" : "a list"}`, async () => {
      const analysis = analyzeProgram(item.program);
      expect(analysis.chains.has(locationKey(item.list))).toBe(item.chain);
      const result = await runProgram(item.program);
      expect(result.error).toBeUndefined();
      expect(isChainResult(item.read(result.value))).toBe(item.chain);
    });
  }
});

describe("$ref scopes", () => {
  it("give the names of the earlier steps of a chain and $last", async () => {
    const program = call("chain", {
      steps: [add(1, 2), call("multiply", { a: ref("$last"), b: 10 }, { $name: "tens" }), call("add", { a: ref("tens"), b: ref("later") }, { $name: "later" })],
    });
    const analysis = analyzeProgram(program);
    expect(analysis.unknownRefs.map((use) => use.name)).toEqual(["later"]);
    expect(analysis.scopeAt.get(locationKey(["input", "steps", 2, "input", "a"]))).toEqual(["tens", "$last"]);
    expect(analysis.scopeAt.get(locationKey(["input", "steps", 1, "input", "a"]))).toEqual(["$last"]);
  });

  it("give the item and the index in map, with the name in `as`", async () => {
    const program = call("map", { items: [1, 2], as: "n", fn: add(ref("n"), ref("index")) });
    expect(analyzeProgram(program).unknownRefs).toEqual([]);
    expect(analyzeProgram(call("map", { items: [1], fn: add(ref("n"), 1) })).unknownRefs.map((use) => use.name)).toEqual(["n"]);
    expect((await runProgram(program)).value).toEqual({ results: [1, 3] });
  });

  it("give acc, item and index in reduce", () => {
    const program = call("reduce", { items: [1, 2], initial: 0, fn: add(ref("acc"), ref("item")) });
    expect(analyzeProgram(program).unknownRefs).toEqual([]);
  });

  it("give the outer names in a nested scope", () => {
    const program = call("chain", {
      steps: [add(1, 1), call("map", { items: [1], fn: add(ref("item"), ref("$last")) })],
    });
    expect(analyzeProgram(program).unknownRefs).toEqual([]);
  });

  it("find a $ref outside every scope", () => {
    const analysis = analyzeProgram(add(ref("total"), 1));
    expect(analysis.unknownRefs.map((use) => use.name)).toEqual(["total"]);
  });
});

describe("other findings", () => {
  it("make only the steps of a chain namable (deep dive SITE-9)", () => {
    const program = call("chain", { steps: [add(1, call("multiply", { a: 1, b: 2 }))] });
    const analysis = analyzeProgram(program);
    expect([...analysis.namable]).toEqual([locationKey(["input", "steps", 0])]);
  });

  it("find calls that are not in the catalog", () => {
    const analysis = analyzeProgram(call("identity", { value: { $proc: ["client", "nothing"], input: {} } }), (key) => key !== "client.nothing");
    expect(analysis.unknownCalls).toEqual([{ location: ["input", "value"], key: "client.nothing" }]);
  });

  it("report a root that is not a call", async () => {
    expect(analyzeProgram([add(1, 1)]).rootProblem).toContain("must be a call");
    expect(analyzeProgram(null).rootProblem).toBeNull();
    const result = await runProgram([add(1, 1)]);
    expect(result.ok).toBe(false);
  });
});
