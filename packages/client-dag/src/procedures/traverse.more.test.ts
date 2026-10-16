/**
 * dag.traverse through a registry: the filters, the dry run, a deferred visit with nested calls,
 * the failures, and the entries of the package.
 *
 * The registry has the dag module and a `lib.scan` of the test: the real one is in
 * `@procedures/lib`, which depends on this package.
 */

import { describe, expect, it } from "vitest";
import {
  PROCEDURE_REGISTRY,
  createProcedure,
  createRegistry,
  defineModule,
  invokePath,
  outputSchema,
  outputValue,
  type ProcedureRegistry,
} from "@procedures/client";
import { dagModule } from "../module.js";
import { dagTraverse } from "./traverse.js";
import type { DagTraverseOutput, ScanOutput } from "./types.js";

/** Three packages: c depends on b, and b depends on a. d depends on nothing. */
const PACKAGES: ScanOutput["packages"] = {
  a: { name: "a", repoPath: "/w/packages/a", mark1russell7Deps: [] },
  b: { name: "b", repoPath: "/w/packages/b", mark1russell7Deps: ["a"] },
  c: { name: "c", repoPath: "/w/packages/c", mark1russell7Deps: ["b"] },
  d: { name: "d", repoPath: "/w/packages/d", mark1russell7Deps: [] },
};

interface Call {
  path: string;
  input: Record<string, unknown>;
}

/** A registry with the dag module, a lib.scan of PACKAGES and the visit procedures of the test. */
function registry(fail: readonly string[] = []): { registry: ProcedureRegistry; calls: Call[] } {
  const calls: Call[] = [];
  const procedure = (path: string[], handler: (input: Record<string, unknown>) => unknown) =>
    createProcedure()
      .path(path)
      .input(outputSchema<Record<string, unknown>>())
      .output(outputSchema<unknown>())
      .meta({ effects: { reads: [], writes: [] } })
      .handler(async (input: Record<string, unknown>) => {
        calls.push({ path: path.join("."), input });
        return handler(input);
      })
      .build();
  const testModule = defineModule("test", [
    procedure(["lib", "scan"], () => ({ packages: PACKAGES, warnings: [] })),
    procedure(["test", "visit"], (input) => {
      const name = (input["node"] as { name: string }).name;
      if (fail.includes(name)) throw new Error(`visit of ${name} failed`);
      return { visited: name, value: input["value"] };
    }),
    procedure(["test", "value"], (input) => `value in ${String(input["cwd"])}`),
  ]);
  return { registry: createRegistry(dagModule, testModule), calls };
}

async function traverse(target: ProcedureRegistry, input: Record<string, unknown>): Promise<DagTraverseOutput> {
  return outputValue(await invokePath<DagTraverseOutput>(["dag", "traverse"], input, { registry: target }));
}

const names = (result: DagTraverseOutput) => result.results.map((entry) => entry.name);

