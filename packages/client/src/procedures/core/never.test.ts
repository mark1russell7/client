/**
 * `$never` in the operands of the control-flow procedures (roadmap R4, REV-4). A `$never` call is
 * data with its full input, at any depth (PROGRAM-FORMAT section 5). Before, only a step of
 * `client.chain` obeyed it: a `$never` branch of `client.conditional`, a try of
 * `client.tryCatch`, a task of `client.parallel` and a `fn` of `client.map` started.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "./schemas.js";
import { ProcedureRegistry } from "../registry.js";
import { allCoreProcedures } from "./index.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function makeClient(): { client: Client; writes: string[] } {
  const writes: string[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  registry.register(
    defineProcedure({
      path: ["test", "write"],
      input: outputSchema<{ name?: string }>(),
      output: outputSchema<string>(),
      handler: (input: { name?: string }) => {
        writes.push(input.name ?? "write");
        return "wrote";
      },
    }),
  );
  return { client: new Client(stubTransport).useRegistry(registry), writes };
}

const deferred = { $proc: ["test", "write"], input: { name: "deferred" }, $when: "$never" };

describe("a $never operand is data", () => {
  it("a branch of client.conditional", async () => {
    const { client, writes } = makeClient();
    const result = await client.exec({ $proc: ["client", "conditional"], input: { condition: true, then: deferred } });
    expect(result).toEqual(deferred);
    expect(writes).toEqual([]);
  });

  it("the try of client.tryCatch", async () => {
    const { client, writes } = makeClient();
    const result = await client.exec({ $proc: ["client", "tryCatch"], input: { try: deferred, catch: "no" } });
    expect(result).toEqual({ success: true, value: deferred });
    expect(writes).toEqual([]);
  });

  it("a task of client.parallel", async () => {
    const { client, writes } = makeClient();
    const result = await client.exec<unknown[]>({
      $proc: ["client", "parallel"],
      input: { tasks: [deferred, { $proc: ["test", "write"], input: { name: "now" } }] },
    });
    expect(writes).toEqual(["now"]);
    expect(JSON.stringify(result)).toContain("deferred");
  });

  it("the fn of client.map", async () => {
    const { client, writes } = makeClient();
    const result = await client.exec<{ results: unknown[] }>({ $proc: ["client", "map"], input: { items: [1, 2], fn: deferred } });
    expect(result.results).toEqual([deferred, deferred]);
    expect(writes).toEqual([]);
  });

  it("an operand of client.and", async () => {
    const { client, writes } = makeClient();
    await client.exec({ $proc: ["client", "and"], input: { values: [true, deferred] } });
    expect(writes).toEqual([]);
  });
});

describe("the fn of map and reduce is one call", () => {
  it("client.map refuses a fn that is not a call", async () => {
    const { client } = makeClient();
    await expect(client.exec({ $proc: ["client", "map"], input: { items: [1], fn: { $ref: "item" } } })).rejects.toThrow("fn must be one call");
  });

  it("client.reduce refuses a fn that is not a call", async () => {
    const { client } = makeClient();
    await expect(client.exec({ $proc: ["client", "reduce"], input: { items: [1], initial: 0, fn: 5 } })).rejects.toThrow("fn must be one call");
  });

  it("map without fn still gives its items", async () => {
    const { client } = makeClient();
    expect(await client.exec({ $proc: ["client", "map"], input: { items: [1, 2] } })).toEqual({ results: [1, 2] });
  });
});
