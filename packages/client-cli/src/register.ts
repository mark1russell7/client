/**
 * Procedure Registration for CLI operations
 *
 * NOTE: lib.* procedures are now registered by client-lib (their canonical home).
 * This file only registers procedure.* and dag.* procedures.
 * TODO: Move procedure.* to client-procedure and dag.* to client-dag.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/new.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import { dagTraverse } from "./procedures/dag/traverse.js";
import {
  ProcedureNewInputSchema,
  type ProcedureNewInput,
  type ProcedureNewOutput,
  DagTraverseInputSchema,
  type DagTraverseInput,
  type DagTraverseOutput,
} from "./types.js";

// =============================================================================
// Minimal Schema Adapter (wraps Zod for client procedure system)
// =============================================================================

interface ZodErrorLike {
  message: string;
  errors: Array<{ path: (string | number)[]; message: string }>;
}

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: ZodErrorLike };
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
// Procedure Procedure Schemas
// =============================================================================

const procedureNewInputSchema = zodAdapter<ProcedureNewInput>(ProcedureNewInputSchema);
const procedureNewOutputSchema = outputSchema<ProcedureNewOutput>();

// =============================================================================
// Procedure Procedure Definitions
// =============================================================================

const procedureNewProcedure = createProcedure()
  .path(["procedure", "new"])
  .input(procedureNewInputSchema)
  .output(procedureNewOutputSchema)
  .meta({
    description: "Scaffold a new procedure with types and registration boilerplate",
    args: ["name"],
    shorts: { namespace: "n", description: "d", path: "p", dryRun: "D" },
    output: "text",
  })
  .handler(async (input: ProcedureNewInput, ctx): Promise<ProcedureNewOutput> => {
    return procedureNew(input, ctx);
  })
  .build();

// =============================================================================
// DAG Procedure Schemas
// =============================================================================

const dagTraverseInputSchema = zodAdapter<DagTraverseInput>(DagTraverseInputSchema);
const dagTraverseOutputSchema = outputSchema<DagTraverseOutput>();

// =============================================================================
// DAG Procedure Definitions
// =============================================================================

const dagTraverseProcedure = createProcedure()
  .path(["dag", "traverse"])
  .input(dagTraverseInputSchema)
  .output(dagTraverseOutputSchema)
  .meta({
    description: "Traverse ecosystem packages in dependency order, executing visit procedure for each",
    args: [],
    shorts: { root: "r", concurrency: "j", continueOnError: "c", dryRun: "d" },
    output: "streaming",
  })
  .handler(async (input: DagTraverseInput, ctx): Promise<DagTraverseOutput> => {
    return dagTraverse(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerCliProcedures(): void {
  // NOTE: lib.* procedures are registered by client-lib (proper owner).
  registerProcedures([
    // procedure procedures
    procedureNewProcedure,
    ...procedureRegistryProcedures,
    // dag procedures
    dagTraverseProcedure,
  ]);
}

// Auto-register when this module is loaded
registerCliProcedures();
