/**
 * Control-flow operands with nested refs, and map/reduce with fn, through `client.exec()`.
 *
 * Before: the control-flow procedures called each operand with its raw input, so a nested ref
 * (`multiply { a: add {...} }`) reached the procedure as an object. `map` returned its raw
 * items and `reduce` its initial value: no function was ever applied.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "./schemas.js";
import { ProcedureRegistry } from "../registry.js";
import { allCoreProcedures } from "./index.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function makeClient(): { client: Client; calls: string[] } {
  const calls: string[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  for (const name of ["then", "else"]) {
    registry.register(
      defineProcedure({
        path: ["test", name],
        input: outputSchema<Record<string, unknown>>(),
        output: outputSchema<string>(),
        handler: () => {
          calls.push(name);
          return name;
        },
      }),
    );
  }
  return { client: new Client(stubTransport).useRegistry(registry), calls };
}

const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
const multiply = (a: unknown, b: unknown) => ({ $proc: ["client", "multiply"], input: { a, b } });

describe("control-flow operands run their nested refs", () => {
  it("chain: a step input can hold a ref", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ final: unknown }>({
      $proc: ["client", "chain"],
      input: { steps: [multiply(add(1, 2), 10)] },
    });
    expect(result.final).toBe(30);
  });

  it("chain: a nested ref can read a named step with $ref", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ final: unknown }>({
      $proc: ["client", "chain"],
      input: {
        steps: [
          { ...add(2, 3), $name: "sum" },
          multiply(add({ $ref: "sum" }, 1), 2),
        ],
      },
    });
    expect(result.final).toBe(12);
  });

  it("conditional: the condition input can hold a ref, and only the selected branch runs", async () => {
    const { client, calls } = makeClient();
    const result = await client.exec({
      $proc: ["client", "conditional"],
      input: {
        condition: { $proc: ["client", "gt"], input: { a: add(2, 2), b: 3 } },
        then: { $proc: ["test", "then"], input: {} },
        else: { $proc: ["test", "else"], input: {} },
      },
    });
    expect(result).toBe("then");
    expect(calls).toEqual(["then"]);
  });

  it("parallel: a task input can hold a ref", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ results: unknown[] }>({
      $proc: ["client", "parallel"],
      input: { tasks: [add(add(1, 1), 1), multiply(add(1, 1), 5)] },
    });
    expect(result.results).toEqual([3, 10]);
  });

  it("tryCatch: the try input can hold a ref", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ success: boolean; value: unknown }>({
      $proc: ["client", "tryCatch"],
      input: { try: multiply(add(1, 1), 4), catch: { $proc: ["client", "constant"], input: { value: 0 } } },
    });
    expect(result).toEqual({ success: true, value: 8 });
  });

  it("a nested control-flow operand stays lazy: only its selected branch runs", async () => {
    const { client, calls } = makeClient();
    await client.exec({
      $proc: ["client", "chain"],
      input: {
        steps: [
          {
            $proc: ["client", "conditional"],
            input: {
              condition: false,
              then: { $proc: ["test", "then"], input: {} },
              else: { $proc: ["test", "else"], input: {} },
            },
          },
        ],
      },
    });
    expect(calls).toEqual(["else"]);
  });
});

describe("map and reduce with fn", () => {
  it("map runs fn for each item, with the item and index as $refs", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ results: unknown[] }>({
      $proc: ["client", "map"],
      input: { items: [1, 2, 3], fn: add(multiply({ $ref: "item" }, 10), { $ref: "index" }) },
    });
    expect(result.results).toEqual([10, 21, 32]);
  });

  it("map: `as` names the item, and the items can come from a ref", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ results: unknown[] }>({
      $proc: ["client", "map"],
      input: {
        items: { $proc: ["client", "range"], input: { start: 1, end: 4 } },
        as: "n",
        fn: multiply({ $ref: "n" }, { $ref: "n" }),
      },
    });
    expect(result.results).toEqual([1, 4, 9]);
  });

  it("map without fn runs the refs of the items, one result per item", async () => {
    const { client } = makeClient();
    const result = await client.exec<{ results: unknown[] }>({
      $proc: ["client", "map"],
      input: { items: [add(1, 1), add(2, 2)] },
    });
    expect(result.results).toEqual([2, 4]);
  });

  it("reduce runs fn with acc and item", async () => {
    const { client } = makeClient();
    const result = await client.exec({
      $proc: ["client", "reduce"],
      input: { items: [1, 2, 3, 4], initial: 0, fn: add({ $ref: "acc" }, { $ref: "item" }) },
    });
    expect(result).toBe(10);
  });

  it("reduce without fn keeps the old result (accumulated, else initial)", async () => {
    const { client } = makeClient();
    expect(await client.exec({ $proc: ["client", "reduce"], input: { items: [1], initial: 5 } })).toBe(5);
  });
});
