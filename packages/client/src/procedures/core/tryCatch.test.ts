/**
 * Unit tests for the tryCatch procedure
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { tryCatchProcedure } from "./index.js";
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

describe("tryCatch procedure", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["test", "tryCatch"],
    };
  });

  describe("successful try", () => {
    it("returns try value on success", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: { data: "success" },
          catch: { error: "fallback" },
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ data: "success" });
      expect(result.error).toBeUndefined();
    });

    it("returns primitive try value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: 42,
          catch: 0,
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it("returns string try value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: "operation succeeded",
          catch: "fallback message",
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe("operation succeeded");
    });

    it("returns null try value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: null,
          catch: "default",
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toBeNull();
    });

    it("returns array try value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: [1, 2, 3],
          catch: [],
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toEqual([1, 2, 3]);
    });

    it("returns boolean try value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: false,
          catch: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });
  });

  describe("result structure", () => {
    it("always returns success as true (hydrated value)", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: "value",
          catch: "fallback",
        },
        ctx
      );

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("value");
      expect(result.success).toBe(true);
    });

    it("does not include error property on success", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: { data: true },
          catch: null,
        },
        ctx
      );

      expect(result.error).toBeUndefined();
    });

    it("has proper structure with all expected fields", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: "test",
          catch: "fallback",
        },
        ctx
      );

      expect(typeof result.success).toBe("boolean");
      expect("value" in result).toBe(true);
    });
  });

  describe("complex try values", () => {
    it("handles deeply nested objects", async () => {
      const complexValue = {
        level1: {
          level2: {
            level3: {
              data: "deep value",
            },
          },
        },
      };

      const result = await tryCatchProcedure.handler(
        {
          try: complexValue,
          catch: null,
        },
        ctx
      );

      expect(result.value).toEqual(complexValue);
    });

    it("handles arrays of objects", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: [
            { id: 1, name: "first" },
            { id: 2, name: "second" },
          ],
          catch: [],
        },
        ctx
      );

      expect(result.value).toEqual([
        { id: 1, name: "first" },
        { id: 2, name: "second" },
      ]);
    });

    it("handles undefined try value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: undefined,
          catch: "default",
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.value).toBeUndefined();
    });
  });

  describe("catch value variations", () => {
    it("accepts object as catch value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: "success",
          catch: { fallback: true, message: "error occurred" },
        },
        ctx
      );

      // Since try succeeded, catch is not used
      expect(result.value).toBe("success");
    });

    it("accepts procedure ref as catch value (not executed on success)", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: "success",
          catch: { $proc: ["error", "handler"], input: {} },
        },
        ctx
      );

      expect(result.value).toBe("success");
      // No calls should be made since try succeeded
      expect(mockClient.getCalls()).toHaveLength(0);
    });

    it("accepts null as catch value", async () => {
      const result = await tryCatchProcedure.handler(
        {
          try: "success",
          catch: null,
        },
        ctx
      );

      expect(result.success).toBe(true);
    });
  });

  describe("without client context", () => {
    it("works without client in context", async () => {
      const noClientCtx: ProcedureContext = {
        metadata: {},
        path: ["test", "tryCatch"],
        client: undefined as any,
      };

      const result = await tryCatchProcedure.handler(
        {
          try: { data: "no client" },
          catch: "fallback",
        },
        noClientCtx
      );

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ data: "no client" });
    });
  });

  describe("hydration context", () => {
    it("returns already hydrated try value", async () => {
      // Simulating a hydrated procedure result
      const hydratedResult = {
        status: "success",
        data: { userId: 123, items: ["a", "b", "c"] },
      };

      const result = await tryCatchProcedure.handler(
        {
          try: hydratedResult,
          catch: { status: "error", data: null },
        },
        ctx
      );

      expect(result.value).toEqual(hydratedResult);
    });

    it("preserves procedure ref structure in try (already hydrated)", async () => {
      // After hydration, $proc refs are replaced with their results
      const result = await tryCatchProcedure.handler(
        {
          try: { resolved: true, from: "git.status" },
          catch: { resolved: false },
        },
        ctx
      );

      expect(result.value).toEqual({ resolved: true, from: "git.status" });
    });
  });

  describe("procedure metadata", () => {
    it("has correct path", () => {
      expect(tryCatchProcedure.path).toEqual(["tryCatch"]);
    });

    it("has correct metadata description", () => {
      expect(tryCatchProcedure.metadata.description).toBe("Try/catch wrapper for procedures");
    });

    it("has core and control-flow tags", () => {
      expect(tryCatchProcedure.metadata.tags).toContain("core");
      expect(tryCatchProcedure.metadata.tags).toContain("control-flow");
    });
  });
});
