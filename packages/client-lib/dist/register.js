/**
 * Procedure Registration for lib operations
 *
 * This is the canonical home for lib.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { libScan, libRefresh, libRename, libInstall, libNew, libAudit, libPull, } from "./procedures/lib/index.js";
import { ecosystemProcedures, EcosystemProceduresInputSchema, } from "./procedures/ecosystem/index.js";
import { dagTraverse } from "./procedures/dag/index.js";
import { coreCatch } from "./procedures/core/index.js";
import { LibScanInputSchema, LibRefreshInputSchema, LibRenameInputSchema, LibInstallInputSchema, LibNewInputSchema, LibAuditInputSchema, LibPullInputSchema, DagTraverseInputSchema, CoreCatchInputSchema, } from "./types.js";
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
// lib.* Procedures
// =============================================================================
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
// =============================================================================
// ecosystem.* Procedures
// =============================================================================
const ecosystemProceduresProcedure = createProcedure()
    .path(["ecosystem", "procedures"])
    .input(zodAdapter(EcosystemProceduresInputSchema))
    .output(outputSchema())
    .meta({
    description: "List all procedures across the ecosystem",
    args: [],
    shorts: { namespace: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return ecosystemProcedures(input, ctx);
})
    .build();
// =============================================================================
// dag.* Procedures
// =============================================================================
const dagTraverseProcedure = createProcedure()
    .path(["dag", "traverse"])
    .input(zodAdapter(DagTraverseInputSchema))
    .output(outputSchema())
    .meta({
    description: "Traverse ecosystem packages in dependency order, executing visit procedure for each",
    args: [],
    shorts: { root: "r", concurrency: "j", continueOnError: "c", dryRun: "d" },
    output: "streaming",
})
    .handler(async (input, ctx) => {
    return dagTraverse(input, ctx);
})
    .build();
// =============================================================================
// core.* Procedures
// =============================================================================
const coreCatchProcedure = createProcedure()
    .path(["core", "catch"])
    .input(zodAdapter(CoreCatchInputSchema))
    .output(outputSchema())
    .meta({
    description: "Execute a procedure with error handling",
    args: [],
    shorts: {},
    output: "json",
})
    .handler(async (input, ctx) => {
    return coreCatch(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerLibProcedures() {
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
        // dag.* procedures (canonical home)
        dagTraverseProcedure,
        // core.* procedures
        coreCatchProcedure,
    ]);
}
// Re-export aggregation registration for convenience
export { registerAggregationProcedures, getAllAggregations, getAggregation, listAggregationPaths, aggregationRegistry, } from "./register-aggregations.js";
// Auto-register
registerLibProcedures();
//# sourceMappingURL=register.js.map