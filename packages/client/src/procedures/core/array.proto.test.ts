/**
 * The array procedures read only the own fields of an item (the catalog test of roadmap R29
 * found it, as R6 for the object procedures). Before, a key such as `toString` read the function
 * of the prototype: `count` counted each item, and `pluck` gave functions.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { ProcedureRegistry } from "../registry.js";
import { allCoreProcedures } from "./index.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function client(): Client {
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  return new Client(stubTransport).useRegistry(registry);
}

const call = (name: string, input: unknown) => client().exec({ $proc: ["client", name], input });
const items: Array<Record<string, unknown>> = [{ id: 1 }, { id: 2, toString: "own" }];

describe("the array procedures read only own fields (R29)", () => {
  it("client.count, client.pluck and client.partition", async () => {
    expect(await call("count", { items, key: "toString" })).toBe(1);
    expect(await call("count", { items, key: "constructor" })).toBe(0);
    expect(await call("pluck", { items, key: "toString" })).toEqual([undefined, "own"]);
    expect(await call("partition", { items, key: "hasOwnProperty" })).toEqual({ truthy: [], falsy: items });
  });

  it("client.filter, client.where and client.unique", async () => {
    expect(await call("filter", { items, key: "toString", value: "own" })).toEqual([items[1]]);
    expect(await call("filter", { items, key: "toString", match: "not", value: "own" })).toEqual([items[0]]);
    expect(await call("where", { items, where: { toString: "own" } })).toEqual([items[1]]);
    expect(await call("unique", { items: [{ a: 1 }, { a: 2 }], key: "constructor" })).toEqual([{ a: 1 }]);
  });

  it("client.groupBy and client.sort", async () => {
    expect(await call("groupBy", { items: [{ id: 1 }], key: "constructor" })).toEqual({ undefined: [{ id: 1 }] });
    expect(await call("sort", { items: [{ n: 2 }, { n: 1 }], key: "n" })).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("a key of a text item reads an own field of the text", async () => {
    expect(await call("pluck", { items: ["ab", "abc"], key: "length" })).toEqual([2, 3]);
  });
});
