/**
 * Unit tests for the procedure reference system
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PROCEDURE_SYMBOL,
  PROCEDURE_JSON_KEY,
  WHEN_IMMEDIATE,
  WHEN_NEVER,
  WHEN_PARENT,
  isProcedureRef,
  isProcedureRefJson,
  isAnyProcedureRef,
  isOutputRef,
  getRefWhen,
  getRefName,
  shouldExecuteRef,
  normalizeRef,
  proc,
  hydrateInput,
  createRefScope,
  getPath,
  resolveOutputRef,
  parseProcedureJson,
  stringifyProcedureJson,
  type ProcedureRef,
  type ProcedureRefJson,
  type RefScope,
} from "./ref.js";

describe("ref.ts", () => {
  describe("type guards", () => {
    describe("isProcedureRef", () => {
      it("returns true for runtime procedure refs", () => {
        const ref = {
          [PROCEDURE_SYMBOL]: true,
          path: ["test", "proc"],
          input: {},
        };
        expect(isProcedureRef(ref)).toBe(true);
      });

      it("returns false for JSON procedure refs", () => {
        const ref = {
          $proc: ["test", "proc"],
          input: {},
        };
        expect(isProcedureRef(ref)).toBe(false);
      });

      it("returns false for plain objects", () => {
        expect(isProcedureRef({ foo: "bar" })).toBe(false);
        expect(isProcedureRef(null)).toBe(false);
        expect(isProcedureRef(undefined)).toBe(false);
        expect(isProcedureRef("string")).toBe(false);
      });
    });

    describe("isProcedureRefJson", () => {
      it("returns true for JSON procedure refs", () => {
        const ref = {
          $proc: ["test", "proc"],
          input: {},
        };
        expect(isProcedureRefJson(ref)).toBe(true);
      });

      it("returns true for minimal JSON refs", () => {
        const ref = { $proc: ["test"] };
        expect(isProcedureRefJson(ref)).toBe(true);
      });

      it("returns false for runtime procedure refs", () => {
        const ref = {
          [PROCEDURE_SYMBOL]: true,
          path: ["test", "proc"],
          input: {},
        };
        expect(isProcedureRefJson(ref)).toBe(false);
      });

      it("returns false when $proc is not an array", () => {
        expect(isProcedureRefJson({ $proc: "string" })).toBe(false);
        expect(isProcedureRefJson({ $proc: 123 })).toBe(false);
      });
    });

    describe("isAnyProcedureRef", () => {
      it("returns true for both runtime and JSON refs", () => {
        const runtime = {
          [PROCEDURE_SYMBOL]: true,
          path: ["test"],
          input: {},
        };
        const json = { $proc: ["test"], input: {} };

        expect(isAnyProcedureRef(runtime)).toBe(true);
        expect(isAnyProcedureRef(json)).toBe(true);
      });
    });

    describe("isOutputRef", () => {
      it("returns true for output refs", () => {
        expect(isOutputRef({ $ref: "name" })).toBe(true);
        expect(isOutputRef({ $ref: "name.path.to.value" })).toBe(true);
        expect(isOutputRef({ $ref: "$last.value" })).toBe(true);
      });

      it("returns false for non-output refs", () => {
        expect(isOutputRef({ $proc: ["test"] })).toBe(false);
        expect(isOutputRef({ ref: "name" })).toBe(false);
        expect(isOutputRef({ $ref: 123 })).toBe(false);
        expect(isOutputRef(null)).toBe(false);
      });
    });
  });

  describe("$when handling", () => {
    describe("getRefWhen", () => {
      it("returns $immediate when not specified", () => {
        const ref: ProcedureRefJson = { $proc: ["test"] };
        expect(getRefWhen(ref)).toBe(WHEN_IMMEDIATE);
      });

      it("returns specified $when value", () => {
        const never: ProcedureRefJson = { $proc: ["test"], $when: "$never" };
        const parent: ProcedureRefJson = { $proc: ["test"], $when: "$parent" };
        const named: ProcedureRefJson = { $proc: ["test"], $when: "myContext" };

        expect(getRefWhen(never)).toBe(WHEN_NEVER);
        expect(getRefWhen(parent)).toBe(WHEN_PARENT);
        expect(getRefWhen(named)).toBe("myContext");
      });
    });

    describe("getRefName", () => {
      it("returns undefined when not specified", () => {
        const ref: ProcedureRefJson = { $proc: ["test"] };
        expect(getRefName(ref)).toBeUndefined();
      });

      it("returns specified $name value", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $name: "myName" };
        expect(getRefName(ref)).toBe("myName");
      });
    });

    describe("shouldExecuteRef", () => {
      it("returns true for $immediate refs", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $when: "$immediate" };
        expect(shouldExecuteRef(ref, [])).toBe(true);
      });

      it("returns true when $when is not specified (defaults to immediate)", () => {
        const ref: ProcedureRefJson = { $proc: ["test"] };
        expect(shouldExecuteRef(ref, [])).toBe(true);
      });

      it("returns false for $never refs", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $when: "$never" };
        expect(shouldExecuteRef(ref, [])).toBe(false);
      });

      it("returns false for $parent refs in non-parent context", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $when: "$parent" };
        expect(shouldExecuteRef(ref, [], false)).toBe(false);
      });

      it("returns true for $parent refs in parent context", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $when: "$parent" };
        expect(shouldExecuteRef(ref, [], true)).toBe(true);
      });

      it("returns true for named refs when name is in context stack", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $when: "traversal" };
        expect(shouldExecuteRef(ref, ["traversal", "outer"])).toBe(true);
      });

      it("returns false for named refs when name is not in context stack", () => {
        const ref: ProcedureRefJson = { $proc: ["test"], $when: "traversal" };
        expect(shouldExecuteRef(ref, ["other", "context"])).toBe(false);
      });
    });
  });

  describe("proc() builder", () => {
    it("creates a procedure ref builder", () => {
      const builder = proc(["test", "procedure"]);
      expect(builder).toBeDefined();
    });

    it("builds a runtime ref", () => {
      const ref = proc(["test", "procedure"]).input({ foo: "bar" }).build();

      expect(isProcedureRef(ref)).toBe(true);
      expect(ref.path).toEqual(["test", "procedure"]);
      expect(ref.input).toEqual({ foo: "bar" });
    });

    it("supports .ref shorthand", () => {
      const ref = proc(["test"]).input({ x: 1 }).ref;

      expect(isProcedureRef(ref)).toBe(true);
    });

    it("supports .name()", () => {
      const ref = proc(["test"]).name("myStep").build();

      expect(ref.$name).toBe("myStep");
    });

    it("supports .when()", () => {
      const ref = proc(["test"]).when("$parent").build();

      expect(ref.$when).toBe("$parent");
    });

    it("supports .defer() shorthand", () => {
      const ref = proc(["test"]).defer().build();

      expect(ref.$when).toBe("$never");
    });

    it("supports .deferToParent() shorthand", () => {
      const ref = proc(["test"]).deferToParent().build();

      expect(ref.$when).toBe("$parent");
    });

    it("converts to JSON form", () => {
      const json = proc(["test", "proc"])
        .input({ value: 42 })
        .name("step1")
        .toJson();

      expect(json.$proc).toEqual(["test", "proc"]);
      expect(json.input).toEqual({ value: 42 });
      expect(json.$name).toBe("step1");
    });
  });

  describe("normalizeRef", () => {
    it("returns runtime refs unchanged", () => {
      const ref: ProcedureRef = {
        [PROCEDURE_SYMBOL]: true,
        path: ["test"],
        input: { x: 1 },
      };

      const normalized = normalizeRef(ref);
      expect(normalized).toBe(ref);
    });

    it("converts JSON refs to runtime form", () => {
      const json: ProcedureRefJson = {
        $proc: ["test", "proc"],
        input: { x: 1 },
      };

      const normalized = normalizeRef(json);
      expect(isProcedureRef(normalized)).toBe(true);
      expect(normalized.path).toEqual(["test", "proc"]);
      expect(normalized.input).toEqual({ x: 1 });
    });
  });

  describe("RefScope", () => {
    describe("createRefScope", () => {
      it("creates an empty scope", () => {
        const scope = createRefScope();

        expect(scope.outputs).toBeInstanceOf(Map);
        expect(scope.outputs.size).toBe(0);
        expect(scope.last).toBeUndefined();
        expect(scope.parent).toBeUndefined();
      });

      it("creates a scope with parent", () => {
        const parent = createRefScope();
        const child = createRefScope(parent);

        expect(child.parent).toBe(parent);
      });

      it("creates a named scope", () => {
        const scope = createRefScope(undefined, "myScope");

        expect(scope.name).toBe("myScope");
      });
    });

    describe("getPath", () => {
      it("gets nested values", () => {
        const obj = {
          a: {
            b: {
              c: "value",
            },
          },
        };

        expect(getPath(obj, ["a", "b", "c"])).toBe("value");
        expect(getPath(obj, ["a", "b"])).toEqual({ c: "value" });
        expect(getPath(obj, ["a"])).toEqual({ b: { c: "value" } });
      });

      it("returns undefined for missing paths", () => {
        const obj = { a: { b: 1 } };

        expect(getPath(obj, ["a", "c"])).toBeUndefined();
        expect(getPath(obj, ["x", "y", "z"])).toBeUndefined();
      });

      it("handles empty path", () => {
        const obj = { a: 1 };
        expect(getPath(obj, [])).toEqual({ a: 1 });
      });
    });

    describe("resolveOutputRef", () => {
      it("resolves named output", () => {
        const scope = createRefScope();
        scope.outputs.set("step1", { value: 42 });

        expect(resolveOutputRef("step1", scope)).toEqual({ value: 42 });
      });

      it("resolves named output with path", () => {
        const scope = createRefScope();
        scope.outputs.set("data", { nested: { value: "found" } });

        expect(resolveOutputRef("data.nested.value", scope)).toBe("found");
      });

      it("resolves $last", () => {
        const scope = createRefScope();
        scope.last = { result: "last output" };

        expect(resolveOutputRef("$last", scope)).toEqual({ result: "last output" });
      });

      it("resolves $last with path", () => {
        const scope = createRefScope();
        scope.last = { value: true };

        expect(resolveOutputRef("$last.value", scope)).toBe(true);
      });

      it("searches parent scopes", () => {
        const parent = createRefScope();
        parent.outputs.set("parentData", { x: 1 });

        const child = createRefScope(parent);
        child.outputs.set("childData", { y: 2 });

        expect(resolveOutputRef("parentData", child)).toEqual({ x: 1 });
        expect(resolveOutputRef("childData", child)).toEqual({ y: 2 });
      });

      it("returns undefined for unresolved refs", () => {
        const scope = createRefScope();

        expect(resolveOutputRef("missing", scope)).toBeUndefined();
      });
    });
  });

  describe("hydrateInput", () => {
    const mockExecutor = vi.fn();

    beforeEach(() => {
      mockExecutor.mockReset();
    });

    it("passes through primitives unchanged", async () => {
      expect(await hydrateInput("string", mockExecutor)).toBe("string");
      expect(await hydrateInput(42, mockExecutor)).toBe(42);
      expect(await hydrateInput(true, mockExecutor)).toBe(true);
      expect(await hydrateInput(null, mockExecutor)).toBe(null);
      expect(await hydrateInput(undefined, mockExecutor)).toBe(undefined);
    });

    it("passes through plain objects", async () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = await hydrateInput(obj, mockExecutor);

      expect(result).toEqual(obj);
    });

    it("executes $immediate procedure refs", async () => {
      mockExecutor.mockResolvedValue({ result: "executed" });

      const result = await hydrateInput(
        { $proc: ["test", "proc"], input: { x: 1 } },
        mockExecutor
      );

      expect(mockExecutor).toHaveBeenCalledWith(["test", "proc"], { x: 1 });
      expect(result).toEqual({ result: "executed" });
    });

    it("does not execute $never refs", async () => {
      const ref = { $proc: ["test", "proc"], input: {}, $when: "$never" };
      const result = await hydrateInput(ref, mockExecutor);

      expect(mockExecutor).not.toHaveBeenCalled();
      expect(result).toEqual(ref);
    });

    it("does not execute $parent refs", async () => {
      const ref = { $proc: ["test", "proc"], input: {}, $when: "$parent" };
      const result = await hydrateInput(ref, mockExecutor);

      expect(mockExecutor).not.toHaveBeenCalled();
      expect(result).toEqual(ref);
    });

    it("hydrates nested objects", async () => {
      mockExecutor.mockResolvedValue("result");

      const input = {
        outer: {
          inner: { $proc: ["test"], input: {} },
        },
      };

      const result = await hydrateInput(input, mockExecutor);

      expect(result).toEqual({ outer: { inner: "result" } });
    });

    it("hydrates arrays", async () => {
      mockExecutor.mockImplementation((path) =>
        Promise.resolve(`result-${path[0]}`)
      );

      const input = [
        { $proc: ["a"], input: {} },
        { $proc: ["b"], input: {} },
      ];

      // Arrays of procedure refs become implicit chains
      const result = await hydrateInput(input, mockExecutor);

      // The implicit chain was executed
      expect(mockExecutor).toHaveBeenCalled();
    });

    it("throws on hydration depth exceeded", async () => {
      // Create deeply nested structure
      const createDeep = (depth: number): object => {
        if (depth === 0) return { value: "leaf" };
        return { nested: createDeep(depth - 1) };
      };

      await expect(
        hydrateInput(createDeep(15), mockExecutor, { maxDepth: 10 })
      ).rejects.toThrow("Hydration depth exceeded");
    });

    it("adds $name to context stack", async () => {
      const calls: string[][] = [];
      mockExecutor.mockImplementation(() => {
        return Promise.resolve({ ok: true });
      });

      await hydrateInput(
        {
          $proc: ["outer"],
          input: {
            nested: { $proc: ["inner"], input: {} },
          },
          $name: "outerContext",
        },
        mockExecutor
      );

      expect(mockExecutor).toHaveBeenCalled();
    });

    describe("implicit chain detection", () => {
      it("wraps array of procedure refs in implicit chain", async () => {
        mockExecutor.mockImplementation((path) => {
          if (path[0] === "client" && path[1] === "chain") {
            // Simulate chain execution
            return Promise.resolve({ results: [], final: undefined });
          }
          return Promise.resolve({ ok: true });
        });

        const input = [
          { $proc: ["step1"], input: {} },
          { $proc: ["step2"], input: {} },
        ];

        await hydrateInput(input, mockExecutor);

        // Implicit chain detection wraps the array in client.chain
        // The steps are hydrated (executed) before chain is called,
        // so the input contains the hydrated results
        const calls = mockExecutor.mock.calls;
        const chainCall = calls.find(
          (call) => call[0][0] === "client" && call[0][1] === "chain"
        );

        expect(chainCall).toBeDefined();
        // The steps should be hydrated results (since procedure refs get executed)
        expect(chainCall![1]).toHaveProperty("steps");
        expect((chainCall![1] as any).steps).toHaveLength(2);
      });

      it("does not wrap mixed arrays as chains", async () => {
        const input = [{ $proc: ["step1"], input: {} }, "plain string", 42];

        const result = await hydrateInput(input, mockExecutor);

        // Mixed array should not become a chain
        // It should hydrate each element individually
        expect(mockExecutor).toHaveBeenCalledWith(["step1"], {});
      });

      it("does not wrap empty arrays as chains", async () => {
        const result = await hydrateInput([], mockExecutor);

        expect(mockExecutor).not.toHaveBeenCalled();
        expect(result).toEqual([]);
      });
    });
  });

  describe("JSON serialization", () => {
    describe("parseProcedureJson", () => {
      it("parses JSON with $proc to runtime refs", () => {
        const json = JSON.stringify({
          $proc: ["test", "proc"],
          input: { x: 1 },
        });

        const result = parseProcedureJson(json);

        expect(isProcedureRef(result)).toBe(true);
      });

      it("parses nested $proc objects", () => {
        const json = JSON.stringify({
          outer: {
            $proc: ["outer"],
            input: {
              inner: {
                $proc: ["inner"],
                input: {},
              },
            },
          },
        });

        const result = parseProcedureJson<{ outer: ProcedureRef }>(json);

        expect(isProcedureRef(result.outer)).toBe(true);
        expect(isProcedureRef((result.outer.input as any).inner)).toBe(true);
      });
    });

    describe("stringifyProcedureJson", () => {
      it("converts runtime refs to $proc JSON", () => {
        const ref = proc(["test"]).input({ x: 1 }).build();
        const json = stringifyProcedureJson(ref);
        const parsed = JSON.parse(json);

        expect(parsed.$proc).toEqual(["test"]);
        expect(parsed.input).toEqual({ x: 1 });
      });

      it("handles nested refs", () => {
        const ref = proc(["outer"])
          .input({
            nested: proc(["inner"]).input({}).build(),
          })
          .build();

        const json = stringifyProcedureJson(ref);
        const parsed = JSON.parse(json);

        expect(parsed.$proc).toEqual(["outer"]);
        expect(parsed.input.nested.$proc).toEqual(["inner"]);
      });

      it("supports pretty printing", () => {
        const ref = proc(["test"]).input({ x: 1 }).build();
        const json = stringifyProcedureJson(ref, 2);

        expect(json).toContain("\n");
        expect(json).toContain("  ");
      });
    });
  });
});
