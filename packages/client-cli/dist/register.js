/**
 * Procedure Registration for CLI operations
 *
 * NOTE: lib.* procedures are now registered by client-lib (their canonical home).
 * This file only registers procedure.* and dag.* procedures.
 * TODO: Move procedure.* to client-procedure and dag.* to client-dag.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/new.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import { dagTraverse } from "./procedures/dag/traverse.js";
import { ProcedureNewInputSchema, DagTraverseInputSchema, } from "./types.js";
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
// DAG Procedure Schemas
// =============================================================================
const dagTraverseInputSchema = zodAdapter(DagTraverseInputSchema);
const dagTraverseOutputSchema = outputSchema();
// =============================================================================
// DAG Procedure Definitions
// =============================================================================
const dagTraverseProcedure = createProcedure()
    .path(["dag", "traverse"])
    .input(dagTraverseInputSchema)
    .output(dagTraverseOutputSchema)
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
// Registration
// =============================================================================
export function registerCliProcedures() {
    // NOTE: lib.* procedures are registered by client-lib (proper owner).
    registerProcedures([
        // procedure procedures
        procedureNewProcedure,
        ...procedureRegistryProcedures,
        // dag procedures
        dagTraverseProcedure,
    ]);
}
// Auto-register when this module is loaded
registerCliProcedures();
//# sourceMappingURL=register.js.map