/**
 * Procedure Registration for lib operations
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { libScan, libRefresh, libRename, libInstall, libNew, libAudit, libPull, } from "./procedures/lib/index.js";
import { LibScanInputSchema, LibRefreshInputSchema, LibRenameInputSchema, LibInstallInputSchema, LibNewInputSchema, LibAuditInputSchema, LibPullInputSchema, } from "./types.js";
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
// lib.scan procedure
const libScanProcedure = createProcedure()
    .path(["lib", "scan"])
    .input(zodAdapter(LibScanInputSchema))
    .output(outputSchema())
    .meta({
    description: "Scan for packages in the git directory",
    args: [],
    shorts: {},
    output: "json",
})
    .handler(async (input, ctx) => {
    return libScan(input, ctx);
})
    .build();
// lib.refresh procedure
const libRefreshProcedure = createProcedure()
    .path(["lib", "refresh"])
    .input(zodAdapter(LibRefreshInputSchema))
    .output(outputSchema())
    .meta({
    description: "Refresh a package (install, build, commit, push)",
    args: ["path"],
    shorts: { recursive: "r", all: "a", force: "f", dryRun: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return libRefresh(input, ctx);
})
    .build();
// lib.rename procedure
const libRenameProcedure = createProcedure()
    .path(["lib", "rename"])
    .input(zodAdapter(LibRenameInputSchema))
    .output(outputSchema())
    .meta({
    description: "Rename a package across the ecosystem",
    args: ["oldName", "newName"],
    shorts: { dryRun: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return libRename(input, ctx);
})
    .build();
// lib.install procedure
const libInstallProcedure = createProcedure()
    .path(["lib", "install"])
    .input(zodAdapter(LibInstallInputSchema))
    .output(outputSchema())
    .meta({
    description: "Install the entire ecosystem from manifest",
    args: [],
    shorts: { dryRun: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return libInstall(input, ctx);
})
    .build();
// lib.new procedure
const libNewProcedure = createProcedure()
    .path(["lib", "new"])
    .input(zodAdapter(LibNewInputSchema))
    .output(outputSchema())
    .meta({
    description: "Create a new package in the ecosystem",
    args: ["name"],
    shorts: { dryRun: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return libNew(input, ctx);
})
    .build();
// lib.audit procedure
const libAuditProcedure = createProcedure()
    .path(["lib", "audit"])
    .input(zodAdapter(LibAuditInputSchema))
    .output(outputSchema())
    .meta({
    description: "Audit ecosystem packages for issues",
    args: [],
    shorts: { fix: "f" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return libAudit(input, ctx);
})
    .build();
// lib.pull procedure
const libPullProcedure = createProcedure()
    .path(["lib", "pull"])
    .input(zodAdapter(LibPullInputSchema))
    .output(outputSchema())
    .meta({
    description: "Pull from remote for all packages",
    args: [],
    shorts: { dryRun: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return libPull(input, ctx);
})
    .build();
export function registerLibProcedures() {
    registerProcedures([
        libScanProcedure,
        libRefreshProcedure,
        libRenameProcedure,
        libInstallProcedure,
        libNewProcedure,
        libAuditProcedure,
        libPullProcedure,
    ]);
}
// Auto-register
registerLibProcedures();
//# sourceMappingURL=register.js.map