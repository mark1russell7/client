/**
 * Procedure Registration for CLI operations
 *
 * Registers lib.scan, lib.refresh procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { libScan } from "./procedures/lib/scan.js";
import { libRefresh } from "./procedures/lib/refresh.js";
import { libRename, LibRenameInputSchema } from "./procedures/lib/rename.js";
import {
  LibScanInputSchema,
  LibRefreshInputSchema,
  type LibScanInput,
  type LibScanOutput,
  type LibRefreshInput,
  type LibRefreshOutput,
  type LibRenameInput,
  type LibRenameOutput,
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
// Schemas
// =============================================================================

const libScanInputSchema = zodAdapter<LibScanInput>(LibScanInputSchema);
const libScanOutputSchema = outputSchema<LibScanOutput>();
const libRefreshInputSchema = zodAdapter<LibRefreshInput>(LibRefreshInputSchema);
const libRefreshOutputSchema = outputSchema<LibRefreshOutput>();

// =============================================================================
// Procedure Definitions
// =============================================================================

const libScanProcedure = createProcedure()
  .path(["lib", "scan"])
  .input(libScanInputSchema)
  .output(libScanOutputSchema)
  .meta({ description: "Scan ~/git for packages and build package-to-repo mapping" })
  .handler(async (input: LibScanInput): Promise<LibScanOutput> => {
    return libScan(input);
  })
  .build();

const libRefreshProcedure = createProcedure()
  .path(["lib", "refresh"])
  .input(libRefreshInputSchema)
  .output(libRefreshOutputSchema)
  .meta({
    description:
      "Refresh a library (clean, install, build, commit). Use --recursive for dependencies.",
  })
  .handler(async (input: LibRefreshInput): Promise<LibRefreshOutput> => {
    return libRefresh(input);
  })
  .build();

const libRenameInputSchema = zodAdapter<LibRenameInput>(LibRenameInputSchema);
const libRenameOutputSchema = outputSchema<LibRenameOutput>();

const libRenameProcedure = createProcedure()
  .path(["lib", "rename"])
  .input(libRenameInputSchema)
  .output(libRenameOutputSchema)
  .meta({
    description:
      "Rename a package across the codebase using ts-morph for AST-based import updates.",
  })
  .handler(async (input: LibRenameInput): Promise<LibRenameOutput> => {
    return libRename(input);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerCliProcedures(): void {
  registerProcedures([libScanProcedure, libRefreshProcedure, libRenameProcedure]);
}

// Auto-register when this module is loaded
registerCliProcedures();
