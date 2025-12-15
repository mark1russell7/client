/**
 * Procedure Registration for CLI operations
 *
 * Registers lib.scan, lib.refresh procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures } from "client";
import { libScan } from "./procedures/lib/scan.js";
import { libRefresh } from "./procedures/lib/refresh.js";
import { LibScanInputSchema, LibRefreshInputSchema, } from "./types.js";
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
// =============================================================================
// Registration
// =============================================================================
export function registerCliProcedures() {
    registerProcedures([libScanProcedure, libRefreshProcedure]);
}
// Auto-register when this module is loaded
registerCliProcedures();
//# sourceMappingURL=register.js.map