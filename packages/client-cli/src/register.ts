/**
 * Procedure Registration for CLI operations
 *
 * Provides cli.run procedure for calling mark CLI commands via client-shell.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { cliRun } from "./procedures/cli/index.js";
import { CliRunInputSchema, type CliRunInput, type CliRunOutput } from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

// =============================================================================
// Minimal Schema Adapter
// =============================================================================

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
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

// =============================================================================
// cli.run Procedure
// =============================================================================

const cliRunProcedure = createProcedure()
  .path(["cli", "run"])
  .input(zodAdapter<CliRunInput>(CliRunInputSchema))
  .output(outputSchema<CliRunOutput>())
  .meta({
    description: "Run a mark CLI command",
    args: ["path"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: CliRunInput, ctx: ProcedureContext): Promise<CliRunOutput> => {
    return cliRun(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerCliProcedures(): void {
  registerProcedures([
    cliRunProcedure,
  ]);
}

// Auto-register
registerCliProcedures();
