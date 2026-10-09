/**
 * The program semantics of the deep dive (2026-10), through `client.exec()`.
 *
 * - CORE-1: `and`/`or` run their operand refs, in order, and stop at the deciding value.
 * - CORE-5: the procedure decides whether `exec()` hydrates its input, not the last path segment.
 * - CORE-13: the names of an outer chain are visible inside nested control flow.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "./schemas.js";
import { ProcedureRegistry } from "../registry.js";
import { RUNS_REFS_TAG } from "../ref.js";
import { allCoreProcedures } from "./index.js";
import { metaProcedures } from "../define-procedure.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

/** A client with the core procedures and recorders: `test.<name>` records its name and returns `value`. */
function makeClient(): { client: Client; calls: string[]; registry: ProcedureRegistry } {
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
  return { client: new Client(stubTransport).useRegistry(registry), calls, registry };
}

const value = (name: string, v: unknown) => ({ $proc: ["test", "value"], input: { name, value: v } });

describe("CORE-1: and/or run their operands", () => {
  it("and stops at the first falsy result", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "and"],
      input: { values: [value("a", 1), value("b", 0), value("c", 2)] },
    });
    expect(result).toBe(0);
    expect(calls).toEqual(["a", "b"]);
  });

  it("and gives the last result when every result is truthy", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "and"],
      input: { values: [value("a", 1), value("b", "yes")] },
    });
    expect(result).toBe("yes");
    expect(calls).toEqual(["a", "b"]);
  });

  it("or stops at the first truthy result", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "or"],
      input: { values: [value("a", ""), value("b", "found"), value("c", "late")] },
    });
    expect(result).toBe("found");
    expect(calls).toEqual(["a", "b"]);
  });

  it("a conditional on and takes else when an operand is falsy", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "conditional"],
      input: {
        condition: { $proc: ["client", "and"], input: { values: [value("a", false), value("b", true)] } },
        then: value("then", "then"),
        else: value("else", "else"),
      },
    });
    expect(result).toBe("else");
    expect(calls).toEqual(["a", "else"]);
  });

  it("plain values still work", async () => {
    const { client } = makeClient();
    expect(await client.exec({ $proc: ["client", "and"], input: { values: [1, null, 2] } })).toBe(null);
    expect(await client.exec({ $proc: ["client", "or"], input: { values: [0, "x"] } })).toBe("x");
  });
});

describe("CORE-5: the procedure decides whether its input is hydrated", () => {
  it("exec of procedure.define keeps the aggregation body: nothing runs at definition time", async () => {
    const { client, calls } = makeClient();
    await client.exec({
      $proc: ["procedure", "define"],
      input: {
        path: ["test", "defined"],
        aggregation: { $proc: ["test", "value"], input: { name: "body", value: { $ref: "input.x" } } },
      },
    });
    expect(calls).toEqual([]);
    expect(await client.exec(["test", "defined"], { x: 7 })).toBe(7);
    expect(calls).toEqual(["body"]);
  });

  it("a code procedure whose last segment is a control-flow name gets hydrated input", async () => {
    const { client, registry } = makeClient();
    registry.register(
      defineProcedure({
        path: ["user", "map"],
        input: outputSchema<{ n: unknown }>(),
        output: outputSchema<unknown>(),
        handler: (input: { n: unknown }) => input.n,
      }),
    );
    const result = await client.exec({ $proc: ["user", "map"], input: { n: { $proc: ["client", "add"], input: { a: 1, b: 2 } } } });
    expect(result).toBe(3);
  });

  it("a runs-refs procedure gets its input raw", async () => {
    const { client, registry } = makeClient();
    registry.register(
      defineProcedure({
        path: ["user", "runner"],
        input: outputSchema<{ task: unknown }>(),
        output: outputSchema<unknown>(),
        metadata: { tags: [RUNS_REFS_TAG] },
        handler: (input: { task: unknown }) => input.task,
      }),
    );
    const task = value("task", 1);
    expect(await client.exec({ $proc: ["user", "runner"], input: { task } })).toEqual(task);
  });

  it("client.export serializes a ref and does not run it", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec<{ json: string }>({
      $proc: ["client", "export"],
      input: { procedure: value("never", 1) },
    });
    expect(calls).toEqual([]);
    expect(JSON.parse(result.json)).toEqual(value("never", 1));
  });

  it("a control-flow ref nested in a hydrated input stays lazy", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "identity"],
      input: {
        value: {
          $proc: ["client", "conditional"],
          input: { condition: false, then: value("then", 1), else: value("else", 2) },
        },
      },
    });
    expect(result).toBe(2);
    expect(calls).toEqual(["else"]);
  });

  it("an implicit chain runs its steps in order, through client.chain", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec<{ final: unknown }>({
      $proc: ["client", "identity"],
      input: { value: [value("a", 1), { ...value("b", 2), $name: "b" }, value("c", { $ref: "b" })] },
    });
    expect(calls).toEqual(["a", "b", "c"]);
    expect(result.final).toBe(2);
  });
});

describe("CORE-13: outer chain names inside nested control flow", () => {
  it("a conditional branch inside a chain reads a step name and $last", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ final: unknown }>({
      $proc: ["client", "chain"],
      input: {
        steps: [
          { ...value("x", 5), $name: "x" },
          {
            $proc: ["client", "conditional"],
            input: {
              condition: { $ref: "x" },
              then: { $proc: ["client", "add"], input: { a: { $ref: "x" }, b: { $ref: "$last" } } },
              else: 0,
            },
          },
        ],
      },
    });
    expect(result.final).toBe(10);
  });

  it("map fn inside a chain reads the item and an outer step", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ final: { results: unknown[] } }>({
      $proc: ["client", "chain"],
      input: {
        steps: [
          { ...value("k", 10), $name: "k" },
          {
            $proc: ["client", "map"],
            input: { items: [1, 2], fn: { $proc: ["client", "multiply"], input: { a: { $ref: "item" }, b: { $ref: "k" } } } },
          },
        ],
      },
    });
    expect(result.final.results).toEqual([10, 20]);
  });

  it("an inner chain name hides an outer one", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ final: { final: unknown } }>({
      $proc: ["client", "chain"],
      input: {
        steps: [
          { ...value("outer", "outer"), $name: "n" },
          {
            $proc: ["client", "chain"],
            input: { steps: [{ ...value("inner", "inner"), $name: "n" }, { $ref: "n" }] },
          },
        ],
      },
    });
    expect(result.final.final).toBe("inner");
  });

  it("an unknown $ref name in a chain is an error", async () => {
    const { client } = makeClient();
    await expect(
      client.exec({
        $proc: ["client", "chain"],
        input: { steps: [value("a", { $ref: "nosuchname" })] },
      }),
    ).rejects.toThrow(/nosuchname/);
  });
});

describe("Client.exec(ref, input)", () => {
  it("adds the fields of input over the fields of the ref's input", async () => {
    const { client } = makeClient();
    const result = await client.exec({ $proc: ["client", "add"], input: { a: 1, b: 1 } }, { b: 41 });
    expect(result).toBe(42);
  });
});
