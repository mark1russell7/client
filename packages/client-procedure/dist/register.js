/**
 * Procedure Registration for procedure operations
 *
 * This is the canonical home for procedure.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */
import { createProcedure, PROCEDURE_REGISTRY, zodAdapter, outputSchema } from "@mark1russell7/client";
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
    // Use override so registration is idempotent and order-independent: the core client also
    // registers procedure.get/list (operating on runtime procedures), and registerAll() throws on
    // duplicate paths — so loading client-procedure after core threw mid-bundle. client-procedure
    // owns the full-registry introspection variants and wins deterministically. Found via the
    // PROCEDURES.md generator; see documentation/BUGS-2026-07.md.
    PROCEDURE_REGISTRY.registerAll([
        // procedure.new
        procedureNewProcedure,
        // procedure.list, procedure.get, procedure.export (from registry.ts)
        ...procedureRegistryProcedures,
    ], { override: true });
}
// Auto-register
registerProcedureProcedures();
//# sourceMappingURL=register.js.map