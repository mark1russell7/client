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

  it("[a, b, c], [a.b, c] and [a, b.c] are three procedures with three keys (CLI-75)", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureAt(["a", "b", "c"], () => "abc"));
    registry.register(procedureAt(["a.b", "c"], () => "a.b c"));
    registry.register(procedureAt(["a", "b.c"], () => "a b.c"));
    expect(registry.get(["a", "b", "c"])?.path).toEqual(["a", "b", "c"]);
    expect(registry.get(["a.b", "c"])?.path).toEqual(["a.b", "c"]);
    expect(registry.get(["a", "b.c"])?.path).toEqual(["a", "b.c"]);
    // A second registration of one path still needs override
    expect(() => registry.register(procedureAt(["a.b", "c"]))).toThrow(/already registered/);
  });

  it("allows a dot in a segment, and its key encodes the dot (CLI-75)", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureAt(["fs", "read.json"]));
    expect(registry.get(["fs", "read.json"])?.path).toEqual(["fs", "read.json"]);
    expect(registry.get(["fs", "read", "json"])).toBeUndefined();
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

  it.each([
    ["the shorter path first", [["a"], ["a", "handler"], ["a", "b", "c"]]],
    ["the longer path first", [["a", "b", "c"], ["a", "handler"], ["a"]]],
  ])("getTree does not write into a stored procedure, with %s (audit O56 #10)", (_order, paths) => {
    const registry = new ProcedureRegistry();
    for (const path of paths) registry.register(procedureAt(path as ProcedurePath, () => (path as string[]).join(".")));
    const stored = registry.get(["a"])!;
    const handler = stored.handler;
    const keys = Object.keys(stored).sort();

    const tree = registry.getTree() as Record<string, Record<string, unknown>>;

    // The stored procedure keeps its fields: the segment "handler" did not replace its handler
    expect(registry.get(["a"])).toBe(stored);
    expect(Object.keys(stored).sort()).toEqual(keys);
    expect(stored.handler).toBe(handler);
    expect(stored.handler?.({}, {} as never)).toBe("a");
    // A node that is a procedure and a namespace keeps the procedure at the key "" (a segment is never empty)
    const a = tree["a"]!;
    expect(a[""]).toBe(stored);
    expect(a["handler"]).toBe(registry.get(["a", "handler"]));
    expect((a["b"] as Record<string, unknown>)["c"]).toBe(registry.get(["a", "b", "c"]));
    expect(Object.keys(a).sort()).toEqual(["", "b", "handler"]);
  });

  it("getTree keeps a procedure as a leaf when no longer path is under it", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureAt(["x", "y"]));
    const tree = registry.getTree() as Record<string, Record<string, unknown>>;
    expect(tree["x"]!["y"]).toBe(registry.get(["x", "y"]));
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
