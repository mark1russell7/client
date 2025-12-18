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
import { LibScanInputSchema, LibRefreshInputSchema, LibInstallInputSchema, LibNewInputSchema, LibAuditInputSchema, ProcedureNewInputSchema, } from "./types.js";
function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                const parsed = schema.parse(data);
                return { success: true, data: parsed };
            }
            catch (error) {
                const err = error;
                return {
                    success: false,
                    error: {
                        message: err.message ?? "Validation failed",
                        errors: Array.isArray(err.errors)
                            ? err.errors.map((e) => {
                                const errObj = e;
                                return {
                                    path: (errObj.path ?? []),
                                    message: errObj.message ?? "Unknown error",
                                };
                            })
                            : [],
                    },
                };
            }
        },
        _output: undefined,
    };
}
function outputSchema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
// =============================================================================
// Schemas
// =============================================================================
const libScanInputSchema = zodAdapter(LibScanInputSchema);
const libScanOutputSchema = outputSchema();
const libRefreshInputSchema = zodAdapter(LibRefreshInputSchema);
const libRefreshOutputSchema = outputSchema();
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
    .handler(async (input, ctx) => {
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
    .handler(async (input, ctx) => {
    return libRefresh(input, ctx);
})
    .build();
const libRenameInputSchema = zodAdapter(LibRenameInputSchema);
const libRenameOutputSchema = outputSchema();
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
    .handler(async (input, ctx) => {
    return libRename(input, ctx);
})
    .build();
const libInstallInputSchema = zodAdapter(LibInstallInputSchema);
const libInstallOutputSchema = outputSchema();
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
    .handler(async (input, ctx) => {
    return libInstall(input, ctx);
})
    .build();
const libNewInputSchema = zodAdapter(LibNewInputSchema);
const libNewOutputSchema = outputSchema();
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
    .handler(async (input, ctx) => {
    return libNew(input, ctx);
})
    .build();
const libAuditInputSchema = zodAdapter(LibAuditInputSchema);
const libAuditOutputSchema = outputSchema();
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
    .handler(async (input, ctx) => {
    return libAudit(input, ctx);
})
    .build();
// =============================================================================
// Procedure Procedure Schemas
// =============================================================================
const procedureNewInputSchema = zodAdapter(ProcedureNewInputSchema);
const procedureNewOutputSchema = outputSchema();
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
    .handler(async (input, ctx) => {
    return procedureNew(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerCliProcedures() {
    registerProcedures([
        // lib procedures
        libScanProcedure,
        libRefreshProcedure,
        libRenameProcedure,
        libInstallProcedure,
        libNewProcedure,
        libAuditProcedure,
        // procedure procedures
        procedureNewProcedure,
        ...procedureRegistryProcedures,
    ]);
}
// Auto-register when this module is loaded
registerCliProcedures();
//# sourceMappingURL=register.js.map