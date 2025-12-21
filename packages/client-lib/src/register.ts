/**
 * Procedure Registration for lib operations
 *
 * This is the canonical home for lib.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import {
  libScan,
  libRefresh,
  libRename,
  libInstall,
  libNew,
  libAudit,
  libPull,
} from "./procedures/lib/index.js";
import {
  ecosystemProcedures,
  EcosystemProceduresInputSchema,
  type EcosystemProceduresInput,
  type EcosystemProceduresOutput,
} from "./procedures/ecosystem/index.js";
import {
  LibScanInputSchema,
  LibRefreshInputSchema,
  LibRenameInputSchema,
  LibInstallInputSchema,
  LibNewInputSchema,
  LibAuditInputSchema,
  LibPullInputSchema,
  type LibScanInput,
  type LibScanOutput,
  type LibRefreshInput,
  type LibRefreshOutput,
  type LibRenameInput,
  type LibRenameOutput,
  type LibInstallInput,
  type LibInstallOutput,
  type LibNewInput,
  type LibNewOutput,
  type LibAuditInput,
  type LibAuditOutput,
  type LibPullInput,
  type LibPullOutput,
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

// =============================================================================
// lib.* Procedures
// =============================================================================

const libScanProcedure = createProcedure()
  .path(["lib", "scan"])
  .input(zodAdapter<LibScanInput>(LibScanInputSchema))
  .output(outputSchema<LibScanOutput>())
  .meta({
    description: "Scan for packages in the git directory",
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: LibScanInput, ctx: ProcedureContext): Promise<LibScanOutput> => {
    return libScan(input, ctx);
  })
  .build();

const libRefreshProcedure = createProcedure()
  .path(["lib", "refresh"])
  .input(zodAdapter<LibRefreshInput>(LibRefreshInputSchema))
  .output(outputSchema<LibRefreshOutput>())
  .meta({
    description: "Refresh a package (install, build, commit, push)",
    args: ["path"],
    shorts: { recursive: "r", all: "a", force: "f", dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibRefreshInput, ctx: ProcedureContext): Promise<LibRefreshOutput> => {
    return libRefresh(input, ctx);
  })
  .build();

const libRenameProcedure = createProcedure()
  .path(["lib", "rename"])
  .input(zodAdapter<LibRenameInput>(LibRenameInputSchema))
  .output(outputSchema<LibRenameOutput>())
  .meta({
    description: "Rename a package across the ecosystem",
    args: ["oldName", "newName"],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibRenameInput, ctx: ProcedureContext): Promise<LibRenameOutput> => {
    return libRename(input, ctx);
  })
  .build();

const libInstallProcedure = createProcedure()
  .path(["lib", "install"])
  .input(zodAdapter<LibInstallInput>(LibInstallInputSchema))
  .output(outputSchema<LibInstallOutput>())
  .meta({
    description: "Install the entire ecosystem from manifest",
    args: [],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibInstallInput, ctx: ProcedureContext): Promise<LibInstallOutput> => {
    return libInstall(input, ctx);
  })
  .build();

const libNewProcedure = createProcedure()
  .path(["lib", "new"])
  .input(zodAdapter<LibNewInput>(LibNewInputSchema))
  .output(outputSchema<LibNewOutput>())
  .meta({
    description: "Create a new package in the ecosystem",
    args: ["name"],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibNewInput, ctx: ProcedureContext): Promise<LibNewOutput> => {
    return libNew(input, ctx);
  })
  .build();

const libAuditProcedure = createProcedure()
  .path(["lib", "audit"])
  .input(zodAdapter<LibAuditInput>(LibAuditInputSchema))
  .output(outputSchema<LibAuditOutput>())
  .meta({
    description: "Audit ecosystem packages for issues",
    args: [],
    shorts: { fix: "f" },
    output: "json",
  })
  .handler(async (input: LibAuditInput, ctx: ProcedureContext): Promise<LibAuditOutput> => {
    return libAudit(input, ctx);
  })
  .build();

const libPullProcedure = createProcedure()
  .path(["lib", "pull"])
  .input(zodAdapter<LibPullInput>(LibPullInputSchema))
  .output(outputSchema<LibPullOutput>())
  .meta({
    description: "Pull from remote for all packages",
    args: [],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibPullInput, ctx: ProcedureContext): Promise<LibPullOutput> => {
    return libPull(input, ctx);
  })
  .build();

// =============================================================================
// ecosystem.* Procedures
// =============================================================================

const ecosystemProceduresProcedure = createProcedure()
  .path(["ecosystem", "procedures"])
  .input(zodAdapter<EcosystemProceduresInput>(EcosystemProceduresInputSchema))
  .output(outputSchema<EcosystemProceduresOutput>())
  .meta({
    description: "List all procedures across the ecosystem",
    args: [],
    shorts: { namespace: "n" },
    output: "json",
  })
  .handler(async (input: EcosystemProceduresInput, ctx: ProcedureContext): Promise<EcosystemProceduresOutput> => {
    return ecosystemProcedures(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerLibProcedures(): void {
  registerProcedures([
    // lib.* procedures (canonical home)
    libScanProcedure,
    libRefreshProcedure,
    libRenameProcedure,
    libInstallProcedure,
    libNewProcedure,
    libAuditProcedure,
    libPullProcedure,
    // ecosystem.* procedures
    ecosystemProceduresProcedure,
  ]);
}

// Auto-register
registerLibProcedures();
