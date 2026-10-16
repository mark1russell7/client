/**
 * The checks of `checkProgram()`: each problem is found before the first call.
 */

import { describe, expect, it } from "vitest";
import { Client, PURE_EFFECTS, RUNS_REFS_TAG, anySchema, defineProcedure, describeRegistry, type AnyProcedure, type Effects } from "@procedures/client/browser";
import { checkProgram, type CheckResult } from "./program.js";
import { makeHarness, READ_EFFECTS, stubTransport } from "../test/harness.js";
import type { DiagnosticCode } from "./diagnostics.js";

const call = (path: string, input?: unknown, extra: Record<string, unknown> = {}) => ({
  $proc: path.split("."),
  ...(input !== undefined ? { input } : {}),
  ...extra,
});
const chain = (...steps: unknown[]) => call("client.chain", { steps });
const ref = (name: string) => ({ $ref: name });
const write = (key: string, value: unknown = 1) => call("t.write", { key, value });


function codes(result: CheckResult, severity?: "error" | "warning" | "info"): Array<[DiagnosticCode, string]> {
  return result.diagnostics.filter((diagnostic) => !severity || diagnostic.severity === severity).map((diagnostic) => [diagnostic.code, diagnostic.pointer]);
}

function procedure(path: string[], metadata: Record<string, unknown>): AnyProcedure {
  return defineProcedure({ path, input: anySchema, output: anySchema, metadata, handler: async (input: unknown) => input }) as AnyProcedure;
}

describe("names", () => {
  const harness = makeHarness();
  const check = (program: unknown, mode?: "exec" | "body") => checkProgram(program, { registry: harness.registry, mode });

  it("finds an unknown name", () => {
    const result = check(chain(call("t.num", { name: "a", value: ref("usr.name") })));
    expect(result.ok).toBe(false);
    expect(codes(result, "error")).toEqual([["unknown-name", "/input/steps/0/input/value"]]);
    expect(result.diagnostics[0]!.message).toContain('Unknown $ref name "usr"');
  });

  it("finds a use before the definition", () => {
    const result = check(chain(call("t.num", { name: "a", value: ref("later") }), call("t.num", { name: "b", value: 1 }, { $name: "later" })));
    expect(codes(result, "error")).toEqual([["use-before-definition", "/input/steps/0/input/value"]]);
  });

  it("finds $last in the first step of the outermost chain", () => {
    const result = check(chain(call("t.num", { name: "a", value: ref("$last") })));
    expect(codes(result, "error")).toEqual([["unknown-name", "/input/steps/0/input/value"]]);
    expect(result.diagnostics[0]!.message).toContain("The first step of a chain has no $last");
  });

  it("knows the names of the scopes: steps, $last, item, index, acc, error and input", () => {
    const program = chain(
      call("t.num", { name: "a", value: 1 }, { $name: "first" }),
      call("client.map", { items: [1, 2], as: "n", fn: call("t.add", { a: ref("n"), b: ref("index") }) }),
      call("client.reduce", { items: [1], initial: 0, fn: call("t.add", { a: ref("acc"), b: ref("item") }) }),
      call("client.tryCatch", { try: call("t.fail", { message: "x" }), catch: ref("error") }),
      call("t.add", { a: ref("first"), b: ref("$last.value") }),
    );
    expect(codes(check(program), "error")).toEqual([]);
    expect(codes(check(call("t.num", { name: "a", value: ref("input.x") }), "body"), "error")).toEqual([]);
  });

  it("gives the name of the item of map only in fn, and the error of tryCatch only in catch", () => {
    const result = check(
      chain(call("client.map", { items: [ref("item")], fn: call("t.num", { value: 1 }) }), call("client.tryCatch", { try: ref("error"), catch: 0 })),
    );
    expect(codes(result, "error")).toEqual([
      ["unknown-name", "/input/steps/0/input/items/0"],
      ["unknown-name", "/input/steps/1/input/try"],
    ]);
  });

  it("warns for a $ref outside each scope: it is data", () => {
    const result = check(call("t.num", { name: "a", value: ref("total") }));
    expect(result.ok).toBe(true);
    expect(codes(result, "warning")).toEqual([["unscoped-ref", "/input/value"]]);
  });

  it("warns for a $name that no $ref can read", () => {
    const result = check(chain(call("t.num", { name: "a", value: call("t.num", { name: "b", value: 1 }, { $name: "inner" }) })));
    expect(codes(result, "warning")).toEqual([["name-not-bound", "/input/steps/0/input/value"]]);
  });
});

