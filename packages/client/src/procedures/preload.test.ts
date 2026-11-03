/**
 * `preloadRefPaths()` (roadmap O93): which `$proc` paths of a value it loads into a lazy registry,
 * in which order, and when it gives no promise. Each test examines one branch of the walk over the
 * value, so the mutation tests of the nightly run find a change of each branch.
 */

import { describe, expect, it } from "vitest";
import { preloadRefPaths } from "./ref.js";
import type { ResolvingRegistry } from "./registry.js";
import type { AnyProcedure, ProcedurePath } from "./types.js";

interface FakeRegistry {
  registry: ResolvingRegistry;
  /** The paths that `resolve()` got, joined with a dot, in order. */
  resolved: string[];
}

/** This function makes a lazy registry that has the paths of `has`, and records each `resolve()`. */
function lazyRegistry(has: readonly string[] = [], fails: readonly string[] = []): FakeRegistry {
  const resolved: string[] = [];
  const registry: ResolvingRegistry = {
    lazy: true,
    get: (path: ProcedurePath) => (has.includes(path.join(".")) ? ({} as AnyProcedure) : undefined),
    resolve: async (path: ProcedurePath) => {
      resolved.push(path.join("."));
      if (fails.includes(path.join("."))) throw new Error(`the package of ${path.join(".")} does not load`);
      return undefined;
    },
  };
  return { registry, resolved };
}

/** This function gives the paths that `preloadRefPaths()` loads for a value, in order. */
async function loadedFor(value: unknown, has: readonly string[] = []): Promise<string[]> {
  const { registry, resolved } = lazyRegistry(has);
  await preloadRefPaths(registry, value);
  return resolved;
}

describe("preloadRefPaths", () => {
  it("gives no promise and loads nothing without a lazy registry with a resolver", () => {
    const value = { $proc: ["a", "x"] };
    expect(preloadRefPaths(undefined, value)).toBeUndefined();

    const calls: string[] = [];
    const eager: ResolvingRegistry = {
      lazy: false,
      get: () => undefined,
      resolve: async (path) => {
        calls.push(path.join("."));
        return undefined;
      },
    };
    expect(preloadRefPaths(eager, value)).toBeUndefined();
    expect(preloadRefPaths({ get: () => undefined, resolve: eager.resolve! }, value)).toBeUndefined();
    expect(calls).toEqual([]);

    expect(preloadRefPaths({ lazy: true, get: () => undefined }, value)).toBeUndefined();
  });

  it("gives no promise when the registry has each path of the value", () => {
    const { registry, resolved } = lazyRegistry(["a.x", "b.y"]);
    expect(preloadRefPaths(registry, [{ $proc: ["a", "x"] }, { $proc: ["b", "y"], input: { n: 1 } }])).toBeUndefined();
    expect(preloadRefPaths(registry, { plain: 1, list: [2, "three"] })).toBeUndefined();
    expect(resolved).toEqual([]);
  });

  it("loads only the paths that the registry does not have", async () => {
    expect(await loadedFor([{ $proc: ["a", "x"] }, { $proc: ["b", "y"] }], ["a.x"])).toEqual(["b.y"]);
  });

  it("finds the refs in lists, in the fields of plain objects and in the inputs of refs, once each, in order", async () => {
    const value = {
      steps: [
        { $proc: ["a", "x"], input: { inner: { $proc: ["b", "y"] } } },
        { $proc: ["a", "x"] },
      ],
      other: { deep: [[{ $proc: ["c", "z"] }]] },
      last: Object.assign(Object.create(null) as object, { ref: { $proc: ["d", "w"] } }),
    };
    expect(await loadedFor(value)).toEqual(["a.x", "b.y", "c.z", "d.w"]);
  });

  it("does not look in literals or in objects that are not plain", async () => {
    class Box {
      readonly ref = { $proc: ["k", "x"] };
    }
    const value = {
      literal: { $literal: { $proc: ["l", "x"] } },
      box: new Box(),
      map: new Map([["ref", { $proc: ["m", "x"] }]]),
      date: new Date(0),
      ref: { $proc: ["a", "x"] },
    };
    expect(await loadedFor(value)).toEqual(["a.x"]);
  });

  it("loads no path that is empty or that has a segment that is not a string", async () => {
    const value = [{ $proc: [] }, { $proc: ["a", 1] }, { $proc: [1, 2] }, { $proc: ["b", "y"] }];
    expect(await loadedFor(value)).toEqual(["b.y"]);
  });

  it("stops at a value that contains itself", async () => {
    const ref: Record<string, unknown> = { $proc: ["a", "x"] };
    ref["input"] = { back: ref };
    const list: unknown[] = [{ $proc: ["b", "y"] }];
    list.push(list);
    expect(await loadedFor({ ref, list })).toEqual(["a.x", "b.y"]);
  });

  it("goes past null and the primitive values", async () => {
    const value = { a: null, b: "text", c: 1, d: [null, true, undefined], e: { $proc: ["a", "x"], input: null } };
    expect(await loadedFor(value)).toEqual(["a.x"]);
  });

  it("loads each path after a path whose package does not load", async () => {
    const { registry, resolved } = lazyRegistry([], ["a.x"]);
    await expect(preloadRefPaths(registry, [{ $proc: ["a", "x"] }, { $proc: ["b", "y"] }])).resolves.toBeUndefined();
    expect(resolved).toEqual(["a.x", "b.y"]);
  });
});
