/**
 * The defects of the docs review (2026-10-11), through `client.exec()`.
 *
 * - DOC-1: a deferred call is data, also in a list and as a chain step. Before, a list of only
 *   `$never` calls ran as an implicit chain, and `client.chain` ran a `$never` step.
 * - DOC-2: `client.eval` evaluates its call like `exec()`: the nested calls and the `$ref` values
 *   of the call's input run. Before, `add` with a nested call gave "[object Object]1".
 * - DOC-4: `client.reduce` without `fn` hydrates `initial`. `client.chain` honors `passThrough`
 *   and `initialInput`.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "./schemas.js";
import { ProcedureRegistry } from "../registry.js";
import { allCoreProcedures } from "./index.js";
import { observeHydration } from "../program.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

/**
 * A client with the core procedures, a recorder (`test.value` records its name and returns
 * `value`) and `test.echo`, which returns its input (null for no input).
 */
function makeClient(): { client: Client; calls: string[] } {
  const calls: string[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
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
      path: ["test", "echo"],
      input: outputSchema<unknown>(),
      output: outputSchema<unknown>(),
      handler: (input: unknown) => input ?? null,
    }),
  );
  return { client: new Client(stubTransport).useRegistry(registry), calls };
}

const value = (name: string, v: unknown) => ({ $proc: ["test", "value"], input: { name, value: v } });
const never = (name: string, v: unknown) => ({ ...value(name, v), $when: "$never" });
const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
const identity = (v: unknown) => ({ $proc: ["client", "identity"], input: { value: v } });

describe("DOC-1: a deferred call is data in a list and in a chain", () => {
  it("a list of only $never calls is data, not an implicit chain", async () => {
    const { client, calls } = makeClient();
    const list = [never("a", 1), never("b", 2)];
    expect(await client.exec(identity(list))).toEqual(list);
    expect(calls).toEqual([]);
  });

  it("a list with a $never call is a list: the other calls run, the $never call stays", async () => {
    const { client, calls } = makeClient();
    expect(await client.exec(identity([value("a", 1), never("b", 2)]))).toEqual([1, never("b", 2)]);
    expect(calls).toEqual(["a"]);
  });

  it("a list of calls that run is still an implicit chain", async () => {
    const { client } = makeClient();
    expect(await client.exec(identity([value("a", 1), value("b", 2)]))).toEqual({ results: [1, 2], final: 2 });
  });

  it("a $never step of client.chain is data", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({ $proc: ["client", "chain"], input: { steps: [value("a", 1), never("b", 2)] } });
    expect(result).toEqual({ results: [1, never("b", 2)], final: never("b", 2) });
    expect(calls).toEqual(["a"]);
  });
});

describe("DOC-2: client.eval evaluates like exec()", () => {
  it("runs the nested calls of the evaluated call", async () => {
    const { client } = makeClient();
    expect(await client.exec({ $proc: ["client", "eval"], input: { procedure: add(add(1, 2), 1) } })).toBe(4);
  });

  it("runs the nested calls of the input that it adds to a path", async () => {
    const { client } = makeClient();
    expect(await client.exec({ $proc: ["client", "eval"], input: { procedure: ["client", "add"], input: { a: add(1, 1), b: 1 } } })).toBe(3);
  });

  it("reads the names of the chain around it", async () => {
    const { client } = makeClient();
    const result = await client.exec({
      $proc: ["client", "chain"],
      input: { steps: [value("a", 5), { $proc: ["client", "eval"], input: { procedure: add({ $ref: "$last" }, 1) } }] },
    });
    expect((result as { final: unknown }).final).toBe(6);
  });

  it("gives a control-flow call its operands raw", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "eval"],
      input: { procedure: { $proc: ["client", "conditional"], input: { condition: false, then: value("then", 1), else: value("else", 2) } } },
    });
    expect(result).toBe(2);
    expect(calls).toEqual(["else"]);
  });
});

describe("DOC-10: the hydration observer of one program", () => {
  it("exec(ref, input, { onRef }) reports the events of its own program, also inside control flow", async () => {
    const { client } = makeClient();
    const a: string[] = [];
    const b: string[] = [];
    const all: string[] = [];
    const stop = observeHydration((event) => all.push(event.path.join(".")));
    try {
      await Promise.all([
        client.exec(identity(value("a", 1)), undefined, { onRef: (event) => a.push(event.path.join(".")) }),
        client.exec(
          { $proc: ["client", "conditional"], input: { condition: true, then: { x: add(3, 4) } } },
          undefined,
          { onRef: (event) => b.push(event.path.join(".")) },
        ),
      ]);
    } finally {
      stop();
    }
    expect(a).toEqual(["test.value"]);
    expect(b).toEqual(["client.add"]);
    // The process-wide observer still sees every program
    expect(all.sort()).toEqual(["client.add", "test.value"]);
  });
});

describe("DOC-4: reduce without fn, and the passThrough of chain", () => {
  it("client.reduce without fn hydrates initial", async () => {
    const { client, calls } = makeClient();
    expect(await client.exec({ $proc: ["client", "reduce"], input: { items: [1, 2], initial: value("i", 10) } })).toBe(10);
    expect(calls).toEqual(["i"]);
  });

  it("passThrough gives each step without input the result of the step before, and the first step initialInput", async () => {
    const { client } = makeClient();
    const result = await client.exec({
      $proc: ["client", "chain"],
      input: {
        passThrough: true,
        initialInput: { n: 7 },
        steps: [{ $proc: ["test", "echo"] }, { $proc: ["test", "echo"] }],
      },
    });
    expect(result).toEqual({ results: [{ n: 7 }, { n: 7 }], final: { n: 7 } });
  });

  it("with passThrough, a step that has its own input keeps it", async () => {
    const { client } = makeClient();
    const result = await client.exec({
      $proc: ["client", "chain"],
      input: { passThrough: true, initialInput: 1, steps: [{ $proc: ["test", "echo"] }, identity("own"), { $proc: ["test", "echo"] }] },
    });
    expect(result).toEqual({ results: [1, "own", "own"], final: "own" });
  });

  it("without passThrough, a step without input gets no input", async () => {
    const { client } = makeClient();
    const result = await client.exec({ $proc: ["client", "chain"], input: { steps: [value("a", 3), { $proc: ["test", "echo"] }] } });
    expect(result).toEqual({ results: [3, null], final: null });
  });
});
