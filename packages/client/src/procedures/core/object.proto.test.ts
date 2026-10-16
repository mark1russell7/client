/**
 * The object procedures and the prototype keys (roadmap R6). `client.set` with the path
 * `__proto__.x` changed the prototype of its result, `client.get` and `client.pick` read the
 * fields of the prototype, and `client.merge` set a `__proto__` key of the data as the prototype.
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

describe("the object procedures do not reach a prototype (R6)", () => {
  for (const segment of ["__proto__", "constructor", "prototype"]) {
    it(`client.set and client.get refuse the segment ${segment}`, async () => {
      await expect(call("set", { object: {}, path: `${segment}.polluted`, value: 1 })).rejects.toThrow("reaches a prototype");
      await expect(call("get", { object: {}, path: `a.${segment}` })).rejects.toThrow("reaches a prototype");
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });
  }

  it("client.get and client.has read only own fields", async () => {
    expect(await call("get", { object: { a: 1 }, path: "toString", default: "none" })).toBe("none");
    expect(await call("has", { object: { a: 1 }, path: "hasOwnProperty" })).toBe(false);
    expect(await call("get", { object: { a: { b: 2 } }, path: "a.b" })).toBe(2);
  });

  it("client.pick picks only own fields", async () => {
    expect(await call("pick", { object: { a: 1 }, keys: ["a", "toString"] })).toEqual({ a: 1 });
  });

  it("client.merge does not set a __proto__ key of the data as the prototype", async () => {
    const data = JSON.parse('{"__proto__": {"admin": true}, "name": "x"}') as Record<string, unknown>;
    for (const deep of [false, true]) {
      const merged = (await call("merge", { objects: [{}, data], deep })) as Record<string, unknown>;
      expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
      expect(merged["admin"]).toBeUndefined();
      expect(merged["name"]).toBe("x");
    }
  });

  it("client.set still sets nested paths without changing its input", async () => {
    const input = { a: { b: 1 } };
    expect(await call("set", { object: input, path: "a.c", value: 2 })).toEqual({ a: { b: 1, c: 2 } });
    expect(input).toEqual({ a: { b: 1 } });
  });
});
