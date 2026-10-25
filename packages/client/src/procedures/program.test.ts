/**
 * Programs on the coeval kernel (roadmap item M14, coeval D13). A program becomes a run document,
 * and one run of the kernel runs it: each call is an effect, and the client does it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as kernel from "@mark1russell7/coeval";
import { Client } from "../client/client.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { ProcedureRegistry } from "./registry.js";
import { allCoreProcedures } from "./core/index.js";
import { metaProcedures } from "./define-procedure.js";
import { InvocationError } from "./invoke.js";
import { createRefScope, rawInputRule, type ProcedureRefJson } from "./ref.js";
import {
  PROGRAM_WORLD,
  desugarInput,
  desugarProgram,
  documentAt,
  nameKey,
  namesOfScope,
  originOf,
  programMachine,
  runDocument,
  runProgram,
  scopeOfNames,
  type CallEffect,
} from "./program.js";
import type { RefExecutor } from "./ref.js";

vi.mock("@mark1russell7/coeval", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mark1russell7/coeval")>();
  return { ...original, prepare: vi.fn(original.prepare) };
});

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function makeClient(): { client: Client; registry: ProcedureRegistry; calls: string[] } {
  const calls: string[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of [...allCoreProcedures, ...metaProcedures]) registry.register(procedure);
  registry.register(
    defineProcedure({
      path: ["test", "value"],
      input: outputSchema<{ name: string; value: unknown }>(),
      output: outputSchema<unknown>(),
      handler: (input: { name: string; value: unknown }) => {
        calls.push(input.name);
        return input.value;
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "fail"],
      input: outputSchema<{ message: string }>(),
      output: outputSchema<unknown>(),
      handler: (input: { message: string }) => {
        throw new InvocationError("FORBIDDEN", input.message, ["test", "fail"]);
      },
    }),
  );
  return { client: new Client(stubTransport).useRegistry(registry), registry, calls };
}

const call = (path: string, input?: unknown, extra: Record<string, unknown> = {}): ProcedureRefJson =>
  ({ $proc: path.split("."), ...(input === undefined ? {} : { input }), ...extra }) as ProcedureRefJson;
const value = (name: string, v: unknown) => call("test.value", { name, value: v });

beforeEach(() => {
  vi.mocked(kernel.prepare).mockClear();
});

describe("a program runs on the kernel", () => {
  it("client.exec() runs a program as one run of the kernel: its root call is the root document", async () => {
    const { client } = makeClient();
    const program = call("client.add", { a: value("a", 1), b: 2 });
    expect(await client.exec(program)).toBe(3);
    const prepared = vi.mocked(kernel.prepare).mock.calls.map(([, doc]) => doc);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toEqual({ type: ["client", "add"], value: { a: { type: ["test", "value"], value: { name: "a", value: 1 } }, b: 2 } });
  });

  it("a control-flow procedure runs its operands in a run of the kernel, with the runner of its kind", async () => {
    const { client, calls } = makeClient();
    const program = call("client.chain", {
      steps: [call("test.value", { name: "one", value: 1 }, { $name: "first" }), value("two", { $ref: "first" }), value("three", { $ref: "$last" })],
    });
    expect(await client.exec(program)).toEqual({ results: [1, 1, 1], final: 1 });
    expect(calls).toEqual(["one", "two", "three"]);
    const docs = vi.mocked(kernel.prepare).mock.calls.map(([, doc]) => doc as { type: unknown; own?: unknown });
    // The root call (raw input), then the document of client.chain with the runner of the kind
    expect(docs.map((doc) => doc.type)).toEqual([["client", "chain"], ["client", "chain"]]);
    expect(docs[1]!.own).toEqual({ eval: "program.chain" });
  });

  it("the run document runs on run() of coeval, and each call is an effect with its place", async () => {
    const doc = desugarProgram(call("client.add", { a: value("a", 1), b: { nested: value("b", 2) } }));
    const performed: Array<{ kind: string; place: readonly kernel.Key[]; position: string }> = [];
    const out = await kernel.run(programMachine({ rawInput: () => false }), doc, kernel.context({ self: { position: "root", extra: {} } }), {
      perform: (effect) => {
        const payload = effect.payload as CallEffect;
        performed.push({ kind: effect.kind, place: effect.place, position: payload.position });
        return effect.kind === "test.value" ? (payload.input as { value: unknown }).value : payload.input;
      },
    });
    expect(performed).toEqual([
      { kind: "test.value", place: ["a"], position: "nested" },
      { kind: "test.value", place: ["b", "nested"], position: "nested" },
      { kind: "client.add", place: [], position: "root" },
    ]);
    expect(out.result).toEqual({ ok: true, value: { a: 1, b: { nested: 2 } } });
    expect(kernel.failures(out.trace)).toEqual([]);
  });

  it("a failed call throws the error of the host: the code of an InvocationError stays", async () => {
    const { client } = makeClient();
    const direct = await client.exec(call("test.fail", { message: "taken" })).catch((error: unknown) => error);
    const nested = await client.exec(call("client.identity", { value: call("test.fail", { message: "taken" }) })).catch((error: unknown) => error);
    const operand = await client.exec(call("client.chain", { steps: [call("test.fail", { message: "taken" })] })).catch((error: unknown) => error);
    for (const error of [direct, nested, operand]) {
      expect(error).toBeInstanceOf(InvocationError);
      expect(error).toMatchObject({ code: "FORBIDDEN", message: "taken" });
    }
  });

  it("a program in the envelope form runs on the kernel too", async () => {
    const { client } = makeClient();
    const program = {
      type: ["client", "chain"],
      value: {
        steps: [
          { type: ["test", "value"], value: { name: "x", value: 4 }, name: "x" },
          { type: ["client", "multiply"], value: { a: { type: "ref", value: ["names", "x"] }, b: { type: "ref", value: ["names", "last"] } } },
        ],
      },
    };
    expect(await client.exec(program)).toEqual({ results: [4, 16], final: 16 });
    expect(vi.mocked(kernel.prepare)).toHaveBeenCalled();
  });
});

describe("a procedure that throws a Failure of coeval gives the caller that Failure (coeval 0.6.3)", () => {
  /** A client with the procedure test.failure, which throws the Failure. */
  function failingClient(thrown: unknown): Client {
    const { client, registry } = makeClient();
    registry.register(
      defineProcedure({
        path: ["test", "failure"],
        input: outputSchema<unknown>(),
        output: outputSchema<unknown>(),
        handler: () => {
          throw thrown;
        },
      }),
    );
    return client;
  }

  it("client.exec() throws the same Failure, with the message <code> <reason>, as with coeval 0.5", async () => {
    const thrown = new kernel.Failure({ code: "#VALUE!", reason: "add takes numbers." });
    const client = failingClient(thrown);
    const nested = await client.exec(call("client.identity", { value: call("test.failure", {}) })).catch((error: unknown) => error);
    const operand = await client.exec(call("client.chain", { steps: [call("test.failure", {})] })).catch((error: unknown) => error);
    for (const error of [nested, operand]) {
      expect(error).toBe(thrown);
      expect((error as Error).message).toBe("#VALUE! add takes numbers.");
    }
  });

  it("runProgram() throws the same Failure for a throw, a rejection and a Failure with a cause", async () => {
    const plain = new kernel.Failure({ code: "#N/A", reason: "max of nothing." });
    const caused = new kernel.Failure({ code: "#X!", reason: "the reason", cause: new TypeError("inner") });
    for (const thrown of [plain, caused]) {
      const throwing = (() => {
        throw thrown;
      }) as unknown as RefExecutor;
      const rejecting = (() => Promise.reject(thrown)) as unknown as RefExecutor;
      for (const executor of [throwing, rejecting]) {
        await expect(runProgram(call("test.failure", {}), { executor })).rejects.toBe(thrown);
        await expect(runProgram(call("client.identity", { value: call("test.failure", {}) }), { executor, rootExecutor: (_, input) => input })).rejects.toBe(thrown);
      }
    }
  });

  it("client.tryCatch and client.parallel read the message of the Failure, with its code", async () => {
    const client = failingClient(new kernel.Failure({ code: "#VALUE!", reason: "add takes numbers." }));
    const message = "#VALUE! add takes numbers.";
    expect(await client.exec(call("client.tryCatch", { try: call("test.failure", {}), catch: value("caught", { $ref: "error" }) }))).toEqual({
      success: false,
      value: message,
      error: message,
    });
    expect(await client.exec(call("client.parallel", { tasks: [value("a", 1), call("test.failure", {})] }))).toEqual({
      results: [1, undefined],
      allSucceeded: false,
      errors: [{ index: 1, error: message }],
    });
  });
});

