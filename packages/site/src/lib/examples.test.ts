import { describe, it, expect } from "vitest";
import { examples } from "./examples";
import { runProgram } from "./runtime";
import { countCalls, decodeProgram, encodeProgram, newCall, setAt, toTypeScript, type Json } from "./program";

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
});

describe("the program model", () => {
  it("makes a call with defaults for the required fields", () => {
    expect(
      newCall(["client", "range"], [
        { name: "start", type: "number", optional: false },
        { name: "end", type: "number", optional: false },
        { name: "step", type: "number", optional: true },
      ]),
    ).toEqual({ $proc: ["client", "range"], input: { start: 0, end: 0 } });
  });

  it("round-trips a program through a share link", () => {
    for (const example of examples) {
      expect(decodeProgram(encodeProgram(example.program))).toEqual(example.program);
    }
    expect(decodeProgram("not base64 json")).toBeUndefined();
  });

  it("sets and removes values at a location", () => {
    const program: Json = { $proc: ["client", "add"], input: { a: 1, b: 2 } };
    expect(setAt(program, ["input", "a"], 5)).toEqual({ $proc: ["client", "add"], input: { a: 5, b: 2 } });
    expect(setAt(program, ["input", "b"], undefined)).toEqual({ $proc: ["client", "add"], input: { a: 1 } });
    expect(setAt([1, 2, 3], [1], undefined)).toEqual([1, 3]);
  });

  it("writes TypeScript with the proc() builder", () => {
    const code = toTypeScript(examples[0]!.program);
    expect(code).toContain('proc(["client","add"]).input({');
    expect(code).toContain('a: proc(["client","multiply"]).input({');
    expect(code).toContain(".ref,");
    expect(code).toContain("}).build());");
  });
});

describe("formatJson", () => {
  it("keeps short values on one line and gives valid JSON", async () => {
    const { formatJson } = await import("./program");
    for (const example of examples) {
      expect(JSON.parse(formatJson(example.program))).toEqual(example.program);
    }
    expect(formatJson({ $proc: ["client", "add"], input: { a: 1, b: "x,y" } })).toBe(
      '{ "$proc": ["client", "add"], "input": { "a": 1, "b": "x,y" } }',
    );
  });
});
