/**
 * Edge case tests for aggregation execution
 *
 * Tests unusual scenarios and boundary conditions:
 * - Empty inputs
 * - Null/undefined handling
 * - Deep object paths in $ref
 * - Large inputs
 * - Edge cases in control flow
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AggregationDefinition } from "@mark1russell7/client";

/**
 * Mock client for testing aggregation execution
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
    return response?.output ?? {};
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

/**
 * Execute an aggregation definition with a mock client
 */
async function executeAggregation(
  aggregation: AggregationDefinition,
  input: Record<string, unknown>,
  client: ReturnType<typeof createTestMockClient>
): Promise<unknown> {
  const context: Record<string, unknown> = { input };

  const resolveRef = (ref: string): unknown => {
    const parts = ref.split(".");
    let value: unknown = context;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };

  const resolveTemplate = (str: string): string => {
    return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const value = resolveRef(path);
      return value != null ? String(value) : "";
    });
  };

  const resolveInput = (obj: unknown): unknown => {
    if (obj == null) return obj;
    if (typeof obj === "string") {
      if (obj.includes("{{")) return resolveTemplate(obj);
      return obj;
    }
    if (Array.isArray(obj)) return obj.map((item) => resolveInput(item));
    if (typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      if ("$ref" in record && typeof record.$ref === "string") {
        const value = resolveRef(record.$ref);
        if (record.invert) return !value;
        return value;
      }
      if ("$proc" in record) {
        const result: Record<string, unknown> = {
          $proc: record.$proc,
        };
        if ("$name" in record) result.$name = record.$name;
        if ("input" in record) result.input = record.input;
        return result;
      }
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        result[key] = resolveInput(value);
      }
      return result;
    }
    return obj;
  };

  const executeStep = async (step: AggregationDefinition): Promise<unknown> => {
    const proc = step.$proc;
    const name = step.$name;
    const stepInput = resolveInput(step.input);

    let result: unknown;

    if (proc[0] === "client") {
      switch (proc[1]) {
        case "chain": {
          const chainInput = stepInput as { steps: AggregationDefinition[] };
          let last: unknown;
          for (const s of chainInput.steps || []) {
            last = await executeStep(s);
          }
          result = last;
          break;
        }
        case "conditional": {
          const condInput = stepInput as {
            condition: boolean;
            then?: AggregationDefinition;
            else?: AggregationDefinition;
          };
          if (condInput.condition && condInput.then) {
            result = await executeStep(condInput.then as AggregationDefinition);
          } else if (!condInput.condition && condInput.else) {
            result = await executeStep(condInput.else as AggregationDefinition);
          }
          break;
        }
        case "tryCatch": {
          const tryInput = stepInput as {
            try: AggregationDefinition;
            catch: unknown;
          };
          try {
            result = await executeStep(tryInput.try as AggregationDefinition);
          } catch {
            result = tryInput.catch;
          }
          break;
        }
        case "parallel": {
          const parallelInput = stepInput as { tasks: AggregationDefinition[] };
          result = await Promise.all(
            (parallelInput.tasks || []).map((t) => executeStep(t))
          );
          break;
        }
        case "identity": {
          result = stepInput;
          break;
        }
        case "throw": {
          const throwInput = stepInput as { message: string };
          throw new Error(throwInput.message);
        }
        default:
          result = await client.call(proc, stepInput);
      }
    } else {
      result = await client.call(proc, stepInput);
    }

    if (name) {
      context[name] = result;
    }

    return result;
  };

  return executeStep(aggregation);
}