describe("the run documents", () => {
  it("a $ref in a scope is a reference of coeval, and $last is the name last", () => {
    const doc = desugarInput({ a: { $ref: "sum.total" }, b: { $ref: "$last" }, c: { $ref: "last" } }, { scoped: true });
    expect(doc).toEqual({
      type: ["program", "data"],
      value: {
        a: { type: "ref", value: ["names", "sum", "total"] },
        b: { type: "ref", value: ["names", "last"] },
        c: { type: "ref", value: ["names", "$last"] },
      },
    });
    // Without a scope, a $ref object is data: nothing runs
    expect(desugarInput({ a: { $ref: "x" } })).toBeUndefined();
  });

  it("the names of a scope and the names of the kernel change one into the other", () => {
    const outer = createRefScope();
    outer.outputs.set("last", "a step with the name last");
    outer.last = "outer last";
    const inner = createRefScope(outer);
    inner.outputs.set("sum", 3);
    inner.last = "inner last";
    const names = namesOfScope(inner);
    expect(names).toEqual({ [nameKey("last")]: "a step with the name last", last: "inner last", sum: 3 });
    const back = scopeOfNames(names);
    expect(back.last).toBe("inner last");
    expect([...back.outputs]).toEqual([
      ["last", "a step with the name last"],
      ["sum", 3],
    ]);
  });

  it("an array of calls at a hydration root is an implicit chain: a call of client.chain", () => {
    const steps = [value("a", 1), value("b", 2)];
    const doc = desugarInput({ list: steps });
    const chain = (doc as { value: { list: { type: unknown; value: unknown } } }).value.list;
    expect(chain.type).toEqual(["client", "chain"]);
    expect(originOf(chain)).toMatchObject({ synthesized: true, source: { $proc: ["client", "chain"], input: { steps } } });
  });

  it("a procedure path that starts with a key of the world goes under procs", () => {
    expect(desugarProgram(call("ref.read", {})).type).toEqual(["procs", "ref", "read"]);
    expect(kernel.lookupKind(PROGRAM_WORLD, ["procs", "ref", "read"])).toMatchObject({ ok: true });
    expect(kernel.lookupKind(PROGRAM_WORLD, ["fs", "read.json"])).toMatchObject({ ok: true, path: ["fs", "read.json"] });
  });

  it("the deep limits and a cycle fail where the run reaches them", async () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic["self"] = cyclic;
    const doc = desugarInput({ first: value("first", 1), later: cyclic })!;
    const seen: string[] = [];
    await expect(
      runDocument(doc, {
        executor: async <TIn, TOut>(path: string[], input: TIn): Promise<TOut> => {
          seen.push(path.join("."));
          return input as unknown as TOut;
        },
      }),
    ).rejects.toThrow("Hydration failed: the input is cyclic (an object contains itself)");
    // The call before the cycle started: the failure is at its place in the run
    expect(seen).toEqual(["test.value"]);
  });
});