describe("procedures and inputs", () => {
  const harness = makeHarness();
  const check = (program: unknown) => checkProgram(program, { registry: harness.registry });

  it("finds an unknown procedure and a path that is not valid", () => {
    expect(codes(check(chain(call("no.such", {}))), "error")).toEqual([["unknown-procedure", "/input/steps/0"]]);
    expect(codes(check(chain({ $proc: ["t", 1] })), "error")).toEqual([["invalid-path", "/input/steps/0"]]);
    expect(codes(check([1]), "error")).toEqual([["root-not-call", ""]]);
  });

  it("finds an input that does not agree with the JSON Schema of the procedure", () => {
    const result = check(chain(call("client.add", { a: "x" }), call("client.add", { a: call("t.num", { value: "?" }), b: 2 })));
    expect(codes(result, "error")).toEqual([
      ["input-schema", "/input/steps/0/input"],
      ["input-schema", "/input/steps/0/input/a"],
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain("a: expected number, got string");
    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain("b: the input has no value for this required key");
  });

  it("finds a control-flow input that is not valid and a fn that is not a call", () => {
    expect(codes(check(call("client.chain", { steps: "x" })), "error")).toEqual([["invalid-control-flow", ""]]);
    const result = check(call("client.map", { items: [1], fn: 5 }));
    expect(codes(result, "error")).toEqual([["fn-not-call", "/input/fn"]]);
  });

  it("finds calls that nest deeper than the hydration limit", () => {
    let value: unknown = 1;
    for (let level = 0; level < 11; level++) value = call("t.num", { value });
    const result = check(call("t.num", { value }));
    expect(codes(result, "error")).toEqual([["depth-limit", `/input${"/value/input".repeat(10)}/value`]]);
  });

  it("finds a procedure that the host does not expose", () => {
    const result = checkProgram(chain(write("k")), { registry: harness.registry, expose: (path) => path.join(".") !== "t.write" });
    expect(codes(result, "error")).toEqual([["not-exposed", "/input/steps/0"]]);
  });
});

describe("the capability: a refused call is found before the first call", () => {
  it("finds a refused write in step 3 before steps 1 and 2 write", async () => {
    const network: Effects = { reads: [], writes: ["network"], destructive: false };
    const harness = makeHarness([procedure(["t", "send"], { effects: network })]);
    const program = chain(write("k1"), write("k2"), call("t.send", { to: "x" }));
    const capability = { effects: { writes: ["store"] } };

    const result = checkProgram(program, { registry: harness.registry, capability });
    expect(result.ok).toBe(false);
    expect(codes(result, "error")).toEqual([["capability-refused", "/input/steps/2"]]);
    expect(result.diagnostics[0]!.message).toContain("t.send changes network, and this call changes only store");
    // The check started nothing
    expect(harness.trace).toEqual([]);
    expect(harness.store.size).toBe(0);

    // The interpreter with the same capability writes twice, then refuses step 3
    const client = new Client({ transport: stubTransport, capability }).useRegistry(harness.registry);
    await expect(client.exec(program)).rejects.toThrow(/t\.send changes network/);
    expect(harness.trace).toEqual(['t.write {"key":"k1","value":1}', 't.write {"key":"k2","value":1}']);
  });

  it("refuses each write under a read-only capability, and an undeclared procedure (fail closed)", () => {
    const harness = makeHarness([procedure(["t", "undeclared"], {})]);
    const readOnly = { effects: { writes: [] as string[] } };
    const result = checkProgram(chain(call("t.read", { key: "k" }), write("k"), call("t.undeclared", {})), { registry: harness.registry, capability: readOnly });
    expect(codes(result, "error")).toEqual([
      ["capability-refused", "/input/steps/1"],
      ["capability-refused", "/input/steps/2"],
    ]);
    expect(result.effects.writes).toBeUndefined();
    expect(result.effects.reads).toBeUndefined();
  });

  it("refuses a destructive procedure when the capability says destructive: false", () => {
    const harness = makeHarness();
    const result = checkProgram(chain(write("k")), { registry: harness.registry, capability: { effects: { destructive: false } } });
    expect(codes(result, "error")).toEqual([["capability-refused", "/input/steps/0"]]);
  });

  it("fails closed for a procedure that runs a program that the compiler cannot see", () => {
    const harness = makeHarness([procedure(["t", "runner"], { effects: PURE_EFFECTS, tags: [RUNS_REFS_TAG] })]);
    const program = chain(call("t.runner", { visit: write("k") }));
    expect(codes(checkProgram(program, { registry: harness.registry }), "info")).toContainEqual(["effects-unknown", "/input/steps/0"]);
    const limited = checkProgram(program, { registry: harness.registry, capability: { effects: { writes: [] as string[] } } });
    expect(codes(limited, "error")).toEqual([["effects-unknown", "/input/steps/0"]]);
    expect(limited.effects.writes).toBeUndefined();
  });

  it("sees the body of a procedure that procedure.define made, through the registry", async () => {
    const harness = makeHarness();
    await harness.client.exec({ $proc: ["procedure", "define"], input: { path: ["my", "save"], aggregation: write("k", ref("input.value")) } });
    const program = chain(call("my.save", { value: 2 }));
    const result = checkProgram(program, { registry: harness.registry, capability: { effects: { writes: [] as string[] } } });
    expect(result.effects.writes).toEqual(["store"]);
    expect(codes(result, "error")).toEqual([["capability-refused", "/input/steps/0"]]);
    expect(result.diagnostics[0]!.message).toContain("the program of my.save changes store");
  });
});

describe("$never traps", () => {
  const harness = makeHarness();
  const warnings = (program: unknown) => codes(checkProgram(program, { registry: harness.registry }), "warning");

  it("warns for a $never step, condition, branch, task, operand and fn", () => {
    const never = (path: string, input: unknown) => call(path, input, { $when: "$never" });
    expect(warnings(chain(never("t.num", { value: 1 })))).toEqual([["never-trap", "/input/steps/0"]]);
    expect(warnings(call("client.conditional", { condition: never("t.truth", { value: false }), then: 1 }))).toEqual([["never-trap", "/input/condition"]]);
    expect(warnings(call("client.map", { items: [1], fn: never("t.num", { value: 1 }) }))).toEqual([["never-trap", "/input/fn"]]);
    expect(warnings(call("client.or", { values: [never("t.num", { value: 0 }), 1] }))).toEqual([["never-trap", "/input/values/0"]]);
  });

  it("warns for an array of calls that is a list because one call waits", () => {
    const program = call("t.num", { value: [call("t.num", { value: 1 }), call("t.num", { value: 2 }, { $when: "$never" })] });
    expect(warnings(program)).toEqual([["never-trap", "/input/value"]]);
  });
});

describe("effects: may and must", () => {
  const harness = makeHarness();
  const check = (program: unknown) => checkProgram(program, { registry: harness.registry });

  it("gives the union of the branches as may, and their intersection as must", () => {
    const one = check(call("client.conditional", { condition: true, then: write("k"), else: call("t.read", { key: "k" }) }));
    expect(one.effects).toEqual({ reads: ["store"], writes: ["store"], destructive: true, idempotent: false });
    expect(one.mustEffects).toEqual({ reads: [], writes: [] });
    const both = check(call("client.conditional", { condition: true, then: write("a"), else: write("b") }));
    expect(both.mustEffects).toEqual({ reads: [], writes: ["store"] });
  });

  it("does not count the later operands of and/or, the catch, or the fn of map over a list that can be empty", () => {
    expect(check(call("client.and", { values: [true, write("k")] })).mustEffects.writes).toEqual([]);
    expect(check(call("client.tryCatch", { try: 1, catch: write("k") })).mustEffects.writes).toEqual([]);
    expect(check(call("client.map", { items: [], fn: write("k", ref("item")) })).mustEffects.writes).toEqual([]);
    expect(check(call("client.map", { items: [1], fn: write("k", ref("item")) })).mustEffects.writes).toEqual(["store"]);
    expect(check(call("client.map", { items: [1], fn: write("k", ref("item")) })).effects.writes).toEqual(["store"]);
  });

  it("gives a read-only program the effects of a read-only procedure", () => {
    const result = check(chain(call("t.read", { key: "k" }), call("t.num", { value: ref("$last") })));
    expect(result.effects).toEqual({ reads: ["store"], writes: [], destructive: false, idempotent: true });
    expect(result.mustEffects).toEqual({ reads: ["store"], writes: [] });
  });

  it("reads what client.eval of a literal path runs", () => {
    const result = check(chain(call("client.eval", { procedure: ["t", "write"], input: { key: "k", value: ref("nope") } })));
    expect(result.effects.writes).toEqual(["store"]);
    expect(codes(result, "error")).toEqual([["unknown-name", "/input/steps/0/input/input/value"]]);
  });

  it("checks the body that the program defines, and gives its effects to the later calls", () => {
    const program = chain(
      call("procedure.define", { path: ["math", "double"], aggregation: call("client.multiply", { a: ref("x"), b: 2 }) }),
      call("procedure.define", { path: ["my", "save"], aggregation: write("k", ref("input.value")) }),
      call("my.save", { value: 2 }),
    );
    const result = check(program);
    expect(codes(result, "error")).toEqual([["unknown-name", "/input/steps/0/input/aggregation/input/a"]]);
    expect(result.effects.writes).toEqual(["registry", "store"]);
  });
});

describe("the manifest of a browser", () => {
  it("gives the same check as the registry", () => {
    const harness = makeHarness();
    const manifest = JSON.parse(JSON.stringify(describeRegistry(harness.registry)));
    const program = chain(
      call("t.read", { key: "k" }, { $name: "old" }),
      call("client.conditional", { condition: ref("old"), then: write("k", ref("$last")), else: call("client.add", { a: "x", b: 1 }) }),
      call("client.map", { items: [1, 2], fn: call("t.num", { value: ref("missing") }) }),
    );
    const fromRegistry = checkProgram(program, { registry: harness.registry, capability: { effects: { writes: [] as string[] } } });
    const fromManifest = checkProgram(program, { manifest, capability: { effects: { writes: [] as string[] } } });
    expect(fromManifest.diagnostics).toEqual(fromRegistry.diagnostics);
    expect(fromManifest.effects).toEqual(fromRegistry.effects);
    expect(fromManifest.registryHash).toBe(fromRegistry.registryHash);
    expect(fromManifest.ok).toBe(false);
  });

  it("knows the read-only procedures of the test registry", () => {
    const harness = makeHarness();
    const manifest = describeRegistry(harness.registry);
    expect(manifest.procedures.find((entry) => entry.key === "t.read")?.effects).toEqual(READ_EFFECTS);
  });
});
