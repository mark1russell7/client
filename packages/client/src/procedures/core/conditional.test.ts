/**
 * Unit tests for the conditional procedure
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { conditionalProcedure } from "./index.js";
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

describe("conditional procedure", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["test", "conditional"],
    };
  });

  describe("truthiness evaluation", () => {
    it("executes then branch when condition is true", async () => {
      mockClient.mockResponse(["test", "thenProc"], { output: "then result" });

      const result = await conditionalProcedure.handler(
        {
          condition: true,
          then: { $proc: ["test", "thenProc"], input: {} },
          else: { $proc: ["test", "elseProc"], input: {} },
        },
        ctx
      );

      expect(result).toBe("then result");
      expect(mockClient.getCallsFor(["test", "thenProc"])).toHaveLength(1);
      expect(mockClient.getCallsFor(["test", "elseProc"])).toHaveLength(0);
    });

    it("executes else branch when condition is false", async () => {
      mockClient.mockResponse(["test", "elseProc"], { output: "else result" });

      const result = await conditionalProcedure.handler(
        {
          condition: false,
          then: { $proc: ["test", "thenProc"], input: {} },
          else: { $proc: ["test", "elseProc"], input: {} },
        },
        ctx
      );

      expect(result).toBe("else result");
      expect(mockClient.getCallsFor(["test", "thenProc"])).toHaveLength(0);
      expect(mockClient.getCallsFor(["test", "elseProc"])).toHaveLength(1);
    });

    it("returns undefined when condition is false and no else", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: false,
          then: { $proc: ["test", "thenProc"], input: {} },
        },
        ctx
      );

      expect(result).toBeUndefined();
    });
  });

  describe("object with .value property", () => {
    it("checks .value property for truthiness when condition is object", async () => {
      mockClient.mockResponse(["test", "thenProc"], { output: "executed" });

      // Simulates predicate output like { value: true }
      const result = await conditionalProcedure.handler(
        {
          condition: { value: true },
          then: { $proc: ["test", "thenProc"], input: {} },
        },
        ctx
      );

      expect(result).toBe("executed");
    });

    it("treats { value: false } as falsy", async () => {
      mockClient.mockResponse(["test", "elseProc"], { output: "else executed" });

      const result = await conditionalProcedure.handler(
        {
          condition: { value: false },
          then: { $proc: ["test", "thenProc"], input: {} },
          else: { $proc: ["test", "elseProc"], input: {} },
        },
        ctx
      );

      expect(result).toBe("else executed");
      expect(mockClient.getCallsFor(["test", "thenProc"])).toHaveLength(0);
    });

    it("treats { value: 0 } as falsy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: { value: 0 },
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("falsy");
    });

    it("treats { value: 1 } as truthy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: { value: 1 },
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("truthy");
    });

    it("treats { value: '' } as falsy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: { value: "" },
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("falsy");
    });

    it("treats { value: 'non-empty' } as truthy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: { value: "non-empty" },
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("truthy");
    });
  });

  describe("falsy values", () => {
    it("treats null as falsy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: null,
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("falsy");
    });

    it("treats undefined as falsy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: undefined,
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("falsy");
    });

    it("treats 0 as falsy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: 0,
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("falsy");
    });

    it("treats empty string as falsy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: "",
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("falsy");
    });
  });

  describe("truthy values", () => {
    it("treats non-empty string as truthy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: "hello",
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("truthy");
    });

    it("treats non-zero number as truthy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: 42,
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("truthy");
    });

    it("treats empty array as truthy", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: [],
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("truthy");
    });

    it("treats empty object as truthy (but checks .value if present)", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: {},
          then: "truthy",
          else: "falsy",
        },
        ctx
      );

      expect(result).toBe("truthy");
    });
  });

  describe("cwd propagation", () => {
    it("propagates cwd to then branch", async () => {
      let capturedInput: unknown;
      mockClient.mockImplementation(["test", "action"], (input: unknown) => {
        capturedInput = input;
        return { ok: true };
      });

      await conditionalProcedure.handler(
        {
          condition: true,
          then: { $proc: ["test", "action"], input: { name: "test" } },
          cwd: "/project/path",
        } as any,
        ctx
      );

      expect((capturedInput as any).cwd).toBe("/project/path");
      expect((capturedInput as any).name).toBe("test");
    });

    it("propagates cwd to else branch", async () => {
      let capturedInput: unknown;
      mockClient.mockImplementation(["test", "action"], (input: unknown) => {
        capturedInput = input;
        return { ok: true };
      });

      await conditionalProcedure.handler(
        {
          condition: false,
          then: { $proc: ["test", "other"], input: {} },
          else: { $proc: ["test", "action"], input: { name: "else" } },
          cwd: "/else/path",
        } as any,
        ctx
      );

      expect((capturedInput as any).cwd).toBe("/else/path");
      expect((capturedInput as any).name).toBe("else");
    });

    it("propagates node to branch", async () => {
      let capturedInput: unknown;
      mockClient.mockImplementation(["test", "action"], (input: unknown) => {
        capturedInput = input;
        return { ok: true };
      });

      const nodeData = { id: "node1", repoPath: "/repo" };

      await conditionalProcedure.handler(
        {
          condition: true,
          then: { $proc: ["test", "action"], input: {} },
          node: nodeData,
        } as any,
        ctx
      );

      expect((capturedInput as any).node).toEqual(nodeData);
    });
  });

  describe("non-procedure branches", () => {
    it("returns raw value for then branch", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: true,
          then: { message: "success" },
          else: { message: "failure" },
        },
        ctx
      );

      expect(result).toEqual({ message: "success" });
    });

    it("returns raw value for else branch", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: false,
          then: { message: "success" },
          else: { message: "failure" },
        },
        ctx
      );

      expect(result).toEqual({ message: "failure" });
    });

    it("returns primitive for then branch", async () => {
      const result = await conditionalProcedure.handler(
        {
          condition: true,
          then: "yes",
          else: "no",
        },
        ctx
      );

      expect(result).toBe("yes");
    });
  });

  describe("without client context", () => {
    it("returns then value without executing procedure", async () => {
      // Create a context WITHOUT a client
      const noClientCtx: ProcedureContext = {
        metadata: {},
        path: ["test", "conditional"],
        client: undefined as any,
      };

      const result = await conditionalProcedure.handler({
        condition: true,
        then: { $proc: ["test", "action"], input: { foo: "bar" } },
      }, noClientCtx);

      // Without client, returns the procedure ref as-is
      expect(result).toEqual({ $proc: ["test", "action"], input: { foo: "bar" } });
    });

    it("returns raw else value without client", async () => {
      // Create a context WITHOUT a client
      const noClientCtx: ProcedureContext = {
        metadata: {},
        path: ["test", "conditional"],
        client: undefined as any,
      };

      const result = await conditionalProcedure.handler({
        condition: false,
        then: "yes",
        else: "no",
      }, noClientCtx);

      expect(result).toBe("no");
    });
  });

  describe("error handling", () => {
    it("propagates errors from then branch", async () => {
      mockClient.mockResponse(["test", "fail"], {
        error: new Error("Then failed"),
      });

      await expect(
        conditionalProcedure.handler(
          {
            condition: true,
            then: { $proc: ["test", "fail"], input: {} },
          },
          ctx
        )
      ).rejects.toThrow("Then failed");
    });

    it("propagates errors from else branch", async () => {
      mockClient.mockResponse(["test", "fail"], {
        error: new Error("Else failed"),
      });

      await expect(
        conditionalProcedure.handler(
          {
            condition: false,
            then: { $proc: ["test", "ok"], input: {} },
            else: { $proc: ["test", "fail"], input: {} },
          },
          ctx
        )
      ).rejects.toThrow("Else failed");
    });
  });
});
