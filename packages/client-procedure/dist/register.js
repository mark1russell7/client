/**
 * Procedure Registration for procedure operations
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/index.js";
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
    description: "Scaffold a new procedure",
    args: ["name"],
    shorts: { dryRun: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return procedureNew(input, ctx);
})
    .build();
export function registerProcedureProcedures() {
    registerProcedures([
        procedureNewProcedure,
    ]);
}
// Auto-register
registerProcedureProcedures();
//# sourceMappingURL=register.js.map