/**
 * The examples of PROGRAM-FORMAT.md: the interpreter, the closure code and the source text give
 * the same result and the same calls.
 */

import { describe, expect, it } from "vitest";
import { makeHarness } from "../test/harness.js";

const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
const ref = (name: string) => ({ $ref: name });

/** The examples: the program and the result that the document gives. */
export const EXAMPLES: Array<{ name: string; program: unknown; result: unknown }> = [
  { name: "1. a call", program: add(1, 2), result: 3 },
  {
    name: "3. hydration",
    program: { $proc: ["client", "multiply"], input: { a: add(1, 2), b: 10 } },
    result: 30,
  },
  {
    name: "4. names",
    program: {
      $proc: ["client", "chain"],
      input: {
        steps: [
          { ...add(1, 2), $name: "sum" },
          { $proc: ["client", "multiply"], input: { a: ref("sum"), b: 10 } },
          add(ref("$last"), ref("sum")),
        ],
      },
    },
    result: { results: [3, 30, 33], final: 33 },
  },
  {
    name: "4. a $ref without a scope is data",
    program: { $proc: ["client", "identity"], input: { value: { $ref: "#/definitions/point" } } },
    result: { $ref: "#/definitions/point" },
  },
  {
    name: "5. $never",
    program: { $proc: ["client", "identity"], input: { value: { ...add(1, 2), $when: "$never" } } },
    result: { ...add(1, 2), $when: "$never" },
  },
  {
    name: "6. $literal",
    program: { $proc: ["client", "identity"], input: { value: { $literal: add(1, 2) } } },
    result: add(1, 2),
  },
  {
    name: "7. an implicit chain",
    program: {
      $proc: ["client", "identity"],
      input: { value: [add(1, 2), { $proc: ["client", "multiply"], input: { a: ref("$last"), b: 10 } }] },
    },
    result: { results: [3, 30], final: 30 },
  },
  {
    name: "7. a list in the input of a nested call",
    program: {
      $proc: ["client", "identity"],
      input: { value: { $proc: ["client", "identity"], input: { value: [add(1, 2), add(3, 4)] } } },
    },
    result: [3, 7],
  },
  {
    name: "8. conditional",
    program: {
      $proc: ["client", "conditional"],
      input: { condition: { $proc: ["client", "gt"], input: { a: 5, b: 3 } }, then: { total: add(5, 3) }, else: "small" },
    },
    result: { total: 8 },
  },
  {
    name: "8. map",
    program: { $proc: ["client", "map"], input: { items: [1, 2, 3], fn: { $proc: ["client", "multiply"], input: { a: ref("item"), b: ref("index") } } } },
    result: { results: [0, 2, 6] },
  },
  {
    name: "8. tryCatch",
    program: { $proc: ["client", "tryCatch"], input: { try: { $proc: ["client", "throw"], input: { message: "disk full" } }, catch: ref("error") } },
    result: { success: false, value: "disk full", error: "disk full" },
  },
  {
    name: "10. procedure.define, then a call of the new procedure",
    program: {
      $proc: ["client", "chain"],
      input: {
        steps: [
          {
            $proc: ["procedure", "define"],
            input: { path: ["math", "double"], aggregation: { $proc: ["client", "multiply"], input: { a: ref("input.x"), b: 2 } } },
          },
          { $proc: ["math", "double"], input: { x: 21 } },
        ],
      },
    },
    result: { results: [{ path: ["math", "double"], replaced: false }, 42], final: 42 },
  },
];

describe("the examples of PROGRAM-FORMAT.md", () => {
  for (const example of EXAMPLES) {
    it(example.name, async () => {
      const harness = makeHarness();
      const interpreted = await harness.interpret(example.program);
      expect(interpreted.outcome).toEqual({ ok: true, value: example.result });

      const fresh = makeHarness();
      const compiled = await fresh.compile(example.program);
      expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      const closure = await fresh.runCompiled(compiled.run);
      expect(closure).toEqual(interpreted);

      const third = makeHarness();
      const text = await third.compile(example.program);
      expect(await third.runText(text.body)).toEqual(interpreted);
    });
  }
});
