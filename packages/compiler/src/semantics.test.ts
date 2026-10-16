/**
 * The rules of the interpreter that random programs rarely reach: each program runs with the
 * interpreter, the closure code and the source text, and the three runs agree.
 */

import { describe, expect, it } from "vitest";
import { makeHarness, type Outcome } from "../test/harness.js";

const call = (path: string, input?: unknown, extra: Record<string, unknown> = {}) => ({
  $proc: path.split("."),
  ...(input !== undefined ? { input } : {}),
  ...extra,
});
const ref = (name: string) => ({ $ref: name });
const num = (value: unknown, name = "n") => call("t.num", { name, value });

function nested(levels: number): unknown {
  let value: unknown = 1;
  for (let level = 0; level < levels; level++) value = num(value);
  return value;
}

function deepData(levels: number): unknown {
  let value: unknown = num(1);
  for (let level = 0; level < levels; level++) value = { next: value };
  return value;
}

const cyclic: Record<string, unknown> = { a: num(1) };
cyclic["self"] = cyclic;

const CASES: Array<{ name: string; program: unknown; mode?: "exec" | "body"; input?: unknown; outcome?: Outcome | ((outcome: Outcome) => void); text?: false }> = [
  { name: "10 levels of nested calls start", program: call("t.num", { value: nested(10) }) },
  { name: "11 levels of nested calls fail", program: call("t.num", { value: nested(11) }), outcome: { ok: false, error: "Hydration depth exceeded maximum of 10" } },
  { name: "an operand starts a new count of the depth", program: call("client.chain", { steps: [num(nested(10)), num(nested(10))] }) },
  { name: "data deeper than 1000 levels fails", program: call("t.num", { value: deepData(1002) }), outcome: { ok: false, error: "Hydration failed: the input has more than 1000 levels of nesting" }, text: false },
  { name: "an input that contains itself fails", program: call("t.echo", cyclic), outcome: { ok: false, error: "Hydration failed: the input is cyclic (an object contains itself)" } },
  {
    name: "the keys of an object start in the order of JavaScript (integer keys first)",
    program: call("t.echo", { b: num(1, "b"), 1: num(2, "1"), a: num(3, "a"), 0: num(4, "0") }),
  },
  { name: "__proto__ is an own key", program: call("t.echo", JSON.parse('{"__proto__": {"$proc": ["t", "num"], "input": {"value": 1}}, "x": 2}')) },
  {
    name: "cwd replaces an operand input that is not an object",
    program: call("client.chain", { steps: [call("t.echo", 5), call("t.echo", [1, 2]), call("t.echo", { keep: true })], cwd: "/w" }),
  },
  {
    name: "cwd goes into nested control flow and replaces its own",
    program: call("client.chain", { steps: [call("client.conditional", { condition: true, then: call("t.echo", {}), cwd: "/inner" })], cwd: "/outer" }),
  },
  { name: "as: index hides the item", program: call("client.map", { items: ["a", "b"], as: "index", fn: call("t.echo", { value: ref("index") }) }) },
  {
    name: "passThrough gives the result of the step before, and a raw step gets { $literal }",
    program: call("client.chain", { steps: [call("t.echo"), call("client.chain")], passThrough: true, initialInput: { first: num(1) } }),
  },
  {
    name: "a $parent call makes an array a list, and its input starts",
    program: call("t.echo", { list: [num(1), call("t.echo", { now: num(2) }, { $when: "$parent" })] }),
  },
  {
    name: "a deferred input keeps an unknown name and resolves a known one",
    program: call("client.chain", { steps: [num(7, "seven"), call("t.echo", { later: call("t.echo", { a: ref("$last"), b: ref("unknown") }, { $when: "runner" }) })] }),
  },
  { name: "map over a call that gives an array", program: call("client.map", { items: call("t.echo", [1, 2]), fn: num(ref("item")) }) },
  { name: "map over a call that gives an object fails", program: call("client.map", { items: call("t.echo", { a: 1 }), fn: num(ref("item")) }) },
  { name: "reduce without fn gives the hydrated accumulated value", program: call("client.reduce", { items: [num(9)], initial: 0, accumulated: num(3) }) },
  { name: "conditional reads the value field: { value: 0 } is false", program: call("client.conditional", { condition: call("t.truth", { value: 0 }), then: "yes", else: "no" }) },
  {
    name: "parallel with failFast stops at the first error of a task",
    program: call("client.parallel", { tasks: [num(1), call("t.fail", { message: "x" }), num(3)], concurrency: 1, failFast: true }),
  },
  {
    name: "parallel without failFast gives each error",
    program: call("client.parallel", { tasks: [num(1), call("t.fail", { message: "x" }), num(3)], concurrency: 1 }),
  },
  { name: "an error of catch goes out of tryCatch", program: call("client.tryCatch", { try: call("t.fail", { message: "a" }), catch: call("t.fail", { message: ref("error") }) }) },
  {
    name: "a later step with the same $name replaces the earlier one",
    program: call("client.chain", { steps: [num(1, "a"), { ...num(2, "b"), $name: "x" }, { ...num(3, "c"), $name: "x" }, num(ref("x"))] }),
  },
  { name: "client.eval of a call with input over its input", program: call("client.chain", { steps: [num(4), call("client.eval", { procedure: call("t.echo", { a: 1, b: 2 }), input: { b: ref("$last") } })] }) },
  { name: "client.eval of a $ref to a call that an earlier step gave", program: call("client.chain", { steps: [{ ...call("t.echo", { $literal: num(5) }), $name: "r" }, call("client.eval", { procedure: ref("r") })] }) },
  { name: "the body of a defined procedure reads input", mode: "body", input: { x: 2 }, program: call("client.chain", { steps: [num(ref("input.x")), call("client.eval", { procedure: ["t", "num"], input: { value: ref("input") } })] }) },
  { name: "a body whose root takes raw input gets the scope of input", mode: "body", input: { x: 3 }, program: call("client.eval", { procedure: ["t", "echo"], input: { got: ref("input.x") } }) },
  { name: "a body that is not a call is hydrated", mode: "body", input: 4, program: { a: num(ref("input")) } },
  { name: "a root call with $never starts", program: { ...num(1), $when: "$never" } },
  { name: "client.exec(path) starts the path with {}", program: ["t", "echo"] },
  { name: "a $literal call is data", program: call("t.echo", { a: { $literal: num(1) } }) },
  { name: "an and of no values is undefined", program: call("client.and", { values: [] }) },
  { name: "an empty chain gives no final", program: call("client.chain", { steps: [] }) },
  { name: "an unknown name inside a scope fails where it is read", program: call("client.chain", { steps: [num(1), num(ref("nope"))] }) },
];

describe("the rules that random programs rarely reach", () => {
  for (const item of CASES) {
    it(item.name, async () => {
      const harness = makeHarness();
      const compiled = await harness.compile(item.program, { mode: item.mode });
      let interpreted;
      if (item.mode === "body") {
        await harness.client.exec({ $proc: ["procedure", "define"], input: { path: ["case", "body"], aggregation: item.program } }).catch(() => undefined);
        interpreted = harness.registry.has(["case", "body"]) ? await harness.interpret(["case", "body"], item.input) : undefined;
      } else {
        interpreted = await harness.interpret(item.program);
      }
      const closure = await harness.runCompiled(compiled.run, item.input);
      if (interpreted) expect(closure).toEqual(interpreted);
      if (item.text !== false) expect(await harness.runText(compiled.body, item.input)).toEqual(closure);
      else expect(compiled.diagnostics.map((diagnostic) => diagnostic.code)).toContain("text-depth");
      if (typeof item.outcome === "function") item.outcome(closure.outcome);
      else if (item.outcome) expect(closure.outcome).toEqual(item.outcome);
    });
  }
});
