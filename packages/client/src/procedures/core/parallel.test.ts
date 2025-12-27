/**
 * Unit tests for the parallel procedure
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { parallelProcedure } from "./index.js";
import type { ProcedureContext } from "../types.js";

/**
 * Simple inline mock client for tests
 */
function createTestMockClient() {
  const calls: Array<{ path: string[]; input: unknown }> = [];
  const responses = new Map<string, { output?: unknown; error?: Error }>();
  const implementations = new Map<string, (input: unknown) => unknown>();

  const pathToKey = (path: readonly string[]): string => path.join(".");

  const call = vi.fn(async (path: readonly string[], input: unknown) => {
    calls.push({ path: [...path], input });
    const key = pathToKey(path);
    const impl = implementations.get(key);
    if (impl) return impl(input);
    const response = responses.get(key);
    if (response?.error) throw response.error;
    return response?.output;
  });

  return {
    call,
    getCalls: () => [...calls],
    getCallsFor: (path: readonly string[]) =>
      calls.filter((c) => pathToKey(c.path) === pathToKey(path)),
    mockResponse: <T>(path: readonly string[], response: { output?: T; error?: Error }) => {
      responses.set(pathToKey(path), response);
    },
    mockImplementation: <TInput, TOutput>(
      path: readonly string[],
      impl: (input: TInput) => TOutput | Promise<TOutput>
    ) => {
      implementations.set(pathToKey(path), impl as (input: unknown) => unknown);
    },
    reset: () => {
      calls.length = 0;
      responses.clear();
      implementations.clear();
      call.mockClear();
    },
  };
}

describe("parallel procedure", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["test", "parallel"],
    };
  });

  describe("basic execution", () => {
    it("returns tasks array as results", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [
            { value: 1 },
            { value: 2 },
            { value: 3 },
          ],
        },
        ctx
      );

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ value: 1 });
      expect(result.results[1]).toEqual({ value: 2 });
      expect(result.results[2]).toEqual({ value: 3 });
    });

    it("returns empty results for empty tasks array", async () => {
      const result = await parallelProcedure.handler({ tasks: [] }, ctx);

      expect(result.results).toHaveLength(0);
      expect(result.allSucceeded).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("handles single task", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [{ single: "value" }],
        },
        ctx
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({ single: "value" });
      expect(result.allSucceeded).toBe(true);
    });

    it("preserves task order in results", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: ["first", "second", "third", "fourth", "fifth"],
        },
        ctx
      );

      expect(result.results).toEqual(["first", "second", "third", "fourth", "fifth"]);
    });
  });

  describe("result structure", () => {
    it("returns allSucceeded as true for successful tasks", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [1, 2, 3],
        },
        ctx
      );

      expect(result.allSucceeded).toBe(true);
    });

    it("returns empty errors array for successful tasks", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [{ a: 1 }, { b: 2 }],
        },
        ctx
      );

      expect(result.errors).toEqual([]);
    });

    it("returns proper structure with all expected fields", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: ["task1", "task2"],
        },
        ctx
      );

      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("allSucceeded");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.results)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.allSucceeded).toBe("boolean");
    });
  });

  describe("value types", () => {
    it("handles mixed value types", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [
            42,
            "string",
            true,
            null,
            { object: "value" },
            ["array", "items"],
          ],
        },
        ctx
      );

      expect(result.results).toEqual([
        42,
        "string",
        true,
        null,
        { object: "value" },
        ["array", "items"],
      ]);
    });

    it("handles nested objects", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [
            { level1: { level2: { level3: "deep" } } },
          ],
        },
        ctx
      );

      expect(result.results[0]).toEqual({
        level1: { level2: { level3: "deep" } },
      });
    });

    it("handles undefined values in tasks", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [undefined, "valid", undefined],
        },
        ctx
      );

      expect(result.results).toEqual([undefined, "valid", undefined]);
      expect(result.allSucceeded).toBe(true);
    });
  });

  describe("without client context", () => {
    it("works without client in context", async () => {
      const noClientCtx: ProcedureContext = {
        metadata: {},
        path: ["test", "parallel"],
        client: undefined as any,
      };

      const result = await parallelProcedure.handler(
        {
          tasks: [1, 2, 3],
        },
        noClientCtx
      );

      expect(result.results).toEqual([1, 2, 3]);
      expect(result.allSucceeded).toBe(true);
    });
  });

  describe("large task arrays", () => {
    it("handles many tasks", async () => {
      const tasks = Array.from({ length: 100 }, (_, i) => ({ index: i }));

      const result = await parallelProcedure.handler({ tasks }, ctx);

      expect(result.results).toHaveLength(100);
      expect(result.results[0]).toEqual({ index: 0 });
      expect(result.results[99]).toEqual({ index: 99 });
      expect(result.allSucceeded).toBe(true);
    });

    it("handles very large task array", async () => {
      const tasks = Array.from({ length: 1000 }, (_, i) => i);

      const result = await parallelProcedure.handler({ tasks }, ctx);

      expect(result.results).toHaveLength(1000);
      expect(result.results[0]).toBe(0);
      expect(result.results[999]).toBe(999);
    });
  });

  describe("hydrated procedure results", () => {
    it("handles already-resolved procedure outputs", async () => {
      // Simulating what happens after hydration - tasks are resolved values
      const hydratedResults = [
        { status: "success", data: { id: 1 } },
        { status: "success", data: { id: 2 } },
        { status: "success", data: { id: 3 } },
      ];

      const result = await parallelProcedure.handler(
        {
          tasks: hydratedResults,
        },
        ctx
      );

      expect(result.results).toEqual(hydratedResults);
    });

    it("handles mixed hydrated and literal values", async () => {
      const result = await parallelProcedure.handler(
        {
          tasks: [
            { $proc: ["git", "status"], resolved: { branch: "main" } },
            "literal-value",
            { computed: true },
          ],
        },
        ctx
      );

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ $proc: ["git", "status"], resolved: { branch: "main" } });
      expect(result.results[1]).toBe("literal-value");
      expect(result.results[2]).toEqual({ computed: true });
    });
  });

  describe("procedure metadata", () => {
    it("has correct path", () => {
      expect(parallelProcedure.path).toEqual(["parallel"]);
    });

    it("has correct metadata description", () => {
      expect(parallelProcedure.metadata.description).toBe("Execute procedures in parallel");
    });

    it("has core and control-flow tags", () => {
      expect(parallelProcedure.metadata.tags).toContain("core");
      expect(parallelProcedure.metadata.tags).toContain("control-flow");
    });
  });
});
