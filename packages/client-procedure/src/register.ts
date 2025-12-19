/**
 * Procedure Registration for procedure operations
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/index.js";
import {
  ProcedureNewInputSchema,
  type ProcedureNewInput,
  type ProcedureNewOutput,
} from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

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

// procedure.new procedure
const procedureNewProcedure = createProcedure()
  .path(["procedure", "new"])
  .input(zodAdapter<ProcedureNewInput>(ProcedureNewInputSchema))
  .output(outputSchema<ProcedureNewOutput>())
  .meta({
    description: "Scaffold a new procedure",
    args: ["name"],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: ProcedureNewInput, ctx: ProcedureContext): Promise<ProcedureNewOutput> => {
    return procedureNew(input, ctx);
  })
  .build();

export function registerProcedureProcedures(): void {
  registerProcedures([
    procedureNewProcedure,
  ]);
}

// Auto-register
registerProcedureProcedures();
