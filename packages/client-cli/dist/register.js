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
import { configInit, configAdd, configRemove, configGenerate, configValidate, } from "./procedures/config/index.js";
import { LibScanInputSchema, LibRefreshInputSchema, LibInstallInputSchema, ConfigInitInputSchema, ConfigAddInputSchema, ConfigRemoveInputSchema, ConfigGenerateInputSchema, ConfigValidateInputSchema, } from "./types.js";
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
    .meta({ description: "Scan ~/git for packages and build package-to-repo mapping" })
    .handler(async (input) => {
    return libScan(input);
})
    .build();
const libRefreshProcedure = createProcedure()
    .path(["lib", "refresh"])
    .input(libRefreshInputSchema)
    .output(libRefreshOutputSchema)
    .meta({
    description: "Refresh a library (clean, install, build, commit). Use --recursive for dependencies.",
})
    .handler(async (input) => {
    return libRefresh(input);
})
    .build();
const libRenameInputSchema = zodAdapter(LibRenameInputSchema);
const libRenameOutputSchema = outputSchema();
const libRenameProcedure = createProcedure()
    .path(["lib", "rename"])
    .input(libRenameInputSchema)
    .output(libRenameOutputSchema)
    .meta({
    description: "Rename a package across the codebase using ts-morph for AST-based import updates.",
})
    .handler(async (input) => {
    return libRename(input);
})
    .build();
const libInstallInputSchema = zodAdapter(LibInstallInputSchema);
const libInstallOutputSchema = outputSchema();
const libInstallProcedure = createProcedure()
    .path(["lib", "install"])
    .input(libInstallInputSchema)
    .output(libInstallOutputSchema)
    .meta({
    description: "Install the entire ecosystem from manifest (clone missing, install deps, build in DAG order).",
})
    .handler(async (input) => {
    return libInstall(input);
})
    .build();
// =============================================================================
// Config Procedure Schemas
// =============================================================================
const configInitInputSchema = zodAdapter(ConfigInitInputSchema);
const configInitOutputSchema = outputSchema();
const configAddInputSchema = zodAdapter(ConfigAddInputSchema);
const configAddOutputSchema = outputSchema();
const configRemoveInputSchema = zodAdapter(ConfigRemoveInputSchema);
const configRemoveOutputSchema = outputSchema();
const configGenerateInputSchema = zodAdapter(ConfigGenerateInputSchema);
const configGenerateOutputSchema = outputSchema();
const configValidateInputSchema = zodAdapter(ConfigValidateInputSchema);
const configValidateOutputSchema = outputSchema();
// =============================================================================
// Config Procedure Definitions
// =============================================================================
const configInitProcedure = createProcedure()
    .path(["config", "init"])
    .input(configInitInputSchema)
    .output(configInitOutputSchema)
    .meta({ description: "Initialize project with dependencies.json using a preset" })
    .handler(async (input) => {
    return configInit(input);
})
    .build();
const configAddProcedure = createProcedure()
    .path(["config", "add"])
    .input(configAddInputSchema)
    .output(configAddOutputSchema)
    .meta({ description: "Add a feature to dependencies.json" })
    .handler(async (input) => {
    return configAdd(input);
})
    .build();
const configRemoveProcedure = createProcedure()
    .path(["config", "remove"])
    .input(configRemoveInputSchema)
    .output(configRemoveOutputSchema)
    .meta({ description: "Remove a feature from dependencies.json" })
    .handler(async (input) => {
    return configRemove(input);
})
    .build();
const configGenerateProcedure = createProcedure()
    .path(["config", "generate"])
    .input(configGenerateInputSchema)
    .output(configGenerateOutputSchema)
    .meta({ description: "Generate package.json, tsconfig.json, .gitignore from dependencies.json" })
    .handler(async (input) => {
    return configGenerate(input);
})
    .build();
const configValidateProcedure = createProcedure()
    .path(["config", "validate"])
    .input(configValidateInputSchema)
    .output(configValidateOutputSchema)
    .meta({ description: "Validate dependencies.json against schema" })
    .handler(async (input) => {
    return configValidate(input);
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
        // config procedures
        configInitProcedure,
        configAddProcedure,
        configRemoveProcedure,
        configGenerateProcedure,
        configValidateProcedure,
    ]);
}
// Auto-register when this module is loaded
registerCliProcedures();
//# sourceMappingURL=register.js.map