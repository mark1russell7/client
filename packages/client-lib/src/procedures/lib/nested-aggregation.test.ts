/**
 * Tests for deeply nested aggregation execution
 *
 * Verifies that aggregations can be nested 3+ levels deep with proper:
 * - $ref resolution across boundaries
 * - Context propagation through nesting
 * - Error bubbling through nesting
 * - Complex composition patterns
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
          for (const s of chainInput.steps) {
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
            parallelInput.tasks.map((t) => executeStep(t))
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

describe("nested aggregation execution", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["test", "procedure"], { output: { success: true } });
    client.mockResponse(["fs", "read"], { output: { data: "file content" } });
    client.mockResponse(["git", "status"], { output: { branch: "main" } });
  });

  describe("3-level deep nesting", () => {
    it("executes chain within chain within chain", async () => {
      const deepNested: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "chain"],
              $name: "level1",
              input: {
                steps: [
                  {
                    $proc: ["client", "chain"],
                    $name: "level2",
                    input: {
                      steps: [
                        {
                          $proc: ["test", "procedure"],
                          $name: "deepest",
                          input: { level: 3 },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = await executeAggregation(deepNested, {}, client);

      const calls = client.getCallsFor(["test", "procedure"]);
      expect(calls).toHaveLength(1);
      expect((calls[0].input as { level: number }).level).toBe(3);
    });

    it("parallel within chain within conditional", async () => {
      const complexNested: AggregationDefinition = {
        $proc: ["client", "conditional"],
        input: {
          condition: true,
          then: {
            $proc: ["client", "chain"],
            input: {
              steps: [
                {
                  $proc: ["client", "parallel"],
                  input: {
                    tasks: [
                      { $proc: ["test", "procedure"], input: { id: 1 } },
                      { $proc: ["test", "procedure"], input: { id: 2 } },
                    ],
                  },
                },
              ],
            },
          },
        },
      };

      const result = await executeAggregation(complexNested, {}, client);

      const calls = client.getCallsFor(["test", "procedure"]);
      expect(calls).toHaveLength(2);
    });

    it("conditional within parallel within chain", async () => {
      const mixedNested: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "parallel"],
              input: {
                tasks: [
                  {
                    $proc: ["client", "conditional"],
                    input: {
                      condition: true,
                      then: { $proc: ["test", "procedure"], input: { branch: "then" } },
                    },
                  },
                  {
                    $proc: ["client", "conditional"],
                    input: {
                      condition: false,
                      else: { $proc: ["test", "procedure"], input: { branch: "else" } },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      await executeAggregation(mixedNested, {}, client);

      const calls = client.getCallsFor(["test", "procedure"]);
      expect(calls).toHaveLength(2);
      expect(calls.map((c) => (c.input as { branch: string }).branch)).toContain("then");
      expect(calls.map((c) => (c.input as { branch: string }).branch)).toContain("else");
    });
  });

  describe("$ref across boundaries", () => {
    it("resolves $ref from parent input in nested chain", async () => {
      client.mockImplementation(["test", "echo"], (input: unknown) => input);

      const nestedRef: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "chain"],
              input: {
                steps: [
                  {
                    $proc: ["test", "echo"],
                    input: { fromRoot: { $ref: "input.rootValue" } },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = await executeAggregation(
        nestedRef,
        { rootValue: "passed-through" },
        client
      );

      const echoCalls = client.getCallsFor(["test", "echo"]);
      expect((echoCalls[0].input as { fromRoot: string }).fromRoot).toBe("passed-through");
    });

    it("resolves $ref to named step in parent chain", async () => {
      client.mockImplementation(["test", "getValue"], () => ({ computedValue: 42 }));
      client.mockImplementation(["test", "useValue"], (input: unknown) => input);

      const crossBoundaryRef: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["test", "getValue"],
              $name: "firstStep",
              input: {},
            },
            {
              $proc: ["client", "chain"],
              input: {
                steps: [
                  {
                    $proc: ["test", "useValue"],
                    input: { value: { $ref: "firstStep.computedValue" } },
                  },
                ],
              },
            },
          ],
        },
      };

      await executeAggregation(crossBoundaryRef, {}, client);

      const useCalls = client.getCallsFor(["test", "useValue"]);
      expect((useCalls[0].input as { value: number }).value).toBe(42);
    });
  });

  describe("error bubbling through nesting", () => {
    it("error in deeply nested step bubbles up", async () => {
      const deepError: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "chain"],
              input: {
                steps: [
                  {
                    $proc: ["client", "chain"],
                    input: {
                      steps: [
                        {
                          $proc: ["client", "throw"],
                          input: { message: "Deep error" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      await expect(executeAggregation(deepError, {}, client)).rejects.toThrow("Deep error");
    });

    it("tryCatch at intermediate level catches nested error", async () => {
      const tryCatchNested: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "tryCatch"],
              $name: "handled",
              input: {
                try: {
                  $proc: ["client", "chain"],
                  input: {
                    steps: [
                      {
                        $proc: ["client", "throw"],
                        input: { message: "Caught error" },
                      },
                    ],
                  },
                },
                catch: { recovered: true, errorHandled: true },
              },
            },
          ],
        },
      };

      const result = await executeAggregation(tryCatchNested, {}, client) as { recovered: boolean };

      expect(result.recovered).toBe(true);
    });

    it("error in parallel task affects parallel result", async () => {
      client.mockResponse(["test", "fail"], { error: new Error("Task failed") });

      const parallelWithError: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "tryCatch"],
              input: {
                try: {
                  $proc: ["client", "parallel"],
                  input: {
                    tasks: [
                      { $proc: ["test", "procedure"], input: {} },
                      { $proc: ["test", "fail"], input: {} },
                    ],
                  },
                },
                catch: { parallelFailed: true },
              },
            },
          ],
        },
      };

      const result = await executeAggregation(parallelWithError, {}, client) as { parallelFailed: boolean };

      expect(result.parallelFailed).toBe(true);
    });
  });

  describe("context propagation", () => {
    it("context flows through multiple nesting levels", async () => {
      client.mockImplementation(["test", "createContext"], () => ({ userId: 123, session: "abc" }));
      client.mockImplementation(["test", "useContext"], (input: unknown) => input);

      const contextFlow: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["test", "createContext"],
              $name: "ctx",
              input: {},
            },
            {
              $proc: ["client", "chain"],
              input: {
                steps: [
                  {
                    $proc: ["client", "chain"],
                    input: {
                      steps: [
                        {
                          $proc: ["test", "useContext"],
                          input: {
                            userId: { $ref: "ctx.userId" },
                            session: { $ref: "ctx.session" },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      await executeAggregation(contextFlow, {}, client);

      const useCalls = client.getCallsFor(["test", "useContext"]);
      const input = useCalls[0].input as { userId: number; session: string };
      expect(input.userId).toBe(123);
      expect(input.session).toBe("abc");
    });
  });

  describe("complex real-world patterns", () => {
    it("refresh pattern with conditional cleanup and build", async () => {
      client.mockResponse(["fs", "rm"], { output: { removed: true } });
      client.mockResponse(["pnpm", "install"], { output: { success: true } });
      client.mockResponse(["pnpm", "run"], { output: { success: true } });

      const refreshPattern: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["client", "conditional"],
              $name: "cleanup",
              input: {
                condition: { $ref: "input.force" },
                then: {
                  $proc: ["client", "chain"],
                  input: {
                    steps: [
                      { $proc: ["fs", "rm"], input: { path: "/node_modules" } },
                      { $proc: ["fs", "rm"], input: { path: "/dist" } },
                    ],
                  },
                },
              },
            },
            {
              $proc: ["client", "chain"],
              input: {
                steps: [
                  { $proc: ["pnpm", "install"], input: {} },
                  { $proc: ["pnpm", "run"], input: { script: "build" } },
                ],
              },
            },
          ],
        },
      };

      await executeAggregation(refreshPattern, { force: true }, client);

      expect(client.getCallsFor(["fs", "rm"])).toHaveLength(2);
      expect(client.getCallsFor(["pnpm", "install"])).toHaveLength(1);
      expect(client.getCallsFor(["pnpm", "run"])).toHaveLength(1);
    });

    it("install pattern with clone-if-missing and build", async () => {
      client.mockResponse(["fs", "exists"], { output: { exists: false } });
      client.mockResponse(["git", "clone"], { output: { cloned: true } });
      client.mockResponse(["pnpm", "install"], { output: { success: true } });

      const installPattern: AggregationDefinition = {
        $proc: ["client", "chain"],
        input: {
          steps: [
            {
              $proc: ["fs", "exists"],
              $name: "exists",
              input: { path: { $ref: "input.path" } },
            },
            {
              $proc: ["client", "conditional"],
              input: {
                condition: { $ref: "exists.exists", invert: true },
                then: {
                  $proc: ["git", "clone"],
                  input: { url: { $ref: "input.url" }, path: { $ref: "input.path" } },
                },
              },
            },
            {
              $proc: ["pnpm", "install"],
              input: { cwd: { $ref: "input.path" } },
            },
          ],
        },
      };

      await executeAggregation(
        installPattern,
        { path: "/git/new-pkg", url: "git@github.com:user/new-pkg.git" },
        client
      );

      expect(client.getCallsFor(["git", "clone"])).toHaveLength(1);
      expect(client.getCallsFor(["pnpm", "install"])).toHaveLength(1);
    });
  });
});
