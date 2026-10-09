import { describe, it, expect } from "vitest";
import { examples } from "./examples";
import { MAX_TRACE_CALLS, runProgram } from "./runtime";
import { countCalls } from "./program";

const expected: Record<string, unknown> = {
  nested: 17,
  chain: { final: "Total: 30" },
  pipeline: { final: "Ada, Alan, Grace" },
  reduce: 55,
  map: { results: ["0: ADA", "1: GRACE", "2: ALAN"] },
  conditional: "a long word",
  trycatch: { success: false, value: "fallback", error: "Division by zero" },
  parallel: { results: [3, "PROCEDURES AS DATA", [0, 1, 2, 3, 4]], allSucceeded: true },
};

describe("the examples of the Composer", () => {
  for (const example of examples) {
    it(`${example.id}: runs and gives the expected result`, async () => {
      const result = await runProgram(example.program);
      expect(result.error).toBeUndefined();
      expect(result.ok).toBe(true);
      expect(result.value).toMatchObject(expected[example.id] as object);
      expect(result.calls.length).toBeGreaterThanOrEqual(countCalls(example.program) > 0 ? 1 : 0);
    });
  }

  it("have an expected result each", () => {
    expect(Object.keys(expected).sort()).toEqual(examples.map((example) => example.id).sort());
  });
});

describe("the trace", () => {
  it("gives each nested call its parent", async () => {
    const chain = examples.find((example) => example.id === "chain")!;
    const result = await runProgram(chain.program);
    const root = result.calls.find((call) => call.key === "client.chain")!;
    const steps = result.calls.filter((call) => call.parent === root.id).map((call) => call.key);
    expect(steps).toEqual(["client.add", "client.multiply", "client.template"]);
  });

  it("does not record the branch that did not run", async () => {
    const conditional = examples.find((example) => example.id === "conditional")!;
    const result = await runProgram(conditional.program);
    const values = result.calls.filter((call) => call.key === "client.constant").map((call) => call.output);
    expect(values).toEqual(["a long word"]);
  });

  it("gives an error result for an invalid program", async () => {
    const result = await runProgram({ $proc: ["client", "nothing"], input: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("keeps NaN in the inputs and outputs (deep dive SITE-9)", async () => {
    const result = await runProgram({ $proc: ["client", "divide"], input: { a: 0, b: { $proc: ["client", "identity"], input: { value: NaN } } } } as never);
    const identity = result.calls.find((call) => call.key === "client.identity");
    expect(identity?.output).toBeNaN();
  });

  it("stops the trace at its limit and counts the other calls", async () => {
    const items = Array.from({ length: MAX_TRACE_CALLS + 10 }, (_, index) => index);
    const result = await runProgram({
      $proc: ["client", "map"],
      input: { items, fn: { $proc: ["client", "identity"], input: { value: { $ref: "item" } } } },
    });
    expect(result.ok).toBe(true);
    expect(result.calls.length).toBe(MAX_TRACE_CALLS);
    expect(result.calls.length + result.dropped).toBe(MAX_TRACE_CALLS + 11);
  });
});
