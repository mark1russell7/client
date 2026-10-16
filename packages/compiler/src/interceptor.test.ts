/**
 * The check before the run as an interceptor (roadmap R22): a refused call in step 3 stops the
 * program before the write of step 1.
 */

import { describe, expect, it } from "vitest";
import {
  invokeProcedure,
  outputValue,
  PURE_EFFECTS,
  defineProcedure,
  anySchema,
  toolHints,
  type Capability,
  type ProcedurePath,
} from "@procedures/client/browser";
import { makeHarness } from "../test/harness.js";
import { programCheckInterceptor } from "./interceptor.js";

const READ_ONLY: Capability = { effects: { writes: [] } };

/** A chain: a write, a read, then a second write. */
const program = {
  steps: [
    { $proc: ["t", "write"], input: { key: "a", value: 1 } },
    { $proc: ["t", "read"], input: { key: "a" } },
    { $proc: ["t", "write"], input: { key: "b", value: 2 } },
  ],
};

async function run(
  input: unknown,
  options: { capability?: Capability; expose?: (path: ProcedurePath) => boolean; check?: boolean; path?: ProcedurePath } = {},
) {
  const harness = makeHarness();
  const checks: number[] = [];
  const interceptors = options.check === false ? [] : [programCheckInterceptor({ registry: harness.registry, expose: options.expose, onCheck: (invocation) => checks.push(invocation.depth) })];
  const procedure = harness.registry.get(options.path ?? ["client", "chain"])!;
  const outcome = invokeProcedure(procedure, input, {
    registry: harness.registry,
    interceptors,
    ...(options.capability ? { capability: options.capability } : {}),
    ...(options.expose ? { expose: options.expose } : {}),
  }).then((output) => outputValue(output));
  return { harness, outcome, checks };
}

