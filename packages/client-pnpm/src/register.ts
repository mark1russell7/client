/**
 * Procedure Registration for pnpm operations
 *
 * Provides pnpm.install, pnpm.add, pnpm.remove, pnpm.link, pnpm.run procedures.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { pnpmInstall, pnpmAdd, pnpmRemove, pnpmLink, pnpmRun } from "./procedures/pnpm/index.js";
import {
  PnpmInstallInputSchema,
  PnpmAddInputSchema,
  PnpmRemoveInputSchema,
  PnpmLinkInputSchema,
  PnpmRunInputSchema,
  type PnpmInstallInput,
  type PnpmAddInput,
  type PnpmRemoveInput,
  type PnpmLinkInput,
  type PnpmRunInput,
  type PnpmCommandOutput,
} from "./types.js";
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
// Procedures
// =============================================================================

const pnpmInstallProcedure = createProcedure()
  .path(["pnpm", "install"])
  .input(zodAdapter<PnpmInstallInput>(PnpmInstallInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Install packages using pnpm",
    shorts: { cwd: "C", dev: "D", frozen: "F" },
    output: "json",
  })
  .handler(async (input: PnpmInstallInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmInstall(input, ctx);
  })
  .build();

const pnpmAddProcedure = createProcedure()
  .path(["pnpm", "add"])
  .input(zodAdapter<PnpmAddInput>(PnpmAddInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Add packages using pnpm",
    args: ["packages"],
    shorts: { cwd: "C", dev: "D", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmAddInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmAdd(input, ctx);
  })
  .build();

const pnpmRemoveProcedure = createProcedure()
  .path(["pnpm", "remove"])
  .input(zodAdapter<PnpmRemoveInput>(PnpmRemoveInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Remove packages using pnpm",
    args: ["packages"],
    shorts: { cwd: "C", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmRemoveInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmRemove(input, ctx);
  })
  .build();

const pnpmLinkProcedure = createProcedure()
  .path(["pnpm", "link"])
  .input(zodAdapter<PnpmLinkInput>(PnpmLinkInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Link packages using pnpm",
    shorts: { cwd: "C", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmLinkInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmLink(input, ctx);
  })
  .build();

const pnpmRunProcedure = createProcedure()
  .path(["pnpm", "run"])
  .input(zodAdapter<PnpmRunInput>(PnpmRunInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Run package scripts using pnpm",
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: PnpmRunInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmRun(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerPnpmProcedures(): void {
  registerProcedures([
    pnpmInstallProcedure,
    pnpmAddProcedure,
    pnpmRemoveProcedure,
    pnpmLinkProcedure,
    pnpmRunProcedure,
  ]);
}

// Auto-register
registerPnpmProcedures();
