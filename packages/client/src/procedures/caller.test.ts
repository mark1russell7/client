/**
 * `callerOf`: one call for a registry of some modules, `invokePath` and `outputValue`. The
 * registry is made at the first call, and the global registry does not change.
 */

import { describe, it, expect } from "vitest";
import { callerOf } from "./caller.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { PROCEDURE_REGISTRY } from "./registry.js";
import { defineModule } from "./module.js";
import { InvocationError } from "./invoke.js";
import type { AnyProcedure } from "./types.js";

let built = 0;
const proc = (path: string[], handler: (input: never) => unknown): AnyProcedure =>
  defineProcedure({ path, input: outputSchema<unknown>(), output: outputSchema<unknown>(), handler: handler as never }) as AnyProcedure;

const mathModule = defineModule("caller-test-math", [
  proc(["math", "double"], (input: { n: number }) => {
    built++;
    return input.n * 2;
  }),
  proc(["math", "count"], async function* (input: { to: number }) {
    for (let i = 1; i <= input.to; i++) yield i;
  }),
]);

describe("callerOf", () => {
  it("runs a procedure of the module and gives its value", async () => {
    const math = callerOf(mathModule);
    await expect(math<number>(["math", "double"], { n: 21 })).resolves.toBe(42);
  });

  it("gives the last item of a stream, and NO_OUTPUT for an empty stream", async () => {
    const math = callerOf(mathModule);
    await expect(math<number>(["math", "count"], { to: 3 })).resolves.toBe(3);
    const empty = math(["math", "count"], { to: 0 });
    await expect(empty).rejects.toBeInstanceOf(InvocationError);
    await expect(empty).rejects.toMatchObject({ code: "NO_OUTPUT" });
  });

  it("makes its registry at the first use, once, and leaves the global registry alone", async () => {
    const before = built;
    const math = callerOf(mathModule);
    expect(built).toBe(before);
    const registry = math.registry;
    expect(math.registry).toBe(registry);
    expect(registry.has(["math", "double"])).toBe(true);
    // The client module comes with each registry, as createRegistry() gives it
    expect(registry.has(["client", "identity"])).toBe(true);
    expect(PROCEDURE_REGISTRY.has(["math", "double"])).toBe(false);
  });

  it("refuses a path that its modules do not have with NOT_FOUND", async () => {
    const math = callerOf(mathModule);
    await expect(math(["math", "missing"], {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("passes the options of a call, for example a signal that already aborted", async () => {
    const math = callerOf(mathModule);
    const controller = new AbortController();
    controller.abort();
    await expect(math(["math", "double"], { n: 1 }, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
  });
});
