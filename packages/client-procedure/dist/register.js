/**
 * Procedure Registration for procedure operations
 *
 * This is the canonical home for procedure.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/index.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import { ProcedureNewInputSchema, } from "./types.js";
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
// procedure.new procedure
const procedureNewProcedure = createProcedure()
    .path(["procedure", "new"])
    .input(zodAdapter(ProcedureNewInputSchema))
    .output(outputSchema())
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
export function registerProcedureProcedures() {
    registerProcedures([
        // procedure.new
        procedureNewProcedure,
        // procedure.list, procedure.get, procedure.export (from registry.ts)
        ...procedureRegistryProcedures,
    ]);
}
// Auto-register
registerProcedureProcedures();
//# sourceMappingURL=register.js.map