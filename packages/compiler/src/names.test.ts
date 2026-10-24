/**
 * The names pass: the static kit of coeval checks the names of a program (roadmap item M14).
 */

import { describe, expect, it, vi } from "vitest";
import * as kernel from "@mark1russell7/coeval";
import { checkProgram } from "./program.js";
import { nameDiagnostics } from "./names.js";
import { makeHarness } from "../test/harness.js";

vi.mock("@mark1russell7/coeval", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mark1russell7/coeval")>();
  return { ...original, check: vi.fn(original.check) };
});

const call = (path: string, input?: unknown, extra: Record<string, unknown> = {}) => ({
  $proc: path.split("."),
  ...(input !== undefined ? { input } : {}),
  ...extra,
});
const ref = (name: string) => ({ $ref: name });

describe("the names pass", () => {
  it("runs the name rules through check() of coeval, on the run document of the program", () => {
    vi.mocked(kernel.check).mockClear();
    const program = call("client.chain", { steps: [call("t.num", { value: ref("nope") })] });
    const result = checkProgram(program, { registry: makeHarness().registry });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "unknown-name").map((diagnostic) => diagnostic.pointer)).toEqual([
      "/input/steps/0/input/value",
    ]);
    const docs = vi.mocked(kernel.check).mock.calls.map(([, doc]) => doc as { type: unknown });
    expect(docs.map((doc) => doc.type)).toContainEqual(["client", "chain"]);
  });

  it("gives the names of the scope in the message", () => {
    const program = call("client.chain", {
      steps: [call("t.num", { value: 1 }, { $name: "first" }), call("client.map", { items: [1], as: "n", fn: call("t.num", { value: ref("x") }) })],
    });
    const [diagnostic] = nameDiagnostics(program, { mode: "exec" });
    expect(diagnostic).toEqual({
      severity: "error",
      code: "unknown-name",
      message: 'Unknown $ref name "x" in "x". The names here: first, $last, n, index.',
      pointer: "/input/steps/1/input/fn/input/value",
    });
  });

  it("gives an info for an unknown name in the input of a deferred call", () => {
    const program = call("client.chain", { steps: [call("t.echo", { later: call("t.echo", { a: ref("nope") }, { $when: "runner" }) })] });
    expect(nameDiagnostics(program, { mode: "exec" })).toEqual([
      {
        severity: "info",
        code: "unknown-name",
        message: 'No scope has the name "nope" here. In the input of a deferred call, the $ref stays data for the runner.',
        pointer: "/input/steps/0/input/later/input/a",
      },
    ]);
  });

  it("knows the name input of a body, and the pointer of a body in a bigger document", () => {
    const body = call("t.num", { value: [ref("input.x"), ref("other")] });
    expect(nameDiagnostics(body, { mode: "body", base: "/input/aggregation" }).map((diagnostic) => [diagnostic.code, diagnostic.pointer])).toEqual([
      ["unknown-name", "/input/aggregation/input/value/1"],
    ]);
    expect(nameDiagnostics(body, { mode: "exec" })).toEqual([]);
  });

  it("counts a step that is data: $last in the second step reads it", () => {
    const program = call("client.reduce", { items: [1], initial: "text", fn: call("client.chain", { steps: [0, ref("$last"), ref("later")] }) });
    expect(nameDiagnostics(program, { mode: "exec" }).map((diagnostic) => [diagnostic.code, diagnostic.pointer])).toEqual([
      ["unknown-name", "/input/fn/input/steps/2"],
    ]);
  });

  it("gives the steps of an implicit chain their pointers in the array", () => {
    const program = call("t.echo", { list: [call("t.num", { value: 1 }), call("t.num", { value: ref("$last") }), call("t.num", { value: ref("later") })] });
    expect(nameDiagnostics(program, { mode: "exec" }).map((diagnostic) => [diagnostic.code, diagnostic.pointer])).toEqual([
      ["unknown-name", "/input/list/2/input/value"],
    ]);
  });
});
