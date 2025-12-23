/**
 * Integration tests for aggregation workflows
 *
 * Tests full aggregation scenarios with chain, conditional, and $ref resolution.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { chainProcedure, conditionalProcedure } from "./index.js";
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

describe("aggregation integration tests", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    mockClient = createTestMockClient();
    ctx = {
      client: mockClient as any,
      metadata: {},
      path: ["test", "integration"],
    };
  });

  describe("chain with conditional", () => {
    it("executes conditional branch based on predicate result", async () => {
      // Setup: git.hasChanges returns { value: true }
      mockClient.mockResponse(["git", "hasChanges"], { output: { value: true } });
      mockClient.mockResponse(["git", "add"], { output: { staged: 5 } });

      // First run the chain that includes a conditional
      const chainResult = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["git", "hasChanges"], input: {}, $name: "changes" },
          ],
        },
        ctx
      );

      // Now run the conditional with the result
      const condResult = await conditionalProcedure.handler(
        {
          condition: chainResult.results[0], // { value: true }
          then: { $proc: ["git", "add"], input: { all: true } },
          else: "no changes",
        },
        ctx
      );

      expect(condResult).toEqual({ staged: 5 });
      expect(mockClient.getCallsFor(["git", "add"])).toHaveLength(1);
    });

    it("skips branch when predicate returns false", async () => {
      mockClient.mockResponse(["git", "hasChanges"], { output: { value: false } });

      const chainResult = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["git", "hasChanges"], input: {}, $name: "changes" },
          ],
        },
        ctx
      );

      const condResult = await conditionalProcedure.handler(
        {
          condition: chainResult.results[0], // { value: false }
          then: { $proc: ["git", "add"], input: { all: true } },
          else: { skipped: true, reason: "no changes" },
        },
        ctx
      );

      expect(condResult).toEqual({ skipped: true, reason: "no changes" });
      expect(mockClient.getCallsFor(["git", "add"])).toHaveLength(0);
    });
  });

  describe("chain with $ref for data flow", () => {
    it("passes data between steps using $ref", async () => {
      // Step 1: Get list of items
      mockClient.mockResponse(["api", "getItems"], {
        output: { items: ["a", "b", "c"], count: 3 },
      });

      // Step 2: Process items (receives the items from step 1)
      mockClient.mockImplementation(["api", "processItems"], (input: any) => {
        return {
          processed: input.items.map((i: string) => i.toUpperCase()),
          original: input.items,
        };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["api", "getItems"], input: {}, $name: "fetch" },
            {
              $proc: ["api", "processItems"],
              input: { items: { $ref: "fetch.items" } },
            },
          ],
        },
        ctx
      );

      expect(result.results[0]).toEqual({ items: ["a", "b", "c"], count: 3 });
      expect(result.results[1]).toEqual({
        processed: ["A", "B", "C"],
        original: ["a", "b", "c"],
      });
    });

    it("chains multiple $ref dependencies", async () => {
      mockClient.mockResponse(["user", "get"], {
        output: { id: 1, name: "Alice" },
      });
      mockClient.mockResponse(["user", "getSettings"], {
        output: { theme: "dark", language: "en" },
      });
      mockClient.mockImplementation(["email", "send"], (input: any) => {
        return {
          to: input.userName,
          theme: input.userTheme,
          sent: true,
        };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["user", "get"], input: {}, $name: "user" },
            { $proc: ["user", "getSettings"], input: {}, $name: "settings" },
            {
              $proc: ["email", "send"],
              input: {
                userName: { $ref: "user.name" },
                userTheme: { $ref: "settings.theme" },
              },
            },
          ],
        },
        ctx
      );

      expect(result.final).toEqual({
        to: "Alice",
        theme: "dark",
        sent: true,
      });
    });

    it("resolves $last for sequential data flow", async () => {
      mockClient.mockResponse(["math", "add"], { output: { result: 10 } });
      mockClient.mockImplementation(["math", "multiply"], (input: any) => {
        return { result: input.value * 2 };
      });
      mockClient.mockImplementation(["math", "subtract"], (input: any) => {
        return { result: input.value - 5 };
      });

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["math", "add"], input: { a: 5, b: 5 } }, // 10
            {
              $proc: ["math", "multiply"],
              input: { value: { $ref: "$last.result" } },
            }, // 20
            {
              $proc: ["math", "subtract"],
              input: { value: { $ref: "$last.result" } },
            }, // 15
          ],
        },
        ctx
      );

      expect(result.results[0]).toEqual({ result: 10 });
      expect(result.results[1]).toEqual({ result: 20 });
      expect(result.results[2]).toEqual({ result: 15 });
    });
  });

  describe("cwd propagation through aggregations", () => {
    it("propagates cwd through chain to conditional to action", async () => {
      const capturedInputs: any[] = [];

      mockClient.mockImplementation(["git", "hasChanges"], (input: any) => {
        capturedInputs.push({ proc: "hasChanges", ...input });
        return { value: true };
      });

      mockClient.mockImplementation(["git", "add"], (input: any) => {
        capturedInputs.push({ proc: "add", ...input });
        return { staged: 1 };
      });

      // Simulate what dag.traverse does - calls chain with cwd
      const chainResult = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["git", "hasChanges"], input: {}, $name: "changes" },
          ],
          cwd: "/repos/my-project",
        } as any,
        ctx
      );

      // Then conditional with the result
      await conditionalProcedure.handler(
        {
          condition: chainResult.results[0],
          then: { $proc: ["git", "add"], input: { all: true } },
          cwd: "/repos/my-project",
        } as any,
        ctx
      );

      expect(capturedInputs[0]).toEqual({
        proc: "hasChanges",
        cwd: "/repos/my-project",
      });
      expect(capturedInputs[1]).toEqual({
        proc: "add",
        all: true,
        cwd: "/repos/my-project",
      });
    });
  });

  describe("real-world workflow patterns", () => {
    it("simulates pnpm install -> git add -> git commit flow", async () => {
      const executionLog: string[] = [];

      mockClient.mockImplementation(["pnpm", "install"], (input: any) => {
        executionLog.push(`pnpm install in ${input.cwd}`);
        return { installed: true, packageCount: 5 };
      });

      mockClient.mockImplementation(["git", "hasChanges"], (input: any) => {
        executionLog.push(`git hasChanges in ${input.cwd}`);
        return { value: true }; // pnpm install made changes
      });

      mockClient.mockImplementation(["git", "add"], (input: any) => {
        executionLog.push(`git add in ${input.cwd}`);
        return { staged: 3 };
      });

      mockClient.mockImplementation(["git", "commit"], (input: any) => {
        executionLog.push(`git commit in ${input.cwd}: ${input.message}`);
        return { sha: "abc123" };
      });

      // Run pnpm install first
      const installResult = await chainProcedure.handler(
        {
          steps: [{ $proc: ["pnpm", "install"], input: {} }],
          cwd: "/project",
        } as any,
        ctx
      );

      // Check for changes
      const changesResult = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["git", "hasChanges"], input: {}, $name: "changes" },
          ],
          cwd: "/project",
        } as any,
        ctx
      );

      // If changes, stage and commit
      if ((changesResult.results[0] as any).value) {
        await chainProcedure.handler(
          {
            steps: [
              { $proc: ["git", "add"], input: { all: true } },
              {
                $proc: ["git", "commit"],
                input: { message: "chore: update dependencies" },
              },
            ],
            cwd: "/project",
          } as any,
          ctx
        );
      }

      expect(executionLog).toEqual([
        "pnpm install in /project",
        "git hasChanges in /project",
        "git add in /project",
        "git commit in /project: chore: update dependencies",
      ]);
    });

    it("simulates conditional git push based on hasLocalCommits", async () => {
      const executionLog: string[] = [];

      mockClient.mockImplementation(["git", "hasLocalCommits"], (input: any) => {
        executionLog.push("check local commits");
        return { value: true };
      });

      mockClient.mockImplementation(["git", "push"], (input: any) => {
        executionLog.push("push to remote");
        return { pushed: true };
      });

      mockClient.mockImplementation(["client", "identity"], (input: any) => {
        executionLog.push("skip push");
        return input.value;
      });

      // Check if we have local commits
      const checkResult = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["git", "hasLocalCommits"], input: {}, $name: "local" },
          ],
        },
        ctx
      );

      // Conditionally push
      const pushResult = await conditionalProcedure.handler(
        {
          condition: checkResult.results[0],
          then: { $proc: ["git", "push"], input: {} },
          else: { $proc: ["client", "identity"], input: { value: "nothing to push" } },
        },
        ctx
      );

      expect(executionLog).toEqual(["check local commits", "push to remote"]);
      expect(pushResult).toEqual({ pushed: true });
    });

    it("handles nested conditionals", async () => {
      mockClient.mockResponse(["check", "isProduction"], { output: { value: true } });
      mockClient.mockResponse(["check", "hasTests"], { output: { value: true } });
      mockClient.mockResponse(["deploy", "production"], { output: { deployed: true } });

      // Check if production
      const isProdResult = await chainProcedure.handler(
        {
          steps: [{ $proc: ["check", "isProduction"], input: {} }],
        },
        ctx
      );

      if ((isProdResult.results[0] as any).value) {
        // In production, check if tests pass
        const hasTestsResult = await chainProcedure.handler(
          {
            steps: [{ $proc: ["check", "hasTests"], input: {} }],
          },
          ctx
        );

        const deployResult = await conditionalProcedure.handler(
          {
            condition: hasTestsResult.results[0],
            then: { $proc: ["deploy", "production"], input: {} },
            else: { error: "Tests must pass for production deploy" },
          },
          ctx
        );

        expect(deployResult).toEqual({ deployed: true });
      }
    });
  });

  describe("error handling in aggregations", () => {
    it("stops chain execution on error", async () => {
      const executionLog: string[] = [];

      mockClient.mockImplementation(["step", "one"], () => {
        executionLog.push("step 1");
        return { ok: true };
      });

      mockClient.mockResponse(["step", "two"], {
        error: new Error("Step 2 failed"),
      });

      mockClient.mockImplementation(["step", "three"], () => {
        executionLog.push("step 3");
        return { ok: true };
      });

      await expect(
        chainProcedure.handler(
          {
            steps: [
              { $proc: ["step", "one"], input: {} },
              { $proc: ["step", "two"], input: {} },
              { $proc: ["step", "three"], input: {} },
            ],
          },
          ctx
        )
      ).rejects.toThrow("Step 2 failed");

      expect(executionLog).toEqual(["step 1"]);
    });

    it("handles error in conditional branch", async () => {
      mockClient.mockResponse(["action", "fail"], {
        error: new Error("Action failed"),
      });

      await expect(
        conditionalProcedure.handler(
          {
            condition: true,
            then: { $proc: ["action", "fail"], input: {} },
          },
          ctx
        )
      ).rejects.toThrow("Action failed");
    });
  });

  describe("complex $ref patterns", () => {
    it("handles multiple steps referencing same named output", async () => {
      mockClient.mockResponse(["data", "get"], {
        output: { id: 1, name: "Test", items: [1, 2, 3] },
      });

      mockClient.mockImplementation(["process", "id"], (input: any) => ({
        processedId: input.id * 100,
      }));

      mockClient.mockImplementation(["process", "name"], (input: any) => ({
        processedName: input.name.toUpperCase(),
      }));

      mockClient.mockImplementation(["process", "items"], (input: any) => ({
        itemCount: input.items.length,
      }));

      const result = await chainProcedure.handler(
        {
          steps: [
            { $proc: ["data", "get"], input: {}, $name: "source" },
            {
              $proc: ["process", "id"],
              input: { id: { $ref: "source.id" } },
              $name: "idResult",
            },
            {
              $proc: ["process", "name"],
              input: { name: { $ref: "source.name" } },
              $name: "nameResult",
            },
            {
              $proc: ["process", "items"],
              input: { items: { $ref: "source.items" } },
              $name: "itemsResult",
            },
          ],
        },
        ctx
      );

      expect(result.results[1]).toEqual({ processedId: 100 });
      expect(result.results[2]).toEqual({ processedName: "TEST" });
      expect(result.results[3]).toEqual({ itemCount: 3 });
    });

    it("handles $ref in conditional branches", async () => {
      mockClient.mockResponse(["user", "get"], {
        output: { name: "Alice", role: "admin" },
      });

      mockClient.mockImplementation(["admin", "panel"], (input: any) => ({
        welcomeAdmin: input.userName,
      }));

      mockClient.mockImplementation(["user", "panel"], (input: any) => ({
        welcomeUser: input.userName,
      }));

      // First get user
      const userResult = await chainProcedure.handler(
        {
          steps: [{ $proc: ["user", "get"], input: {}, $name: "user" }],
        },
        ctx
      );

      const user = userResult.results[0] as { name: string; role: string };

      // Then route based on role
      const panelResult = await conditionalProcedure.handler(
        {
          condition: user.role === "admin",
          then: { $proc: ["admin", "panel"], input: { userName: user.name } },
          else: { $proc: ["user", "panel"], input: { userName: user.name } },
        },
        ctx
      );

      expect(panelResult).toEqual({ welcomeAdmin: "Alice" });
    });
  });
});
