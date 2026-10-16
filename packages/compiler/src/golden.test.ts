/**
 * The golden outputs: the IR and the source text (TypeScript) of representative programs. The
 * files are in test/golden. The test of the test types (`.github/scripts/typecheck-tests.mjs`)
 * examines the TypeScript files with the strict configuration of the package.
 */

import { describe, expect, it } from "vitest";
import { makeHarness } from "../test/harness.js";
import { printIR } from "./print.js";

const call = (path: string, input?: unknown, extra: Record<string, unknown> = {}) => ({
  $proc: path.split("."),
  ...(input !== undefined ? { input } : {}),
  ...extra,
});
const ref = (name: string) => ({ $ref: name });

/** The programs: names, an implicit chain, the control flow, passThrough, deferred calls and a body. */
const PROGRAMS: Array<{ name: string; program: unknown; mode?: "exec" | "body" }> = [
  {
    name: "names",
    program: call("client.chain", {
      steps: [
        call("client.add", { a: 1, b: 2 }, { $name: "sum" }),
        call("client.multiply", { a: ref("sum"), b: 10 }),
        call("client.add", { a: ref("$last"), b: ref("sum") }),
      ],
    }),
  },
  {
    name: "implicit-chain",
    program: call("client.identity", { value: [call("t.num", { name: "a", value: 1 }), call("t.add", { a: ref("$last"), b: 2 })] }),
  },
  {
    name: "control-flow",
    program: call("client.chain", {
      steps: [
        call("t.read", { key: "k" }, { $name: "old" }),
        call("client.conditional", { condition: call("t.truth", { value: ref("old") }), then: call("t.write", { key: "k", value: 1 }), else: "same" }),
        call("client.tryCatch", { try: call("t.fail", { message: "disk full" }), catch: { message: ref("error") } }),
        call("client.map", { items: [1, 2, 3], as: "n", fn: call("t.add", { a: ref("n"), b: ref("index") }) }),
        call("client.reduce", { items: [1, 2], initial: 0, fn: call("t.add", { a: ref("acc"), b: ref("item") }) }),
        call("client.parallel", { tasks: [call("t.num", { value: 1 }), call("t.num", { value: 2 })], concurrency: 1 }),
        call("client.and", { values: [true, call("t.truth", { value: 0 })] }),
      ],
    }),
  },
  {
    name: "pass-through",
    program: call("client.chain", {
      steps: [call("t.echo"), call("t.echo"), call("t.num", { value: 5 })],
      passThrough: true,
      initialInput: { start: call("t.num", { value: 1 }) },
      cwd: "/repo",
    }),
  },
  {
    name: "deferred",
    program: call("client.chain", {
      steps: [
        call("t.num", { value: 2 }, { $name: "two" }),
        call("client.eval", { procedure: ["t", "add"], input: { a: ref("two"), b: 1 } }),
        call("t.echo", {
          never: call("t.write", { key: "k" }, { $when: "$never" }),
          parent: call("t.echo", { now: call("t.num", { value: 3 }) }, { $when: "$parent" }),
          literal: { $literal: { $proc: ["t", "write"], input: {} } },
          schema: { $literal: { $ref: "#/definitions/point" } },
        }),
      ],
    }),
  },
  {
    name: "body",
    mode: "body",
    program: call("client.chain", { steps: [call("t.add", { a: ref("input.x"), b: 1 }), call("t.write", { key: "k", value: ref("$last") })] }),
  },
];

describe("golden outputs", () => {
  for (const { name, program, mode } of PROGRAMS) {
    it(`${name}: the IR, the TypeScript text and the run agree`, async () => {
      const harness = makeHarness();
      const compiled = await harness.compile(program, { mode, language: "ts" });
      expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      await expect(printIR(compiled.ir)).toMatchFileSnapshot(`../test/golden/${name}.ir.txt`);
      // The hash changes with each change of a core procedure: the golden file does not pin it
      await expect(compiled.code.split(compiled.registryHash).join("<registry hash>")).toMatchFileSnapshot(`../test/golden/${name}.ts`);
      const input = mode === "body" ? { x: 41 } : undefined;
      const closure = await harness.runCompiled(compiled.run, input);
      expect(await harness.runText(compiled.body, input)).toEqual(closure);
      if (mode !== "body") expect(closure).toEqual(await harness.interpret(program));
    });
  }
});
