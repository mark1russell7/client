/**
 * Unit tests for the chain procedure
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { chainProcedure } from "./index.js";
import type { ProcedureContext } from "../../types.js";

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

describe("chain procedure", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["test", "chain"],
    };
  });

  describe("basic execution", () => {
    it("executes steps in sequence", async () => {
      // Setup mock responses
      mockClient.mockResponse(["test", "step1"], { output: { value: 1 } });
      mockClient.mockResponse(["test", "step2"], { output: { value: 2 } });
      mockClient.mockResponse(["test", "step3"], { output: { value: 3 } });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "step1"], input: {} },
            { $proc: ["test", "step2"], input: {} },
            { $proc: ["test", "step3"], input: {} },
          ],
        },
        ctx
      );

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ value: 1 });
      expect(result.results[1]).toEqual({ value: 2 });
      expect(result.results[2]).toEqual({ value: 3 });
      expect(result.final).toEqual({ value: 3 });
    });

    it("returns empty results for empty steps array", async () => {
      const result = await chainProcedure.handler({ steps: [] }, ctx);

      expect(result.results).toHaveLength(0);
      expect(result.final).toBeUndefined();
    });

    it("handles single step", async () => {
      mockClient.mockResponse(["test", "single"], { output: "result" });

      const result = await chainProcedure.handler(
        {
          steps: [{ $proc: ["test", "single"], input: {} }],
        },
        ctx
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe("result");
      expect(result.final).toBe("result");
    });
  });

  describe("$ref resolution", () => {
    it("resolves $ref to named output", async () => {
      mockClient.mockResponse(["test", "getData"], { output: { value: 42 } });
      mockClient.mockImplementation(["test", "useData"], (input: unknown) => {
        return { received: (input as { data: unknown }).data };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "getData"], input: {}, $name: "dataStep" },
            {
              $proc: ["test", "useData"],
              input: { data: { $ref: "dataStep" } },
            },
          ],
        },
        ctx
      );

      expect(result.results[0]).toEqual({ value: 42 });
      // The $ref should be resolved to the dataStep output
      expect(result.results[1]).toEqual({ received: { value: 42 } });
    });

    it("resolves $ref with path traversal", async () => {
      mockClient.mockResponse(["test", "getData"], {
        output: { nested: { deep: { value: "found" } } },
      });
      mockClient.mockImplementation(["test", "useData"], (input: unknown) => {
        return { received: (input as { data: unknown }).data };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "getData"], input: {}, $name: "data" },
            {
              $proc: ["test", "useData"],
              input: { data: { $ref: "data.nested.deep.value" } },
            },
          ],
        },
        ctx
      );

      expect(result.results[1]).toEqual({ received: "found" });
    });

    it("resolves $last reference", async () => {
      mockClient.mockResponse(["test", "step1"], { output: { result: "first" } });
      mockClient.mockImplementation(["test", "step2"], (input: unknown) => {
        return { previous: (input as { prev: unknown }).prev };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "step1"], input: {} },
            { $proc: ["test", "step2"], input: { prev: { $ref: "$last" } } },
          ],
        },
        ctx
      );

      expect(result.results[1]).toEqual({ previous: { result: "first" } });
    });

    it("resolves $last.value path", async () => {
      mockClient.mockResponse(["test", "predicate"], { output: { value: true } });
      mockClient.mockImplementation(["test", "check"], (input: unknown) => {
        return { wasTrue: (input as { flag: boolean }).flag };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "predicate"], input: {} },
            { $proc: ["test", "check"], input: { flag: { $ref: "$last.value" } } },
          ],
        },
        ctx
      );

      expect(result.results[1]).toEqual({ wasTrue: true });
    });
  });

  describe("cwd propagation", () => {
    it("propagates cwd to all steps", async () => {
      const capturedInputs: unknown[] = [];
      mockClient.mockImplementation(["test", "step"], (input: unknown) => {
        capturedInputs.push(input);
        return { ok: true };
      });

      await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "step"], input: { name: "first" } },
            { $proc: ["test", "step"], input: { name: "second" } },
          ],
          cwd: "/some/path",
        } as any,
        ctx
      );

      expect(capturedInputs).toHaveLength(2);
      expect((capturedInputs[0] as any).cwd).toBe("/some/path");
      expect((capturedInputs[0] as any).name).toBe("first");
      expect((capturedInputs[1] as any).cwd).toBe("/some/path");
      expect((capturedInputs[1] as any).name).toBe("second");
    });

    it("propagates node to all steps", async () => {
      const capturedInputs: unknown[] = [];
      mockClient.mockImplementation(["test", "step"], (input: unknown) => {
        capturedInputs.push(input);
        return { ok: true };
      });

      const nodeData = { id: "node1", path: "/repo" };

      await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "step"], input: {} },
          ],
          node: nodeData,
        } as any,
        ctx
      );

      expect((capturedInputs[0] as any).node).toEqual(nodeData);
    });
  });

  describe("non-procedure steps", () => {
    it("handles raw values as steps", async () => {
      const result = await chainProcedure.handler(
        {
          steps: [
            { literal: "value" },
            42,
            "string",
          ],
        },
        ctx
      );

      expect(result.results).toEqual([
        { literal: "value" },
        42,
        "string",
      ]);
    });

    it("handles $ref as step value", async () => {
      mockClient.mockResponse(["test", "getData"], { output: { key: "value" } });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["test", "getData"], input: {}, $name: "data" },
            { $ref: "data.key" },
          ],
        },
        ctx
      );

      expect(result.results[1]).toBe("value");
    });
  });

  describe("without client context", () => {
    it("returns resolved input when no client", async () => {
      const result = await chainProcedure.handler({
        steps: [
          { $proc: ["test", "step"], input: { foo: "bar" } },
        ],
      });

      // Without client, just returns the resolved input
      expect(result.results[0]).toEqual({ foo: "bar" });
    });
  });

  describe("error handling", () => {
    it("propagates errors from failed procedures", async () => {
      mockClient.mockResponse(["test", "fail"], {
        error: new Error("Step failed"),
      });

      await expect(
        chainProcedure.handler(
          {
            steps: [{ $proc: ["test", "fail"], input: {} }],
          },
          ctx
        )
      ).rejects.toThrow("Step failed");
    });
  });
});