describe("programCheckInterceptor (R22)", () => {
  it("refuses the program before its first write, where the interpreter refuses only at the write", async () => {
    const plain = await run(program, { capability: { effects: { writes: ["store"], reads: [] } }, check: false });
    await expect(plain.outcome).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Without the check, the write of step 1 happened before the refusal of the read in step 2
    expect(plain.harness.store.get("a")).toBe(1);

    const checked = await run(program, { capability: { effects: { writes: ["store"], reads: [] } } });
    await expect(checked.outcome).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
    await expect(checked.outcome).rejects.toThrow("no step started");
    expect(checked.harness.store.size).toBe(0);
    expect(checked.harness.trace).toEqual([]);
  });

  it("refuses a write under a read-only capability, also in a branch that does not run", async () => {
    const branch = { condition: true, then: 1, else: { $proc: ["t", "write"], input: { key: "a", value: 1 } } };
    const checked = await run(branch, { capability: READ_ONLY, path: ["client", "conditional"] });
    await expect(checked.outcome).rejects.toMatchObject({ code: "FORBIDDEN" });
    const plain = await run(branch, { capability: READ_ONLY, path: ["client", "conditional"], check: false });
    expect(await plain.outcome).toBe(1);
  });

  it("refuses a call that the host does not expose, also inside client.tryCatch", async () => {
    const expose = (path: ProcedurePath): boolean => path[0] !== "t" || path[1] !== "write";
    const checked = await run({ try: { $proc: ["t", "write"], input: { key: "a", value: 1 } }, catch: 0 }, { expose, path: ["client", "tryCatch"] });
    await expect(checked.outcome).rejects.toMatchObject({ code: "NOT_EXPOSED" });
    expect(checked.harness.store.size).toBe(0);
  });

  it("refuses an unknown name, and gives the pointer of the problem", async () => {
    const checked = await run({ steps: [{ $proc: ["t", "echo"], input: { value: { $ref: "missing" } } }] });
    await expect(checked.outcome).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(checked.outcome).rejects.toThrow("unknown-name at /steps/0/input/value of the input");
  });

  it("runs a good program unchanged, and checks only the call of the host", async () => {
    const checked = await run(program);
    expect(((await checked.outcome) as { results: unknown[] }).results).toEqual([{ written: "a" }, 1, { written: "b" }]);
    expect(checked.harness.store.get("b")).toBe(2);
    expect(checked.checks).toEqual([0]);
  });

  it("does not check a call of a procedure that is not data-driven", async () => {
    const checked = await run({ key: "a", value: 1 }, { path: ["t", "write"], capability: READ_ONLY });
    // The admission of the interpreter refuses it: the interceptor did not examine it
    await expect(checked.outcome).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(checked.checks).toEqual([]);
  });

  it("gives procedure.define the effects of its body, so the tool of the procedure has the right hints", async () => {
    const harness = makeHarness();
    const interceptors = [programCheckInterceptor({ registry: harness.registry })];
    const define = (path: string[], aggregation: unknown, metadata?: unknown) =>
      invokeProcedure(harness.registry.get(["procedure", "define"])!, { path, aggregation, ...(metadata ? { metadata } : {}) }, { registry: harness.registry, interceptors }).then(
        (output) => outputValue(output),
      );

    await define(["d", "writer"], { $proc: ["t", "write"], input: { key: "k", value: { $ref: "input.value" } } });
    const writer = harness.registry.get(["d", "writer"])!;
    expect((writer.metadata as { inferredEffects?: unknown }).inferredEffects).toMatchObject({ reads: [], writes: ["store"] });
    expect(toolHints(writer)).toMatchObject({ readOnlyHint: false, destructiveHint: true });

    // The metadata of the caller cannot claim the effects: the framework sets the field
    await define(["d", "pure"], { $proc: ["t", "echo"], input: { value: 1 } }, { description: "pure", inferredEffects: { reads: [], writes: ["store"] } });
    expect(toolHints(harness.registry.get(["d", "pure"])!)).toMatchObject({ readOnlyHint: true });
  });

  it("refuses a body with an error, and gives the place in the input", async () => {
    const harness = makeHarness();
    const define = invokeProcedure(
      harness.registry.get(["procedure", "define"])!,
      { path: ["d", "broken"], aggregation: { $proc: ["t", "echo"], input: { value: { $ref: "missing" } } } },
      { registry: harness.registry, interceptors: [programCheckInterceptor({ registry: harness.registry })] },
    );
    await expect(define).rejects.toThrow("unknown-name at /aggregation/input/value of the input");
    expect(harness.registry.get(["d", "broken"])).toBeUndefined();
  });

  it("gives no hints to a defined procedure without the check of a host", async () => {
    const harness = makeHarness();
    await invokeProcedure(
      harness.registry.get(["procedure", "define"])!,
      { path: ["d", "plain"], aggregation: { $proc: ["t", "echo"], input: { value: 1 } }, metadata: { inferredEffects: { reads: [], writes: [] } } },
      { registry: harness.registry },
    ).then((output) => outputValue(output));
    expect(toolHints(harness.registry.get(["d", "plain"])!)).toEqual({});
  });

  it("makes its facts again when the registry changes", async () => {
    const harness = makeHarness();
    const interceptor = programCheckInterceptor({ registry: harness.registry });
    const chain = harness.registry.get(["client", "chain"])!;
    const call = (input: unknown) => invokeProcedure(chain, input, { registry: harness.registry, interceptors: [interceptor] }).then((output) => outputValue(output));
    const later = { steps: [{ $proc: ["t", "later"], input: {} }] };
    await expect(call(later)).rejects.toMatchObject({ code: "NOT_FOUND" });
    harness.registry.register(
      defineProcedure({ path: ["t", "later"], input: anySchema, output: anySchema, metadata: { effects: PURE_EFFECTS }, handler: async () => "now" }),
    );
    expect(((await call(later)) as { results: unknown[] }).results).toEqual(["now"]);
  });
});
