/**
 * Procedure Registration for test operations
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { testRun } from "./procedures/test/run.js";
import { testCoverage } from "./procedures/test/coverage.js";
import {
  TestRunInputSchema,
  TestCoverageInputSchema,
  type TestRunInput,
  type TestRunOutput,
  type TestCoverageInput,
  type TestCoverageOutput,
} from "./types.js";

// Minimal schema adapter
interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

// Procedure definitions
const testRunProcedure = createProcedure()
  .path(["test", "run"])
  .input(zodAdapter<TestRunInput>(TestRunInputSchema))
  .output(outputSchema<TestRunOutput>())
  .meta({
    description: "Run tests for a package",
    args: [],
    shorts: { cwd: "C", watch: "w", coverage: "c", pattern: "p" },
    output: "json",
  })
  .handler(async (input: TestRunInput, ctx): Promise<TestRunOutput> => {
    return testRun(input, ctx);
  })
  .build();

const testCoverageProcedure = createProcedure()
  .path(["test", "coverage"])
  .input(zodAdapter<TestCoverageInput>(TestCoverageInputSchema))
  .output(outputSchema<TestCoverageOutput>())
  .meta({
    description: "Run tests with coverage reporting",
    args: [],
    shorts: { cwd: "C", pattern: "p", threshold: "t" },
    output: "json",
  })
  .handler(async (input: TestCoverageInput, ctx): Promise<TestCoverageOutput> => {
    return testCoverage(input, ctx);
  })
  .build();

export function registerTestProcedures(): void {
  registerProcedures([
    testRunProcedure,
    testCoverageProcedure,
  ]);
}

// Auto-register
registerTestProcedures();
