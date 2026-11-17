import * as home from "@mark1russell7/predicates";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { predicatesManifest, predicatesModule } from "./module.js";

const registry = createRegistry(predicatesModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["predicates", name], input, { registry }), ["predicates", name])) as T;

describe("@procedures/predicates", () => {
  it("gives the same value as the function of the home", async () => {
    expect(await call("orient2dSign", { ax: 0, ay: 0, bx: 10, by: 10, cx: 3, cy: 6 })).toBe(home.orient2dSign(0, 0, 10, 10, 3, 6));
    expect(await call("orient2d", { ax: 0, ay: 0, bx: 10, by: 10, cx: 3, cy: 6 })).toEqual(home.orient2d(0, 0, 10, 10, 3, 6));
    expect(await call("incircleSign", { ax: 0, ay: 0, bx: 1, by: 0, cx: 0, cy: 1, dx: 0.5, dy: 0.5 })).toBe(home.incircleSign(0, 0, 1, 0, 0, 1, 0.5, 0.5));
    expect(await call("classifySegments", { ax: 0, ay: 0, bx: 2, by: 2, cx: 0, cy: 2, dx: 2, dy: 0 })).toEqual(home.classifySegments(0, 0, 2, 2, 0, 2, 2, 0));
  });

  it("gives an exact sign where the floating-point determinant is wrong", async () => {
    // The point a is 41 and 48 steps of 2^-53 from (0.5, 0.5). The naive determinant gives -1, and the exact sign is 1
    const step = 2 ** -53;
    const [ax, ay, bx, by, cx, cy] = [0.5 + 41 * step, 0.5 + 48 * step, 12, 12, 24, 24];
    expect(Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))).toBe(-1);
    expect(await call("orient2dSign", { ax, ay, bx, by, cx, cy })).toBe(1);
    expect(await call("orient2dSign", { ax: 0.5, ay: 0.5, bx: 12, by: 12, cx: 24, cy: 24 })).toBe(0);
  });

  it("refuses an input that is not in the schema", async () => {
    await expect(call("orient2dSign", { ax: 0, ay: 0, bx: 1, by: 1, cx: "2" })).rejects.toThrow();
  });

  it("has a procedure with no effect for each function of the home", () => {
    expect(predicatesManifest.procedures).toHaveLength(13);
    for (const procedure of predicatesManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });
});
