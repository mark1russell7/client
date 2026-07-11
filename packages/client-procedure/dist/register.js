/**
 * Procedure Registration for procedure operations
 *
 * This is the canonical home for procedure.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/index.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import { ProcedureNewInputSchema, } from "./types.js";
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