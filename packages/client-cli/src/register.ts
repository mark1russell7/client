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
import { libInstall } from "./procedures/lib/install.js";
import { libNew } from "./procedures/lib/new.js";
import { libAudit } from "./procedures/lib/audit.js";
import { procedureNew } from "./procedures/procedure/new.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import {
  configInit,
  configAdd,
  configRemove,
  configGenerate,
  configValidate,
} from "./procedures/config/index.js";
import {
  LibScanInputSchema,
  LibRefreshInputSchema,
  LibInstallInputSchema,
  LibNewInputSchema,
  LibAuditInputSchema,
  ConfigInitInputSchema,
  ConfigAddInputSchema,
  ConfigRemoveInputSchema,
  ConfigGenerateInputSchema,
  ConfigValidateInputSchema,
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
  type ConfigInitInput,
  type ConfigInitOutput,
  type ConfigAddInput,
  type ConfigAddOutput,
  type ConfigRemoveInput,
  type ConfigRemoveOutput,
  type ConfigGenerateInput,
  type ConfigGenerateOutput,
  type ConfigValidateInput,
  type ConfigValidateOutput,
  ProcedureNewInputSchema,
  type ProcedureNewInput,
  type ProcedureNewOutput,
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
  .meta({
    description: "Scan ~/git for packages and build package-to-repo mapping",
    args: ["rootPath"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: LibScanInput, ctx): Promise<LibScanOutput> => {
    return libScan(input, ctx);
  })
  .build();

const libRefreshProcedure = createProcedure()
  .path(["lib", "refresh"])
  .input(libRefreshInputSchema)
  .output(libRefreshOutputSchema)
  .meta({
    description: "Refresh a library (install, build, commit). Use -f for full cleanup, -d for dry-run.",
    args: ["path"],
    shorts: {
      recursive: "r",
      all: "a",
      force: "f",
      skipGit: "g",
      autoConfirm: "y",
      dryRun: "d",
    },
    output: "streaming",
  })
  .handler(async (input: LibRefreshInput, ctx): Promise<LibRefreshOutput> => {
    return libRefresh(input, ctx);
  })
  .build();

const libRenameInputSchema = zodAdapter<LibRenameInput>(LibRenameInputSchema);
const libRenameOutputSchema = outputSchema<LibRenameOutput>();

const libRenameProcedure = createProcedure()
  .path(["lib", "rename"])
  .input(libRenameInputSchema)
  .output(libRenameOutputSchema)
  .meta({
    description: "Rename a package across the codebase (AST-based import updates)",
    args: ["oldName", "newName"],
    shorts: { rootPath: "r", dryRun: "d" },
    output: "text",
  })
  .handler(async (input: LibRenameInput, ctx): Promise<LibRenameOutput> => {
    return libRename(input, ctx);
  })
  .build();

const libInstallInputSchema = zodAdapter<LibInstallInput>(LibInstallInputSchema);
const libInstallOutputSchema = outputSchema<LibInstallOutput>();

const libInstallProcedure = createProcedure()
  .path(["lib", "install"])
  .input(libInstallInputSchema)
  .output(libInstallOutputSchema)
  .meta({
    description: "Install ecosystem from manifest (clone, install, build in DAG order)",
    args: [],
    shorts: { rootPath: "r", dryRun: "d", continueOnError: "c", concurrency: "j" },
    output: "streaming",
  })
  .handler(async (input: LibInstallInput, ctx): Promise<LibInstallOutput> => {
    return libInstall(input, ctx);
  })
  .build();

const libNewInputSchema = zodAdapter<LibNewInput>(LibNewInputSchema);
const libNewOutputSchema = outputSchema<LibNewOutput>();

const libNewProcedure = createProcedure()
  .path(["lib", "new"])
  .input(libNewInputSchema)
  .output(libNewOutputSchema)
  .meta({
    description: "Create a new package with standard ecosystem structure",
    args: ["name"],
    shorts: { preset: "p", skipGit: "g", skipManifest: "m", dryRun: "d" },
    output: "text",
  })
  .handler(async (input: LibNewInput, ctx): Promise<LibNewOutput> => {
    return libNew(input, ctx);
  })
  .build();

const libAuditInputSchema = zodAdapter<LibAuditInput>(LibAuditInputSchema);
const libAuditOutputSchema = outputSchema<LibAuditOutput>();

const libAuditProcedure = createProcedure()
  .path(["lib", "audit"])
  .input(libAuditInputSchema)
  .output(libAuditOutputSchema)
  .meta({
    description: "Audit all packages against ecosystem projectTemplate",
    args: [],
    shorts: { rootPath: "r", fix: "f" },
    output: "json",
  })
  .handler(async (input: LibAuditInput, ctx): Promise<LibAuditOutput> => {
    return libAudit(input, ctx);
  })
  .build();

// =============================================================================
// Config Procedure Schemas
// =============================================================================

const configInitInputSchema = zodAdapter<ConfigInitInput>(ConfigInitInputSchema);
const configInitOutputSchema = outputSchema<ConfigInitOutput>();

const configAddInputSchema = zodAdapter<ConfigAddInput>(ConfigAddInputSchema);
const configAddOutputSchema = outputSchema<ConfigAddOutput>();

const configRemoveInputSchema = zodAdapter<ConfigRemoveInput>(ConfigRemoveInputSchema);
const configRemoveOutputSchema = outputSchema<ConfigRemoveOutput>();

const configGenerateInputSchema = zodAdapter<ConfigGenerateInput>(ConfigGenerateInputSchema);
const configGenerateOutputSchema = outputSchema<ConfigGenerateOutput>();

const configValidateInputSchema = zodAdapter<ConfigValidateInput>(ConfigValidateInputSchema);
const configValidateOutputSchema = outputSchema<ConfigValidateOutput>();

// =============================================================================
// Config Procedure Definitions
// =============================================================================

const configInitProcedure = createProcedure()
  .path(["config", "init"])
  .input(configInitInputSchema)
  .output(configInitOutputSchema)
  .meta({
    description: "Initialize project with dependencies.json using a preset",
    args: [],
    shorts: { preset: "p", force: "f" },
    output: "text",
  })
  .handler(async (input: ConfigInitInput, ctx): Promise<ConfigInitOutput> => {
    return configInit(input, ctx);
  })
  .build();

const configAddProcedure = createProcedure()
  .path(["config", "add"])
  .input(configAddInputSchema)
  .output(configAddOutputSchema)
  .meta({
    description: "Add a feature to dependencies.json",
    args: ["feature"],
    shorts: {},
    output: "text",
  })
  .handler(async (input: ConfigAddInput): Promise<ConfigAddOutput> => {
    return configAdd(input);
  })
  .build();

const configRemoveProcedure = createProcedure()
  .path(["config", "remove"])
  .input(configRemoveInputSchema)
  .output(configRemoveOutputSchema)
  .meta({
    description: "Remove a feature from dependencies.json",
    args: ["feature"],
    shorts: {},
    output: "text",
  })
  .handler(async (input: ConfigRemoveInput): Promise<ConfigRemoveOutput> => {
    return configRemove(input);
  })
  .build();

const configGenerateProcedure = createProcedure()
  .path(["config", "generate"])
  .input(configGenerateInputSchema)
  .output(configGenerateOutputSchema)
  .meta({
    description: "Generate package.json, tsconfig.json from dependencies.json",
    args: [],
    shorts: {},
    output: "text",
  })
  .handler(async (input: ConfigGenerateInput, ctx): Promise<ConfigGenerateOutput> => {
    return configGenerate(input, ctx);
  })
  .build();

const configValidateProcedure = createProcedure()
  .path(["config", "validate"])
  .input(configValidateInputSchema)
  .output(configValidateOutputSchema)
  .meta({
    description: "Validate dependencies.json against schema",
    args: [],
    shorts: {},
    output: "text",
  })
  .handler(async (input: ConfigValidateInput, ctx): Promise<ConfigValidateOutput> => {
    return configValidate(input, ctx);
  })
  .build();

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
// Registration
// =============================================================================

export function registerCliProcedures(): void {
  registerProcedures([
    // lib procedures
    libScanProcedure,
    libRefreshProcedure,
    libRenameProcedure,
    libInstallProcedure,
    libNewProcedure,
    libAuditProcedure,
    // config procedures
    configInitProcedure,
    configAddProcedure,
    configRemoveProcedure,
    configGenerateProcedure,
    configValidateProcedure,
    // procedure procedures
    procedureNewProcedure,
    ...procedureRegistryProcedures,
  ]);
}

// Auto-register when this module is loaded
registerCliProcedures();