describe("the static kit of coeval checks a program", () => {
  const machine = programMachine({ rawInput: rawInputRule(undefined) });

  it("check finds a name that nothing binds, and a read of a later step", () => {
    const program = call("client.chain", {
      steps: [value("a", { $ref: "later" }), call("test.value", { name: "b", value: { $ref: "nobody" } }, { $name: "later" })],
    });
    const doc = desugarProgram(program, { expand: true });
    const issues = kernel.check(machine, doc);
    expect(issues.map((issue) => [issue.code, issue.reason])).toEqual([
      ["#NAME?", "The name later is bound by a later step."],
      ["#NAME?", "Nothing binds the name nobody."],
    ]);
    expect(issues.map((issue) => originOf(documentAt(doc, issue.place))?.pointer)).toEqual(["/input/steps/0/input/value", "/input/steps/1/input/value"]);
  });

  it("check knows the names of map, reduce and tryCatch, and the input of a defined body", () => {
    const program = call("client.chain", {
      steps: [
        value("first", 0),
        call("client.map", { items: [1, 2], as: "n", fn: value("m", [{ $ref: "n" }, { $ref: "index" }, { $ref: "$last" }]) }),
        call("client.reduce", { items: [1], initial: 0, fn: value("r", [{ $ref: "acc" }, { $ref: "item" }, { $ref: "index" }]) }),
        call("client.tryCatch", { try: value("t", 1), catch: value("c", { $ref: "error" }) }),
        value("i", { $ref: "input.x" }),
      ],
    });
    const doc = desugarProgram(program, { expand: true, scoped: true });
    expect(kernel.check(machine, doc, { names: ["input"] })).toEqual([]);
    expect(kernel.check(machine, doc).map((issue) => issue.reason)).toEqual(["Nothing binds the name input."]);
  });
});
