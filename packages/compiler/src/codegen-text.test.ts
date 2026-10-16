/**
 * The source text: a value of the program cannot change the code, and each literal keeps its
 * value (`__proto__`, line separators, quotes, numbers that JSON does not have).
 */

import { describe, expect, it } from "vitest";
import { makeHarness } from "../test/harness.js";

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe("the source text", () => {
  it("keeps strange keys and strings as data", async () => {
    const harness = makeHarness();
    const strange = [`"; throw new Error("x"); "`, "*/ throw 1; /*", `\n}); throw 2; (() => {`, `${LINE_SEPARATOR} throw 3;`, PARAGRAPH_SEPARATOR, "${a}", "`", "</script>"];
    const value: Record<string, unknown> = Object.fromEntries(strange.map((text, index) => [text, `${index}${text}`]));
    Object.defineProperty(value, "__proto__", { value: { polluted: true }, enumerable: true, configurable: true, writable: true });
    const program = {
      $proc: ["client", "chain"],
      input: {
        steps: [
          { $proc: ["t", "echo"], input: { [strange[0]!]: { $proc: ["t", "num"], input: { value: 1 } }, data: value } },
          { $proc: ["t", "num"], input: { value: { $ref: "$last" } } },
        ],
      },
    };
    const compiled = await harness.compile(program);
    expect(compiled.code).not.toContain(LINE_SEPARATOR);
    expect(compiled.code).not.toContain(PARAGRAPH_SEPARATOR);
    const interpreted = await harness.interpret(program);
    expect(interpreted.outcome.ok).toBe(true);
    const text = await harness.runText(compiled.body);
    expect(text).toEqual(interpreted);
    const result = (text.outcome as { value: { final: Record<string, Record<string, unknown>> } }).value.final;
    expect(Object.hasOwn(result["data"]!, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("writes the numbers that JSON does not have", async () => {
    const harness = makeHarness();
    const program = { $proc: ["t", "echo"], input: { values: [Number.NaN, Infinity, -Infinity, -0, 1e21, undefined] } };
    const compiled = await harness.compile(program);
    expect(await harness.runText(compiled.body)).toEqual(await harness.interpret(program));
  });

  it("reports a literal that has no source text, and the closure code still runs it", async () => {
    const harness = makeHarness();
    const program = { $proc: ["t", "echo"], input: { when: new Date(0), fn: () => 1 } };
    const compiled = await harness.compile(program);
    expect(compiled.diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code])).toContainEqual(["warning", "not-serializable"]);
    expect(await harness.runCompiled(compiled.run)).toEqual(await harness.interpret(program));
  });

  it("gives a source map from the lines of the code to the pointers of the program", async () => {
    const harness = makeHarness();
    const program = { $proc: ["client", "chain"], input: { steps: [{ $proc: ["t", "num"], input: { value: 1 } }, { $proc: ["t", "num"], input: { value: 2 } }] } };
    const compiled = await harness.compile(program);
    const lines = compiled.code.split("\n");
    for (const entry of compiled.sourceMap) expect(lines[entry.line - 1]).toContain(JSON.stringify(entry.pointer));
    expect(compiled.sourceMap.map((entry) => entry.pointer)).toEqual(["", "/input/steps/0", "/input/steps/1", ""]);
  });
});
