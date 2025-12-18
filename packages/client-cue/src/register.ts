/**
 * Procedure Registration for cue operations
 *
 * Registers cue.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { cueInit } from "./procedures/cue/init.js";
import { cueAdd } from "./procedures/cue/add.js";
import { cueRemove } from "./procedures/cue/remove.js";
import { cueGenerate } from "./procedures/cue/generate.js";
import { cueValidate } from "./procedures/cue/validate.js";
import {
  CueInitInputSchema,
  CueAddInputSchema,
  CueRemoveInputSchema,
  CueGenerateInputSchema,
  CueValidateInputSchema,
  type CueInitInput,
  type CueInitOutput,
  type CueAddInput,
  type CueAddOutput,
  type CueRemoveInput,
  type CueRemoveOutput,
  type CueGenerateInput,
  type CueGenerateOutput,
  type CueValidateInput,
  type CueValidateOutput,
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
// Procedure Definitions
// =============================================================================

const cueInitProcedure = createProcedure()
  .path(["cue", "init"])
  .input(zodAdapter<CueInitInput>(CueInitInputSchema))
  .output(outputSchema<CueInitOutput>())
  .meta({
    description: "Initialize dependencies.json with a preset",
    args: [],
    shorts: { preset: "p", force: "f", cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueInitInput, ctx): Promise<CueInitOutput> => {
    return cueInit(input, ctx);
  })
  .build();

const cueAddProcedure = createProcedure()
  .path(["cue", "add"])
  .input(zodAdapter<CueAddInput>(CueAddInputSchema))
  .output(outputSchema<CueAddOutput>())
  .meta({
    description: "Add a feature to dependencies.json",
    args: ["feature"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueAddInput, ctx): Promise<CueAddOutput> => {
    return cueAdd(input, ctx);
  })
  .build();

const cueRemoveProcedure = createProcedure()
  .path(["cue", "remove"])
  .input(zodAdapter<CueRemoveInput>(CueRemoveInputSchema))
  .output(outputSchema<CueRemoveOutput>())
  .meta({
    description: "Remove a feature from dependencies.json",
    args: ["feature"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueRemoveInput, ctx): Promise<CueRemoveOutput> => {
    return cueRemove(input, ctx);
  })
  .build();

const cueGenerateProcedure = createProcedure()
  .path(["cue", "generate"])
  .input(zodAdapter<CueGenerateInput>(CueGenerateInputSchema))
  .output(outputSchema<CueGenerateOutput>())
  .meta({
    description: "Generate config files from dependencies.json",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueGenerateInput, ctx): Promise<CueGenerateOutput> => {
    return cueGenerate(input, ctx);
  })
  .build();

const cueValidateProcedure = createProcedure()
  .path(["cue", "validate"])
  .input(zodAdapter<CueValidateInput>(CueValidateInputSchema))
  .output(outputSchema<CueValidateOutput>())
  .meta({
    description: "Validate dependencies.json",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueValidateInput, ctx): Promise<CueValidateOutput> => {
    return cueValidate(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerCueProcedures(): void {
  registerProcedures([
    cueInitProcedure,
    cueAddProcedure,
    cueRemoveProcedure,
    cueGenerateProcedure,
    cueValidateProcedure,
  ]);
}

// Auto-register when this module is loaded
registerCueProcedures();
