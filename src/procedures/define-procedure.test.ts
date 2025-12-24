/**
 * Unit tests for the procedure.define meta-procedure and related utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  defineProcedureProcedure,
  getProcedureProcedure,
  listProceduresProcedure,
  deleteProcedureProcedure,
  getRuntimeProcedure,
  hasRuntimeProcedure,
  getAllRuntimeProcedures,
  clearRuntimeProcedures,
} from "./define-procedure.js";
import type { ProcedureContext } from "./types.js";
import type { AggregationDefinition } from "./define-procedure.js";

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

describe("procedure.define meta-procedure", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    clearRuntimeProcedures();
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["procedure", "define"],
    };
  });

  describe("defineProcedureProcedure", () => {
    it("registers a procedure from aggregation definition", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: { $ref: "input.value" } },
      };

      const result = await defineProcedureProcedure.handler!(
        {
          path: ["test", "simple"],
          aggregation,
        },
        ctx
      );

      expect(result.path).toEqual(["test", "simple"]);
      expect(result.replaced).toBe(false);
      expect(hasRuntimeProcedure(["test", "simple"])).toBe(true);
    });

    it("throws on duplicate path without replace flag", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      // First registration should succeed
      await defineProcedureProcedure.handler!(
        {
          path: ["test", "duplicate"],
          aggregation,
        },
        ctx
      );

      // Second registration without replace should throw
      await expect(
        defineProcedureProcedure.handler!(
          {
            path: ["test", "duplicate"],
            aggregation,
          },
          ctx
        )
      ).rejects.toThrow("Procedure already exists at path: test.duplicate");
    });

    it("replaces existing procedure with replace: true", async () => {
      const aggregation1: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "first" },
      };

      const aggregation2: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "second" },
      };

      // First registration
      await defineProcedureProcedure.handler!(
        {
          path: ["test", "replaceable"],
          aggregation: aggregation1,
        },
        ctx
      );

      // Second registration with replace: true
      const result = await defineProcedureProcedure.handler!(
        {
          path: ["test", "replaceable"],
          aggregation: aggregation2,
          replace: true,
        },
        ctx
      );

      expect(result.replaced).toBe(true);
      expect(hasRuntimeProcedure(["test", "replaceable"])).toBe(true);
    });

    it("stores custom metadata", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "withMeta"],
          aggregation,
          metadata: {
            description: "Custom description",
            tags: ["custom", "test"],
          },
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "withMeta"]);
      expect(proc?.metadata?.description).toBe("Custom description");
      expect(proc?.metadata?.tags).toEqual(["custom", "test"]);
    });
  });

  describe("registered procedure execution", () => {
    it("executes registered aggregation procedure", async () => {
      // Mock the identity procedure
      mockClient.mockImplementation(["client", "identity"], (input: unknown) => input);

      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { passthrough: { $ref: "input.data" } },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "executable"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "executable"]);
      expect(proc).toBeDefined();
      expect(proc?.handler).toBeDefined();

      // Execute the procedure
      const result = await proc!.handler!({ data: "hello" }, ctx);

      // Should call client.identity with resolved input
      expect(mockClient.getCalls()).toHaveLength(1);
      expect(mockClient.getCalls()[0]?.path).toEqual(["client", "identity"]);
      expect(mockClient.getCalls()[0]?.input).toEqual({ passthrough: "hello" });
    });

    it("resolves $ref in aggregation input", async () => {
      mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

      const aggregation: AggregationDefinition = {
        $proc: ["test", "echo"],
        input: {
          nested: {
            value: { $ref: "input.source.nested.value" },
          },
        },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "refResolution"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "refResolution"]);
      await proc!.handler!(
        { source: { nested: { value: "deepValue" } } },
        ctx
      );

      expect(mockClient.getCalls()[0]?.input).toEqual({
        nested: { value: "deepValue" },
      });
    });

    it("throws when executed without client context", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "noClient"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "noClient"]);
      const noClientCtx: ProcedureContext = {
        metadata: {},
        path: ["test", "noClient"],
        client: undefined as any,
      };

      await expect(proc!.handler!({}, noClientCtx)).rejects.toThrow(
        "procedure.define requires a client context to execute aggregations"
      );
    });
  });

  describe("getProcedureProcedure", () => {
    it("returns registered procedure by path", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "findable"],
          aggregation,
        },
        ctx
      );

      const result = await getProcedureProcedure.handler!(
        { path: ["test", "findable"] },
        ctx
      );

      expect(result).not.toBeNull();
      expect(result?.path).toEqual(["test", "findable"]);
    });

    it("returns null for non-existent path", async () => {
      const result = await getProcedureProcedure.handler!(
        { path: ["does", "not", "exist"] },
        ctx
      );

      expect(result).toBeNull();
    });
  });

  describe("listProceduresProcedure", () => {
    it("lists all runtime-defined procedures", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "list1"],
          aggregation,
          metadata: { description: "First" },
        },
        ctx
      );

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "list2"],
          aggregation,
          metadata: { description: "Second" },
        },
        ctx
      );

      const result = await listProceduresProcedure.handler!({}, ctx);

      expect(result.procedures).toHaveLength(2);
      expect(result.procedures.map((p) => p.path)).toContainEqual(["test", "list1"]);
      expect(result.procedures.map((p) => p.path)).toContainEqual(["test", "list2"]);
    });

    it("returns empty array when none defined", async () => {
      const result = await listProceduresProcedure.handler!({}, ctx);

      expect(result.procedures).toHaveLength(0);
    });
  });

  describe("deleteProcedureProcedure", () => {
    it("deletes runtime-defined procedure", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "deletable"],
          aggregation,
        },
        ctx
      );

      expect(hasRuntimeProcedure(["test", "deletable"])).toBe(true);

      const result = await deleteProcedureProcedure.handler!(
        { path: ["test", "deletable"] },
        ctx
      );

      expect(result.deleted).toBe(true);
      expect(hasRuntimeProcedure(["test", "deletable"])).toBe(false);
    });

    it("returns false for non-existent procedure", async () => {
      const result = await deleteProcedureProcedure.handler!(
        { path: ["does", "not", "exist"] },
        ctx
      );

      expect(result.deleted).toBe(false);
    });
  });

  describe("utility functions", () => {
    it("getRuntimeProcedure returns procedure by path", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["util", "test"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["util", "test"]);
      expect(proc).toBeDefined();
      expect(proc?.path).toEqual(["util", "test"]);
    });

    it("getRuntimeProcedure returns undefined for non-existent", () => {
      const proc = getRuntimeProcedure(["not", "found"]);
      expect(proc).toBeUndefined();
    });

    it("hasRuntimeProcedure returns correct boolean", async () => {
      expect(hasRuntimeProcedure(["check", "exists"])).toBe(false);

      await defineProcedureProcedure.handler!(
        {
          path: ["check", "exists"],
          aggregation: {
            $proc: ["client", "identity"],
            input: {},
          },
        },
        ctx
      );

      expect(hasRuntimeProcedure(["check", "exists"])).toBe(true);
    });

    it("getAllRuntimeProcedures returns all procedures", async () => {
      await defineProcedureProcedure.handler!(
        {
          path: ["all", "first"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      await defineProcedureProcedure.handler!(
        {
          path: ["all", "second"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      const all = getAllRuntimeProcedures();
      expect(all).toHaveLength(2);
    });

    it("clearRuntimeProcedures clears all procedures", async () => {
      await defineProcedureProcedure.handler!(
        {
          path: ["clear", "test"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      expect(getAllRuntimeProcedures()).toHaveLength(1);

      clearRuntimeProcedures();

      expect(getAllRuntimeProcedures()).toHaveLength(0);
    });
  });
});

describe("$ref resolution", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    clearRuntimeProcedures();
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["procedure", "define"],
    };
  });

  it("resolves simple input reference", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "simple"],
        aggregation: {
          $proc: ["test", "echo"],
          input: { value: { $ref: "input.data" } },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "simple"]);
    await proc!.handler!({ data: 42 }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ value: 42 });
  });

  it("resolves nested input reference", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "nested"],
        aggregation: {
          $proc: ["test", "echo"],
          input: { value: { $ref: "input.deep.nested.value" } },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "nested"]);
    await proc!.handler!({ deep: { nested: { value: "found" } } }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ value: "found" });
  });

  it("resolves array of $ref values", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "array"],
        aggregation: {
          $proc: ["test", "echo"],
          input: {
            values: [
              { $ref: "input.a" },
              { $ref: "input.b" },
            ],
          },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "array"]);
    await proc!.handler!({ a: 1, b: 2 }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ values: [1, 2] });
  });

  it("handles undefined references gracefully", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "undefined"],
        aggregation: {
          $proc: ["test", "echo"],
          input: { value: { $ref: "input.nonexistent" } },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "undefined"]);
    await proc!.handler!({ other: "data" }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ value: undefined });
  });

  it("passes through primitive values unchanged", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "primitives"],
        aggregation: {
          $proc: ["test", "echo"],
          input: {
            str: "literal",
            num: 42,
            bool: true,
            nil: null,
          },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "primitives"]);
    await proc!.handler!({}, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({
      str: "literal",
      num: 42,
      bool: true,
      nil: null,
    });
  });
});