describe("dag.traverse in a registry", () => {
  it("visits each package after its dependencies, with cwd set to its folder", async () => {
    const { registry: target, calls } = registry();
    const result = await traverse(target, { visit: ["test", "visit"], concurrency: 1 });
    expect(result).toMatchObject({ success: true, visited: 4, failed: 0 });
    const order = names(result);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
    const visitOfC = calls.find((call) => call.path === "test.visit" && (call.input["node"] as { name: string }).name === "c");
    expect(visitOfC?.input).toMatchObject({ cwd: "/w/packages/c", node: { name: "c", path: "/w/packages/c", dependencies: ["b"] } });
  });

  it("visits only the packages of filter", async () => {
    const { registry: target } = registry();
    const result = await traverse(target, { visit: ["test", "visit"], filter: ["a", "d", "missing"] });
    expect(names(result).sort()).toEqual(["a", "d"]);
  });

  it("visits root and the packages that it depends on", async () => {
    const { registry: target } = registry();
    const result = await traverse(target, { visit: ["test", "visit"], root: "b" });
    expect(names(result)).toEqual(["a", "b"]);
  });

  it("visits nothing for a root that the scan did not find", async () => {
    const { registry: target, calls } = registry();
    const result = await traverse(target, { visit: ["test", "visit"], root: "missing" });
    expect(result).toMatchObject({ success: false, results: [], visited: 0, failed: 0 });
    expect(calls.map((call) => call.path)).toEqual(["lib.scan"]);
  });

  it("gives the plan and starts no visit with dryRun", async () => {
    const { registry: target, calls } = registry();
    const result = await traverse(target, { visit: ["test", "visit"], dryRun: true, serialize: "repository" });
    expect(result.visited).toBe(4);
    expect(result.results[0]?.output).toEqual({ dryRun: true, wouldExecute: ["test", "visit"] });
    expect(calls.map((call) => call.path)).toEqual(["lib.scan"]);
  });

  it("starts the nested calls of a deferred visit for each package, with its cwd", async () => {
    const { registry: target } = registry();
    const result = await traverse(target, {
      visit: { $proc: ["test", "visit"], input: { value: { $proc: ["test", "value"], input: {} } }, $when: "$parent" },
      filter: ["a"],
    });
    expect(result.results[0]?.output).toEqual({ visited: "a", value: "value in /w/packages/a" });
  });

  it("stops after the level of a failed visit, and gives its error", async () => {
    const { registry: target } = registry(["a"]);
    const result = await traverse(target, { visit: ["test", "visit"] });
    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.results.find((entry) => entry.name === "a")).toMatchObject({ success: false, error: "visit of a failed" });
    expect(names(result)).not.toContain("b");
  });

  it("continues after a failed visit with continueOnError", async () => {
    const { registry: target } = registry(["a"]);
    const result = await traverse(target, { visit: ["test", "visit"], continueOnError: true });
    expect(result).toMatchObject({ success: false, visited: 3, failed: 1 });
  });

  it("refuses a visit that is neither a path nor a procedure reference", async () => {
    const ctx = { client: { call: async () => ({ packages: PACKAGES }) } } as never;
    await expect(dagTraverse({ visit: { input: {} } } as never, ctx)).rejects.toThrow(/visit must be a procedure path/);
  });

  it("takes the defaults of an input without the schema, and a visit reference without input", async () => {
    const calls: string[] = [];
    const ctx = {
      client: {
        call: async (path: string[], input: unknown) => {
          calls.push(path.join("."));
          if (path.join(".") === "lib.scan") return { packages: { a: PACKAGES["a"] } };
          if (path.join(".") === "test.fail") throw "a plain string";
          return input;
        },
      },
    } as never;
    const ok = await dagTraverse({ visit: { $proc: ["test", "echo"], $when: "$parent" } } as never, ctx);
    expect(ok.results[0]?.output).toMatchObject({ cwd: "/w/packages/a" });
    const failed = await dagTraverse({ visit: ["test", "fail"] } as never, ctx);
    expect(failed.results[0]).toMatchObject({ success: false, error: "a plain string" });
  });

  it("gives a nested call that has no object input its input unchanged", async () => {
    const seen: unknown[] = [];
    const ctx = {
      client: {
        call: async (path: string[], input: unknown) => {
          if (path.join(".") === "lib.scan") return { packages: { a: PACKAGES["a"] } };
          seen.push(input);
          return "nested";
        },
      },
    } as never;
    await dagTraverse(
      { visit: { $proc: ["test", "visit"], input: { value: { $proc: ["test", "value"], input: 5 } }, $when: "$parent" } } as never,
      ctx,
    );
    expect(seen).toContain(5);
  });
});

describe("the entries of @procedures/dag", () => {
  it("registers nothing from the root, and dag.traverse from the register entry", async () => {
    const root = await import("../index.js");
    expect(root.dagModule).toBe(dagModule);
    expect(typeof root.buildLeveledDAG).toBe("function");
    expect(PROCEDURE_REGISTRY.has(["dag", "traverse"])).toBe(false);
    await import("../register.js");
    expect(PROCEDURE_REGISTRY.get(["dag", "traverse"])?.handler).toBeDefined();
  });
});
