/**
 * The registry checks the path segments (deep dive CORE-6) and reports a replaced procedure.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry, RegistryError } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import type { AnyProcedure, ProcedurePath } from "./types.js";

function procedureAt(path: ProcedurePath, handler: () => unknown = () => "ok"): AnyProcedure {
  return {
    ...defineProcedure({ path: ["placeholder"], input: outputSchema<unknown>(), output: outputSchema<unknown>(), handler }),
    path,
  } as AnyProcedure;
}

describe("ProcedureRegistry path segments (CORE-6)", () => {
  it.each([
    ["__proto__", ["__proto__", "polluted"]],
    ["constructor", ["a", "constructor"]],
    ["prototype", ["prototype", "x"]],
    ["an empty segment", ["a", ""]],
    ["no segment", []],
  ])("rejects %s", (_name, path) => {
    const registry = new ProcedureRegistry();
    expect(() => registry.register(procedureAt(path as ProcedurePath))).toThrow(RegistryError);
  });

  it("rejects a prefix with a bad segment", () => {
    const registry = new ProcedureRegistry();
    expect(() => registry.register(procedureAt(["x"]), { pathPrefix: ["__proto__"] })).toThrow(RegistryError);
  });

  it("[a.b, c] and [a, b.c] cannot collide, also with override", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureAt(["a", "b", "c"]));
    expect(() => registry.register(procedureAt(["a.b", "c"]))).toThrow(/same key/);
    expect(() => registry.register(procedureAt(["a", "b.c"]), { override: true })).toThrow(/same key/);
    expect(registry.get(["a", "b", "c"])?.path).toEqual(["a", "b", "c"]);
  });

  it("allows a dot in a segment (client-fs has fs.read.json)", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureAt(["fs", "read.json"]));
    expect(registry.get(["fs", "read.json"])?.path).toEqual(["fs", "read.json"]);
  });

  it("getTree does not write into Object.prototype", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureAt(["toString", "x"]));
    registry.register(procedureAt(["hasOwnProperty"]));
    const tree = registry.getTree() as Record<string, Record<string, unknown>>;
    expect(Object.keys(tree).sort()).toEqual(["hasOwnProperty", "toString"]);
    expect(Object.keys(tree["toString"]!)).toEqual(["x"]);
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
    expect(typeof Object.prototype.toString).toBe("function");
  });
});

describe("ProcedureRegistry override", () => {
  it("emits unregister for the procedure that it replaces", () => {
    const registry = new ProcedureRegistry();
    const first = procedureAt(["a"], () => 1);
    const second = procedureAt(["a"], () => 2);
    const events: string[] = [];
    registry.on("unregister", (procedure) => events.push(`unregister ${String(procedure.handler?.({}, {} as never))}`));
    registry.on("register", (procedure) => events.push(`register ${String(procedure.handler?.({}, {} as never))}`));
    registry.register(first);
    registry.register(second, { override: true });
    expect(events).toEqual(["register 1", "unregister 1", "register 2"]);
  });
});