describe("aggregation edge cases", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["test", "procedure"], { output: { success: true } });
  });

  describe("empty inputs", () => {
    it("handles empty chain steps array", async () => {
      const emptyChain: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [],
        },
      };

      const result = await executeAggregation(emptyChain, {}, client);
      expect(result).toBeUndefined();
      expect(client.getCalls()).toHaveLength(0);
    });

    it("handles empty parallel tasks array", async () => {
      const emptyParallel: AggregationDefinition = {
        $proc: ["client", "parallel"],
        input: {
          tasks: [],
        },
      };

      const result = await executeAggregation(emptyParallel, {}, client) as unknown[];
      expect(result).toEqual([]);
    });

    it("handles empty input object", async () => {
      const withEmptyInput: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {},
      };

      const result = await executeAggregation(withEmptyInput, {}, client);
      expect(result).toEqual({});
    });
  });

  describe("null/undefined handling", () => {
    it("handles null input values", async () => {
      client.mockImplementation(["test", "echo"], (input: unknown) => input);

      const nullInput: AggregationDefinition = {
        $proc: ["test", "echo"],
        input: { value: null, other: "valid" },
      };

      const result = await executeAggregation(nullInput, {}, client) as { value: null };
      expect(result.value).toBeNull();
    });

    it("handles $ref to undefined path", async () => {
      const undefinedRef: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          value: { $ref: "input.nonexistent.path" },
        },
      };

      const result = await executeAggregation(undefinedRef, {}, client) as { value: undefined };
      expect(result.value).toBeUndefined();
    });

    it("handles $ref with undefined intermediate", async () => {
      const deepUndefined: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          value: { $ref: "input.a.b.c.d.e" },
        },
      };

      const result = await executeAggregation(
        deepUndefined,
        { a: { b: null } }, // b is null, so c.d.e can't be resolved
        client
      ) as { value: undefined };

      expect(result.value).toBeUndefined();
    });

    it("conditional with falsy condition and no else branch", async () => {
      const noElse: AggregationDefinition = {
        $proc: ["client", "conditional"],
        input: {
          condition: false,
          then: { $proc: ["test", "procedure"], input: {} },
          // no else branch
        },
      };

      const result = await executeAggregation(noElse, {}, client);
      expect(result).toBeUndefined();
      expect(client.getCalls()).toHaveLength(0);
    });
  });

  describe("deep object paths in $ref", () => {
    it("resolves 10+ level deep $ref path", async () => {
      const deepObject = {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: {
                  l6: {
                    l7: {
                      l8: {
                        l9: {
                          l10: {
                            value: "found at depth 10",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const deepRef: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          result: { $ref: "input.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10.value" },
        },
      };

      const result = await executeAggregation(deepRef, deepObject, client) as { result: string };
      expect(result.result).toBe("found at depth 10");
    });

    it("handles array index in $ref path", async () => {
      // Note: Our simple resolver doesn't support array indexing
      // This test documents the current behavior
      const arrayInput: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          // Array indices aren't standard $ref path - just testing string split
          first: { $ref: "input.items.0" },
        },
      };

      const result = await executeAggregation(
        arrayInput,
        { items: { "0": "first item" } }, // Object with numeric key
        client
      ) as { first: string };

      expect(result.first).toBe("first item");
    });
  });

  describe("large inputs", () => {
    it("handles large array of tasks in parallel", async () => {
      const largeTasks: AggregationDefinition = {
        $proc: ["client", "parallel"],
        input: {
          tasks: Array.from({ length: 100 }, (_, i) => ({
            $proc: ["test", "procedure"],
            input: { index: i },
          })),
        },
      };

      const result = await executeAggregation(largeTasks, {}, client) as unknown[];

      expect(result).toHaveLength(100);
      expect(client.getCalls()).toHaveLength(100);
    });

    it("handles chain with many steps", async () => {
      const manySteps: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: Array.from({ length: 50 }, (_, i) => ({
            $proc: ["test", "procedure"],
            $name: `step${i}`,
            input: { step: i },
          })),
        },
      };

      const result = await executeAggregation(manySteps, {}, client);

      expect(client.getCalls()).toHaveLength(50);
    });

    it("handles input with many keys", async () => {
      const manyKeys = Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [`key${i}`, `value${i}`])
      );

      const largeInput: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: manyKeys,
      };

      const result = await executeAggregation(largeInput, {}, client) as Record<string, string>;

      expect(Object.keys(result)).toHaveLength(100);
      expect(result.key50).toBe("value50");
    });
  });

  describe("special string handling", () => {
    it("handles template with missing value (empty string)", async () => {
      const missingTemplate: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          path: "{{input.base}}/{{input.missing}}/file.txt",
        },
      };

      const result = await executeAggregation(
        missingTemplate,
        { base: "/home" },
        client
      ) as { path: string };

      expect(result.path).toBe("/home//file.txt");
    });

    it("handles strings that look like templates but aren't", async () => {
      const notTemplate: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          code: "function() { return { value }; }",
          regex: "/\\{\\{.*\\}\\}/g",
        },
      };

      const result = await executeAggregation(notTemplate, {}, client) as {
        code: string;
        regex: string;
      };

      expect(result.code).toBe("function() { return { value }; }");
      expect(result.regex).toBe("/\\{\\{.*\\}\\}/g");
    });
  });

  describe("conditional edge cases", () => {
    it("truthy condition with various values", async () => {
      const values = [1, "string", true, [], {}, -1, "false"];

      for (const val of values) {
        const conditional: AggregationDefinition = {
          $proc: ["client", "conditional"],
          input: {
            condition: val,
            then: { $proc: ["client", "identity"], input: { branch: "then" } },
            else: { $proc: ["client", "identity"], input: { branch: "else" } },
          },
        };

        const result = await executeAggregation(conditional, {}, client) as { branch: string };
        expect(result.branch).toBe("then");
      }
    });

    it("falsy condition with various values", async () => {
      const values = [0, "", false, null, undefined];

      for (const val of values) {
        const conditional: AggregationDefinition = {
          $proc: ["client", "conditional"],
          input: {
            condition: val,
            then: { $proc: ["client", "identity"], input: { branch: "then" } },
            else: { $proc: ["client", "identity"], input: { branch: "else" } },
          },
        };

        const result = await executeAggregation(conditional, {}, client) as { branch: string };
        expect(result.branch).toBe("else");
      }
    });
  });

  describe("$ref invert edge cases", () => {
    it("inverts truthy value to false", async () => {
      const invertTrue: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          inverted: { $ref: "input.value", invert: true },
        },
      };

      const result = await executeAggregation(
        invertTrue,
        { value: true },
        client
      ) as { inverted: boolean };

      expect(result.inverted).toBe(false);
    });

    it("inverts falsy value to true", async () => {
      const invertFalse: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          inverted: { $ref: "input.value", invert: true },
        },
      };

      const result = await executeAggregation(
        invertFalse,
        { value: false },
        client
      ) as { inverted: boolean };

      expect(result.inverted).toBe(true);
    });

    it("inverts undefined to true", async () => {
      const invertUndefined: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: {
          inverted: { $ref: "input.missing", invert: true },
        },
      };

      const result = await executeAggregation(invertUndefined, {}, client) as { inverted: boolean };
      expect(result.inverted).toBe(true);
    });
  });
});
